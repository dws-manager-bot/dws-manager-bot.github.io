/* Pass War map engine, moved from pou-rocks/pou-pass-war unchanged.
 * The body is the original IIFE; only the host object differs, so the
 * geometry and drawing stay exactly as they were tested there. */
// The semicolon matters: without it `{}` is called as a function, because
// automatic semicolon insertion joins this line to the IIFE that follows.
const ns = {};

/* PoU Pass Occupation War — map engine (Canvas).
   A faithful port of draw_pass_war_map.py: same geometry, same placement rules, same look.
   Pure and side-effect free apart from drawing — the UI lives in app.js. */
(function (global) {
  "use strict";

  // ------------------------------- CONFIG -----------------------------------
  const CONNECTOR_W = 5, CONNECTOR_H = 12;
  const PASS_W = 5, PASS_H = 4;
  const KEEP_CLEAR_H = 2, PORTAL_GAP = 1;
  const SHELTER_ROW_N = 4, SHELTER_ROWS_DEFAULT = 2;

  /* What each version changes. Everything else -- the two portals at the gate
     above all -- is common to every layout and lives outside this table.
       shelterRows  how deep the shelter block starts; 0 fills it with portals
       shelterCols  how wide each shelter layer starts
       liftBlock    raise the block one portal height, leaving a portal layer
                    between the shelters and our border
     Both counts are only a starting point: the officer sets them per plan. */
  const VERSIONS = {
    1: { shelterRows: SHELTER_ROWS_DEFAULT, shelterCols: SHELTER_ROW_N, liftBlock: true },
    2: { shelterRows: SHELTER_ROWS_DEFAULT, shelterCols: SHELTER_ROW_N, liftBlock: false },
    3: { shelterRows: 0, shelterCols: SHELTER_ROW_N, liftBlock: false }
  };

  /* v4 was "v2, but four shelter layers deep", which the shelter controls now
     say directly, so it is gone as a version. Plans saved under it still open,
     as the v2 they always were, keeping the four layers they were drawn with. */
  const RETIRED = { 4: { version: 2, shelterRows: 4, shelterCols: SHELTER_ROW_N } };
  const versionSpec = (v) => VERSIONS[v] || VERSIONS[1];

  function resolve(o) {
    const was = RETIRED[o.version];
    if (!was) return { version: VERSIONS[o.version] ? o.version : 1, rows: o.shelterRows, cols: o.shelterCols };
    return {
      version: was.version,
      rows: o.shelterRows == null ? was.shelterRows : o.shelterRows,
      cols: o.shelterCols == null ? was.shelterCols : o.shelterCols
    };
  }

  /* A version supplies the starting shape; the caller may override either
     dimension, so any layout can be made deeper or wider. */
  function shelterGrid(o) {
    const r = resolve(o), spec = versionSpec(r.version);
    const rows = r.rows == null ? spec.shelterRows : Math.max(0, Math.round(r.rows));
    const cols = r.cols == null ? spec.shelterCols : Math.max(1, Math.round(r.cols));
    return { rows, cols };
  }
  const shelterCountFor = (v, rows, cols) => {
    const grid = shelterGrid({ version: v, shelterRows: rows, shelterCols: cols });
    return grid.rows * grid.cols;
  };

  /* Saved options with a retired version and any missing field settled, so the
     screen and the engine always agree on what is being drawn. */
  function normalizeOpts(o) {
    const grid = shelterGrid(o);
    const out = { ...o, version: resolve(o).version, shelterRows: grid.rows, shelterCols: grid.cols };
    /* The rival camp used to be six tiles deep with no way to change it, so a
       plan saved before the portal target existed carries that depth without
       anyone having chosen it. Those take the new default; a plan saved since
       is left alone, which keeps six a settable value. */
    if (out.portalCount == null && out.rivalDepth === 6) out.rivalDepth = 2;
    if (out.portalCount == null) out.portalCount = 100;
    /* The board is described from the pass outward now. A plan saved with a
       width and a gate position describes the same board; convert it once,
       rather than carrying two ways of saying the same thing.

       The old keys win where they are present, because this object is the
       screen's defaults with a saved plan merged over them: the new keys will
       be there either way, and only the old ones prove which board was saved. */
    const legacyBoard = out.mapW != null || out.gateX != null || out.mapTiles != null;
    if (legacyBoard || out.leftOfPass == null || out.rightOfPass == null) {
      const probe = { ...out, tile: out.tile || 30, orient: out.orient || "bottom" };
      // Drop the defaults, or geometry would read them in preference to the
      // saved width and gate position this is here to convert.
      if (legacyBoard) { delete probe.leftOfPass; delete probe.rightOfPass; }
      const g = geometry(probe);
      out.leftOfPass = g.leftOfPass;
      out.rightOfPass = g.rightOfPass;
      out.mapH = g.mapH;
    }
    delete out.portalLayers;   // the ring depth follows from the portal target now
    delete out.mapTiles;       // one square dimension, since split into width and depth
    delete out.mapW; delete out.gateX;    // replaced by the two sides of the pass
    delete out.gateW; delete out.gateH;   // the gate's size is the game's, not ours
    return out;
  }

  const RULER = 5;
  const MARGIN = 56, TITLE_H = 78, LEGEND_H = 66;

  const SIZES = { PASS: [PASS_W, PASS_H], PORTAL: [2, 2], SHELTER: [3, 3] };

  const BG = "#f5f3ee", INK = "rgb(40,40,40)";
  const OURS_FILL = "rgb(219,231,242)", RIVAL_FILL = "rgb(243,224,224)";
  const CONN_FILL = "rgb(234,228,212)", EDGE = "rgb(120,118,112)";
  const GRID_RGBA = "rgba(60,60,60,0.18)", GRID5_RGBA = "rgba(60,60,60,0.38)";
  const HATCH_RGBA = "rgba(110,100,80,0.35)";
  const FILLS = { PASS: "rgb(198,140,44)", PORTAL: "rgb(52,104,186)", SHELTER: "rgb(56,148,104)" };
  const FREE_PORTAL = "rgb(128,162,208)";
  const ZONE_TONE = { SHELTER: "rgb(34,96,66)", PORTAL: "rgb(34,70,128)" };
  const ZONE_TINT = { SHELTER: "rgba(56,148,104,0.10)", PORTAL: "rgba(52,104,186,0.10)" };

  const FONT = '"Arial Unicode MS","PingFang SC","Hiragino Sans","Hiragino Kaku Gothic Pro",' +
               '"Apple SD Gothic Neo","Malgun Gothic","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
  const fontStr = (sz) => sz + "px " + FONT;

  // ------------------------------- helpers ----------------------------------
  function shortCP(v) {
    v = Number(v);
    if (!isFinite(v) || v <= 0) return "";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "G";
    if (v >= 1e6) return Math.round(v / 1e6) + "M";
    if (v >= 1e3) return Math.round(v / 1e3) + "K";
    return String(Math.round(v));
  }
  function inkOn(rgb) {
    const m = rgb.match(/\d+/g).map(Number);
    return 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2] > 140 ? "rgb(25,25,25)" : "rgb(250,250,250)";
  }
  function fitFont(ctx, text, maxw, hi, lo) {
    lo = lo || 7;
    for (let sz = hi; sz >= lo; sz--) {
      ctx.font = fontStr(sz);
      if (ctx.measureText(text).width <= maxw) return [sz, text];
    }
    ctx.font = fontStr(lo);
    let t = text;
    while (t && ctx.measureText(t + "…").width > maxw) t = t.slice(0, -1);
    return [lo, t + "…"];
  }
  function ctext(ctx, cx, cy, text, sz, fill) {
    ctx.font = fontStr(sz); ctx.fillStyle = fill;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy);
  }
  function ltext(ctx, x, y, text, sz, fill) {
    ctx.font = fontStr(sz); ctx.fillStyle = fill;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  // ------------------------------- CSV --------------------------------------
  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /* Same six columns the hive map reads: Name, Industry Level, BGB CP, Total CP,
     Preferred Outermost, Stick Group. A row needs a name and a Total CP to count. */
  function parseMembers(text) {
    const rows = parseCSV(text), out = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const name = (r[0] || "").trim();
      const cp = (r[3] || "").replace(/[^0-9.]/g, "");
      if (!name || !cp) continue;
      const bgb = (r[2] || "").replace(/[^0-9.]/g, "");
      out.push({
        name: name,
        lvl: r[1] && String(r[1]).trim() ? parseInt(r[1], 10) : null,
        bgb: bgb ? Math.round(Number(bgb)) : 0,
        cp: Math.round(Number(cp)),
        merc: false
      });
    }
    out.sort((a, b) => b.bgb - a.bgb);
    return out;
  }

  // ------------------------------- geometry ---------------------------------
  function geometry(o) {
    const g = {};
    const [PW, PH] = SIZES.PORTAL, [SW, SH] = SIZES.SHELTER;
    g.PW = PW; g.PH = PH; g.SW = SW; g.SH = SH;

    g.tile = o.tile;
    g.rivalDepth = Math.max(1, Math.round(o.rivalDepth != null ? o.rivalDepth : 2));
    g.orient = o.orient;

    // The gate is the game's own structure: where it sits varies by map, how
    // big it is does not.
    g.GATE_W = CONNECTOR_W;
    g.GATE_H = CONNECTOR_H;

    /* The board is measured outward from the pass, because that is what anyone
       planning is looking at: so much of our ground to its left, so much to its
       right, so much depth behind the border. The camp's width falls out of
       those three rather than being set first and the gate then placed inside
       it -- which meant changing the width moved the pass, and moving the pass
       changed how much ground was on each side of it.

       Plans saved the old way carry `mapW` with `gateX`, or the single square
       `mapTiles` before that. Both resolve to the same board. */
    const oldWidth = Math.max(12, Math.round(
      o.mapW != null ? o.mapW : (o.mapTiles != null ? o.mapTiles : 40)));
    const oldLeft = o.gateX != null
      ? Math.min(oldWidth - g.GATE_W, Math.max(0, Math.round(o.gateX)))
      : Math.floor((oldWidth - g.GATE_W) / 2);

    g.leftOfPass = Math.max(0, Math.round(
      o.leftOfPass != null ? o.leftOfPass : oldLeft));
    g.rightOfPass = Math.max(0, Math.round(
      o.rightOfPass != null ? o.rightOfPass : oldWidth - oldLeft - g.GATE_W));
    g.mapH = Math.max(6, Math.round(
      o.mapH != null ? o.mapH : (o.mapTiles != null ? o.mapTiles : 40)));

    g.mapW = g.leftOfPass + g.GATE_W + g.rightOfPass;
    g.CONN_X0 = g.leftOfPass;
    g.CONN_Y0 = g.mapH;
    g.PASS_X0 = g.CONN_X0 + Math.floor((g.GATE_W - PASS_W) / 2);
    g.PASS_Y0 = g.CONN_Y0 + Math.floor((g.GATE_H - PASS_H) / 2);
    g.RIVAL_Y0 = g.CONN_Y0 + g.GATE_H;
    g.APRON_H = g.PASS_Y0 - g.CONN_Y0;
    g.PORTAL_ROW = g.CONN_Y0;
    g.AXIS_X = g.CONN_X0 + g.GATE_W / 2;
    // The pair at the gate stays centered on it however wide the gate is.
    g.GATE_P_X0 = g.CONN_X0 + Math.floor((g.GATE_W - (2 * PW + PORTAL_GAP)) / 2);

    g.version = resolve(o).version;
    const spec = versionSpec(g.version);
    const grid = shelterGrid(o);
    g.shelterRows = grid.rows;
    g.shelterCols = grid.cols;
    g.BLOCK_Y1 = g.CONN_Y0 - (spec.liftBlock ? PH : 0);
    g.BLOCK_H = g.shelterRows * SH || 6;
    g.BLOCK_Y0 = g.BLOCK_Y1 - g.BLOCK_H;
    g.BLOCK_W = g.shelterCols * SW;

    const ideal = g.AXIS_X - g.BLOCK_W / 2;
    g.BLOCK_X0 = Math.floor(ideal) + (o.shelterBias === "right" ? 1 : 0);
    g.BLOCK_X1 = g.BLOCK_X0 + g.BLOCK_W;
    g.offset = (g.BLOCK_X0 + g.BLOCK_W / 2) - g.AXIS_X;

    /* Shelters tile in 3s and portals in 2s, so a block an odd number of tiles
       across or deep cannot be ringed exactly. Rounding the rect the rings grow
       from out to an even size makes every ring tile perfectly; the leftover
       tile becomes a one-tile channel on the rear and lean side, rather than the
       overrun that used to collide with the ring's own corner and silently drop
       whole portals -- which is what made the formation look cracked. */
    g.PAD_X = g.BLOCK_W % PW ? PW - (g.BLOCK_W % PW) : 0;
    g.PAD_Y = g.BLOCK_H % PH ? PH - (g.BLOCK_H % PH) : 0;
    g.FRAME_X0 = g.BLOCK_X0 - (o.shelterBias === "right" ? g.PAD_X : 0);
    g.FRAME_X1 = g.FRAME_X0 + g.BLOCK_W + g.PAD_X;
    g.FRAME_Y1 = g.BLOCK_Y1;
    g.FRAME_Y0 = g.BLOCK_Y0 - g.PAD_Y;

    /* How many portals the formation is built to hold, all told -- named and
       free alike. Rings are grown outward until that many are placed, so the
       count is the setting and the ring depth follows from it. */
    g.portalCount = Math.max(0, Math.round(o.portalCount != null ? o.portalCount : 100));
    // Enough rings to cover the camp; the target decides how many get used.
    g.maxLayers = Math.ceil(Math.max(g.mapW, g.mapH) / PH) + 2;

    /* The tile the parity padding leaves over, as the L-shaped strip it really
       is. Nothing in the game is one tile wide, so it is drawn as kept clear
       rather than left looking like a portal that failed to appear. */
    g.CHANNELS = [];
    if (g.PAD_Y) g.CHANNELS.push([g.FRAME_X0, g.FRAME_Y0, g.FRAME_X1 - g.FRAME_X0, g.PAD_Y]);
    if (g.PAD_X) g.CHANNELS.push([o.shelterBias === "right" ? g.FRAME_X0 : g.BLOCK_X1,
                                  g.BLOCK_Y0, g.PAD_X, g.BLOCK_H]);

    // Placeholders until buildPlan measures what actually landed on the board.
    g.RING_TOP = g.FRAME_Y0;
    g.FORM_X0 = g.FRAME_X0;
    g.FORM_X1 = g.FRAME_X1;

    g.OURS = [0, 0, g.mapW, g.mapH];
    g.CONN = [g.CONN_X0, g.CONN_Y0, g.GATE_W, g.GATE_H];
    g.RIVAL = [0, g.RIVAL_Y0, g.mapW, g.rivalDepth];
    g.APRON = [g.CONN_X0, g.CONN_Y0, g.GATE_W, g.APRON_H];
    g.PORTAL_BAND = [g.GATE_P_X0, g.PORTAL_ROW, 2 * PW + PORTAL_GAP, PH];
    g.KEEP_CLEAR = [g.CONN_X0, g.PORTAL_ROW + PH, g.GATE_W, Math.max(0, g.APRON_H - PH)];
    g.GAP_RECT = [g.GATE_P_X0 + PW, g.PORTAL_ROW, PORTAL_GAP, PH];

    g.ZONES = [];

    g.W_TILES = g.mapW;
    g.H_TILES = g.mapH + g.GATE_H + g.rivalDepth;
    const flat = g.orient === "bottom" || g.orient === "top";
    g.WORLD_W = flat ? g.W_TILES : g.H_TILES;
    g.WORLD_H = flat ? g.H_TILES : g.W_TILES;
    g.W = MARGIN * 2 + g.WORLD_W * g.tile;
    g.H = MARGIN * 2 + TITLE_H + g.WORLD_H * g.tile + LEGEND_H;
    return g;
  }

  /* Logical tile point -- layout always reasons with the pass at the bottom -- to pixels,
     turned through the orientation on the way out. Fractional tiles are fine, which is what
     lets the annotations be written once and survive rotation. */
  function wpt(g, tx, ty) {
    let X, Y;
    if (g.orient === "bottom") { X = tx; Y = ty; }
    else if (g.orient === "top") { X = g.W_TILES - tx; Y = g.H_TILES - ty; }
    else if (g.orient === "left") { X = g.H_TILES - ty; Y = tx; }
    else { X = ty; Y = g.W_TILES - tx; }
    return [MARGIN + X * g.tile, MARGIN + TITLE_H + Y * g.tile];
  }
  function box(g, r) {
    const a = wpt(g, r[0], r[1]), b = wpt(g, r[0] + r[2], r[1] + r[3]);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }
  function wrect(g, r) {
    const b = box(g, r);
    return [Math.round((b[0] - MARGIN) / g.tile), Math.round((b[1] - MARGIN - TITLE_H) / g.tile),
            Math.round((b[2] - b[0]) / g.tile), Math.round((b[3] - b[1]) / g.tile)];
  }
  const inRect = (x, y, r) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];

  // ------------------------------- the board --------------------------------
  function Board(g) { this.g = g; this.cells = new Map(); this.items = []; }
  Board.prototype.onMap = function (x, y) {
    const g = this.g;
    return inRect(x, y, g.OURS) || inRect(x, y, g.CONN) || inRect(x, y, g.RIVAL);
  };
  Board.prototype.fits = function (kind, x, y) {
    const [w, h] = SIZES[kind];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!this.onMap(x + i, y + j)) return false;
      if (this.cells.has((x + i) + "," + (y + j))) return false;
    }
    return true;
  };
  Board.prototype.place = function (kind, x, y, label, fill, member) {
    const [w, h] = SIZES[kind], tiles = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) tiles.push([x + i, y + j]);
    for (const c of tiles) if (!this.onMap(c[0], c[1])) return null;
    for (const c of tiles) if (this.cells.has(c[0] + "," + c[1])) return null;
    const s = { kind, x, y, w, h, label: label || "", fill: fill || FILLS[kind], member: member || null };
    for (const c of tiles) this.cells.set(c[0] + "," + c[1], s);
    this.items.push(s);
    return s;
  };

  /* Center-to-pass distance: to the pass rectangle, tie-broken by its center, then by
     tile so the order is stable whatever the construction sequence. */
  function passDist(g, x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2;
    const nx = Math.min(Math.max(cx, g.PASS_X0), g.PASS_X0 + PASS_W);
    const ny = Math.min(Math.max(cy, g.PASS_Y0), g.PASS_Y0 + PASS_H);
    return [Math.hypot(cx - nx, cy - ny),
            Math.hypot(cx - (g.PASS_X0 + PASS_W / 2), cy - (g.PASS_Y0 + PASS_H / 2)), x, y];
  }
  const cmpTuple = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

  /* Where there is still room to build, measured from what actually landed
     rather than from the requested ring count -- the two differ once the target
     runs out mid-ring, or the camp edge trims one. */
  function refreshZones(g, board) {
    const inCamp = board.items.filter((s) => s.y + s.h <= g.CONN_Y0);
    if (!inCamp.length) { g.ZONES = []; return; }
    g.RING_TOP = Math.min.apply(null, inCamp.map((s) => s.y));
    g.FORM_X0 = Math.min.apply(null, inCamp.map((s) => s.x));
    g.FORM_X1 = Math.max.apply(null, inCamp.map((s) => s.x + s.w));
    const rear = g.shelterRows ? ["SHELTER", "shelters"] : ["PORTAL", "portals"];
    g.ZONES = [
      [[0, 0, g.mapW, g.RING_TOP], rear[0], rear[1]],
      [[0, g.RING_TOP, g.FORM_X0, g.CONN_Y0 - g.RING_TOP], "PORTAL", "portals"],
      [[g.FORM_X1, g.RING_TOP, g.mapW - g.FORM_X1, g.CONN_Y0 - g.RING_TOP], "PORTAL", "portals"]
    ];
  }

  /* Every slot a portal may take, gate pair first, then outward ring by ring.
     The frame rect has even sides by construction, so a ring runs from its left
     column across to its right column and lands exactly on it -- corners fall
     out of the same loop, nothing overruns, nothing is dropped for overlapping.
     Only the pair at the gate stands apart, held one tile open for the corridor. */
  function portalSlots(g) {
    const layers = [[[g.GATE_P_X0, g.PORTAL_ROW], [g.GATE_P_X0 + g.PW + PORTAL_GAP, g.PORTAL_ROW]]];
    if (!g.shelterRows) {
      const core = [];
      for (let y = g.FRAME_Y0; y < g.FRAME_Y1; y += g.PH)
        for (let x = g.FRAME_X0; x < g.FRAME_X1; x += g.PW) core.push([x, y]);
      layers.push(core);
    }
    let x0 = g.FRAME_X0, x1 = g.FRAME_X1, y0 = g.FRAME_Y0, y1 = g.FRAME_Y1;
    for (let n = 0; n < g.maxLayers; n++) {
      const left = x0 - g.PW, right = x1, top = y0 - g.PH, bottom = y1, ring = [];
      for (let y = y0; y < y1; y += g.PH) { ring.push([left, y]); ring.push([right, y]); }
      for (let x = left; x <= right; x += g.PW) ring.push([x, top]);
      if (bottom + g.PH <= g.CONN_Y0) {          // room before our border: close the ring
        for (let x = left; x <= right; x += g.PW) ring.push([x, bottom]);
        y1 = bottom + g.PH;
      }
      layers.push(ring);
      x0 = left; x1 = right + g.PW; y0 = top;
    }
    return layers;
  }

  /* One member per shelter, highest in the line-up nearest the pass: S1 is the
     closest slot and takes lineup[0]. A grid deeper than the camp runs off the
     map; those slots are dropped before numbering, so the numbers stay
     contiguous and nobody loses their place to a slot that was never drawn. */
  function placeShelters(board, lineup) {
    const g = board.g;
    if (!g.shelterRows) return 0;
    const slots = [];
    for (let r = 0; r < g.shelterRows; r++)
      for (let i = 0; i < g.shelterCols; i++) slots.push([g.BLOCK_X0 + i * g.SW, g.BLOCK_Y0 + r * g.SH]);
    slots.sort((a, b) => cmpTuple(passDist(g, a[0], a[1], g.SW, g.SH), passDist(g, b[0], b[1], g.SW, g.SH)));
    const usable = slots.filter((c) => board.fits("SHELTER", c[0], c[1]));
    usable.forEach((c, i) => board.place("SHELTER", c[0], c[1], "S" + (i + 1), null, lineup[i] || null));
    return usable.length;
  }

  /* Portals, outward ring by ring until the formation holds `target` of them --
     the gate pair included, named and free alike. A ring the target runs out
     inside is filled nearest-the-pass first, so an unfinished formation is open
     at the rear rather than ragged the whole way round.

     The `owners` slots nearest the pass are then named from the same line-up the
     shelters read, so the strongest members hold both. The rest are free. */
  function placePortals(board, lineup, target, owners) {
    const g = board.g, byPass = (a, b) =>
      cmpTuple(passDist(g, a[0], a[1], g.PW, g.PH), passDist(g, b[0], b[1], g.PW, g.PH));
    const taken = [];
    for (const ring of portalSlots(g)) {
      if (taken.length >= target) break;
      const usable = ring.filter((c) => board.fits("PORTAL", c[0], c[1])).sort(byPass);
      for (const c of usable) {
        if (taken.length >= target) break;
        taken.push(c);
      }
    }
    const rank = new Map();
    [...taken].sort(byPass).slice(0, Math.max(0, owners))
      .forEach((c, i) => rank.set(c[0] + "," + c[1], i));
    for (const c of taken) {
      const i = rank.get(c[0] + "," + c[1]);
      const m = i === undefined ? null : (lineup[i] || null);
      board.place("PORTAL", c[0], c[1], "", m ? null : FREE_PORTAL, m);
    }
    return rank.size;
  }

  function buildPlan(lineup, o) {
    const g = geometry(o), board = new Board(g);
    board.place("PASS", g.PASS_X0, g.PASS_Y0, "PASS");
    placeShelters(board, lineup);
    placePortals(board, lineup, g.portalCount, o.portalOwners);
    refreshZones(g, board);
    const portals = board.items.filter((s) => s.kind === "PORTAL");
    const shelters = board.items.filter((s) => s.kind === "SHELTER");
    const named = new Set(board.items.filter((s) => s.member).map((s) => s.member.name));
    return {
      g: g, board: board,
      stats: {
        portals: portals.length,
        owned: portals.filter((s) => s.member).length,
        free: portals.filter((s) => !s.member).length,
        shelters: shelters.length,
        wanted: g.portalCount,
        named: named.size
      }
    };
  }

  // ------------------------------- drawing ----------------------------------
  function fillRegion(ctx, g, r, color) {
    const b = box(g, r); ctx.fillStyle = color;
    ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
  }
  function hatchRegion(ctx, g, r) {
    const b = box(g, r), w = b[2] - b[0], h = b[3] - b[1];
    ctx.save(); ctx.beginPath(); ctx.rect(b[0], b[1], w, h); ctx.clip();
    ctx.strokeStyle = HATCH_RGBA; ctx.lineWidth = 1;
    for (let k = -h; k < w; k += 9) {
      ctx.beginPath(); ctx.moveTo(b[0] + k, b[1]); ctx.lineTo(b[0] + k + h, b[1] + h); ctx.stroke();
    }
    ctx.restore();
  }
  function gridRegion(ctx, g, r) {
    const [X, Y, w, h] = wrect(g, r);
    const top = MARGIN + TITLE_H + Y * g.tile, bot = MARGIN + TITLE_H + (Y + h) * g.tile;
    ctx.lineWidth = 1;
    for (let i = 0; i <= w; i++) {
      const tx = X + i, px = MARGIN + tx * g.tile + 0.5;
      ctx.strokeStyle = tx % RULER === 0 ? GRID5_RGBA : GRID_RGBA;
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bot); ctx.stroke();
    }
    const left = MARGIN + X * g.tile, right = MARGIN + (X + w) * g.tile;
    for (let j = 0; j <= h; j++) {
      const ty = Y + j, py = MARGIN + TITLE_H + ty * g.tile + 0.5;
      ctx.strokeStyle = ty % RULER === 0 ? GRID5_RGBA : GRID_RGBA;
      ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
    }
  }
  function outlineRegion(ctx, g, r, color) {
    const b = box(g, r);
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.strokeRect(b[0] + 1, b[1] + 1, b[2] - b[0] - 2, b[3] - b[1] - 2);
  }

  function drawStructure(ctx, g, s) {
    const b = box(g, [s.x, s.y, s.w, s.h]);
    const w = b[2] - b[0], h = b[3] - b[1];
    ctx.fillStyle = s.fill; ctx.fillRect(b[0], b[1], w, h);
    ctx.strokeStyle = "rgb(255,255,255)"; ctx.lineWidth = 2;
    ctx.strokeRect(b[0] + 1, b[1] + 1, w - 2, h - 2);

    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, fg = inkOn(s.fill), maxw = w - 7;
    let lines;
    if (s.kind === "PASS") lines = [[s.label || "PASS", 17], [s.w + "×" + s.h, 14]];
    else if (s.member && s.kind === "SHELTER")
      lines = [[s.label, 11], [s.member.name, 15], [shortCP(s.member.bgb) || "merc", 13]];
    else if (s.member) lines = [[s.member.name, 13], [shortCP(s.member.bgb) || "merc", 11]];
    else if (s.kind === "PORTAL") lines = [["P", 15]];
    else lines = s.label ? [[s.label, 13]] : [];
    if (!lines.length) return;

    const rendered = lines.map((l) => fitFont(ctx, l[0], maxw, l[1]));
    const step = Math.max.apply(null, rendered.map((r) => r[0])) + 3;
    rendered.forEach((r, i) => ctext(ctx, cx, cy + (i - (rendered.length - 1) / 2) * step, r[1], r[0], fg));
  }

  function drawZones(ctx, g, remaining) {
    g.ZONES.forEach((z, zi) => {
      const [rx, ry, rw, rh] = z[0], kind = z[1], what = z[2];
      if (rw <= 0 || rh <= 0) return;
      const [sw, sh] = SIZES[kind], cols = Math.floor(rw / sw), rows = Math.floor(rh / sh);
      if (!cols || !rows) return;
      const b = box(g, z[0]);
      ctx.save();
      ctx.setLineDash([7, 5]); ctx.strokeStyle = ZONE_TONE[kind]; ctx.lineWidth = 1;
      ctx.strokeRect(b[0] + 4.5, b[1] + 4.5, b[2] - b[0] - 9, b[3] - b[1] - 9);
      ctx.restore();
      const lines = [["build " + what + " here", 17],
                     [rw + "×" + rh + " — fits " + cols + " × " + rows + " = " + cols * rows +
                      " of " + sw + "×" + sh, 13]];
      if (zi === 0 && remaining > 0)
        lines.push([remaining + " members still to place, strongest nearest the pass", 13]);
      const rendered = lines.map((l) => fitFont(ctx, l[0], b[2] - b[0] - 24, l[1], 8));
      const step = Math.max.apply(null, rendered.map((r) => r[0])) + 7;
      const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      rendered.forEach((r, i) =>
        ctext(ctx, cx, cy + (i - (rendered.length - 1) / 2) * step, r[1], r[0], ZONE_TONE[kind]));
    });
  }

  function drawAxis(ctx, g) {
    const a = wpt(g, g.AXIS_X, g.RING_TOP - 1), b = wpt(g, g.AXIS_X, g.PASS_Y0);
    ctx.save();
    ctx.setLineDash([6, 5]); ctx.strokeStyle = "rgb(74,68,58)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.restore();
    const l = wpt(g, g.AXIS_X, g.RING_TOP - 1.45);
    ctext(ctx, l[0], l[1], "connector axis", 11, "rgb(120,112,96)");
  }

  function drawApronNotes(ctx, g) {
    if (g.KEEP_CLEAR[3] > 0) {
      const b = box(g, g.KEEP_CLEAR), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      ctext(ctx, cx, cy - 9, "keep clear", 13, "rgb(118,102,68)");
      ctext(ctx, cx, cy + 9, g.KEEP_CLEAR[2] + "×" + g.KEEP_CLEAR[3], 13, "rgb(118,102,68)");
    }

    const tone = "rgb(160,150,130)", bx = g.APRON[0] + g.APRON[2] + 0.45;
    ctx.strokeStyle = tone; ctx.lineWidth = 1;
    const seg = (p, q) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
    seg(wpt(g, bx, g.APRON[1]), wpt(g, bx, g.APRON[1] + g.APRON[3]));
    [g.APRON[1], g.APRON[1] + g.APRON[3]].forEach((yy) =>
      seg(wpt(g, bx - 0.15, yy), wpt(g, bx + 0.15, yy)));

    // Text always runs horizontally in world space, so under a 90-degree turn a label's
    // WIDTH sweeps along logical y. Anchoring mid-connector keeps that sweep in the void.
    const l = wpt(g, bx + 2.9, g.CONN_Y0 + g.GATE_H / 2 - 1.5);
    ctext(ctx, l[0], l[1] - 10, "apron " + g.APRON[2] + "×" + g.APRON[3], 13, "rgb(140,128,105)");
    ctext(ctx, l[0], l[1] + 10, "portal band " + g.PORTAL_BAND[2] + "×" + g.PORTAL_BAND[3] +
          "  =  " + g.PW + " + " + PORTAL_GAP + " + " + g.PW, 13, "rgb(140,128,105)");
  }

  function drawRulers(ctx, g) {
    for (let tx = 0; tx <= g.WORLD_W; tx += RULER)
      ctext(ctx, MARGIN + tx * g.tile, MARGIN + TITLE_H - 12, String(tx), 11, "rgb(130,128,122)");
    for (let ty = 0; ty <= g.WORLD_H; ty += RULER)
      ctext(ctx, MARGIN - 17, MARGIN + TITLE_H + ty * g.tile, String(ty), 11, "rgb(130,128,122)");
  }

  function labelRegion(ctx, g, r, text, color, at) {
    const b = box(g, r), y = at === "bottom" ? b[3] - 16 : b[1] + 16;
    ltext(ctx, b[0] + 12, y, text, 16, color);
  }

  function drawChrome(ctx, g, plan, roster, ts) {
    const boardRight = MARGIN + g.WORLD_W * g.tile;

    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = INK;
    const title = "PoU  ·  Pass Occupation War Map  ·  v" + g.version;
    // Down to a size the board can hold, rather than off the edge of it.
    let titleSize = 30;
    ctx.font = fontStr(titleSize);
    while (titleSize > 15 && ctx.measureText(title).width > boardRight - MARGIN) {
      titleSize -= 1;
      ctx.font = fontStr(titleSize);
    }
    ctx.fillText(title, MARGIN, MARGIN - 16);
    const titleEnd = MARGIN + ctx.measureText(title).width;

    let right = plan.stats.portals + " portals  ·  pass " + PASS_W + "×" + PASS_H;
    if (roster.length) {
      const sum = roster.reduce((a, m) => a + m.bgb, 0);
      right = roster.length + " members  ·  Σ BGB " + shortCP(sum) + "  ·  " + right;
    }

    /* A narrow board leaves the stats nowhere to sit: shrink them to fit beside
       the title, and drop them below it when even that will not do. Setting the
       width from the two sides of the pass makes a narrow board easy to ask
       for, so this is no longer an edge case. */
    let size = 18;
    ctx.font = fontStr(size);
    const room = boardRight - titleEnd - 24;
    while (size > 11 && ctx.measureText(right).width > room) {
      size -= 1;
      ctx.font = fontStr(size);
    }
    ctx.fillStyle = "rgb(90,90,90)";
    if (ctx.measureText(right).width <= room) {
      ctx.textAlign = "right";
      ctx.fillText(right, boardRight, MARGIN - 10);
      ctx.textAlign = "left";
      ctx.fillStyle = "rgb(140,140,140)"; ctx.font = fontStr(14);
      ctx.fillText(ts, MARGIN, MARGIN + 11);
    } else {
      ctx.font = fontStr(13);
      ctx.fillText(right, MARGIN, MARGIN + 11);
      ctx.fillStyle = "rgb(140,140,140)"; ctx.font = fontStr(12);
      ctx.fillText(ts, MARGIN, MARGIN + 27);
    }

    const ly = MARGIN + TITLE_H + g.WORLD_H * g.tile + 34;
    let x = MARGIN;
    const entries = [["PASS", "Pass " + PASS_W + "×" + PASS_H, FILLS.PASS],
                     ["PORTAL", "Portal 2×2 · owned", FILLS.PORTAL],
                     ["PORTAL", "free portal", FREE_PORTAL]];
    if (plan.stats.shelters) entries.push(["SHELTER", "Shelter 3×3", FILLS.SHELTER]);
    ctx.textAlign = "left";
    for (const [kind, label, col] of entries) {
      const [w, h] = SIZES[kind], bw = w * 8, bh = h * 8;
      ctx.fillStyle = col; ctx.fillRect(x, ly - bh / 2, bw, bh);
      ctx.strokeStyle = "rgb(255,255,255)"; ctx.lineWidth = 1; ctx.strokeRect(x, ly - bh / 2, bw, bh);
      x += bw + 8;
      ltext(ctx, x, ly, label, 14, INK);
      ctx.font = fontStr(14);
      x += ctx.measureText(label).width + 26;
    }
    ctx.fillStyle = CONN_FILL; ctx.fillRect(x, ly - 12, 24, 24);
    ctx.strokeStyle = "rgb(190,182,165)"; ctx.lineWidth = 1; ctx.strokeRect(x, ly - 12, 24, 24);
    ctx.save(); ctx.beginPath(); ctx.rect(x, ly - 12, 24, 24); ctx.clip();
    ctx.strokeStyle = "rgb(190,183,165)";
    for (let k = -24; k < 24; k += 9) {
      ctx.beginPath(); ctx.moveTo(x + k, ly - 12); ctx.lineTo(x + k + 24, ly + 12); ctx.stroke();
    }
    ctx.restore();
    x += 32;
    ltext(ctx, x, ly, "kept clear", 14, INK);

    let note = "1 tile = " + g.tile + "px  ·  pass at " + g.orient + "  ·  connector " +
      g.GATE_W + "×" + g.GATE_H + "  ·  apron " + g.APRON[2] + "×" + g.APRON[3] +
      "  ·  " + plan.stats.owned + " prioritized";
    note += g.CHANNELS.length
      ? "  ·  " + g.CHANNELS.map((c) => c[2] + "×" + c[3]).join(" and ") +
        " kept clear: shelters tile in 3s, portals in 2s"
      : "  ·  every structure flush";
    ctx.textAlign = "right";
    ltext(ctx, 0, 0, "", 13, INK);
    ctx.font = fontStr(13); ctx.fillStyle = "rgb(120,120,120)";
    ctx.fillText(note, MARGIN + g.WORLD_W * g.tile, ly);
    ctx.textAlign = "left";
  }

  function render(canvas, plan, roster, ts) {
    // Retina where it fits; a large camp would otherwise ask for a canvas the
    // browser refuses to allocate, and draw nothing at all.
    const g = plan.g, dpr = Math.min(2, 8192 / g.W, 8192 / g.H);
    canvas.width = g.W * dpr; canvas.height = g.H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = BG; ctx.fillRect(0, 0, g.W, g.H);
    fillRegion(ctx, g, g.OURS, OURS_FILL);
    fillRegion(ctx, g, g.RIVAL, RIVAL_FILL);
    fillRegion(ctx, g, g.CONN, CONN_FILL);

    hatchRegion(ctx, g, g.KEEP_CLEAR);
    hatchRegion(ctx, g, g.GAP_RECT);
    for (const c of g.CHANNELS) hatchRegion(ctx, g, c);
    if (plan.showZones) for (const z of g.ZONES)
      if (z[0][2] > 0 && z[0][3] > 0) fillRegion(ctx, g, z[0], ZONE_TINT[z[1]]);
    for (const r of [g.OURS, g.CONN, g.RIVAL]) gridRegion(ctx, g, r);
    for (const r of [g.OURS, g.CONN, g.RIVAL]) outlineRegion(ctx, g, r, EDGE);

    if (plan.showZones) drawZones(ctx, g, Math.max(0, roster.length - plan.stats.named));
    for (const s of plan.board.items) drawStructure(ctx, g, s);
    drawAxis(ctx, g);
    labelRegion(ctx, g, g.OURS, "PoU camp  —  our territory", "rgb(70,100,140)");
    labelRegion(ctx, g, g.RIVAL, "rival camp", "rgb(150,90,90)", "bottom");
    drawApronNotes(ctx, g);
    drawRulers(ctx, g);
    drawChrome(ctx, g, plan, roster, ts);
    return g;
  }

  global.PassWar = {
    SIZES, FILLS, FREE_PORTAL, SHELTER_ROW_N, SHELTER_ROWS_DEFAULT,
    VERSIONS, versionSpec, shelterCountFor, shelterGrid, normalizeOpts,
    GATE_W: CONNECTOR_W, GATE_H: CONNECTOR_H,
    parseCSV, parseMembers, shortCP, geometry, buildPlan, render, passDist, wrect
  };
})(ns);

export const PassWar = ns.PassWar
export default ns.PassWar
