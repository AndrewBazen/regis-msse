/*
 * 403: The Game — Level definitions
 * OWASP A01:2025 — Broken Access Control
 *
 * Each level is a self-contained access-control puzzle. The player edits ONE
 * thing in the Inspector and hits "Send Request". `evaluate(state)` decides
 * whether the exploit landed and, crucially, returns a DIAGNOSTIC message that
 * explains WHY a wrong attempt failed — never a bare "403 Forbidden".
 *
 * Every `postmortem.vulnerable` snippet carries an // INTENTIONAL VULNERABILITY
 * comment. These flaws are the lesson; no auth checks are added to fix them here.
 */

/* ---- tiny self-contained parsing helpers (used by evaluate functions) ---- */

function parseUrl(url) {
  // Returns { path, query } without relying on a real <base>. Tolerant of junk.
  try {
    const u = new URL(url, "https://placeholder.invalid");
    const query = {};
    u.searchParams.forEach((v, k) => { query[k] = v; });
    return { path: u.pathname, query, raw: url, hostname: u.hostname };
  } catch {
    return { path: "", query: {}, raw: url, hostname: "" };
  }
}

function parseCookies(str) {
  const out = {};
  String(str || "").split(";").forEach((pair) => {
    const i = pair.indexOf("=");
    if (i === -1) return;
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (k) out[k] = v;
  });
  return out;
}

