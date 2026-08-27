use super::types::{
    ChatMessage, ChatRequest, ChatResponse, ImageUrl, Part, ProviderError, StreamChunk, TestResult,
};
use crate::error::{AppError, AppResult};
use crate::settings::Profile;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const EVENT_CHUNK: &str = "llm:chunk";

/// In-flight requests the user can cancel from the UI.
#[derive(Default)]
pub struct CancelRegistry(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl CancelRegistry {
    fn register(&self, id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id.to_string(), flag.clone());
        flag
    }

    fn release(&self, id: &str) {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(id);
    }

    pub fn cancel(&self, id: &str) {
        if let Some(flag) = self.0.lock().unwrap_or_else(|e| e.into_inner()).get(id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

}

fn build_client(profile: &Profile) -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(profile.timeout_secs.clamp(10, 900)))
        .connect_timeout(Duration::from_secs(15))
        .user_agent("Director/0.1 (+minimax-h3-prompt-tool)")
        .build()
        .map_err(Into::into)
}

fn headers(profile: &Profile, api_key: &str) -> AppResult<HeaderMap> {
    let mut map = HeaderMap::new();
    map.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    if !api_key.is_empty() {
        let mut auth = HeaderValue::from_str(&format!("Bearer {api_key}"))
            .map_err(|_| AppError::Other("La API key contiene caracteres inválidos.".into()))?;
        auth.set_sensitive(true);
        map.insert(AUTHORIZATION, auth);
    }

    for [name, value] in &profile.extra_headers {
        let (Ok(n), Ok(v)) = (
            HeaderName::from_bytes(name.trim().as_bytes()),
            HeaderValue::from_str(value.trim()),
        ) else {
            continue;
        };
        map.insert(n, v);
    }
    Ok(map)
}

async fn provider_error(status: reqwest::StatusCode, body: String) -> AppError {
    let message = serde_json::from_str::<ProviderError>(&body)
        .ok()
        .and_then(|e| e.error.and_then(|b| b.message).or(e.message))
        .unwrap_or_else(|| {
            let trimmed = body.trim();
            if trimmed.is_empty() {
                "sin detalle".to_string()
            } else {
                trimmed.chars().take(300).collect()
            }
        });

    let hint = match status.as_u16() {
        401 | 403 => " — revisá la API key en Ajustes.",
        404 => " — revisá la base URL y el nombre del modelo.",
        429 => " — límite de tasa alcanzado, esperá unos segundos.",
        _ => "",
    };

    AppError::Provider {
        status: status.as_u16(),
        message: format!("{message}{hint}"),
    }
}

/// Non-streaming completion. Used by the vision pass and the connection test.
pub async fn complete(
    profile: &Profile,
    api_key: &str,
    messages: &[ChatMessage],
    temperature: Option<f32>,
) -> AppResult<String> {
    profile.ensure_usable()?;
    let client = build_client(profile)?;
    let body = ChatRequest {
        model: &profile.model,
        messages,
        temperature: temperature.unwrap_or(profile.temperature),
        max_tokens: profile.max_tokens,
        stream: false,
    };

    let response = client
        .post(profile.chat_completions_url())
        .headers(headers(profile, api_key)?)
        .json(&body)
        .send()
        .await?;

    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        return Err(provider_error(status, text).await);
    }

    let parsed: ChatResponse =
        serde_json::from_str(&text).map_err(|_| AppError::MalformedModelJson)?;
    let content = parsed
        .choices
        .into_iter()
        .next()
        .and_then(|c| c.message.or(c.delta))
        .and_then(|m| m.content)
        .unwrap_or_default();

    if content.trim().is_empty() {
        Err(AppError::EmptyCompletion)
    } else {
        Ok(content)
    }
}

/// Streaming completion. Deltas are emitted as `llm:chunk` events; the full
/// text is also returned so the caller does not have to reassemble it.
pub async fn complete_streaming(
    app: &AppHandle,
    registry: &CancelRegistry,
    request_id: &str,
    profile: &Profile,
    api_key: &str,
    messages: &[ChatMessage],
    temperature: Option<f32>,
) -> AppResult<String> {
    profile.ensure_usable()?;
    let cancelled = registry.register(request_id);
    let result = stream_inner(
        app,
        &cancelled,
        request_id,
        profile,
        api_key,
        messages,
        temperature,
    )
    .await;
    registry.release(request_id);
    result
}

