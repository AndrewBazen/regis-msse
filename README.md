# regis-msse

Coursework and project artifacts for **MSSE 642 — Secure Software Engineering** at Regis University.

## Contents

### `assignments/weekly-projects/`

Hands-on weekly projects.

- [`project-1-labsetup.md`](assignments/weekly-projects/project-1-labsetup.md) — Penetration testing lab setup on Windows 11 using VirtualBox, Kali Linux (attacker), and Metasploitable 2 (target) on an isolated host-only network.
- [`project-2-threat-model.md`](assignments/weekly-projects/project-2-threat-model.md) — Secure SDLC and threat model for a Hiking Club web application. Group project with Depen Tamang and Anusha Reddy.
- [`project-3-pentesting1.md`](assignments/weekly-projects/project-3-pentesting1.md) — Penetration testing walkthrough using the Metasploit Framework and Nessus against Metasploitable 2, with findings and suggested remediations.
- [`project-4-penlab-2.md`](assignments/weekly-projects/project-4-penlab-2.md) — Web-application penetration test (Part 2) of the Hiking Club app: a from-scratch Flask + SQLite rebuild coded with an agentic tool, deployed to an isolated lab VM, and tested with gobuster (content discovery) and OWASP ZAP (active scanning). Group project with Anusha Reddy. Source lives in [`code/hiking-club-app/`](code/hiking-club-app/).

### `assignments/vibe-coding-assignments/`

OWASP Top 10 (2025) teaching demos built with AI coding agents (Replit for 1–2, Claude Code for 3).

- [`vibe-coding-1.md`](assignments/vibe-coding-assignments/vibe-coding-1.md) — A07:2025 Identification and Authentication Failures: hacker-simulator game with deliberately weak login logic.
- [`vibe-coding-2.md`](assignments/vibe-coding-assignments/vibe-coding-2.md) — A04:2025 Cryptographic Failures: *CipherLock*, a six-room escape-room game where each room exploits a different cryptographic failure (including an ECB-mode demo and a fake Git history endpoint).
- [`vibe-coding-3.md`](assignments/vibe-coding-assignments/vibe-coding-3.md) — A01:2025 Broken Access Control: *403: The Game*, an eight-level puzzle game where the player tampers with an editable HTTP request (URL, cookies, JWT, body, verb) to exploit IDOR, forced browsing, cookie tampering, GraphQL/BOLA, verb swapping, mass assignment, JWT `alg:none`, and path traversal — with a concept pre-brief and vulnerable-vs-secure postmortem per level. Source lives in [`code/403-the-game/`](code/403-the-game/).

### `assignments/images/`

Screenshots and diagrams referenced by the project write-ups.

### `code/`

Source code for assignments that ship runnable artifacts.

- [`code/403-the-game/`](code/403-the-game/) — *403: The Game* (Vibe Coding 3). A dependency-free static site (vanilla HTML/CSS/JS); open `index.html` in a browser to play.
- [`code/hiking-club-app/`](code/hiking-club-app/) — Hiking Club Application (Project 4). A Flask + SQLite web app with guest/member/admin roles; the deployable, scan-target build used for the Project 4 penetration test. See its [README](code/hiking-club-app/README.md) to run it locally, with Docker, or on a lab VM.

### `assignments/research-presentation/`

Reserved for upcoming work.

## Layout

```
regis-msse/
├── assignments/
│   ├── weekly-projects/         # Project write-ups (Markdown)
│   ├── vibe-coding-assignments/ # OWASP teaching-demo write-ups
│   ├── research-presentation/
│   └── images/                  # Screenshots for the write-ups
└── code/
    ├── 403-the-game/            # Vibe Coding 3 — playable static site
    └── hiking-club-app/         # Project 4 — Flask + SQLite pen-test target
```

## Author

Andrew Bazen — MSSE 642, Regis University.