function safeJson(str) {
  try { return { ok: true, value: JSON.parse(str) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

/* Reusable bits of faux-page markup */
const lock = '<span class="ico">&#128274;</span>';

const LEVELS = [
  /* ============================ LEVEL 1 ============================ */
  {
    num: 1,
    title: "Sequential IDOR",
    tag: "Insecure Direct Object Reference",
    goal: {
      persona: "You are <b>Jordan Reyes</b>, a regular customer of Vault Bank. Your own account is user&nbsp;<code>847</code>.",
      objective: "The bank's founder, <b>account #1</b>, holds a private balance the whole class wants to see. Open <b>user&nbsp;1's</b> account page."
    },
    brief: {
      title: "Insecure Direct Object Reference (IDOR)",
      body: `<p>Apps constantly expose references to internal objects &mdash; a user id, an order number, a document key &mdash; right in the URL or request (<code>?user=847</code>). That's fine <i>if</i> the server checks you're allowed to see the object it's about to return.</p>
        <p><b>The flaw:</b> when the server fetches the object by that reference and skips the ownership check, anyone can change the reference to read someone else's data. It is the single most common form of Broken Access Control, and exploiting it can be as simple as changing one number.</p>
        <div class="brief-task"><b>In this level:</b> tamper with the object reference in the URL to open an account that isn't yours.</div>`
    },
    hint: "The account you're viewing is named right there in the URL bar: <code>?user=847</code>. The server fetches whatever id it's handed — it never checks that the id belongs to <i>you</i>.",
    expand: "url",
    state: {
      method: "GET",
      url: "https://vaultbank.example.com/account?user=847",
      cookies: "session=8f3a2c91d4; theme=dark",
      jwt: { header: { alg: "HS256", typ: "JWT" }, payload: { sub: "847", name: "Jordan Reyes", role: "customer" }, signature: "Qm9ndXNTaWduYXR1cmU" },
      body: ""
    },
    appInitial:
      `<div class="page">
         <div class="page-head"><h1>Vault Bank</h1><span class="badge badge-user">customer</span></div>
         <p class="muted">Logged in as user <b>#847</b></p>
         <div class="card">
           <div class="kv"><span>Account holder</span><b>Jordan Reyes</b></div>
           <div class="kv"><span>Account number</span><b>****&nbsp;0847</b></div>
           <div class="kv"><span>Balance</span><b>$4,210.55</b></div>
         </div>
         <p class="muted small">Tip: the account shown is whatever <code>?user=</code> says.</p>
       </div>`,
    evaluate(s) {
      const { query } = parseUrl(s.url);
      const id = query.user;
      if (id === undefined) {
        return { ok: false, status: 400, statusText: "Bad Request",
          diagnostic: "The request has no <code>user</code> parameter at all. The page loads an account by id — put one back in the URL.",
          appHtml: `<div class="page"><div class="denied">400 — no account id supplied.</div></div>` };
      }
      if (id === "847") {
        return { ok: false, status: 200, statusText: "OK",
          diagnostic: "That worked — but it loaded <b>your own</b> account (#847). The goal is the founder's account, <b>#1</b>. The server never checks ownership, so just change the id.",
          appHtml: this.appInitial };
      }
      if (id === "1") {
        return { ok: true, status: 200, statusText: "OK",
          diagnostic: "Direct object reference exploited. You asked for id <code>1</code> and the server happily returned it — no ownership check.",
          appHtml:
            `<div class="page">
               <div class="page-head"><h1>Vault Bank</h1><span class="badge badge-admin">FOUNDER</span></div>
               <p class="muted">Viewing user <b>#1</b></p>
               <div class="card">
                 <div class="kv"><span>Account holder</span><b>Morgan Vale</b></div>
                 <div class="kv"><span>Account number</span><b>****&nbsp;0001</b></div>
                 <div class="kv"><span>Balance</span><b>$92,400,118.02</b></div>
               </div>
               <div class="secret">${lock} You are reading another user's private financial data. This is IDOR.</div>
             </div>` };
      }
      return { ok: false, status: 200, statusText: "OK",
        diagnostic: `You loaded user <b>#${escapeAttr(id)}</b>'s account — proving the flaw — but that's not the target. The founder is account <b>#1</b>.`,
        appHtml:
          `<div class="page">
             <div class="page-head"><h1>Vault Bank</h1><span class="badge badge-user">customer</span></div>
             <p class="muted">Viewing user <b>#${escapeHtml(id)}</b></p>
             <div class="card"><div class="kv"><span>Account holder</span><b>(some other customer)</b></div></div>
           </div>` };
    },
    postmortem: {
      summary: "You changed <code>?user=847</code> to <code>?user=1</code> and read another customer's account. The endpoint trusts the id in the URL and never asks \"does this record belong to the caller?\"",
      vulnerable:
`app.get('/account', (req, res) => {
  // INTENTIONAL VULNERABILITY: trusts the client-supplied id and never
  // checks that the record belongs to the logged-in user (IDOR).
  const account = db.accounts.findById(req.query.user);
  res.json(account);
});`,
      secure:
`app.get('/account', requireAuth, (req, res) => {
  // Ignore any client-supplied id. Resolve the record from the SESSION.
  const account = db.accounts.findByOwner(req.user.id);
  if (!account) return res.sendStatus(404);
  res.json(account);
  // To allow staff to view others, gate it: if (req.user.role !== 'admin') deny.
});`,
      lessons: [
        "Never use a raw client-supplied id to fetch a record without an authorization check.",
        "Derive the subject from the authenticated session, not from the request.",
        "Unguessable ids (UUIDs) raise the bar but are NOT access control — enforce ownership server-side."
      ]
    }
  },

  /* ============================ LEVEL 2 ============================ */
  {
    num: 2,
    title: "Forced Browsing",
    tag: "Hidden but unprotected route",
    goal: {
      persona: "You are a logged-in <b>customer</b> on the ShopFast storefront. There is no \"Admin\" link anywhere on your dashboard.",
      objective: "An internal admin console lives at <code>/admin</code>. It was never linked and the dev assumed \"nobody will find it\" — but it has <b>no access check</b>. Browse to it."
    },
    brief: {
      title: "Forced Browsing (missing function-level authorization)",
      body: `<p>Sensitive pages and endpoints sometimes ship with <i>no link</i> in the interface &mdash; the developer assumes that if it isn't linked, nobody will find it. But URLs leak: through browser history, JavaScript bundles, search engines, and automated wordlist scanners.</p>
        <p><b>The flaw:</b> "hidden" is not "protected." If the route itself has no authorization check, simply requesting the URL grants access. The fix is to protect every privileged route on the server, deny-by-default.</p>
        <div class="brief-task"><b>In this level:</b> browse directly to an admin route that was never linked &mdash; and never guarded.</div>`
    },
    hint: "Hidden &ne; protected. Edit the path in the URL bar from <code>/dashboard</code> to <code>/admin</code> and send.",
    expand: "url",
    state: {
      method: "GET",
      url: "https://shopfast.example.com/dashboard",
      cookies: "session=c7e1aa90b2; role=customer",
      jwt: { header: { alg: "HS256", typ: "JWT" }, payload: { sub: "5521", role: "customer" }, signature: "c2lnbmVk" },
      body: ""
    },
    appInitial:
      `<div class="page">
         <div class="page-head"><h1>ShopFast</h1><span class="badge badge-user">customer</span></div>
         <nav class="fakenav"><a class="active">Dashboard</a><a>Orders</a><a>Wishlist</a><a>Account</a></nav>
         <div class="card"><div class="kv"><span>Recent order</span><b>#A-99213 — shipped</b></div>
           <div class="kv"><span>Reward points</span><b>1,240</b></div></div>
         <p class="muted small">No admin link here. (That doesn't mean there's no admin page.)</p>
       </div>`,
    evaluate(s) {
      const { path } = parseUrl(s.url);
      const p = path.replace(/\/+$/, "") || "/"; // tolerate trailing slash
      if (p === "/dashboard" || p === "/") {
        return { ok: false, status: 200, statusText: "OK",
          diagnostic: "Still on your own dashboard. The admin console isn't linked from here — you have to type its path into the URL bar yourself.",
          appHtml: this.appInitial };
      }
      if (p === "/admin") {
        return { ok: true, status: 200, statusText: "OK",
          diagnostic: "Forced browsing successful. <code>/admin</code> exists and renders for <i>anyone</i> who knows the URL — there is no role check on the route.",
          appHtml:
            `<div class="page">
               <div class="page-head"><h1>ShopFast — Admin Console</h1><span class="badge badge-admin">ADMIN</span></div>
               <div class="card">
                 <div class="kv"><span>Total revenue (today)</span><b>$412,907</b></div>
                 <div class="kv"><span>Pending refunds</span><b>37</b></div>
                 <div class="kv"><span>Feature flags</span><b>edit&nbsp;&rsaquo;</b></div>
               </div>
               <div class="secret">${lock} A customer session just rendered the full admin console. No authorization required.</div>
             </div>` };
      }
      // wrong-but-plausible paths
      const known = { "/administrator": "Close — but the real route is exactly <code>/admin</code>, not <code>/administrator</code>.",
                      "/admin/login": "There's no login wall — the console itself is at <code>/admin</code> with no gate. Drop <code>/login</code>.",
                      "/wp-admin": "Wrong stack. This isn't WordPress — try the plain <code>/admin</code> path." };
      return { ok: false, status: 404, statusText: "Not Found",
        diagnostic: (known[p] || `No route at <code>${escapeHtml(p)}</code>.`) + " The unprotected console is at <code>/admin</code>.",
        appHtml: `<div class="page"><div class="denied">404 — no page at <code>${escapeHtml(p)}</code></div></div>` };
    },
    postmortem: {
      summary: "You navigated straight to <code>/admin</code>. The route renders for any session because the developer relied on the link being hidden — \"security by obscurity\" — instead of an authorization check.",
      vulnerable:
`// INTENTIONAL VULNERABILITY: the route is simply never linked in the UI.
// There is NO middleware checking the user's role, so anyone who types
// the path reaches the admin console.
app.get('/admin', (req, res) => {
  res.render('admin/console', { stats: getCompanyStats() });
});`,
      secure:
`app.get('/admin',
  requireAuth,
  requireRole('admin'),          // deny-by-default authorization
  (req, res) => {
    res.render('admin/console', { stats: getCompanyStats() });
  });`,
      lessons: [
        "Obscurity is not access control — assume every URL will be discovered (crawlers, JS bundles, wordlists).",
        "Protect routes with deny-by-default middleware, not by omitting the nav link.",
        "Apply authorization at the server, centrally, so new routes are protected by default."
      ]
    }
  },

  /* ============================ LEVEL 3 ============================ */
  {
    num: 3,
    title: "Cookie Tampering",
    tag: "Privilege escalation via client-side state",
    goal: {
      persona: "You're signed in to the MailRoom webapp. Your session cookie literally contains <code>role=customer</code>.",
      objective: "The server reads your role straight off the cookie and trusts it. Flip yourself to an <b>admin</b> and load the admin panel."
    },
    brief: {
      title: "Privilege Escalation via Client-Controlled State",
      body: `<p>Browsers hold state in cookies, <code>localStorage</code>, and hidden form fields &mdash; and the user can edit every bit of it. Treating any of that as trustworthy is dangerous.</p>
        <p><b>The flaw:</b> when the server reads your role or permissions straight from a cookie and believes it, you can simply rewrite the value to promote yourself. Roles must be looked up server-side from a trusted store, keyed by a signed session id &mdash; never read from a raw cookie.</p>
        <div class="brief-task"><b>In this level:</b> change a value the server trusts to escalate from customer to admin.</div>`
    },
    hint: "Open the Cookies pane. Change <code>role=customer</code> to <code>role=admin</code> — the server never verifies it.",
    expand: "cookies",
    state: {
      method: "GET",
      url: "https://mailroom.example.com/admin/panel",
      cookies: "session=a1b2c3d4e5; role=customer; theme=light",
      jwt: { header: { alg: "HS256", typ: "JWT" }, payload: { sub: "3092", role: "customer" }, signature: "dW5jaGVja2Vk" },
      body: ""
    },
    appInitial:
      `<div class="page">
         <div class="page-head"><h1>MailRoom</h1><span class="badge badge-user">customer</span></div>
         <div class="denied">${lock} 403 — the admin panel checks your <code>role</code> cookie. Right now it says <code>customer</code>.</div>
         <p class="muted small">The check is literally <code>if (cookies.role === 'admin')</code>.</p>
       </div>`,
    evaluate(s) {
      const c = parseCookies(s.cookies);
      if (c.role === undefined) {
        return { ok: false, status: 403, statusText: "Forbidden",
          diagnostic: "Your cookies no longer contain a <code>role</code> entry at all, so the server treats you as unprivileged. Add <code>role=admin</code>.",
          appHtml: this.appInitial };
      }
      if (c.role === "admin") {
        return { ok: true, status: 200, statusText: "OK",
          diagnostic: "Privilege escalated. The server read <code>role=admin</code> from a cookie <i>you</i> control and granted access — client-side state is never trustworthy.",
          appHtml:
            `<div class="page">
               <div class="page-head"><h1>MailRoom — Admin Panel</h1><span class="badge badge-admin">ADMIN</span></div>
               <div class="card">
                 <div class="kv"><span>Mailboxes</span><b>impersonate&nbsp;&rsaquo;</b></div>
                 <div class="kv"><span>Audit log</span><b>view / purge</b></div>
                 <div class="kv"><span>Broadcast email</span><b>compose&nbsp;&rsaquo;</b></div>
               </div>
               <div class="secret">${lock} Full admin control, granted by editing a string in your own browser.</div>
             </div>` };
      }
      if (c.role === "administrator" || c.role === "superuser" || c.role === "root") {
        return { ok: false, status: 403, statusText: "Forbidden",
          diagnostic: `The server compares against the exact string <code>'admin'</code>. <code>role=${escapeHtml(c.role)}</code> doesn't match — use exactly <code>admin</code>.`,
          appHtml: this.appInitial };
      }
      return { ok: false, status: 403, statusText: "Forbidden",
        diagnostic: `Your cookie says <code>role=${escapeHtml(c.role)}</code>. The panel only opens for <code>role=admin</code>.`,
        appHtml: this.appInitial };
    },
    postmortem: {
      summary: "You rewrote the <code>role</code> cookie from <code>customer</code> to <code>admin</code>. The server treats a value the client fully controls as the source of truth for authorization.",
      vulnerable:
`app.get('/admin/panel', (req, res) => {
  // INTENTIONAL VULNERABILITY: trusts a plain, client-editable cookie
  // as the authority on the user's role. The browser owns this value.
  if (req.cookies.role === 'admin') {
    return res.render('admin/panel');
  }
  res.sendStatus(403);
});`,
      secure:
`app.get('/admin/panel', requireAuth, (req, res) => {
  // Look the role up server-side from a trusted store, keyed by the
  // signed session id. Never read privilege from a raw cookie.
  const user = db.users.findById(req.session.userId);
  if (user.role !== 'admin') return res.sendStatus(403);
  res.render('admin/panel');
});`,
      lessons: [
        "Anything stored in the browser (cookies, localStorage, hidden fields) is attacker-controlled.",
        "Store only an opaque, signed session id client-side; keep roles and permissions server-side.",
        "If you must put claims in a token, sign it AND verify the signature on every request (see Level 7)."
      ]
    }
  },

  /* ============================ LEVEL 4 ============================ */
  {
    num: 4,
    title: "GraphQL Vertical IDOR",
    tag: "Object-level authorization missing in a resolver",
    goal: {
      persona: "You are employee <b>#847</b> querying CourierCo's GraphQL API. You can read your own employee record.",
      objective: "The CEO is employee <b>#1</b>, and the <code>user(id)</code> resolver does no ownership check. Edit the query to pull employee <b>1</b> and reveal their salary."
    },
    brief: {
      title: "Broken Object Level Authorization (API / GraphQL IDOR)",
      body: `<p>APIs expose many objects through a single endpoint or resolver, addressed by id. GraphQL is especially blunt about this: one <code>user(id)</code> field can return <i>any</i> user. The framework does <b>not</b> add authorization for you.</p>
        <p><b>The flaw:</b> if the resolver returns whatever id it's handed without checking the caller, it's IDOR &mdash; and "vertical" when the id points at higher-privileged data (an admin, an executive). This &mdash; Broken Object Level Authorization, or <b>BOLA</b> &mdash; is the #1 risk on the OWASP API Security Top 10.</p>
        <div class="brief-task"><b>In this level:</b> change an id in a GraphQL query to read a record well above your pay grade.</div>`
    },
    hint: "Open the Body pane. The GraphQL query asks for <code>user(id: \"847\")</code>. Change the id to <code>\"1\"</code>.",
    expand: "body",
    state: {
      method: "POST",
      url: "https://api.courierco.example.com/graphql",
      cookies: "session=ee20f1c8; role=employee",
      jwt: { header: { alg: "HS256", typ: "JWT" }, payload: { sub: "847", role: "employee" }, signature: "Z3FsdG9rZW4" },
      body: '{\n  "query": "{ user(id: \\"847\\") { name title salary } }"\n}'
    },
    appInitial:
      `<div class="page">
         <div class="page-head"><h1>CourierCo GraphQL</h1><span class="badge badge-user">employee</span></div>
         <p class="muted small">POST your query to <code>/graphql</code>. The current query returns your own record.</p>
         <pre class="resp">{
  "data": {
    "user": { "name": "You (Sam Okafor)", "title": "Driver", "salary": 54000 }
  }
}</pre>
       </div>`,
    evaluate(s) {
      const parsed = safeJson(s.body);
      if (!parsed.ok) {
        return { ok: false, status: 400, statusText: "Bad Request",
          diagnostic: `The request body isn't valid JSON (<code>${escapeHtml(parsed.error)}</code>). Keep the <code>{ "query": "..." }</code> envelope intact and only change the id.`,
          appHtml: `<div class="page"><div class="denied">400 — malformed JSON body</div></div>` };
      }
      const q = String(parsed.value.query || "");
      const m = q.match(/user\s*\(\s*id\s*:\s*\\?"?\s*([0-9]+)\s*\\?"?\s*\)/);
      if (!/\buser\s*\(/.test(q)) {
        return { ok: false, status: 400, statusText: "Bad Request",
          diagnostic: "Couldn't find a <code>user(id: \"…\")</code> field in your query. Keep the query shape and just swap the id.",
          appHtml: `<div class="page"><div class="denied">400 — query missing <code>user(id:)</code></div></div>` };
      }
      const id = m ? m[1] : null;
      if (id === "847") {
        return { ok: false, status: 200, statusText: "OK",
          diagnostic: "That returned <b>your own</b> record again. The resolver doesn't care whose id it is — change <code>\"847\"</code> to <code>\"1\"</code>.",
          appHtml: this.appInitial };
      }
      if (id === "1") {
        return { ok: true, status: 200, statusText: "OK",
          diagnostic: "Vertical IDOR via GraphQL. The <code>user</code> resolver returned employee #1's record with no check that you're allowed to see it.",
          appHtml:
            `<div class="page">
               <div class="page-head"><h1>CourierCo GraphQL</h1><span class="badge badge-admin">leaked</span></div>
               <pre class="resp">{
  "data": {
    "user": {
      "name": "Dana Whitfield",
      "title": "Chief Executive Officer",
      "salary": 2750000
    }
  }
}</pre>
               <div class="secret">${lock} You read the CEO's salary through a public-shaped query. The resolver never authorized the access.</div>
             </div>` };
      }
      return { ok: false, status: 200, statusText: "OK",
        diagnostic: `You queried employee <b>#${escapeHtml(id)}</b> — the flaw works on any id — but the target is the CEO, employee <b>#1</b>.`,
        appHtml: `<div class="page"><pre class="resp">{ "data": { "user": { "name": "(another employee)" } } }</pre></div>` };
    },
    postmortem: {
      summary: "You changed the GraphQL <code>user(id)</code> argument from your own id to <code>1</code>. The resolver returns whatever id it's given — GraphQL doesn't add authorization for you.",
      vulnerable:
`const resolvers = {
  Query: {
    // INTENTIONAL VULNERABILITY: returns any user by id with no check
    // that the caller is that user or otherwise authorized to see them.
    user: (_, { id }) => db.users.findById(id),
  },
};`,
      secure:
`const resolvers = {
  Query: {
    user: (_, { id }, ctx) => {
      if (!ctx.user) throw new ForbiddenError('Login required');
      // Object-level authorization in the resolver itself.
      if (ctx.user.id !== id && ctx.user.role !== 'admin') {
        throw new ForbiddenError('Not allowed to view this user');
      }
      return db.users.findById(id);
    },
  },
};`,
      lessons: [
        "A single GraphQL endpoint hides many objects — enforce authorization per resolver / per object.",
        "Field-level checks matter too: hide <code>salary</code> unless the caller may see it.",
        "Don't assume an internal API is safe; clients can send any query they like."
      ]
    }
  },

  /* ============================ LEVEL 5 ============================ */
  {
    num: 5,
    title: "HTTP Verb Swap",
    tag: "Inconsistent authorization across methods",
    goal: {
      persona: "You are a low-privilege author. <code>GET /api/posts/42</code> returns <b>403</b> — that read path is guarded.",
      objective: "Only the <code>GET</code> handler got an auth check. The <code>PUT</code>/<code>PATCH</code>/<code>DELETE</code> handlers were never guarded. Use a different verb on <code>/api/posts/42</code> to modify the post."
    },
    brief: {
      title: "Inconsistent Authorization Across HTTP Methods",
      body: `<p>A single resource (<code>/api/posts/42</code>) is usually served by several handlers &mdash; <code>GET</code> to read, <code>PUT</code>/<code>PATCH</code> to edit, <code>DELETE</code> to remove. Each is a separate piece of code.</p>
        <p><b>The flaw:</b> when an authorization check is added to one method but forgotten on the others, switching the HTTP verb sidesteps the guard entirely &mdash; you might be blocked from <i>reading</i> a record yet free to overwrite or delete it. Checks must be applied consistently to every method, ideally in one shared place.</p>
        <div class="brief-task"><b>In this level:</b> change the HTTP method to reach a handler nobody remembered to protect.</div>`
    },
    hint: "Open the Method pane and switch <code>GET</code> to <code>PUT</code> (or PATCH/DELETE). Keep the path on <code>/api/posts/42</code>.",
    expand: "method",
    state: {
      method: "GET",
      url: "https://blog.example.com/api/posts/42",
      cookies: "session=77aa12bd; role=author",
      jwt: { header: { alg: "HS256", typ: "JWT" }, payload: { sub: "611", role: "author" }, signature: "dmVyYnN3YXA" },
      body: '{ "title": "Edited by an unauthorized user", "published": false }'
    },
    appInitial:
      `<div class="page">
         <div class="page-head"><h1>Blog API</h1><span class="badge badge-user">author</span></div>
         <div class="denied">${lock} 403 — <code>GET /api/posts/42</code> is protected by an ownership check.</div>
         <p class="muted small">But the write verbs share the same path with no such check…</p>
       </div>`,
    evaluate(s) {
      const { path } = parseUrl(s.url);
      const method = String(s.method || "GET").toUpperCase();
      if (path !== "/api/posts/42") {
        return { ok: false, status: 404, statusText: "Not Found",
          diagnostic: `The target resource is <code>/api/posts/42</code>. Your path is <code>${escapeHtml(path)}</code>.`,
          appHtml: `<div class="page"><div class="denied">404 — wrong path</div></div>` };
      }
      if (method === "GET") {
        return { ok: false, status: 403, statusText: "Forbidden",
          diagnostic: "The <code>GET</code> handler is the one that <i>does</i> have the ownership check, so it denies you. Try a write verb (<code>PUT</code>, <code>PATCH</code>, or <code>DELETE</code>) — those were never guarded.",
          appHtml: this.appInitial };
      }
      if (method === "POST") {
        return { ok: false, status: 405, statusText: "Method Not Allowed",
          diagnostic: "There's no <code>POST</code> handler for an existing post id (POST is for creating). Use <code>PUT</code>/<code>PATCH</code>/<code>DELETE</code> to hit the unguarded update path.",
          appHtml: `<div class="page"><div class="denied">405 — POST not allowed on a specific post</div></div>` };
      }
      if (method === "PUT" || method === "PATCH" || method === "DELETE") {
        const verbed = method === "DELETE" ? "deleted" : "overwrote";
        return { ok: true, status: 200, statusText: "OK",
          diagnostic: `Verb tampering successful. <code>${method} /api/posts/42</code> skipped the authorization that only <code>GET</code> had, and you ${verbed} a post you can't even read.`,
          appHtml:
            `<div class="page">
               <div class="page-head"><h1>Blog API</h1><span class="badge badge-admin">${method}</span></div>
               <pre class="resp">{
  "id": 42,
  "title": "Edited by an unauthorized user",
  "published": false,
  "modifiedBy": "author #611 (not the owner)"
}</pre>
               <div class="secret">${lock} You could not GET this post, yet you just ${verbed} it. Authorization must cover every method.</div>
             </div>` };
      }
      return { ok: false, status: 400, statusText: "Bad Request",
        diagnostic: `Unrecognized method <code>${escapeHtml(method)}</code>. Pick a real HTTP verb.`,
        appHtml: `<div class="page"><div class="denied">400 — unknown method</div></div>` };
    },
    postmortem: {
      summary: "You switched the method from <code>GET</code> to <code>PUT</code>. The read route was protected, but the write routes on the same resource were registered without the same check.",
      vulnerable:
`// The read path is guarded...
app.get('/api/posts/:id', requireOwner, (req, res) => {
  res.json(db.posts.findById(req.params.id));
});

// INTENTIONAL VULNERABILITY: the write handlers on the SAME resource
// were added later and forgot the requireOwner check entirely.
app.put('/api/posts/:id', (req, res) => {
  db.posts.update(req.params.id, req.body);
  res.json(db.posts.findById(req.params.id));
});
app.delete('/api/posts/:id', (req, res) => {
  db.posts.remove(req.params.id);
  res.sendStatus(200);
});`,
      secure:
`// Apply the SAME authorization to every method on the resource.
const post = express.Router({ mergeParams: true });
post.use(requireAuth, requireOwner);   // covers GET, PUT, PATCH, DELETE

post.get('/',    (req, res) => res.json(load(req)));
post.put('/',    (req, res) => res.json(update(req)));
post.delete('/', (req, res) => res.sendStatus(remove(req)));

app.use('/api/posts/:id', post);`,
      lessons: [
        "Authorization must be consistent across GET/POST/PUT/PATCH/DELETE on the same object.",
        "Centralize checks (router-level middleware) so a new handler can't silently skip them.",
        "Test every verb — attackers will try the ones you forgot, including HEAD and OPTIONS."
      ]
    }
  },

  /* ============================ LEVEL 6 ============================ */
  {
    num: 6,
    title: "Mass Assignment",
    tag: "Unfiltered request body sets privileged fields",
    goal: {
      persona: "You're editing your own profile on the DevHub platform. The update form lets you change your display name and bio.",
      objective: "The update handler blindly spreads the whole request body onto your user record. Add a field the form never showed — <code>isAdmin: true</code> — to escalate."
    },
    brief: {
      title: "Mass Assignment (autobinding)",
      body: `<p>To save boilerplate, web frameworks can map an entire request body straight onto a database model &mdash; every key in the JSON becomes a field on the record.</p>
        <p><b>The flaw:</b> if the server doesn't restrict <i>which</i> fields are writable, the client can include privileged fields the form never showed &mdash; <code>isAdmin</code>, <code>role</code>, <code>balance</code> &mdash; and have them saved straight to the record. The fix is an explicit allow-list of editable fields.</p>
        <div class="brief-task"><b>In this level:</b> add a field the form never offered to the update request, and watch the server save it.</div>`
    },
    hint: "Open the Body pane. Add <code>\"isAdmin\": true</code> alongside the existing fields. The handler writes whatever keys you send.",
    expand: "body",
    state: {
      method: "PATCH",
      url: "https://devhub.example.com/api/users/me",
      cookies: "session=b09f3aa1; role=member",
      jwt: { header: { alg: "HS256", typ: "JWT" }, payload: { sub: "2048", role: "member" }, signature: "bWFzc2Fzc2lnbg" },
      body: '{\n  "displayName": "Pat Lin",\n  "bio": "Coffee, code, repeat."\n}'
    },
    appInitial:
      `<div class="page">
         <div class="page-head"><h1>DevHub — Edit Profile</h1><span class="badge badge-user">member</span></div>
         <div class="card">
           <div class="kv"><span>Display name</span><b>Pat Lin</b></div>
           <div class="kv"><span>Bio</span><b>Coffee, code, repeat.</b></div>
           <div class="kv"><span>Role</span><b>member</b></div>
         </div>
         <p class="muted small">The form only shows name &amp; bio — but the API accepts more.</p>
       </div>`,
    evaluate(s) {
      const parsed = safeJson(s.body);
      if (!parsed.ok) {
        return { ok: false, status: 400, statusText: "Bad Request",
          diagnostic: `The body isn't valid JSON (<code>${escapeHtml(parsed.error)}</code>). Add the new field with a comma, e.g. <code>"bio": "…",</code> then <code>"isAdmin": true</code>.`,
          appHtml: `<div class="page"><div class="denied">400 — malformed JSON body</div></div>` };
      }
      const obj = parsed.value || {};
      const hasKey = Object.prototype.hasOwnProperty.call(obj, "isAdmin");
      if (!hasKey) {
        return { ok: false, status: 200, statusText: "OK",
          diagnostic: "Profile updated — but only the fields you sent changed, and none of them were privileged. Add <code>\"isAdmin\": true</code> to the body.",
          appHtml: this.appInitial };
      }
      if (obj.isAdmin === "true") {
        return { ok: false, status: 200, statusText: "OK",
          diagnostic: "You sent <code>isAdmin</code> as the <i>string</i> <code>\"true\"</code>. The check is a strict boolean — use <code>true</code> with no quotes.",
          appHtml: this.appInitial };
      }
      if (obj.isAdmin === true) {
        return { ok: true, status: 200, statusText: "OK",
          diagnostic: "Mass assignment exploited. The handler spread your whole body onto the record, so <code>isAdmin: true</code> was written straight to your account.",
          appHtml:
            `<div class="page">
               <div class="page-head"><h1>DevHub — Edit Profile</h1><span class="badge badge-admin">ADMIN</span></div>
               <div class="card">
                 <div class="kv"><span>Display name</span><b>${escapeHtml(String(obj.displayName ?? "Pat Lin"))}</b></div>
                 <div class="kv"><span>Role</span><b>member</b></div>
                 <div class="kv"><span>isAdmin</span><b class="hot">true</b></div>
               </div>
               <div class="secret">${lock} A field the form never exposed was written because the server trusted the whole body.</div>
             </div>` };
      }
      return { ok: false, status: 200, statusText: "OK",
        diagnostic: `You set <code>isAdmin</code> to <code>${escapeHtml(JSON.stringify(obj.isAdmin))}</code>, which is falsy. Set it to the boolean <code>true</code>.`,
        appHtml: this.appInitial };
    },
    postmortem: {
      summary: "You added <code>isAdmin: true</code> to the profile-update body. The handler copies every key from the body onto the user record, so it happily wrote a field the UI never offered.",
      vulnerable:
`app.patch('/api/users/me', requireAuth, (req, res) => {
  // INTENTIONAL VULNERABILITY: spreads the entire request body onto the
  // record. Any field the client sends (isAdmin, role, balance...) is saved.
  Object.assign(req.user, req.body);
  db.users.save(req.user);
  res.json(req.user);
});`,
      secure:
`app.patch('/api/users/me', requireAuth, (req, res) => {
  // Allow-list exactly the fields a user may edit. Ignore everything else.
  const ALLOWED = ['displayName', 'bio', 'avatarUrl'];
  for (const key of ALLOWED) {
    if (key in req.body) req.user[key] = req.body[key];
  }
  db.users.save(req.user);
  res.json(req.user);
});`,
      lessons: [
        "Never bind a request body directly onto a model — use an explicit allow-list (or a typed DTO).",
        "Privileged fields (role, isAdmin, ownerId, price) must only change through dedicated, authorized paths.",
        "Block-lists rot; allow-lists fail safe when new fields are added to the model."
      ]
    }
  },

  /* ============================ LEVEL 7 ============================ */
  {
    num: 7,
    title: "JWT alg:none",
    tag: "Forged token — unsigned algorithm accepted",
    goal: {
      persona: "You hold a JSON Web Token that says <code>role: \"user\"</code>. The API's verifier was misconfigured to accept the <code>none</code> algorithm.",
      objective: "Forge an admin token: (1) change the payload <code>role</code> to <code>admin</code>, (2) set the header <code>alg</code> to <code>none</code>, and (3) clear the signature. Then send it."
    },
    brief: {
      title: "JWT Forgery &mdash; a 30-second primer",
      body: `<p>A <b>JSON Web Token</b> is just three Base64URL chunks joined by dots. It is <b>signed, not encrypted</b> &mdash; anyone can read <i>and rewrite</i> the contents. The signature is the only thing stopping forgery:</p>
        <div class="primer-jwt"><span class="jp-h">eyJhbGciOiJIUzI1NiJ9</span>.<span class="jp-p">eyJyb2xlIjoidXNlciJ9</span>.<span class="jp-s">k3yS1gn4tur3</span></div>
        <div class="primer-grid">
          <div class="primer-part h"><h4>&#9312; Header</h4><p>Which algorithm signs the token, e.g. <code>{"alg":"HS256"}</code>.</p></div>
          <div class="primer-part p"><h4>&#9313; Payload</h4><p>The claims &mdash; who you are and what you can do, e.g. <code>{"role":"user"}</code>.</p></div>
          <div class="primer-part s"><h4>&#9314; Signature</h4><p>A hash of header + payload, keyed with the server's <i>secret</i>. Proves nothing was changed.</p></div>
        </div>
        <div class="primer-warn"><b>The trap you're about to exploit:</b> some verifiers honor <code>{"alg":"none"}</code> &mdash; a special value meaning <i>&ldquo;no signature.&rdquo;</i> If the server accepts it, rewrite the payload (say, <code>role: admin</code>), set <code>alg: none</code>, delete the signature, and the server trusts it. Pin the algorithm and reject <code>none</code> to prevent this.</div>
        <div class="brief-task"><b>In this level:</b> forge an admin token using exactly that trick.</div>`
    },
    hint: "Open the JWT pane. It has three parts. Edit <b>payload</b> &rarr; <code>role: \"admin\"</code>, edit <b>header</b> &rarr; <code>alg: \"none\"</code>, and delete the <b>signature</b> entirely.",
    expand: "jwt",
    state: {
      method: "GET",
      url: "https://api.fintrust.example.com/admin/ledger",
      cookies: "session=(sent as Bearer token below)",
      jwt: { header: { alg: "HS256", typ: "JWT" }, payload: { sub: "9001", name: "Robin Ash", role: "user" }, signature: "S2j3mE9xQp8wL2vR7tN1aZ" },
      body: ""
    },
    appInitial:
      `<div class="page">
         <div class="page-head"><h1>FinTrust API</h1><span class="badge badge-user">user</span></div>
         <div class="denied">${lock} 403 — <code>/admin/ledger</code> requires <code>role: admin</code> in your token. Yours says <code>user</code>.</div>
         <p class="muted small">The verifier accepts <code>alg: none</code> — an unsigned token it will still trust.</p>
       </div>`,
    evaluate(s) {
      const alg = String(s.jwt.header && s.jwt.header.alg || "").toLowerCase();
      const role = s.jwt.payload && s.jwt.payload.role;
      const sig = String(s.jwt.signature || "");
      const missing = [];

      if (role !== "admin") missing.push("payload <code>role</code> still <code>" + escapeHtml(String(role)) + "</code> (set it to <code>admin</code>)");
      if (alg !== "none") missing.push("header <code>alg</code> still <code>" + escapeHtml(String(s.jwt.header && s.jwt.header.alg)) + "</code> (set it to <code>none</code>)");
      if (sig.trim() !== "") missing.push("a signature is still present (delete it — <code>alg:none</code> means <i>no</i> signature)");

      // Special teaching case: right role, but kept a real algorithm + signature.
      if (role === "admin" && alg !== "none" && sig.trim() !== "") {
        return { ok: false, status: 401, statusText: "Unauthorized",
          diagnostic: "You changed the role to <code>admin</code>, but the token is still signed with <code>" + escapeHtml(String(s.jwt.header && s.jwt.header.alg)) + "</code>. The server will recompute that signature with its secret, see your tampering, and reject it. Switch <code>alg</code> to <code>none</code> and drop the signature.",
          appHtml: this.appInitial };
      }
      // alg:none but role not changed
      if (alg === "none" && sig.trim() === "" && role !== "admin") {
        return { ok: false, status: 403, statusText: "Forbidden",
          diagnostic: "Good — the token is now unsigned (<code>alg:none</code>) and the server accepts it as-is. But the payload still says <code>role: " + escapeHtml(String(role)) + "</code>. Change it to <code>admin</code>.",
          appHtml: this.appInitial };
      }
      if (missing.length) {
        return { ok: false, status: 401, statusText: "Unauthorized",
          diagnostic: "Almost — still to do: " + missing.join("; ") + ".",
          appHtml: this.appInitial };
      }
      return { ok: true, status: 200, statusText: "OK",
        diagnostic: "Token forged. With <code>alg:none</code> the server skipped signature verification and trusted your hand-edited <code>role: admin</code> payload outright.",
        appHtml:
          `<div class="page">
             <div class="page-head"><h1>FinTrust — Admin Ledger</h1><span class="badge badge-admin">ADMIN</span></div>
             <div class="card">
               <div class="kv"><span>Accounts under management</span><b>$1.4B</b></div>
               <div class="kv"><span>Wire transfers</span><b>approve&nbsp;&rsaquo;</b></div>
               <div class="kv"><span>Token alg</span><b class="hot">none</b></div>
             </div>
             <div class="secret">${lock} An unsigned, self-issued token granted full admin. Never accept <code>alg:none</code>.</div>
           </div>` };
    },
    postmortem: {
      summary: "You set the header to <code>alg: none</code>, rewrote the payload role to <code>admin</code>, and removed the signature. A verifier that honors <code>none</code> performs no cryptographic check and trusts the forged claims.",
      vulnerable:
`const jwt = require('jsonwebtoken');
function getUser(req) {
  const token = bearer(req);
  // INTENTIONAL VULNERABILITY: 'none' is in the allowed algorithms, so a
  // token with header {alg:'none'} and no signature is accepted as valid.
  return jwt.verify(token, SECRET, { algorithms: ['HS256', 'none'] });
}`,
      secure:
`function getUser(req) {
  const token = bearer(req);
  // Pin the exact algorithm. 'none' (and alg confusion like RS256->HS256)
  // is rejected because the signature must verify against the secret/key.
  return jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  // Better: short-lived tokens + server-side revocation + asymmetric keys.
}`,
      lessons: [
        "Always pin the expected signing algorithm; never let the token's own header pick it.",
        "Reject <code>alg: none</code> outright — an unsigned token is just attacker-supplied JSON.",
        "JWTs are signed, not encrypted: anyone can read and rewrite the payload, so the signature is the only thing protecting it."
      ]
    }
  },

  /* ============================ LEVEL 8 ============================ */
  {
    num: 8,
    title: "Path Traversal",
    tag: "Unsanitized file path escapes its directory",
    goal: {
      persona: "You're using DocVault's download endpoint: <code>GET /download?file=report.pdf</code>. It serves files out of a <code>/docs</code> folder.",
      objective: "The server joins your <code>file</code> value onto the base folder with no sanitizing. Climb out with <code>../</code> and read <code>/admin/secrets.txt</code>."
    },
    brief: {
      title: "Path Traversal (directory traversal)",
      body: `<p>Endpoints that serve files often build a filesystem path by gluing user input onto a base directory: <code>/docs/</code> + <code>file</code>. The <code>../</code> sequence means &ldquo;go up one folder.&rdquo;</p>
        <p><b>The flaw:</b> if that input isn't sanitized, an attacker can stuff it with <code>../</code> to climb out of the intended directory and read arbitrary files &mdash; source code, config, credentials. The fix is to canonicalize the resolved path and confirm it stays inside the allowed base (or avoid passing raw paths at all).</p>
        <div class="brief-task"><b>In this level:</b> escape the documents folder with <code>../</code> to read an admin-only file.</div>`
    },
    hint: "Open the URL pane. Change <code>file=report.pdf</code> to <code>file=../admin/secrets.txt</code> — the <code>../</code> walks up out of <code>/var/docs</code>.",
    expand: "url",
    state: {
      method: "GET",
      url: "https://docvault.example.com/download?file=report.pdf",
      cookies: "session=df81aa02; role=staff",
      jwt: { header: { alg: "HS256", typ: "JWT" }, payload: { sub: "742", role: "staff" }, signature: "ZG9jdmF1bHQ" },
      body: ""
    },
    appInitial:
      `<div class="page">
         <div class="page-head"><h1>DocVault</h1><span class="badge badge-user">staff</span></div>
         <div class="card">
           <div class="kv"><span>Serving directory</span><b>/docs</b></div>
           <div class="kv"><span>Requested file</span><b>report.pdf</b></div>
         </div>
         <pre class="resp">report.pdf — Q3 logistics summary (you're allowed to read this).</pre>
       </div>`,
    evaluate(s) {
      const { query } = parseUrl(s.url);
      const file = query.file;
      if (file === undefined) {
        return { ok: false, status: 400, statusText: "Bad Request",
          diagnostic: "There's no <code>file</code> parameter now. Put it back and point it at the admin secrets with <code>../</code>.",
          appHtml: `<div class="page"><div class="denied">400 — no file requested</div></div>` };
      }
      const decoded = (() => { try { return decodeURIComponent(file); } catch { return file; } })();
      const normalized = normalizeServerPath("/docs", decoded);
      const hasTraversal = /\.\.[\/\\]/.test(decoded) || decoded.startsWith("/");

      if (!hasTraversal && /^report\.pdf$/i.test(decoded)) {
        return { ok: false, status: 200, statusText: "OK",
          diagnostic: "That served the allowed file from inside <code>/docs</code>. To reach the secret you must break <i>out</i> of that folder using <code>../</code>.",
          appHtml: this.appInitial };
      }
      if (normalized === "/admin/secrets.txt") {
        return { ok: true, status: 200, statusText: "OK",
          diagnostic: "Path traversal successful. <code>" + escapeHtml(decoded) + "</code> resolved to <code>/admin/secrets.txt</code> — outside the documents folder entirely.",
          appHtml:
            `<div class="page">
               <div class="page-head"><h1>DocVault</h1><span class="badge badge-admin">leaked</span></div>
               <div class="card"><div class="kv"><span>Resolved path</span><b class="hot">/admin/secrets.txt</b></div></div>
               <pre class="resp">ADMIN_API_KEY=sk_live_4Ttr0n2bD9...   # do not share
DB_ROOT_PASSWORD=h0rizon-staple-7
recovery_phrase: "violet ember anchor ...":</pre>
               <div class="secret">${lock} You read a file the endpoint was never meant to expose, just by walking the path up.</div>
             </div>` };
      }
      if (hasTraversal) {
        return { ok: false, status: 404, statusText: "Not Found",
          diagnostic: "You escaped <code>/docs</code> (the <code>../</code> worked) but landed on <code>" + escapeHtml(normalized) + "</code>, which isn't the target. Aim for <code>/admin/secrets.txt</code>.",
          appHtml: `<div class="page"><div class="denied">404 — <code>${escapeHtml(normalized)}</code> not found</div></div>` };
      }
      return { ok: false, status: 404, statusText: "Not Found",
        diagnostic: "No file named <code>" + escapeHtml(decoded) + "</code> inside <code>/docs</code>. Use <code>../</code> to climb out toward <code>/admin/secrets.txt</code>.",
        appHtml: `<div class="page"><div class="denied">404 — file not found in /var/docs</div></div>` };
    },
    postmortem: {
      summary: "You set <code>file=../admin/secrets.txt</code>. The server pasted that onto its base directory and resolved a path outside the intended folder, leaking admin secrets.",
      vulnerable:
`const path = require('path');
app.get('/download', (req, res) => {
  // INTENTIONAL VULNERABILITY: joins user input straight onto the base dir.
  // "../admin/secrets.txt" resolves OUTSIDE /docs.
  const full = path.join('/docs', req.query.file);
  res.sendFile(full);
});`,
      secure:
`app.get('/download', requireAuth, (req, res) => {
  const base = '/docs';
  // Resolve, then confirm the final path is still inside the base dir.
  const full = path.resolve(base, req.query.file);
  if (full !== base && !full.startsWith(base + path.sep)) {
    return res.sendStatus(403);            // traversal attempt
  }
  // Even better: never accept raw paths — map an id to a known file.
  res.sendFile(full);
});`,
      lessons: [
        "Treat any path/filename from the client as hostile — it may contain <code>../</code>, absolute paths, or URL-encoding.",
        "Canonicalize the resolved path and verify it stays within the allowed base directory.",
        "Best of all: don't pass file paths at all — map an opaque id to a server-side allow-list of files."
      ]
    }
  }
];

/* normalizeServerPath: resolve `input` relative to `base` like a POSIX server
 * would, collapsing ../ segments. Pure + dependency-free so it runs in-browser. */
function normalizeServerPath(base, input) {
  let combined = input.startsWith("/") ? input : base.replace(/\/+$/, "") + "/" + input;
  const parts = combined.split(/[\/\\]+/);
  const stack = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") { stack.pop(); continue; }
    stack.push(part);
  }
  return "/" + stack.join("/");
}

/* HTML-escaping helpers shared with game.js (defined here so evaluate() can use
 * them even though the engine also references them). Guarded against redefinition. */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(s) { return escapeHtml(s); }
