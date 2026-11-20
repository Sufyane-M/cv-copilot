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

CREATE TABLE IF NOT EXISTS message (
    id INTEGER PRIMARY KEY,
    cv_id INTEGER NOT NULL REFERENCES cv(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    base_version_number INTEGER NOT NULL,
    section_id TEXT NOT NULL,
    job_posting TEXT,
    llm_mode TEXT CHECK (llm_mode IN ('mock', 'openrouter')),
    requested_model_id TEXT,
    actual_model_id TEXT,
    UNIQUE (cv_id, id, base_version_number, section_id),
    FOREIGN KEY (cv_id, base_version_number) REFERENCES cv_version(cv_id, number)
);

CREATE TABLE IF NOT EXISTS proposal (
    id INTEGER PRIMARY KEY,
    cv_id INTEGER NOT NULL REFERENCES cv(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL UNIQUE,
    base_version_number INTEGER NOT NULL,
    section_id TEXT NOT NULL,
    new_text TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    applied_version_number INTEGER,
    FOREIGN KEY (cv_id, message_id, base_version_number, section_id)
        REFERENCES message(cv_id, id, base_version_number, section_id) ON DELETE CASCADE,
    FOREIGN KEY (cv_id, base_version_number) REFERENCES cv_version(cv_id, number),
    FOREIGN KEY (cv_id, applied_version_number) REFERENCES cv_version(cv_id, number),
    CHECK (
        (status = 'pending' AND resolved_at IS NULL AND applied_version_number IS NULL)
        OR (status = 'accepted' AND resolved_at IS NOT NULL
            AND applied_version_number IS NOT NULL AND applied_version_number = base_version_number + 1)
        OR (status = 'rejected' AND resolved_at IS NOT NULL AND applied_version_number IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS message_by_cv ON message(cv_id, id);
CREATE INDEX IF NOT EXISTS proposal_by_cv ON proposal(cv_id, id);
