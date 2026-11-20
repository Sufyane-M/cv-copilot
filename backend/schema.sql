CREATE TABLE IF NOT EXISTS cv (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cv_version (
    id INTEGER PRIMARY KEY,
    cv_id INTEGER NOT NULL REFERENCES cv(id) ON DELETE CASCADE,
    number INTEGER NOT NULL CHECK (number > 0),
    content_json TEXT NOT NULL CHECK (json_valid(content_json)),
    origin TEXT NOT NULL CHECK (origin IN ('creation', 'manual', 'ai', 'restore')),
    created_at TEXT NOT NULL,
    restored_from_number INTEGER,
    UNIQUE (cv_id, number),
    FOREIGN KEY (cv_id, restored_from_number) REFERENCES cv_version(cv_id, number),
    CHECK (
        (origin = 'restore' AND restored_from_number IS NOT NULL AND restored_from_number < number)
        OR (origin <> 'restore' AND restored_from_number IS NULL)
    )
);
