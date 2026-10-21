CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  sheet TEXT NOT NULL,
  header_row INTEGER NOT NULL,
  headers_json TEXT NOT NULL,
  mapping_json TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  asset_count INTEGER NOT NULL,
  error_count INTEGER NOT NULL,
  warning_count INTEGER NOT NULL
);
CREATE TABLE asset_rows (
  run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  cells_json TEXT NOT NULL,
  PRIMARY KEY (run_id, row_number)
);
CREATE TABLE run_assets (
  run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  hostname TEXT,
  ip TEXT,
  asset_tag TEXT,
  serial TEXT,
  category TEXT,
  manufacturer TEXT,
  model TEXT,
  os TEXT,
  cpu_model TEXT,
  cpu_sockets INTEGER,
  cpu_cores INTEGER,
  memory_gb REAL,
  site TEXT,
  rack TEXT,
  zone TEXT,
  system_name TEXT,
  owner TEXT,
  status TEXT,
  PRIMARY KEY (run_id, key)
);
CREATE INDEX run_assets_ip ON run_assets (run_id, ip);
CREATE TABLE asset_issues (
  run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX asset_issues_run ON asset_issues (run_id, severity, code);
CREATE TABLE classify_runs (
  run_id INTEGER PRIMARY KEY REFERENCES sync_runs(id) ON DELETE CASCADE,
  profile_json TEXT NOT NULL,
  classified_at TEXT NOT NULL
);
CREATE TABLE asset_projects (
  run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  project TEXT,
  env TEXT,
  role TEXT,
  site TEXT,
  source TEXT,
  rule_id TEXT,
  shared INTEGER NOT NULL DEFAULT 0,
  naming_ok INTEGER NOT NULL DEFAULT 0,
  conflict TEXT,
  PRIMARY KEY (run_id, key)
);
CREATE INDEX asset_projects_project ON asset_projects (run_id, project);
CREATE TABLE project_names (
  run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  project TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (run_id, project)
);
CREATE VIEW assets AS
  SELECT * FROM run_assets WHERE run_id = (SELECT MAX(id) FROM sync_runs);
CREATE VIRTUAL TABLE assets_fts USING fts5(key UNINDEXED, hostname, ip, system_name, owner, category, model, os, zone, site, asset_tag, tokenize='trigram');
