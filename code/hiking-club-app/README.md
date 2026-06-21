# Hiking Club Application

A small Flask + SQLite web application for a community hiking club, built for
**MSSE 642 — Project 4**. It implements the design described in the group's
Project 2 threat model (`assignments/weekly-projects/project-2-threat-model.md`).

The app supports three kinds of users:

| Role   | Logged in? | Can do                                                          |
|--------|------------|-----------------------------------------------------------------|
| Guest  | No         | View the public list of upcoming events.                        |
| Member | Yes        | Register/log in, view & edit **their own** profile, browse events, register for events, see "My Events". |
| Admin  | Yes        | Everything a member can, plus create events and view the member list via the admin dashboard. |

This is normal, functional application code intended to be deployed on a single
VM in an isolated lab and scanned with OWASP ZAP. No deliberate vulnerabilities
have been added.

---

## Tech stack

- Python 3 + [Flask](https://flask.palletsprojects.com/) with Jinja2 templates
- SQLite via the standard-library `sqlite3` module (parameterized queries)
- [Werkzeug](https://werkzeug.palletsprojects.com/) for password hashing
- Plain CSS in `static/style.css`

## Project structure

```
hiking-club-app/
├── app.py              # Flask app: routes, auth, role checks
├── db.py               # SQLite connection + parameterized query helpers
├── schema.sql          # users / events / registrations tables
├── seed.py             # Initialize + seed the database with sample data
├── requirements.txt
├── Dockerfile
├── static/style.css
└── templates/          # base layout + page templates (incl. admin/)
```

---

## Run it (virtualenv on a VM or your machine)

From inside the `code/hiking-club-app/` directory:

### Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python seed.py          # create and seed hiking.db
python app.py           # starts on http://0.0.0.0:5000
```

### Windows (PowerShell)

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python seed.py          # create and seed hiking.db
python app.py           # starts on http://0.0.0.0:5000
```

> `app.py` also auto-creates and seeds the database on first run if `hiking.db`
> doesn't exist yet, so the `python seed.py` step is optional — but running it
> explicitly is the clearest way to (re)initialize a known-good dataset.

### Access URL

The server binds to `0.0.0.0:5000`, so other machines on the lab network can
reach it:

- On the host itself: `http://localhost:5000`
- From another lab machine: `http://<VM-IP-ADDRESS>:5000`

(Find the VM's address with `ip addr` on Linux.)

---

## Seeded login credentials

`seed.py` creates one admin and two members:

| Role   | Email                   | Password        |
|--------|-------------------------|-----------------|
| Admin  | `admin@hikingclub.test` | `AdminPass123`  |
| Member | `alice@example.com`     | `MemberPass123` |
| Member | `bob@example.com`       | `MemberPass123` |

It also creates five upcoming events and pre-registers Alice for the first one
(so "My Events" has content). These are lab credentials — change or remove them
for any real deployment.

To reset to a clean dataset at any time:

```bash
python seed.py          # drops and recreates all tables, then re-seeds
```

---

## Run it with Docker (alternative to a bare VM)

From inside `code/hiking-club-app/`:

```bash
docker build -t hiking-club .
docker run --rm -p 5000:5000 hiking-club
```

Then browse to `http://localhost:5000` (or `http://<DOCKER-HOST-IP>:5000` from
another machine). The image seeds the database during the build.

To override the Flask session secret, set the `SECRET_KEY` environment variable
(e.g. `docker run -e SECRET_KEY=... -p 5000:5000 hiking-club`).

---

## Notes on this build vs. the design document

The Project 2 architecture diagram shows a 3-tier cloud topology — public
internet → perimeter firewall → front-end web server on a public subnet →
internal firewall → a separate database server on a private subnet, all inside a
VPC.

This build intentionally **collapses that topology onto a single host** (as the
assignment calls for): the three client types map directly to the Guest / Member
/ Admin roles, and the separate private-subnet database becomes a **local SQLite
file** in the same Flask process. The network isolation, firewalls, HTTPS
termination, and TLS in the diagram are deployment/infrastructure concerns
handled at the VM/lab level, not in the application code.

Out of scope for this build (present in the broader design doc but not the
Project 4 spec): treasury/payments, member medical information, private
trip-leader notes, multi-factor authentication, and audit logging.

---

## Quick start (copy/paste)

```bash
cd code/hiking-club-app
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python seed.py
python app.py
# open http://<VM-IP>:5000   (admin@hikingclub.test / AdminPass123)
```
