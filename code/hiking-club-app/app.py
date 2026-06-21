"""Hiking Club Application — Flask + SQLite.

A small server-rendered web app with three kinds of users:

* Guest  (not logged in) — can view the public list of upcoming events.
* Member (logged in)     — manage their own profile and register for events.
* Admin  (logged in)     — create events and view the member list.

Security-relevant choices (matching the group's threat model):
* Passwords are hashed with Werkzeug (never stored in plaintext).
* All SQL uses parameterized queries (see db.py) — no string concatenation.
* Authorization is enforced server-side on every protected route.
* The profile route keys off the session user id only; there is no user id in
  the URL, so a member cannot view or edit another member's profile.
* Jinja2 autoescaping (on by default) protects rendered output from XSS.
"""

import functools
import os
import sqlite3
from datetime import date

from flask import (
    Flask,
    abort,
    flash,
    g,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

import db
from db import execute_db, query_db

app = Flask(__name__)
# Session cookies are signed with this key. Override in production via env var.
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")
db.init_app(app)


# ---------------------------------------------------------------------------
# Current-user helpers and access-control decorators
# ---------------------------------------------------------------------------

@app.before_request
def load_logged_in_user():
    """Attach the current user (or None) to ``g`` for use in views/templates."""
    user_id = session.get("user_id")
    g.user = (
        query_db("SELECT * FROM users WHERE id = ?", (user_id,), one=True)
        if user_id is not None
        else None
    )


@app.context_processor
def inject_user():
    """Make ``current_user`` available in every template."""
    return {"current_user": g.get("user")}


def login_required(view):
    """Redirect guests to the login page."""

    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            flash("Please log in to continue.", "error")
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    """Allow only admins; everyone else gets 403 (or login if a guest)."""

    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            flash("Please log in to continue.", "error")
            return redirect(url_for("login", next=request.path))
        if g.user["role"] != "admin":
            abort(403)
        return view(*args, **kwargs)

    return wrapped


def spots_remaining(event):
    """Compute remaining spots for an event row."""
    taken = query_db(
        "SELECT COUNT(*) AS c FROM registrations WHERE event_id = ?",
        (event["id"],),
        one=True,
    )["c"]
    return event["max_participants"] - taken


# ---------------------------------------------------------------------------
# Public routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    """Public home page: upcoming events sorted by date."""
    today = date.today().isoformat()
    events = query_db(
        "SELECT * FROM events WHERE date >= ? ORDER BY date ASC",
        (today,),
    )
    events = [
        {**dict(e), "spots_remaining": spots_remaining(e)} for e in events
    ]
    return render_template("index.html", events=events)


@app.route("/register", methods=("GET", "POST"))
def register():
    """Create a new member account."""
    if g.user is not None:
        return redirect(url_for("index"))

    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        error = None
        if not name or not email or not password:
            error = "Name, email, and password are all required."
        elif len(password) < 8:
            error = "Password must be at least 8 characters."

        if error is None:
            try:
                execute_db(
                    "INSERT INTO users (name, email, password_hash, role)"
                    " VALUES (?, ?, ?, 'member')",
                    (name, email, generate_password_hash(password)),
                )
            except sqlite3.IntegrityError:
                error = "An account with that email already exists."
            else:
                flash("Account created. You can now log in.", "success")
                return redirect(url_for("login"))

        flash(error, "error")

    return render_template("register.html")


@app.route("/login", methods=("GET", "POST"))
def login():
    """Authenticate a user and start a session."""
    if g.user is not None:
        return redirect(url_for("index"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        user = query_db(
            "SELECT * FROM users WHERE email = ?", (email,), one=True
        )

        if user is None or not check_password_hash(
            user["password_hash"], password
        ):
            # Same message for both cases so we don't reveal which emails exist.
            flash("Incorrect email or password.", "error")
        else:
            session.clear()
            session["user_id"] = user["id"]
            session["role"] = user["role"]
            flash(f"Welcome back, {user['name']}!", "success")
            nxt = request.args.get("next")
            # Only allow internal redirects.
            if nxt and nxt.startswith("/"):
                return redirect(nxt)
            return redirect(url_for("index"))

    return render_template("login.html")


@app.route("/logout", methods=("POST",))
def logout():
    """End the current session."""
    session.clear()
    flash("You have been logged out.", "success")
    return redirect(url_for("index"))


# ---------------------------------------------------------------------------
# Member routes
# ---------------------------------------------------------------------------

@app.route("/profile", methods=("GET", "POST"))
@login_required
def profile():
    """View and edit ONLY the logged-in user's own profile.

    The user id comes from the session, never from the request, so one member
    cannot edit another member's profile.
    """
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        phone = request.form.get("phone", "").strip()
        emergency_contact = request.form.get("emergency_contact", "").strip()

        if not name or not email:
            flash("Name and email are required.", "error")
        else:
            try:
                execute_db(
                    "UPDATE users SET name = ?, email = ?, phone = ?,"
                    " emergency_contact = ? WHERE id = ?",
                    (name, email, phone, emergency_contact, g.user["id"]),
                )
            except sqlite3.IntegrityError:
                flash("That email is already in use by another account.", "error")
            else:
                flash("Profile updated.", "success")
            return redirect(url_for("profile"))

    return render_template("profile.html")


@app.route("/events/<int:event_id>")
def event_detail(event_id):
    """Show a single event. The register button appears for eligible members."""
    event = query_db(
        "SELECT * FROM events WHERE id = ?", (event_id,), one=True
    )
    if event is None:
        abort(404)

    already_registered = False
    if g.user is not None:
        already_registered = (
            query_db(
                "SELECT 1 FROM registrations WHERE user_id = ? AND event_id = ?",
                (g.user["id"], event_id),
                one=True,
            )
            is not None
        )

    return render_template(
        "event_detail.html",
        event=event,
        spots=spots_remaining(event),
        already_registered=already_registered,
    )


@app.route("/events/<int:event_id>/register", methods=("POST",))
@login_required
def register_for_event(event_id):
    """Register the current user for an event, if there is room."""
    event = query_db(
        "SELECT * FROM events WHERE id = ?", (event_id,), one=True
    )
    if event is None:
        abort(404)

    if spots_remaining(event) <= 0:
        flash("Sorry, this event is full.", "error")
        return redirect(url_for("event_detail", event_id=event_id))

    try:
        execute_db(
            "INSERT INTO registrations (user_id, event_id, status)"
            " VALUES (?, ?, 'registered')",
            (g.user["id"], event_id),
        )
    except sqlite3.IntegrityError:
        # UNIQUE(user_id, event_id) — already registered.
        flash("You are already registered for this event.", "error")
    else:
        flash(f"You're registered for {event['title']}.", "success")

    return redirect(url_for("event_detail", event_id=event_id))


@app.route("/my-events")
@login_required
def my_events():
    """List events the current user has registered for."""
    events = query_db(
        "SELECT e.*, r.status FROM events e"
        " JOIN registrations r ON r.event_id = e.id"
        " WHERE r.user_id = ?"
        " ORDER BY e.date ASC",
        (g.user["id"],),
    )
    return render_template("my_events.html", events=events)


# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------

@app.route("/admin")
@admin_required
def admin_dashboard():
    """Admin dashboard: create-event form, all events, and member list."""
    events = query_db("SELECT * FROM events ORDER BY date ASC")
    members = query_db(
        "SELECT id, name, email, role, phone FROM users ORDER BY name ASC"
    )
    return render_template(
        "admin/dashboard.html", events=events, members=members
    )


@app.route("/admin/events", methods=("POST",))
@admin_required
def admin_create_event():
    """Create a new event owned by the current admin."""
    title = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip()
    event_date = request.form.get("date", "").strip()
    location = request.form.get("location", "").strip()
    max_participants = request.form.get("max_participants", "").strip()

    error = None
    if not title or not event_date:
        error = "Title and date are required."
    else:
        try:
            max_participants = int(max_participants) if max_participants else 10
            if max_participants <= 0:
                raise ValueError
        except ValueError:
            error = "Max participants must be a positive whole number."

    if error is not None:
        flash(error, "error")
    else:
        execute_db(
            "INSERT INTO events"
            " (title, description, date, location, max_participants, created_by)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (
                title,
                description,
                event_date,
                location,
                max_participants,
                g.user["id"],
            ),
        )
        flash(f"Event '{title}' created.", "success")

    return redirect(url_for("admin_dashboard"))


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(403)
def forbidden(_e):
    return render_template("error.html", code=403,
                           message="You don't have permission to view this page."), 403


@app.errorhandler(404)
def not_found(_e):
    return render_template("error.html", code=404,
                           message="Page not found."), 404


# ---------------------------------------------------------------------------
# First-run bootstrap + entry point
# ---------------------------------------------------------------------------

def _ensure_db():
    """Create and seed the database on first run if it doesn't exist yet."""
    if not os.path.exists(db.DB_PATH):
        import seed  # local import to avoid a circular import at module load
        seed.seed()


if __name__ == "__main__":
    _ensure_db()
    # Bind to all interfaces so another machine on the lab network can reach it.
    app.run(host="0.0.0.0", port=5000, debug=False)
