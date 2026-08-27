use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum Content {
    Text(String),
    Parts(Vec<Part>),
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum Part {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrl },
}

#[derive(Debug, Clone, Serialize)]
pub struct ImageUrl {
    /// A `data:image/jpeg;base64,...` URL. Every OpenAI-compatible server that
    /// supports vision accepts this form; remote URLs would leak the path.
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatMessage {
    pub role: &'static str,
    pub content: Content,
}

impl ChatMessage {
    pub fn system(text: impl Into<String>) -> Self {
        ChatMessage {
            role: "system",
            content: Content::Text(text.into()),
        }
    }

    pub fn user(text: impl Into<String>) -> Self {
        ChatMessage {
            role: "user",
            content: Content::Text(text.into()),
        }
    }

    pub fn user_parts(parts: Vec<Part>) -> Self {
        ChatMessage {
            role: "user",
            content: Content::Parts(parts),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ChatRequest<'a> {
    pub model: &'a str,
    pub messages: &'a [ChatMessage],
    pub temperature: f32,
    pub max_tokens: u32,
    pub stream: bool,
}

// ---- response shapes (deliberately lenient) --------------------------------

#[derive(Debug, Deserialize)]
pub struct ChatResponse {
    #[serde(default)]
    pub choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
pub struct Choice {
    #[serde(default)]
    pub message: Option<ResponseMessage>,
    #[serde(default)]
    pub delta: Option<ResponseMessage>,
}

#[derive(Debug, Deserialize)]
pub struct ResponseMessage {
    #[serde(default)]
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProviderError {
    #[serde(default)]
    pub error: Option<ProviderErrorBody>,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProviderErrorBody {
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    pub ok: bool,
    pub latency_ms: u128,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamChunk {
    pub request_id: String,
    pub delta: String,
}
