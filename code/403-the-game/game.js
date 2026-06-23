/*
 * 403: The Game — engine
 * Renders the three-panel layout, drives the level-aware Inspector, evaluates
 * "Send Request", shows diagnostic results + postmortems, and handles the JWT
 * primer and navigation. Pure vanilla JS; no dependencies, no build step.
 */

(function () {
  "use strict";

  /* ----------------------------- state ----------------------------- */
  const SAVE_KEY = "403game.progress.v1";
  let current = 0;          // index into LEVELS
  let state = null;         // working copy of the active level's inspector state
  let solved = new Set();   // level numbers already solved
  let openPane = null;      // which inspector pane is expanded
  let briefed = new Set();  // level numbers whose pre-brief was shown this session

  /* ----------------------------- dom ------------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  /* ------------------------- base64url codec ----------------------- */
  function b64urlEncode(obj) {
    const json = typeof obj === "string" ? obj : JSON.stringify(obj);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function buildJwt(jwt) {
    const h = b64urlEncode(jwt.header || {});
    const p = b64urlEncode(jwt.payload || {});
    const s = jwt.signature || "";
    return h + "." + p + "." + s;
  }

  /* ------------------------- progress / save ----------------------- */
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
      if (Array.isArray(raw.solved)) solved = new Set(raw.solved);
      if (typeof raw.current === "number") current = clamp(raw.current, 0, LEVELS.length - 1);
    } catch { /* ignore */ }
  }
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ solved: Array.from(solved), current }));
    } catch { /* ignore */ }
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /* --------------------------- level setup ------------------------- */
  function loadLevel(index, opts) {
    opts = opts || {};
    current = clamp(index, 0, LEVELS.length - 1);
    const level = LEVELS[current];
    state = deepClone(level.state);
    openPane = level.expand;
    save();

    renderProgress();
    renderGoal(level);
    renderApp(level.appInitial, null);
    renderInspector(level);
    clearResult();

    // Auto-show the per-level concept briefing once per session per level.
    if (!opts.noBrief) maybeBrief();
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  /* --------------------------- progress bar ------------------------ */
  function renderProgress() {
    const wrap = $("#progress");
    wrap.innerHTML = "";
    LEVELS.forEach((lvl, i) => {
      const dot = el("button", "step", String(lvl.num));
      dot.title = "Level " + lvl.num + " — " + lvl.title;
      if (solved.has(lvl.num)) dot.classList.add("done");
      if (i === current) dot.classList.add("active");
      // Allow jumping to any solved level or the next unsolved one.
      const reachable = i <= current || solved.has(lvl.num);
      if (reachable) dot.addEventListener("click", () => loadLevel(i));
      else dot.classList.add("locked");
      wrap.appendChild(dot);
    });
    $("#level-counter").textContent = "Level " + LEVELS[current].num + " / " + LEVELS.length;
    $("#level-title").textContent = LEVELS[current].title;
    $("#level-tag").textContent = LEVELS[current].tag;
  }

  /* ----------------------------- goal card ------------------------- */
  function renderGoal(level) {
    $("#goal-persona").innerHTML = level.goal.persona;
    $("#goal-objective").innerHTML = level.goal.objective;
    const hintBtn = $("#hint-toggle");
    const hintBody = $("#hint-body");
    hintBody.innerHTML = level.hint || "";
    hintBody.hidden = true;
    hintBtn.setAttribute("aria-expanded", "false");
  }

  /* ----------------------------- app panel ------------------------- */
  function renderApp(html, response) {
    const method = state ? state.method : "GET";
    const url = state ? state.url : "";
    $("#browser-method").textContent = method;
    $("#browser-method").className = "method-pill m-" + method.toUpperCase();
    $("#browser-url").textContent = url;

    const statusEl = $("#browser-status");
    if (response) {
      statusEl.hidden = false;
      statusEl.textContent = response.status + " " + response.statusText;
      statusEl.className = "browser-status " + (response.ok ? "ok" : "err");
    } else {
      statusEl.hidden = true;
    }
    $("#app-body").innerHTML = html;
  }

  /* --------------------------- inspector --------------------------- */
  function renderInspector(level) {
    const root = $("#inspector-panes");
    root.innerHTML = "";

    root.appendChild(pane("method", "Method", "The HTTP verb. Authorization sometimes differs per verb.", methodPaneBody()));
    root.appendChild(pane("url", "URL", "The full request target — path and query string.", urlPaneBody()));
    root.appendChild(pane("cookies", "Cookies", "Sent with every request. Fully editable by the client.", cookiesPaneBody()));
    root.appendChild(pane("jwt", "JWT (decoded)", "Header . Payload . Signature. Edit the JSON; the token re-encodes live.", jwtPaneBody()));
    root.appendChild(pane("body", "Request Body", "The payload sent with the request (JSON / GraphQL).", bodyPaneBody()));

    // expand the level-relevant pane
    setOpenPane(openPane);
  }

  function pane(key, label, sub, bodyNode) {
    const wrap = el("section", "pane");
    wrap.dataset.pane = key;
    const head = el("button", "pane-head");
    head.innerHTML =
      '<span class="pane-caret">&#9656;</span>' +
      '<span class="pane-label">' + label + '</span>' +
      '<span class="pane-sub">' + sub + '</span>';
    head.addEventListener("click", () => setOpenPane(openPane === key ? null : key));
    const body = el("div", "pane-body");
    body.appendChild(bodyNode);
    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  function setOpenPane(key) {
    openPane = key;
    $$(".pane").forEach((p) => {
      const isOpen = p.dataset.pane === key;
      p.classList.toggle("open", isOpen);
    });
  }

  function methodPaneBody() {
    const wrap = el("div", "field");
    const sel = el("select", "input mono");
    ["GET", "POST", "PUT", "PATCH", "DELETE"].forEach((m) => {
      const o = el("option", null, m);
      o.value = m;
      if (state.method === m) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => { state.method = sel.value; syncBrowserBar(); });
    wrap.appendChild(label("HTTP method"));
    wrap.appendChild(sel);
    return wrap;
  }

  function urlPaneBody() {
    const wrap = el("div", "field");
    wrap.appendChild(label("Request URL"));
    const inp = el("input", "input mono");
    inp.type = "text";
    inp.value = state.url;
    inp.spellcheck = false;
    inp.addEventListener("input", () => { state.url = inp.value; syncBrowserBar(); });
    wrap.appendChild(inp);
    return wrap;
  }

  function cookiesPaneBody() {
    const wrap = el("div", "field");
    wrap.appendChild(label("Cookie header (name=value; …)"));
    const ta = el("textarea", "input mono");
    ta.rows = 3;
    ta.value = state.cookies;
    ta.spellcheck = false;
    ta.addEventListener("input", () => { state.cookies = ta.value; });
    wrap.appendChild(ta);
    return wrap;
  }

  function bodyPaneBody() {
    const wrap = el("div", "field");
    wrap.appendChild(label("Request body"));
    const ta = el("textarea", "input mono");
    ta.rows = 6;
    ta.value = state.body || "";
    ta.spellcheck = false;
    ta.placeholder = "(empty)";
    ta.addEventListener("input", () => { state.body = ta.value; });
    wrap.appendChild(ta);
    return wrap;
  }

  function jwtPaneBody() {
    const wrap = el("div", "jwt-grid");

    const headerField = jsonField("Header", state.jwt.header, (val) => { state.jwt.header = val; refreshToken(); });
    const payloadField = jsonField("Payload", state.jwt.payload, (val) => { state.jwt.payload = val; refreshToken(); });

    const sigWrap = el("div", "field");
    sigWrap.appendChild(label("Signature"));
    const sigInp = el("input", "input mono sig");
    sigInp.type = "text";
    sigInp.value = state.jwt.signature || "";
    sigInp.spellcheck = false;
    sigInp.placeholder = "(empty — e.g. alg:none)";
    sigInp.addEventListener("input", () => { state.jwt.signature = sigInp.value; refreshToken(); });
    sigWrap.appendChild(sigInp);

    const tokenWrap = el("div", "field token-field");
    tokenWrap.appendChild(label("Encoded token (read-only, updates live)"));
    const token = el("div", "token mono");
    token.id = "jwt-token";
    tokenWrap.appendChild(token);

    wrap.appendChild(headerField);
    wrap.appendChild(payloadField);
    wrap.appendChild(sigWrap);
    wrap.appendChild(tokenWrap);

    // initial token paint (deferred until in DOM)
    setTimeout(refreshToken, 0);
    return wrap;
  }

  function jsonField(name, obj, onValid) {
    const wrap = el("div", "field");
    const lab = label(name);
    const status = el("span", "json-status", "valid JSON");
    lab.appendChild(status);
    wrap.appendChild(lab);
    const ta = el("textarea", "input mono");
    ta.rows = 4;
    ta.spellcheck = false;
    ta.value = JSON.stringify(obj, null, 2);
    ta.addEventListener("input", () => {
      try {
        const parsed = JSON.parse(ta.value);
        status.textContent = "valid JSON";
        status.className = "json-status ok";
        onValid(parsed);
      } catch (e) {
        status.textContent = "invalid JSON";
        status.className = "json-status bad";
      }
    });
    wrap.appendChild(ta);
    return wrap;
  }

  function refreshToken() {
    const token = $("#jwt-token");
    if (!token) return;
    const t = buildJwt(state.jwt);
    const parts = t.split(".");
    token.innerHTML =
      '<span class="jp jp-h">' + escapeHtml(parts[0]) + '</span>.' +
      '<span class="jp jp-p">' + escapeHtml(parts[1] || "") + '</span>.' +
      '<span class="jp jp-s">' + escapeHtml(parts[2] || "") + '</span>';
  }

  function label(text) { return el("label", "field-label", text); }

  function syncBrowserBar() {
    $("#browser-url").textContent = state.url;
    const m = (state.method || "GET").toUpperCase();
    $("#browser-method").textContent = m;
    $("#browser-method").className = "method-pill m-" + m;
  }

  /* ------------------------- send / evaluate ----------------------- */
  function send() {
    const level = LEVELS[current];
    let response;
    try {
      response = level.evaluate(state);
    } catch (e) {
      response = { ok: false, status: 500, statusText: "Internal Error",
        diagnostic: "The request couldn't be processed: " + escapeHtml(e.message),
        appHtml: '<div class="page"><div class="denied">500 — could not process request</div></div>' };
    }
    renderApp(response.appHtml || level.appInitial, response);
    showResult(response);

    if (response.ok) {
      solved.add(level.num);
      save();
      renderProgress();
      setTimeout(() => openPostmortem(level), 650);
    }
  }

  function showResult(response) {
    const box = $("#result");
    box.hidden = false;
    box.className = "result " + (response.ok ? "ok" : "err");
    const tag = response.ok ? "ACCESS GRANTED" : (response.status + " " + response.statusText);
    box.innerHTML =
      '<div class="result-head"><span class="result-status">' + tag + '</span></div>' +
      '<div class="result-msg">' + response.diagnostic + '</div>';
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearResult() { const box = $("#result"); box.hidden = true; box.innerHTML = ""; }

  /* --------------------------- postmortem -------------------------- */
  function openPostmortem(level) {
    const pm = level.postmortem;
    $("#pm-level").textContent = "Level " + level.num + " — " + level.title;
    $("#pm-summary").innerHTML = pm.summary;
    $("#pm-vuln-code").textContent = pm.vulnerable;
    $("#pm-secure-code").textContent = pm.secure;
    const ul = $("#pm-lessons");
    ul.innerHTML = "";
    pm.lessons.forEach((li) => ul.appendChild(el("li", null, li)));

    const nextBtn = $("#pm-next");
    const last = current >= LEVELS.length - 1;
    nextBtn.textContent = last ? "See the wrap-up →" : "Next level →";
    nextBtn.onclick = () => {
      closeModal("#modal-postmortem");
      if (last) openWin();
      else loadLevel(current + 1);
    };
    openModal("#modal-postmortem");
  }

  /* ----------------------- tutorial / briefing --------------------- */
  const BRIEF_KEY = "403game.briefed";
  const TUT_KEY = "403game.tutorialSeen";

  function loadBriefed() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(BRIEF_KEY) || "[]");
      if (Array.isArray(raw)) briefed = new Set(raw);
    } catch { /* ignore */ }
  }
  function saveBriefed() {
    try { sessionStorage.setItem(BRIEF_KEY, JSON.stringify(Array.from(briefed))); } catch { /* ignore */ }
  }

  function openTutorial() { openModal("#modal-tutorial"); }

  function maybeBrief() {
    const level = LEVELS[current];
    if (briefed.has(level.num)) return;
    openBrief(level);
  }

  function openBrief(level) {
    briefed.add(level.num);
    saveBriefed();
    const b = level.brief || { title: level.title, body: "" };
    $("#brief-eyebrow").textContent = "Level " + level.num + " Briefing";
    $("#brief-title").innerHTML = b.title;
    $("#brief-body").innerHTML = b.body;
    openModal("#modal-brief");
  }

  /* ------------------------------ win ------------------------------ */
  function openWin() { openModal("#modal-win"); }

  /* ----------------------------- modals ---------------------------- */
  function openModal(sel) {
    const m = $(sel);
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add("show"));
  }
  function closeModal(sel) {
    const m = $(sel);
    m.classList.remove("show");
    setTimeout(() => { m.hidden = true; }, 200);
  }

  /* ----------------------------- wiring ---------------------------- */
  function wire() {
    $("#send").addEventListener("click", send);
    $("#reset").addEventListener("click", () => loadLevel(current, { noBrief: true }));

    $("#hint-toggle").addEventListener("click", () => {
      const body = $("#hint-body");
      const open = body.hidden;
      body.hidden = !open;
      $("#hint-toggle").setAttribute("aria-expanded", String(open));
    });

    $("#prev").addEventListener("click", () => { if (current > 0) loadLevel(current - 1); });
    $("#next-nav").addEventListener("click", () => {
      const canAdvance = solved.has(LEVELS[current].num) && current < LEVELS.length - 1;
      if (canAdvance) loadLevel(current + 1);
    });

    // tutorial controls
    $("#how-to-play").addEventListener("click", openTutorial);
    $("#tutorial-start").addEventListener("click", () => {
      localStorage.setItem(TUT_KEY, "1");
      closeModal("#modal-tutorial");
      if ($("#modal-brief").hidden) maybeBrief();
    });

    // briefing controls
    $("#briefing-btn").addEventListener("click", () => openBrief(LEVELS[current]));
    $("#brief-start").addEventListener("click", () => closeModal("#modal-brief"));
    $("#brief-howto").addEventListener("click", openTutorial);

    // win controls
    $("#win-restart").addEventListener("click", () => {
      solved = new Set(); current = 0; save();
      briefed = new Set(); saveBriefed();
      closeModal("#modal-win");
      loadLevel(0);
    });

    // generic modal close buttons + backdrop
    $$("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(btn.getAttribute("data-close")));
    });
    $$(".modal").forEach((m) => {
      m.addEventListener("mousedown", (e) => { if (e.target === m) closeModal("#" + m.id); });
    });

    // keyboard: Ctrl/Cmd+Enter sends
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); send(); }
      if (e.key === "Escape") $$(".modal").forEach((m) => { if (!m.hidden) closeModal("#" + m.id); });
    });

    // reset-all progress
    $("#reset-all").addEventListener("click", () => {
      solved = new Set(); current = 0;
      briefed = new Set(); saveBriefed();
      save();
      loadLevel(0);
    });
  }

  /* ------------------------------ boot ----------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    load();
    loadBriefed();
    wire();
    loadLevel(current, { noBrief: true }); // render first, then decide what to auto-show

    // First-ever visit: show the how-to-play tutorial, then the level briefing.
    // Returning players: just show the current level's briefing (once per session).
    if (!localStorage.getItem(TUT_KEY)) openTutorial();
    else maybeBrief();
  });
})();
