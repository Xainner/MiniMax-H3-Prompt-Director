use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn open(dir: &Path) -> AppResult<Self> {
        std::fs::create_dir_all(dir).map_err(|e| AppError::FileRead {
            path: dir.display().to_string(),
            source: e,
        })?;
        let conn = Connection::open(dir.join("director.db"))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrate(&conn)?;
        Ok(Db(Mutex::new(conn)))
    }

    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        // A poisoned lock means a previous command panicked mid-query; the
        // connection itself is still usable, so recover rather than abort.
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    // ---- key/value settings -------------------------------------------------

    pub fn get_setting(&self, key: &str) -> AppResult<Option<String>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        Ok(match rows.next()? {
            Some(row) => Some(row.get(0)?),
            None => None,
        })
    }

    pub fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        self.conn().execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    // ---- vision cache -------------------------------------------------------

    pub fn get_vision(&self, hash: &str, model: &str) -> AppResult<Option<String>> {
        let conn = self.conn();
        let mut stmt =
            conn.prepare("SELECT payload FROM vision_cache WHERE hash = ?1 AND model = ?2")?;
        let mut rows = stmt.query(params![hash, model])?;
        Ok(match rows.next()? {
            Some(row) => Some(row.get(0)?),
            None => None,
        })
    }

    pub fn put_vision(&self, hash: &str, model: &str, payload: &str) -> AppResult<()> {
        self.conn().execute(
            "INSERT INTO vision_cache (hash, model, payload, created_at)
             VALUES (?1, ?2, ?3, strftime('%s','now'))
             ON CONFLICT(hash, model) DO UPDATE SET payload = excluded.payload",
            params![hash, model, payload],
        )?;
        Ok(())
    }

    pub fn clear_vision_cache(&self) -> AppResult<usize> {
        Ok(self.conn().execute("DELETE FROM vision_cache", [])?)
    }

    // ---- projects -----------------------------------------------------------

    pub fn list_projects(&self) -> AppResult<Vec<ProjectSummary>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, created_at, updated_at, schema_version, reference_count, total_size
             FROM projects ORDER BY updated_at DESC LIMIT 200",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ProjectSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                schema_version: row.get(4)?,
                reference_count: row.get(5)?,
                total_size: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn load_project(&self, id: &str) -> AppResult<Option<String>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT data FROM projects WHERE id = ?1")?;
        let mut rows = stmt.query(params![id])?;
        Ok(match rows.next()? {
            Some(row) => Some(row.get(0)?),
            None => None,
        })
    }

    pub fn save_project(&self, id: &str, name: &str, data: &str) -> AppResult<()> {
        let value: serde_json::Value = serde_json::from_str(data)?;
        let created_at = value
            .get("createdAt")
            .and_then(|v| v.as_i64())
            .unwrap_or_else(now_millis);
        let schema_version = value
            .get("schemaVersion")
            .and_then(|v| v.as_i64())
            .unwrap_or(1);
        let references = value.get("references").and_then(|v| v.as_array());
        let reference_count = references.map(|items| items.len() as i64).unwrap_or(0);
        let reference_size: i64 = references
            .into_iter()
            .flatten()
            .filter_map(|item| item.get("sizeBytes").and_then(|v| v.as_i64()))
            .sum();
        let output_size: i64 = value
            .get("outputs")
            .and_then(|v| v.as_array())
            .into_iter()
            .flatten()
            .filter_map(|item| item.get("sizeBytes").and_then(|v| v.as_i64()))
            .sum();
        self.conn().execute(
            "INSERT INTO projects (id, name, data, created_at, updated_at, schema_version, reference_count, total_size)
             VALUES (?1, ?2, ?3, ?4, strftime('%s','now'), ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                data = excluded.data,
                updated_at = excluded.updated_at,
                schema_version = excluded.schema_version,
                reference_count = excluded.reference_count,
                total_size = excluded.total_size",
            params![id, name, data, created_at, schema_version, reference_count, reference_size + output_size],
        )?;
        Ok(())
    }

    pub fn delete_project(&self, id: &str) -> AppResult<()> {
        let mut conn = self.conn();
        let transaction = conn.transaction()?;
        transaction.execute(
            "DELETE FROM maestro_jobs WHERE project_id = ?1",
            params![id],
        )?;
        transaction.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        transaction.commit()?;
        Ok(())
    }

    pub fn has_active_maestro_jobs(&self, project_id: &str) -> AppResult<bool> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT data FROM maestro_jobs WHERE project_id = ?1")?;
        let rows = stmt.query_map(params![project_id], |row| row.get::<_, String>(0))?;
        for raw in rows {
            let value: serde_json::Value = serde_json::from_str(&raw?).unwrap_or_default();
            if matches!(
                value.get("status").and_then(|v| v.as_str()),
                Some("held" | "queued" | "running")
            ) {
                return Ok(true);
            }
        }
        Ok(false)
    }

    // ---- prompt history -----------------------------------------------------

    pub fn add_history(
        &self,
        id: &str,
        project_id: &str,
        mode: &str,
        content: &str,
    ) -> AppResult<()> {
        self.conn().execute(
            "INSERT INTO prompt_history (id, project_id, mode, content, created_at)
             VALUES (?1, ?2, ?3, ?4, strftime('%s','now'))",
            params![id, project_id, mode, content],
        )?;
        Ok(())
    }

    pub fn list_history(&self, project_id: &str) -> AppResult<Vec<HistoryEntry>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, mode, content, created_at FROM prompt_history
             WHERE project_id = ?1 ORDER BY created_at DESC LIMIT 50",
        )?;
        let rows = stmt.query_map(params![project_id], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                mode: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn copy_history(&self, from_project_id: &str, to_project_id: &str) -> AppResult<()> {
        self.conn().execute(
            "INSERT INTO prompt_history (id, project_id, mode, content, created_at)
             SELECT ?2 || '_' || id, ?2, mode, content, created_at FROM prompt_history WHERE project_id = ?1",
            params![from_project_id, to_project_id],
        )?;
        Ok(())
    }

    // ---- Maestro jobs ------------------------------------------------------

    pub fn upsert_maestro_job(
        &self,
        id: &str,
        project_id: &str,
        instance_id: &str,
        data: &str,
    ) -> AppResult<()> {
        self.conn().execute(
            "INSERT INTO maestro_jobs (id, project_id, instance_id, data, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, strftime('%s','now'), strftime('%s','now'))
             ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            params![id, project_id, instance_id, data],
        )?;
        Ok(())
    }

    pub fn list_maestro_jobs(&self) -> AppResult<Vec<String>> {
        let conn = self.conn();
        let mut stmt =
            conn.prepare("SELECT data FROM maestro_jobs ORDER BY updated_at DESC LIMIT 100")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub schema_version: i64,
    pub reference_count: i64,
    pub total_size: i64,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub mode: String,
    pub content: String,
    pub created_at: i64,
}

/// Idempotent migrations. Each statement is safe to re-run on every boot.
fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vision_cache (
            hash       TEXT NOT NULL,
            model      TEXT NOT NULL,
            payload    TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (hash, model)
        );

        CREATE TABLE IF NOT EXISTS projects (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            data       TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            schema_version INTEGER NOT NULL DEFAULT 1,
            reference_count INTEGER NOT NULL DEFAULT 0,
            total_size INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS prompt_history (
            id         TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            mode       TEXT NOT NULL,
            content    TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_history_project
            ON prompt_history (project_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS maestro_jobs (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            instance_id TEXT NOT NULL,
            data        TEXT NOT NULL,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_maestro_jobs_updated
            ON maestro_jobs (updated_at DESC);
        ",
    )?;
    ensure_column(conn, "projects", "created_at", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(
        conn,
        "projects",
        "schema_version",
        "INTEGER NOT NULL DEFAULT 1",
    )?;
    ensure_column(
        conn,
        "projects",
        "reference_count",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(conn, "projects", "total_size", "INTEGER NOT NULL DEFAULT 0")?;
    conn.execute(
        "UPDATE projects SET created_at = updated_at * 1000 WHERE created_at = 0",
        [],
    )?;
    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> AppResult<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !columns.iter().any(|name| name == column) {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )?;
    }
    Ok(())
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_the_legacy_projects_table_idempotently() {
        let dir = std::env::temp_dir().join(format!("director-db-test-{}", now_millis()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("director.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL); INSERT INTO projects VALUES ('old', 'Old', '{}', 100);").unwrap();
        drop(conn);
        let db = Db::open(&dir).unwrap();
        let rows = db.list_projects().unwrap();
        assert_eq!(rows[0].id, "old");
        assert_eq!(rows[0].created_at, 100_000);
        drop(db);
        Db::open(&dir).unwrap();
        let _ = std::fs::remove_dir_all(dir);
    }
}
