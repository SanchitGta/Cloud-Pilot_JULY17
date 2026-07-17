CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  access_key_id TEXT NOT NULL,
  encrypted_secret_key TEXT NOT NULL,
  region TEXT NOT NULL,
  aws_account_id TEXT NOT NULL,
  aws_arn TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES connections(id),
  status TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
