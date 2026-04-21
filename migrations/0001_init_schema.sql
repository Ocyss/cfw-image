-- Migration number: 0001 	 2026-04-21T08:11:25.419Z
CREATE TABLE IF NOT EXISTS images (
    key TEXT PRIMARY KEY,
    original_url TEXT,
    status TEXT
);
