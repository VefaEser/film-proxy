CREATE TABLE IF NOT EXISTS admin_tasks (
    id TEXT PRIMARY KEY,
    admin_user_id INTEGER NOT NULL,
    task_type TEXT NOT NULL,
    target TEXT,
    list_type TEXT,
    status TEXT NOT NULL
        CHECK (status IN (
            'pending',
            'running',
            'completed',
            'failed',
            'cancelled'
        )),
    total INTEGER NOT NULL DEFAULT 0,
    done INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    result_json TEXT,
    error_log TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_admin_tasks_admin_created
ON admin_tasks(admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_tasks_status
ON admin_tasks(status);
