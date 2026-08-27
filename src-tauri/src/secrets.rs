use crate::error::{AppError, AppResult};
use keyring::Entry;

const SERVICE: &str = "Director-MiniMaxH3";

/// API keys live in the Windows Credential Manager, never in SQLite and never
/// in the webview. The frontend only ever learns whether one exists.
fn entry(profile_id: &str) -> AppResult<Entry> {
    Entry::new(SERVICE, profile_id).map_err(Into::into)
}

pub fn set_key(profile_id: &str, key: &str) -> AppResult<()> {
    let key = key.trim();
    if key.is_empty() {
        return clear_key(profile_id);
    }
    entry(profile_id)?.set_password(key).map_err(Into::into)
}

pub fn get_key(profile_id: &str) -> AppResult<String> {
    match entry(profile_id)?.get_password() {
        Ok(k) => Ok(k),
        Err(keyring::Error::NoEntry) => Err(AppError::MissingApiKey(profile_id.to_string())),
        Err(e) => Err(e.into()),
    }
}

pub fn has_key(profile_id: &str) -> bool {
    matches!(entry(profile_id).and_then(|e| Ok(e.get_password())), Ok(Ok(_)))
}

pub fn clear_key(profile_id: &str) -> AppResult<()> {
    match entry(profile_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
