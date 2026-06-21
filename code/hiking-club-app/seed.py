"""Initialize and seed the Hiking Club database.

Run directly to (re)create the database with sample data:

    python seed.py

Creates 1 admin, 2 members, and 5 upcoming events. Re-running drops and
recreates everything, so the app always starts from a known state.

Seeded credentials (also listed in README.md):
    admin@hikingclub.test / AdminPass123   (admin)
    alice@example.com      / MemberPass123 (member)
    bob@example.com        / MemberPass123 (member)
"""

import sqlite3
from datetime import date, timedelta

from werkzeug.security import generate_password_hash

import db


# Events are dated relative to "today" so they always appear as upcoming.
_TODAY = date.today()


def _future(days):
    return (_TODAY + timedelta(days=days)).isoformat()


SEED_USERS = [
    # (name, email, password, role, phone, emergency_contact)
    ("Site Admin", "admin@hikingclub.test", "AdminPass123", "admin",
     "555-0100", "Club Office 555-0101"),
    ("Alice Walker", "alice@example.com", "MemberPass123", "member",
     "555-0110", "Jordan Walker 555-0111"),
    ("Bob Stone", "bob@example.com", "MemberPass123", "member",
     "555-0120", "Casey Stone 555-0121"),
]

SEED_EVENTS = [
    # (title, description, date, location, max_participants)
    ("Sunrise Summit Hike",
     "An early-morning climb to catch the sunrise from the ridge. "
     "Moderate difficulty, ~6 miles round trip.",
     _future(7), "Eagle Ridge Trailhead", 12),
    ("Coastal Cliffs Loop",
     "A scenic coastal loop with ocean views and a picnic stop. "
     "Easy pace, family friendly.",
     _future(14), "Harbor Point Park", 20),
    ("Old Growth Forest Walk",
     "A shaded walk through old-growth forest with a naturalist guide. "
     "Easy, ~4 miles.",
     _future(21), "Cedar Hollow Reserve", 15),
    ("Alpine Lake Overnight",
     "A two-day backpacking trip to a high alpine lake. Strenuous; "
     "requires overnight gear and prior backpacking experience.",
     _future(35), "North Pass Wilderness", 8),
    ("Desert Canyon Day Hike",
     "A guided day hike through a slot canyon. Bring extra water. "
     "Moderate, ~8 miles.",
     _future(45), "Red Mesa Canyon", 10),
]


def seed():
    """Create the schema and insert sample users and events."""
    db.init_db()

    conn = sqlite3.connect(db.DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")

    user_ids = {}
    for name, email, password, role, phone, emergency in SEED_USERS:
        cur = conn.execute(
            "INSERT INTO users"
            " (name, email, password_hash, role, phone, emergency_contact)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (name, email, generate_password_hash(password), role, phone, emergency),
        )
        user_ids[email] = cur.lastrowid

    admin_id = user_ids["admin@hikingclub.test"]
    for title, description, event_date, location, max_participants in SEED_EVENTS:
        conn.execute(
            "INSERT INTO events"
            " (title, description, date, location, max_participants, created_by)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (title, description, event_date, location, max_participants, admin_id),
        )

    # Pre-register Alice for the first event so "My Events" has content.
    first_event_id = conn.execute(
        "SELECT id FROM events ORDER BY id ASC LIMIT 1"
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO registrations (user_id, event_id, status)"
        " VALUES (?, ?, 'registered')",
        (user_ids["alice@example.com"], first_event_id),
    )

    conn.commit()
    conn.close()

    print(f"Seeded database at {db.DB_PATH}")
    print(f"  {len(SEED_USERS)} users, {len(SEED_EVENTS)} events.")
    print("Login credentials:")
    for name, email, password, role, _phone, _emergency in SEED_USERS:
        print(f"  {role:6} {email:24} {password}")


if __name__ == "__main__":
    seed()