async fn stream_inner(
    app: &AppHandle,
    cancelled: &Arc<AtomicBool>,
    request_id: &str,
    profile: &Profile,
    api_key: &str,
    messages: &[ChatMessage],
    temperature: Option<f32>,
) -> AppResult<String> {
    let client = build_client(profile)?;
    let body = ChatRequest {
        model: &profile.model,
        messages,
        temperature: temperature.unwrap_or(profile.temperature),
        max_tokens: profile.max_tokens,
        stream: true,
    };

    let response = client
        .post(profile.chat_completions_url())
        .headers(headers(profile, api_key)?)
        .json(&body)
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(provider_error(status, text).await);
    }

    let mut stream = response.bytes_stream();
    let mut pending = String::new();
    let mut full = String::new();

    while let Some(chunk) = stream.next().await {
        if cancelled.load(Ordering::SeqCst) {
            return Err(AppError::Cancelled);
        }
        pending.push_str(&String::from_utf8_lossy(&chunk?));

        let batch = drain_sse(&mut pending);
        for delta in batch.deltas {
            full.push_str(&delta);
            let _ = app.emit(
                EVENT_CHUNK,
                StreamChunk {
                    request_id: request_id.to_string(),
                    delta,
                },
            );
        }
        if batch.done {
            return finish(full);
        }
    }

    finish(full)
}

fn finish(full: String) -> AppResult<String> {
    if full.trim().is_empty() {
        Err(AppError::EmptyCompletion)
    } else {
        Ok(full)
    }
}

#[derive(Debug, Default, PartialEq)]
pub struct SseBatch {
    pub deltas: Vec<String>,
    pub done: bool,
}

/// Consumes every complete SSE frame in `pending`, leaving any partial tail in
/// place. Frames are blank-line separated, a frame may hold several `data:`
/// lines, and a frame can arrive split across TCP reads — all three cases show
/// up in practice across providers.
pub fn drain_sse(pending: &mut String) -> SseBatch {
    let mut batch = SseBatch::default();

    while let Some(end) = find_frame_end(pending) {
        let frame: String = pending.drain(..end).collect();

        for line in frame.lines() {
            let Some(payload) = line.strip_prefix("data:") else {
                continue;
            };
            let payload = payload.trim();
            if payload.is_empty() {
                continue;
            }
            if payload == "[DONE]" {
                batch.done = true;
                return batch;
            }
            let Ok(parsed) = serde_json::from_str::<ChatResponse>(payload) else {
                continue;
            };
            let delta = parsed
                .choices
                .into_iter()
                .next()
                .and_then(|c| c.delta.or(c.message))
                .and_then(|m| m.content)
                .unwrap_or_default();
            if !delta.is_empty() {
                batch.deltas.push(delta);
            }
        }
    }

    batch
}

