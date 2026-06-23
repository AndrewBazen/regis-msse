# 403: The Game

An educational puzzle game that teaches **OWASP A01:2025 — Broken Access Control**.

The player works through **8 self-contained access-control puzzles**. Each one is a tiny,
deliberately broken web app. Every level opens with a short **pre-brief** explaining the
vulnerability concept; then you read the **Goal Card**, change **one thing** in the
**Inspector**, hit **Send Request**, and watch the flaw let you reach something you were
never supposed to. Finally a **Postmortem** shows the vulnerable backend code next to the
secure version. A one-time **"How to play" tutorial** appears on first run (reopenable from
the toolbar).

> ⚠️ Every vulnerability here is an **intentional teaching feature**. Each broken route in
> the postmortems is marked `// INTENTIONAL VULNERABILITY`. This code demonstrates flaws —
> do not copy it into anything real.

## How to run

No build step, no dependencies, no server. Just open the file:

```
code/403-the-game/index.html   →  double-click, or open in any modern browser
```

Progress is saved in your browser's `localStorage`, so you can close the tab and pick up
where you left off. "Reset all" (top right) clears it.

## The three-panel layout

Every level uses the same layout:

- **The App** — a rendered fake web page shown in faux-browser chrome (URL bar + method pill + status).
- **The Inspector** — the current **URL, HTTP method, cookies, decoded JWT, and request body**, all editable. The pane that matters for the current level is **expanded by default**.
- **The Goal Card** — who you are this level and what you need to access, plus an optional hint.

You change one field, press **Send Request** (or `Ctrl`/`Cmd`+`Enter`), and the engine tells
you what happened. **Error messages are diagnostic** — they explain *why* an attempt failed
(e.g. "that loaded your own account; the target is #1"), never a bare "403 Forbidden."

## The 8 puzzles

| # | Puzzle | Broken Access Control flaw | The edit |
|---|--------|----------------------------|----------|
| 1 | Sequential IDOR | Object reference with no ownership check | `?user=847` → `?user=1` |
| 2 | Forced browsing | Hidden but unprotected route | path → `/admin` |
| 3 | Cookie tampering | Trusting a client-held role | `role=customer` → `role=admin` |
| 4 | GraphQL vertical IDOR | Resolver without object authorization | query `id: "847"` → `"1"` |
| 5 | HTTP verb swap | Auth check on `GET` only | method `GET` → `PUT` |
| 6 | Mass assignment | Request body bound onto the model | add `"isAdmin": true` |
| 7 | JWT `alg:none` | Verifier accepts unsigned tokens | role→admin, `alg`→none, drop signature |
| 8 | Path traversal | Unsanitized file path | `file=../admin/secrets.txt` |

Every level is preceded by a concept **pre-brief**. For Level 7 that pre-brief is a
**30-second JWT primer** explaining the header/payload/signature structure and the
`alg:none` trap, since forging a token assumes you know what one is.

## Project structure

```
code/403-the-game/
├── index.html    layout shell, modals (tutorial, level briefing, postmortem, win screen)
├── styles.css    dark terminal theme + faux-browser chrome
├── levels.js     the 8 levels: puzzle data, evaluate() logic, postmortem code
├── game.js       engine: inspector panes, JWT base64url codec, send/diagnostics, navigation
└── README.md     this file
```

## What it teaches

Broken Access Control is OWASP's **#1** web risk. It isn't one bug — it's a family:
horizontal and vertical IDOR, missing function-level authorization, privilege escalation
via client-controlled state, inconsistent checks across HTTP methods, mass assignment,
token forgery, and path traversal. By the end you've *performed* each one and seen the
one-line server-side fix for it.

---
Part of the MSSE 642 (Secure Software Engineering, Regis University) vibe-coding series,
alongside **BreachQuest** (A07) and **CipherLock** (A04).
