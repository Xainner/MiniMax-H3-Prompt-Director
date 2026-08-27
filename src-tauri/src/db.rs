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
            "SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC LIMIT 200",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ProjectSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                updated_at: row.get(2)?,
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
        self.conn().execute(
            "INSERT INTO projects (id, name, data, updated_at)
             VALUES (?1, ?2, ?3, strftime('%s','now'))
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                data = excluded.data,
                updated_at = excluded.updated_at",
            params![id, name, data],
        )?;
        Ok(())
    }

    pub fn delete_project(&self, id: &str) -> AppResult<()> {
        self.conn()
            .execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ---- prompt history -----------------------------------------------------

    pub fn add_history(&self, id: &str, project_id: &str, mode: &str, content: &str) -> AppResult<()> {
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
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub updated_at: i64,
}

#[derive(serde::Serialize)]
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
            updated_at INTEGER NOT NULL
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
        ",
    )?;
    Ok(())
}
