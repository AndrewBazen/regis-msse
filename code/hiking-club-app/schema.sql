-- Hiking Club Application — SQLite schema
-- Three tables: users, events, registrations.
-- Run via db.init_db() (called by seed.py and on first app start).

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS registrations;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT    NOT NULL,
    email             TEXT    NOT NULL UNIQUE,
    password_hash     TEXT    NOT NULL,
    role              TEXT    NOT NULL DEFAULT 'member'
                              CHECK (role IN ('member', 'admin')),
    phone             TEXT,
    emergency_contact TEXT
);

CREATE TABLE events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    title            TEXT    NOT NULL,
    description      TEXT    NOT NULL DEFAULT '',
    date             TEXT    NOT NULL,            -- ISO date 'YYYY-MM-DD'
    location         TEXT    NOT NULL DEFAULT '',
    max_participants INTEGER NOT NULL DEFAULT 10,
    created_by       INTEGER,
    FOREIGN KEY (created_by) REFERENCES users (id)
);

CREATE TABLE registrations (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    status   TEXT    NOT NULL DEFAULT 'registered',
    FOREIGN KEY (user_id)  REFERENCES users (id),
    FOREIGN KEY (event_id) REFERENCES events (id),
    UNIQUE (user_id, event_id)           -- a member can register for an event only once
);
