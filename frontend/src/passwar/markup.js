/* The Pass War markup, lifted from the original index.html.
 * A template rather than JSX because app.js drives these nodes by id: React
 * owns the host element, and everything inside it belongs to app.js. */
export default `
<header class="appbar">
  <div class="inner">
    <div class="brand">
      <span class="logo">🚪</span>
      <div>
        <h1 class="text-gradient">PoU Pass Occupation War</h1>
        <div class="sub">Portal &amp; shelter placement around the pass</div>
      </div>
      <span class="spacer"></span>
      <span class="who"><span id="whoami"></span></span>
    </div>

    <div class="toolbar">
      <label class="field">Version
        <select id="version">
          <option value="1">v1 · portal layer under shelters</option>
          <option value="2">v2 · shelters on the border</option>
          <option value="3">v3 · all portals</option>
          <option value="4">v4 · 4 shelter layers on the border</option>
        </select>
      </label>
      <label class="field">Pass at
        <select id="orient">
          <option value="bottom">bottom</option><option value="top">top</option>
          <option value="left">left</option><option value="right">right</option>
        </select>
      </label>
      <label class="field">Prioritised
        <input type="range" id="owners" min="0" max="100" step="1" />
        <b id="ownersOut" style="min-width:2ch">24</b>
      </label>
      <label class="field">Layers <input type="number" id="layers" min="0" max="8" /></label>
      <label class="field">Lean
        <select id="bias"><option value="left">left</option><option value="right">right</option></select>
      </label>
      <label class="toggle"><input type="checkbox" id="zones" />Build-out zones</label>
      <span class="spacer"></span>
      <button class="btn" id="refresh">↻ Refresh</button>
      <button class="btn" id="full">⤢ Actual size</button>
      <button class="btn primary" id="png">⬇ Download PNG</button>
    </div>
  </div>
</header>

<main>
  <section>
    <div class="stage" id="stage">
      <div id="wrap"><canvas id="map" width="400" height="300"></canvas></div>
    </div>
    <p class="status" id="status"></p>
    <p class="src" id="src"></p>
  </section>

  <aside class="panel">
    <div class="savebar" id="savebar" hidden>
      <div class="savenote" id="savenote"></div>
      <select id="planpick" class="planpick" title="Which plan to view"></select>
      <div class="saveactions">
        <button class="btn" id="reload" title="Discard local changes and reload this plan">↻ Reload</button>
        <button class="btn" id="savedraft">Draft saved</button>
        <button class="btn" id="publish" title="Publish this plan as the official one">★ Publish</button>
      </div>
      <div class="savemsg" id="savemsg"></div>
    </div>
    <h2>Line-up</h2>
    <div class="sub">Order is priority — the top of this list gets the slots nearest the pass.
      <b id="slotinfo"></b>.<br />Drag the number to move a player, or nudge with ⤒ ↑ ↓.
      <button class="btn link" id="reset">reset to BGB order</button></div>
    <div class="merc">
      <input id="mname" placeholder="Mercenary name" autocapitalize="none" />
      <input id="mcp" class="cp" placeholder="BGB CP" inputmode="numeric" />
      <button class="btn" id="addmerc">+ Add</button>
    </div>
    <div class="bulkrow"><button class="btn link" id="bulktoggle">＋ bulk add…</button></div>
    <div class="merc bulkbox" id="bulkbox" hidden>
      <textarea id="mbulk" rows="3" placeholder="Ronin, Kaida, Vex — separate names with commas"></textarea>
      <button class="btn" id="addbulk">+ Add all</button>
    </div>
    <div class="mercerr" id="mercerr"></div>
    <ul class="lineup" id="lineup"></ul>
  </aside>
</main>
`
