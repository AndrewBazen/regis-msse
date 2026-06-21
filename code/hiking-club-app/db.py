"""Database helpers for the Hiking Club Application.

Thin wrapper around the standard-library ``sqlite3`` module. Every query that
takes user input uses ``?`` placeholders (parameterized queries) so values are
never concatenated into SQL strings.
"""

import os
import sqlite3

from flask import g

# The SQLite database file lives next to this module unless overridden by the
# DATABASE env var (handy for Docker / tests).
DB_PATH = os.environ.get(
    "DATABASE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "hiking.db"),
)
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")


def get_db():
    """Return a request-scoped SQLite connection, creating it if needed."""
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row          # rows behave like dicts
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(exception=None):
    """Close the request-scoped connection (registered as a teardown handler)."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def query_db(query, args=(), one=False):
    """Run a SELECT and return rows (or a single row when ``one`` is True)."""
    cur = get_db().execute(query, args)
    rows = cur.fetchall()
    cur.close()
    return (rows[0] if rows else None) if one else rows


def execute_db(query, args=()):
    """Run an INSERT/UPDATE/DELETE, commit, and return the new row id."""
    db = get_db()
    cur = db.execute(query, args)
    db.commit()
    last_id = cur.lastrowid
    cur.close()
    return last_id


def init_db():
    """(Re)create all tables from schema.sql. Drops existing data."""
    # Used by seed.py and the first-run bootstrap; opens its own connection so it
    # can run outside a request context.
    conn = sqlite3.connect(DB_PATH)
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()


def init_app(app):
    """Register the teardown handler so connections close after each request."""
    app.teardown_appcontext(close_db)
