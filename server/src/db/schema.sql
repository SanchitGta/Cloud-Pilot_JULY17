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

CREATE TABLE IF NOT EXISTS scan_ec2_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES scans(id),
  instance_id TEXT NOT NULL,
  instance_type TEXT NOT NULL,
  state TEXT NOT NULL,
  avg_cpu_14d REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS scan_ebs_volumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES scans(id),
  volume_id TEXT NOT NULL,
  size_gb INTEGER NOT NULL,
  attachment_status TEXT NOT NULL CHECK (attachment_status IN ('attached','unattached')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS scan_rds_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES scans(id),
  db_instance_id TEXT NOT NULL,
  instance_type TEXT NOT NULL,
  avg_cpu_14d REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS scan_s3_buckets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES scans(id),
  bucket_name TEXT NOT NULL,
  size_bytes REAL NOT NULL,
  object_count INTEGER NOT NULL,
  size_30d_ago_bytes REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
