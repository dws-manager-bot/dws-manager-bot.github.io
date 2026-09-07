/* PoU Pass Occupation War — UI layer.
   Roster comes from the published Google Sheet (same feed the hive map uses), with the
   bundled members.csv as the fallback. The LINEUP is the thing that drives placement:
   an explicit priority order, seeded from BGB CP, which the user reorders and mixes
   mercenaries into. Mercenaries carry no BGB CP -- their position in the lineup IS their rank. */
import PassWar from "./engine.js"

/**
 * Pass War UI, moved from pou-rocks/pou-pass-war.
 *
 * The body is the original app: the same drag-to-reorder lineup, plan drafts,
 * canvas render and PNG export, all of which already worked. Three things
 * changed. Its selectors are scoped to a host element rather than the document,
 * so it can live inside a page it does not own. Its sign-in gate is gone, since
 * the backoffice has authenticated the caller before this runs. And it takes the
 * API client instead of carrying a second copy of token handling.
 */
export function init({ root, api, user }) {
  // No "use strict" here: an ES module is already strict, and the directive
  // is illegal in a function with a destructured parameter list.

  const SHEET = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS9nTYasjEgPo-Mb7Qtu" +
                "AoLxUf1PBmiRKMIa46L7wruZZY2zXNxTGJrzb_YkJbyng/pub?output=csv";
  const STORE = "pouwar.state.v1";
  const $ = (s) => root.querySelector(s);
  // The shape the ported code expects, from the host's signed-in user.
  const currentUser = () => ({
    id: String(user.discord_id), name: user.username, admin: Boolean(user.is_admin),
  });

  const OFFICIAL = "official";
  const draftSlug = (id) => "draft:" + id;
  const state = {
    roster: [],       // sheet members, BGB desc
    lineup: [],       // ordered member objects -- the priority list
    source: "",
    slug: OFFICIAL,   // which plan is on screen
    plans: [],        // the published plan plus every officer's draft
    title: "",
    server: null,     // provenance of the plan on screen
    dirty: false,     // local edits not yet saved to my draft
    offline: "",      // why the API is unreachable, if it is
    opts: {
      version: 1, orient: "bottom", portalOwners: 24, portalLayers: 4,
      shelterBias: "left", showZones: true, tile: 30, mapTiles: 40, rivalDepth: 6
    }
  };

  const stamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  };

  // ------------------------------- persistence ------------------------------
  const snapshot = () => ({
    opts: state.opts,
    order: state.lineup.map((m) => m.name),
    mercs: state.lineup.filter((m) => m.merc).map((m) => ({ name: m.name, bgb: m.bgb }))
  });

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(snapshot())); } catch (e) { /* private mode */ }
  }

  /* Plans live on the API: one published plan everyone loads, plus a draft per
     officer that nobody else can overwrite. Publishing copies a draft into the
     published plan and leaves the draft exactly where it was. */
  async function refreshPlans() {
    try { state.plans = await api("/lineups"); state.offline = ""; }
    catch (e) { state.plans = []; state.offline = e.message; }
  }

  async function saveDraft() {
    const who = currentUser(), slug = draftSlug(who.id);
    setSaveState("saving…");
    try {
      const r = await api("/lineups/" + slug, {
        method: "PUT",
        body: JSON.stringify(Object.assign(snapshot(), { title: state.title || null }))
      });
      state.slug = slug; state.server = r; state.dirty = false;
      setSaveState("Draft saved.");
      await refreshPlans();
    } catch (e) { setSaveState("Could not save: " + e.message); }
    paintSaveBar();
  }

  async function publishCurrent() {
    if (state.slug === OFFICIAL) return;
    if (!confirm("Publish this plan as the alliance's official line-up?\n\n" +
                 "Everyone will load it. Every draft, including this one, stays untouched.")) return;
    setSaveState("publishing…");
    try {
      state.server = await api("/lineups/" + state.slug + "/publish", { method: "POST" });
      setSaveState("Published as the official plan.");
      await refreshPlans();
    } catch (e) { setSaveState("Could not publish: " + e.message); }
    paintSaveBar();
  }

  function applyPlan(p) {
    if (p.opts) Object.assign(state.opts, p.opts);
    state.lineup = (p.mercs || []).map((m) => Object.assign({ merc: true, cp: 0, lvl: null }, m));
    syncLineup({ order: p.order || [] });
  }

  async function openPlan(slug) {
    setSaveState("loading…");
    try {
      const r = await api("/lineups/" + slug);
      state.slug = slug; state.server = r; state.title = r.title || "";
      if (r.order && r.order.length) applyPlan(r);
      state.dirty = false; setSaveState("");
    } catch (e) { setSaveState("Could not open: " + e.message); }
    syncControls(); draw();
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; }
  }

  /* Merge the roster into the lineup: saved order wins for names it knows, anything new
     falls in at its BGB rank behind them, and departed members drop out. Mercenaries are
     local-only so they always survive. */
  function syncLineup(saved) {
    const mercs = state.lineup.filter((m) => m.merc);
    const order = saved ? saved.order : state.lineup.map((m) => m.name);
    const idx = new Map((order || []).map((n, i) => [n, i]));
    const pool = state.roster.concat(mercs);
    pool.forEach((m, i) => { m._seed = idx.has(m.name) ? idx.get(m.name) : 1e6 + i; });
    pool.sort((a, b) => a._seed - b._seed);
    state.lineup = pool;
  }

  /* Mercenaries carry no BGB CP -- their position in the line-up is their rank.
     Accepts one name or a comma-separated list; newlines count as separators too, so a
     pasted column works. Spacing around the commas is irrelevant. */
  function addMercs(raw, bgb) {
    const names = String(raw || "").split(/[,\n\r]+/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return { added: 0, dup: [], err: "Give at least one mercenary name." };
    const have = new Set(state.lineup.map((m) => m.name.toLowerCase()));
    const fresh = [], dup = [];
    for (const n of names) {
      const k = n.toLowerCase();
      if (have.has(k)) { dup.push(n); continue; }
      have.add(k);
      fresh.push({ name: n, bgb: Number(String(bgb || "").replace(/[^0-9.]/g, "")) || 0,
                   cp: 0, lvl: null, merc: true });
    }
    state.lineup.unshift.apply(state.lineup, fresh);   // keeps the order they were typed in
    return { added: fresh.length, dup: dup };
  }

  function reportMercs(r) {
    if (r.err) return r.err;
    const bits = [];
    if (r.added) bits.push(`Added ${r.added}`);
    if (r.dup.length) bits.push(`already in the line-up: ${r.dup.join(", ")}`);
    return bits.join(" · ");
  }

  const move = (i, to) => {
    if (to < 0 || to >= state.lineup.length) return;
    const [m] = state.lineup.splice(i, 1);
    state.lineup.splice(to, 0, m);
  };

  // ------------------------------- roster load ------------------------------
  async function loadRoster(live) {
    await refreshPlans();
    let remote = null;
    try {
      const r = await api("/lineups/" + state.slug);
      if (r && r.order && r.order.length) { remote = r; state.server = r; state.title = r.title || ""; }
      state.offline = "";
    } catch (e) { state.offline = e.message; }
    const saved = remote || load();          // the published plan outranks this device's cache
    if (saved && saved.opts) Object.assign(state.opts, saved.opts);
    if (saved && saved.mercs) state.lineup = saved.mercs.map((m) => Object.assign({ merc: true, cp: 0, lvl: null }, m));

    let text = null;
    if (live !== false) {
      try {
        const r = await fetch(SHEET, { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const t = await r.text();
        if (/^\s*</.test(t)) throw new Error("sheet not public?");
        text = t; state.source = "live Google Sheet";
      } catch (e) { state.source = "bundled snapshot (" + e.message + ")"; }
    }
    if (text === null) {
      text = window.__MEMBERS_CSV__ ||
        await fetch("passwar-members.csv", { cache: "no-store" }).then((r) => r.text());
      if (!state.source) state.source = "bundled snapshot";
    }
    state.roster = PassWar.parseMembers(text);
    syncLineup(saved);
  }

  // ------------------------------- rendering --------------------------------
  let plan = null;
  function draw() {
    const o = state.opts;
    plan = PassWar.buildPlan(state.lineup, o);
    plan.showZones = o.showZones;
    PassWar.render($("#map"), plan, state.roster, stamp());
    $("#wrap").style.width = plan.g.W + "px";
    const s = plan.stats;
    $("#status").textContent =
      `v${o.version} · pass at ${o.orient} · ${s.shelters} shelters · ${s.portals} portals ` +
      `(${s.owned} prioritised + ${s.free} free) · ${s.named} of ${state.roster.length + countMercs()} placed`;
    $("#src").textContent = "roster: " + state.source;
    renderLineup();
    save();
    paintSaveBar();
  }

  function setSaveState(msg) { $("#savemsg").textContent = msg || ""; }

  function paintSaveBar() {
    const who = currentUser(), bar = $("#savebar");
    if (!who) { bar.hidden = true; return; }
    bar.hidden = false;
    const mine = draftSlug(who.id), onOfficial = state.slug === OFFICIAL;
    const readOnly = !onOfficial && state.slug !== mine;      // another officer's draft

    const label = (p) => p.slug === OFFICIAL
      ? "★ Official plan" + (p.updated_by_name ? " — by " + p.updated_by_name : "")
      : (p.slug === mine ? "My draft" : "Draft — " + (p.owner_name || "?")) +
        (p.title ? " · " + p.title : "");
    const known = state.plans.slice();
    if (!known.some((p) => p.slug === OFFICIAL)) known.unshift({ slug: OFFICIAL });
    if (who.admin && !known.some((p) => p.slug === mine)) known.push({ slug: mine });
    $("#planpick").innerHTML = known.map((p) =>
      '<option value="' + esc(p.slug) + '"' + (p.slug === state.slug ? " selected" : "") +
      ">" + esc(label(p)) + "</option>").join("");

    const draftBtn = $("#savedraft"), pubBtn = $("#publish");
    draftBtn.hidden = !who.admin;
    draftBtn.disabled = !state.dirty;
    draftBtn.textContent = state.dirty ? "⬆ Save my draft" : "Draft saved";
    draftBtn.classList.toggle("primary", state.dirty);
    pubBtn.hidden = !who.admin || onOfficial;
    pubBtn.disabled = state.dirty;
    pubBtn.title = state.dirty ? "Save the draft before publishing it" : "";

    let note;
    if (state.offline) note = "Alliance API unavailable (" + state.offline + ") — this device only.";
    else if (onOfficial) {
      note = state.server && state.server.updated_by_name
        ? "The official plan, published by " + state.server.updated_by_name + "."
        : "No official plan published yet.";
      if (who.admin) note += " Your edits here save to your own draft.";
    } else if (readOnly) {
      const owner = (state.server && state.server.owner_name) || "another officer";
      note = "Viewing " + owner + "'s draft — you cannot overwrite it.";
    } else {
      note = "Your own draft. No other officer can overwrite it.";
      if (state.dirty) note += " Unsaved changes.";
    }
    if (!who.admin) note += " Officers keep the drafts.";
    $("#savenote").textContent = note;
  }

  const countMercs = () => state.lineup.filter((m) => m.merc).length;
  const shelterCount = () => PassWar.shelterCountFor(state.opts.version);
  const cutAt = () => Math.max(shelterCount(), state.opts.portalOwners);

  function badgesFor(i) {
    let h = "";
    if (i < shelterCount()) h += `<b class="bg s">S${i + 1}</b>`;
    if (i < state.opts.portalOwners) h += `<b class="bg p">P${i + 1}</b>`;
    return h;
  }

  function renderLineup() {
    const o = state.opts, list = $("#lineup");
    list.innerHTML = "";
    $("#slotinfo").textContent = shelterCount()
      ? `${shelterCount()} shelters + ${o.portalOwners} portals`
      : `${o.portalOwners} portals (this layout has no shelters)`;

    state.lineup.forEach((m) => {
      const row = document.createElement("li");
      row.className = "row";
      row.dataset.name = m.name;
      row.innerHTML =
        `<span class="n handle" title="drag to reorder"></span>` +
        `<span class="who"><span class="nm">${esc(m.name)}</span>` +
        `<span class="cp">${m.merc ? "mercenary" : ""}${m.bgb ? (m.merc ? " · " : "") + PassWar.shortCP(m.bgb) : (m.merc ? "" : "—")}</span></span>` +
        `<span class="badges"></span>` +
        `<span class="acts">` +
          `<button title="to top" data-a="top">⤒</button>` +
          `<button title="up" data-a="up">↑</button>` +
          `<button title="down" data-a="dn">↓</button>` +
          (m.merc ? `<button title="remove" class="rm" data-a="rm">✕</button>` : "") +
        `</span>`;
      list.appendChild(row);
    });
    const div = document.createElement("li");
    div.className = "cut";
    div.textContent = "— assigned above · bench below —";
    list.appendChild(div);
    restripe();
  }

  /* Rewrite the position-derived bits in place. Called after every drag step so the row
     you are holding shows the slot it would actually land in. */
  function restripe() {
    const list = $("#lineup"), rows = [].slice.call(list.querySelectorAll(".row")), cut = cutAt();
    rows.forEach((r, i) => {
      r.querySelector(".n").textContent = i + 1;
      r.querySelector(".badges").innerHTML = badgesFor(i);
      r.classList.toggle("on", i < cut);
      r.dataset.i = i;
    });
    const div = list.querySelector(".cut");
    if (div) {
      if (rows[cut]) list.insertBefore(div, rows[cut]);
      else list.appendChild(div);
      div.hidden = !rows.length || cut >= rows.length;
    }
  }
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ------------------------------- wiring -----------------------------------
  function bind() {
    const o = state.opts;
    const edit = () => { state.dirty = true; draw(); };
    const set = (k, v) => { o[k] = v; edit(); };

    $("#version").onchange = (e) => set("version", parseInt(e.target.value, 10));
    $("#orient").onchange = (e) => set("orient", e.target.value);
    $("#bias").onchange = (e) => set("shelterBias", e.target.value);
    $("#layers").onchange = (e) => set("portalLayers", Math.max(0, Math.min(8, +e.target.value)));
    $("#owners").oninput = (e) => {
      $("#ownersOut").textContent = e.target.value;
      set("portalOwners", Math.max(0, +e.target.value));
    };
    $("#zones").onchange = (e) => set("showZones", e.target.checked);

    $("#refresh").onclick = async (e) => {
      e.target.disabled = true; $("#src").textContent = "roster: fetching…";
      await loadRoster(true); draw(); e.target.disabled = false;
    };
    $("#reset").onclick = () => {
      const mercs = state.lineup.filter((m) => m.merc);
      state.lineup = state.roster.slice();
      mercs.forEach((m) => state.lineup.unshift(m));
      edit();
    };
    $("#full").onclick = () => {
      $("#stage").classList.toggle("full");
      $("#full").textContent = $("#stage").classList.contains("full") ? "⤢ Fit width" : "⤢ Actual size";
    };
    $("#png").onclick = () => {
      $("#map").toBlob((b) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `pass_war_map_v${o.version}_${o.orient}_${stamp()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, "image/png");
    };

    $("#addmerc").onclick = () => {
      const r = addMercs($("#mname").value, $("#mcp").value);
      $("#mercerr").textContent = reportMercs(r);
      if (r.added) { $("#mname").value = ""; $("#mcp").value = ""; edit(); }
    };
    $("#bulktoggle").onclick = () => {
      const b = $("#bulkbox");
      b.hidden = !b.hidden;
      $("#bulktoggle").textContent = b.hidden ? "＋ bulk add…" : "− hide bulk add";
      if (!b.hidden) $("#mbulk").focus();
    };
    $("#addbulk").onclick = () => {
      const r = addMercs($("#mbulk").value, 0);
      $("#mercerr").textContent = reportMercs(r);
      if (r.added) { $("#mbulk").value = ""; edit(); }
    };
    $("#mname").onkeydown = (e) => { if (e.key === "Enter") $("#addmerc").click(); };
    $("#mcp").onkeydown = (e) => { if (e.key === "Enter") $("#addmerc").click(); };

    $("#lineup").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const i = +b.closest(".row").dataset.i;
      if (b.dataset.a === "top") move(i, 0);
      else if (b.dataset.a === "up") move(i, i - 1);
      else if (b.dataset.a === "dn") move(i, i + 1);
      else if (b.dataset.a === "rm") state.lineup.splice(i, 1);
      edit();
    };
    $("#savedraft").onclick = () => saveDraft();
    $("#publish").onclick = () => publishCurrent();
    $("#planpick").onchange = (e) => {
      if (state.dirty && !confirm("You have unsaved changes. Open another plan and lose them?")) {
        e.target.value = state.slug; return;
      }
      openPlan(e.target.value);
    };
    $("#reload").onclick = async () => {
      setSaveState("reloading…"); await refreshPlans(); await openPlan(state.slug);
    };
  }

  function commitOrder() {
    const by = new Map(state.lineup.map((m) => [m.name, m]));
    const next = [].slice.call($("#lineup").querySelectorAll(".row"))
      .map((r) => by.get(r.dataset.name)).filter(Boolean);
    if (next.length === state.lineup.length) state.lineup = next;
    state.dirty = true;
    draw();
  }

  function placeAt(list, row, y) {
    const rows = [].slice.call(list.querySelectorAll(".row")).filter((r) => r !== row);
    let before = null;
    for (const r of rows) {
      const b = r.getBoundingClientRect();
      if (y < b.top + b.height / 2) { before = r; break; }
    }
    if (before) list.insertBefore(row, before); else list.appendChild(row);
    restripe();
  }

  function initDrag() {
    const list = $("#lineup");
    let drag = null;

    list.addEventListener("pointerdown", (e) => {
      const h = e.target.closest(".handle");
      if (!h || e.button) return;
      const row = h.closest(".row"), rect = row.getBoundingClientRect();
      e.preventDefault();
      const clone = row.cloneNode(true);
      clone.className = "row floating";
      clone.style.width = rect.width + "px";
      clone.style.left = rect.left + "px";
      clone.style.top = rect.top + "px";
      document.body.appendChild(clone);
      row.classList.add("ghost");
      drag = { row, clone, grab: e.clientY - rect.top, y: e.clientY, id: e.pointerId, alive: true };
      list.setPointerCapture(e.pointerId);      // capture on the list: the row itself gets moved
      autoScroll(list, drag);
    });

    list.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      drag.y = e.clientY;
      drag.clone.style.top = (e.clientY - drag.grab) + "px";
      placeAt(list, drag.row, e.clientY);
    });

    const end = (e) => {
      if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
      drag.alive = false;
      drag.clone.remove();
      drag.row.classList.remove("ghost");
      drag = null;
      commitOrder();
    };
    list.addEventListener("pointerup", end);
    list.addEventListener("pointercancel", end);
  }

  /* Keep scrolling while the finger simply rests near an edge -- a 97-row list needs it. */
  function autoScroll(list, drag) {
    const step = () => {
      if (!drag.alive) return;
      const b = list.getBoundingClientRect(), edge = 46;
      let d = 0;
      if (drag.y < b.top + edge) d = -Math.min(15, (b.top + edge - drag.y) / 2.2);
      else if (drag.y > b.bottom - edge) d = Math.min(15, (drag.y - (b.bottom - edge)) / 2.2);
      if (d) {
        const before = list.scrollTop;
        list.scrollTop += d;
        if (list.scrollTop !== before) placeAt(list, drag.row, drag.y);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function syncControls() {
    const o = state.opts;
    $("#version").value = o.version; $("#orient").value = o.orient;
    $("#bias").value = o.shelterBias; $("#layers").value = o.portalLayers;
    $("#owners").value = o.portalOwners; $("#ownersOut").textContent = o.portalOwners;
    $("#zones").checked = o.showZones;
  }

  // ------------------------------- boot -------------------------------------
  async function start(who) {
    // No gate to hide: the host page only mounts this once signed in.
    $("#whoami").textContent = who.name + (who.admin ? " · officer" : "");
    await loadRoster(true);
    state.dirty = false;                 // whatever we just loaded is the baseline
    syncControls(); bind(); initDrag(); draw();
  }

  // Authentication is the host page's job; start straight away.
  start({ name: user.username, admin: user.is_admin })
}