fn find_frame_end(buf: &str) -> Option<usize> {
    let lf = buf.find("\n\n").map(|i| i + 2);
    let crlf = buf.find("\r\n\r\n").map(|i| i + 4);
    match (lf, crlf) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (a, b) => a.or(b),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(content: &str) -> String {
        format!("data: {{\"choices\":[{{\"delta\":{{\"content\":\"{content}\"}}}}]}}\n\n")
    }

    #[test]
    fn collects_deltas_from_complete_frames() {
        let mut buf = format!("{}{}", frame("Hola"), frame(" mundo"));
        let batch = drain_sse(&mut buf);
        assert_eq!(batch.deltas, vec!["Hola", " mundo"]);
        assert!(!batch.done);
        assert!(buf.is_empty());
    }

    #[test]
    fn keeps_a_partial_frame_for_the_next_read() {
        let full = frame("completa");
        let mut buf = format!("{full}data: {{\"choices\":[{{\"delta\":{{\"cont");

        let first = drain_sse(&mut buf);
        assert_eq!(first.deltas, vec!["completa"]);
        assert!(!buf.is_empty(), "the partial frame must survive");

        buf.push_str("ent\":\"resto\"}}]}\n\n");
        let second = drain_sse(&mut buf);
        assert_eq!(second.deltas, vec!["resto"]);
        assert!(buf.is_empty());
    }

    #[test]
    fn stops_at_done() {
        let mut buf = format!("{}data: [DONE]\n\n{}", frame("uno"), frame("nunca"));
        let batch = drain_sse(&mut buf);
        assert_eq!(batch.deltas, vec!["uno"]);
        assert!(batch.done);
    }

    #[test]
    fn handles_crlf_separators_and_comment_lines() {
        let mut buf =
            ": keep-alive\r\ndata: {\"choices\":[{\"delta\":{\"content\":\"crlf\"}}]}\r\n\r\n"
                .to_string();
        assert_eq!(drain_sse(&mut buf).deltas, vec!["crlf"]);
    }

    #[test]
    fn ignores_frames_without_content() {
        let mut buf = "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\n\n".to_string();
        assert!(drain_sse(&mut buf).deltas.is_empty());
    }

    // ---- HTTP round-trip against a mock OpenAI-compatible server ----------

    use std::io::{Read, Write};
    use std::net::TcpListener;

    struct MockServer {
        port: u16,
        request: std::sync::mpsc::Receiver<String>,
    }

    /// Serves exactly one request, then hands the raw request back to the test.
    fn mock_server(status: u16, body: &'static str) -> MockServer {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().unwrap().port();
        let (tx, rx) = std::sync::mpsc::channel();

        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut raw = Vec::new();
            let mut buf = [0u8; 4096];

            // Read headers, then exactly Content-Length bytes of body.
            loop {
                let n = stream.read(&mut buf).unwrap_or(0);
                if n == 0 {
                    break;
                }
                raw.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&raw).to_string();
                if let Some(head_end) = text.find("\r\n\r\n") {
                    let len = text
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap_or(0))
                        })
                        .unwrap_or(0);
                    if raw.len() >= head_end + 4 + len {
                        break;
                    }
                }
            }

            let _ = tx.send(String::from_utf8_lossy(&raw).to_string());
            let response = format!(
                "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
        });

        MockServer { port, request: rx }
    }

    fn local_profile(port: u16) -> crate::settings::Profile {
        crate::settings::Profile {
            id: "writer".into(),
            base_url: format!("http://127.0.0.1:{port}/v1"),
            model: "mock-model".into(),
            temperature: 0.3,
            max_tokens: 512,
            timeout_secs: 15,
            extra_headers: vec![["X-Title".into(), "Director".into()]],
        }
    }

    #[tokio::test]
    async fn completes_against_an_openai_compatible_endpoint() {
        let server = mock_server(
            200,
            r#"{"choices":[{"message":{"content":"subject_definitions: ok"}}]}"#,
        );
        let profile = local_profile(server.port);

        let content = complete(
            &profile,
            "sk-test-key",
            &[ChatMessage::system("s"), ChatMessage::user("u")],
            Some(0.0),
        )
        .await
        .expect("completion");

        assert_eq!(content, "subject_definitions: ok");

        let raw = server.request.recv().expect("captured request");
        assert!(raw.starts_with("POST /v1/chat/completions"), "wrong path: {raw}");
        assert!(raw.contains("authorization: Bearer sk-test-key") || raw.contains("Authorization: Bearer sk-test-key"));
        assert!(raw.contains("x-title: Director") || raw.contains("X-Title: Director"));
        assert!(raw.contains("\"model\":\"mock-model\""));
        assert!(raw.contains("\"stream\":false"));
        assert!(raw.contains("\"temperature\":0.0"));
    }

    #[tokio::test]
    async fn vision_pass_sends_the_image_inline_and_parses_the_json() {
        let server = mock_server(
            200,
            r#"{"choices":[{"message":{"content":"{\"summary\":\"a young woman indoors\",\"identity\":\"oval face, dark eyes\",\"visibleText\":[\"OFERTA\"]}"}}]}"#,
        );
        let profile = local_profile(server.port);

        let analysis = crate::llm::vision::analyze(
            &profile,
            "sk-vision",
            "data:image/jpeg;base64,QUJD".to_string(),
            Some("Identidad".to_string()),
        )
        .await
        .expect("analysis");

        assert_eq!(analysis.summary, "a young woman indoors");
        assert_eq!(analysis.identity, "oval face, dark eyes");
        assert_eq!(analysis.visible_text, vec!["OFERTA"]);

        let raw = server.request.recv().expect("captured request");
        assert!(raw.contains(r#""type":"image_url""#), "image part missing");
        assert!(raw.contains("data:image/jpeg;base64,QUJD"), "image data missing");
        assert!(raw.contains("Identidad"), "the role hint should reach the model");
    }

    #[tokio::test]
    async fn surfaces_provider_errors_with_a_hint() {
        let server = mock_server(401, r#"{"error":{"message":"Invalid API key"}}"#);
        let err = complete(&local_profile(server.port), "bad", &[ChatMessage::user("u")], None)
            .await
            .expect_err("should fail");

        let message = err.to_string();
        assert!(message.contains("Invalid API key"), "{message}");
        assert!(message.contains("revisá la API key"), "{message}");
    }

    #[tokio::test]
    async fn rejects_an_empty_completion() {
        let server = mock_server(200, r#"{"choices":[{"message":{"content":"   "}}]}"#);
        let err = complete(&local_profile(server.port), "", &[ChatMessage::user("u")], None)
            .await
            .expect_err("should fail");
        assert!(err.to_string().contains("vacía"));
    }

    #[tokio::test]
    async fn vision_probe_actually_sends_an_image() {
        let server = mock_server(200, r#"{"choices":[{"message":{"content":"OK"}}]}"#);
        let result = test_connection(&local_profile(server.port), "", true)
            .await
            .expect("test result");

        assert!(result.ok);
        assert!(result.message.contains("acepta imágenes"), "{}", result.message);

        let raw = server.request.recv().expect("captured request");
        assert!(raw.contains(r#""type":"image_url""#), "probe carried no image");
    }

    #[tokio::test]
    async fn text_probe_stays_text_only() {
        let server = mock_server(200, r#"{"choices":[{"message":{"content":"OK"}}]}"#);
        let result = test_connection(&local_profile(server.port), "", false)
            .await
            .expect("test result");

        assert!(result.ok);
        assert!(!result.message.contains("acepta imágenes"));

        let raw = server.request.recv().expect("captured request");
        assert!(!raw.contains("image_url"));
    }

    #[tokio::test]
    async fn explains_a_model_that_cannot_see() {
        let server = mock_server(
            400,
            r#"{"error":{"message":"This model does not support image input"}}"#,
        );
        let result = test_connection(&local_profile(server.port), "", true)
            .await
            .expect("test result");

        assert!(!result.ok);
        assert!(result.message.contains("no parece aceptar imágenes"), "{}", result.message);
    }

    #[tokio::test]
    async fn refuses_a_profile_without_a_model() {
        let mut profile = local_profile(1);
        profile.model = String::new();
        let err = complete(&profile, "", &[ChatMessage::user("u")], None)
            .await
            .expect_err("should fail");
        assert!(err.to_string().contains("no está configurado"));
    }

    #[test]
    fn builds_chat_url_from_any_reasonable_base() {
        let mut profile = crate::settings::Profile {
            id: "writer".into(),
            base_url: "http://localhost:1234/v1".into(),
            model: "m".into(),
            temperature: 0.4,
            max_tokens: 1024,
            timeout_secs: 60,
            extra_headers: vec![],
        };
        assert_eq!(
            profile.chat_completions_url(),
            "http://localhost:1234/v1/chat/completions"
        );

        profile.base_url = "https://api.openai.com/v1/".into();
        assert_eq!(
            profile.chat_completions_url(),
            "https://api.openai.com/v1/chat/completions"
        );

        profile.base_url = "https://api.openai.com/v1/chat/completions".into();
        assert_eq!(
            profile.chat_completions_url(),
            "https://api.openai.com/v1/chat/completions"
        );
    }
}

/// A 1×1 PNG. Small enough to be free, real enough that an endpoint or model
/// without vision support rejects it.
const PROBE_IMAGE: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/// Round-trip against the configured endpoint so the user gets a real answer
/// instead of "saved" hope. When `with_image` is set the probe carries an
/// actual image part, which is the only way to learn that a model cannot see.
pub async fn test_connection(
    profile: &Profile,
    api_key: &str,
    with_image: bool,
) -> AppResult<TestResult> {
    profile.ensure_usable()?;
    let started = Instant::now();

    let messages = if with_image {
        vec![
            ChatMessage::system("Responde exactamente: OK"),
            ChatMessage::user_parts(vec![
                Part::ImageUrl {
                    image_url: ImageUrl {
                        url: PROBE_IMAGE.to_string(),
                    },
                },
                Part::Text {
                    text: "ping".to_string(),
                },
            ]),
        ]
    } else {
        vec![
            ChatMessage::system("Responde exactamente: OK"),
            ChatMessage::user("ping"),
        ]
    };

    match complete(profile, api_key, &messages, Some(0.0)).await {
        Ok(text) => Ok(TestResult {
            ok: true,
            latency_ms: started.elapsed().as_millis(),
            message: format!(
                "{} respondió{}: {}",
                profile.model,
                if with_image { " y acepta imágenes" } else { "" },
                text.trim().chars().take(50).collect::<String>()
            ),
        }),
        Err(e) => {
            let detail = e.to_string();
            let message = if with_image && looks_like_no_vision(&detail) {
                format!("{detail} — este modelo no parece aceptar imágenes: elegí uno con visión.")
            } else {
                detail
            };
            Ok(TestResult {
                ok: false,
                latency_ms: started.elapsed().as_millis(),
                message,
            })
        }
    }
}

fn looks_like_no_vision(message: &str) -> bool {
    let lower = message.to_lowercase();
    ["image", "imagen", "vision", "multimodal", "content type", "image_url"]
        .iter()
        .any(|needle| lower.contains(needle))
}
