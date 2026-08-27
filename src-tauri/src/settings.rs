use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::secrets;
use serde::{Deserialize, Serialize};

pub const VISION_PROFILE: &str = "vision";
pub const WRITER_PROFILE: &str = "writer";

const SETTINGS_KEY: &str = "profiles";

/// One OpenAI-compatible endpoint. The same shape covers OpenAI, OpenRouter,
/// Groq, LM Studio, Ollama and vLLM — only the base URL and model change.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub model: String,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    /// Some gateways need an extra header (e.g. OpenRouter's HTTP-Referer).
    #[serde(default)]
    pub extra_headers: Vec<[String; 2]>,
}

fn default_temperature() -> f32 {
    0.4
}
fn default_max_tokens() -> u32 {
    4096
}
fn default_timeout() -> u64 {
    180
}

impl Profile {
    fn blank(id: &str) -> Self {
        Profile {
            id: id.to_string(),
            base_url: String::new(),
            model: String::new(),
            temperature: default_temperature(),
            max_tokens: default_max_tokens(),
            timeout_secs: default_timeout(),
            extra_headers: Vec::new(),
        }
    }

    pub fn ensure_usable(&self) -> AppResult<()> {
        if self.base_url.trim().is_empty() || self.model.trim().is_empty() {
            return Err(AppError::ProfileNotConfigured(self.id.clone()));
        }
        validate_base_url(&self.base_url)
    }

    /// Builds `<base>/chat/completions`, tolerating a base that already ends in
    /// `/v1`, `/v1/`, or the full path.
    pub fn chat_completions_url(&self) -> String {
        let base = self.base_url.trim().trim_end_matches('/');
        if base.ends_with("/chat/completions") {
            base.to_string()
        } else {
            format!("{base}/chat/completions")
        }
    }

}

pub fn validate_base_url(url: &str) -> AppResult<()> {
    let url = url.trim();
    if url.starts_with("http://") || url.starts_with("https://") {
        Ok(())
    } else {
        Err(AppError::InvalidBaseUrl)
    }
}

/// What the frontend is allowed to see: everything except the key itself.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    #[serde(flatten)]
    pub profile: Profile,
    pub has_key: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub vision: ProfileView,
    pub writer: ProfileView,
}

pub fn load_all(db: &Db) -> AppResult<Vec<Profile>> {
    let stored = db.get_setting(SETTINGS_KEY)?;
    let mut profiles: Vec<Profile> = match stored {
        Some(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        None => Vec::new(),
    };
    for id in [VISION_PROFILE, WRITER_PROFILE] {
        if !profiles.iter().any(|p| p.id == id) {
            profiles.push(Profile::blank(id));
        }
    }
    Ok(profiles)
}

pub fn load(db: &Db, id: &str) -> AppResult<Profile> {
    load_all(db)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| AppError::ProfileNotConfigured(id.to_string()))
}

pub fn save(db: &Db, incoming: Profile) -> AppResult<()> {
    validate_base_url(&incoming.base_url).or_else(|e| {
        // An empty base URL is a legitimate "not configured yet" state.
        if incoming.base_url.trim().is_empty() {
            Ok(())
        } else {
            Err(e)
        }
    })?;

    let mut profiles = load_all(db)?;
    match profiles.iter_mut().find(|p| p.id == incoming.id) {
        Some(existing) => *existing = incoming,
        None => profiles.push(incoming),
    }
    db.set_setting(SETTINGS_KEY, &serde_json::to_string(&profiles)?)
}

pub fn view(db: &Db) -> AppResult<SettingsView> {
    let profiles = load_all(db)?;
    let pick = |id: &str| -> ProfileView {
        let profile = profiles
            .iter()
            .find(|p| p.id == id)
            .cloned()
            .unwrap_or_else(|| Profile::blank(id));
        ProfileView {
            has_key: secrets::has_key(id),
            profile,
        }
    };
    Ok(SettingsView {
        vision: pick(VISION_PROFILE),
        writer: pick(WRITER_PROFILE),
    })
}
