use crate::db::Db;
use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use reqwest::{multipart, Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;

const INSTANCES_KEY: &str = "maestro_instances";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaestroInstance {
    pub id: String,
    pub name: String,
    pub base_url: String,
}

impl MaestroInstance {
    pub fn normalized(mut self) -> AppResult<Self> {
        self.id = self.id.trim().to_string();
        self.name = self.name.trim().to_string();
        self.base_url = self.base_url.trim().trim_end_matches('/').to_string();
        if self.id.is_empty() || self.name.is_empty() {
            return Err(AppError::Other("La instancia necesita id y nombre.".into()));
        }
        validate_base_url(&self.base_url)?;
        Ok(self)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaestroModel {
    pub model_type: String,
    pub name: String,
    #[serde(default)]
    pub architecture: String,
    #[serde(default)]
    pub fps: f64,
    #[serde(default)]
    pub is_downloaded: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaestroCapabilities {
    pub model_type: String,
    pub omni_reference: bool,
    pub fps: f64,
    pub frames_minimum: u32,
    pub frames_maximum: u32,
    pub frames_step: u32,
    pub overlap_default: u32,
    pub overlap_minimum: u32,
    pub overlap_maximum: u32,
    pub overlap_step: u32,
    pub resolutions: Vec<MaestroResolution>,
    pub defaults: Value,
    pub turbo: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaestroResolution {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaestroLora {
    pub filename: String,
    #[serde(default)]
    pub trained_words: Vec<String>,
    #[serde(default)]
    pub recommended_weights: Option<Value>,
    #[serde(default)]
    pub has_guide: bool,
    #[serde(default)]
    pub guide: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaestroUpload {
    pub filename: String,
    pub path: String,
    pub url: String,
    #[serde(alias = "fps")]
    pub fps: Option<f64>,
    #[serde(alias = "frame_count")]
    pub frame_count: Option<u64>,
    #[serde(alias = "duration_seconds")]
    pub duration_seconds: Option<f64>,
    #[serde(alias = "has_audio")]
    pub has_audio: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaestroJob {
    pub job_id: String,
    pub instance_id: String,
    pub project_id: String,
    #[serde(default)]
    pub seed: i64,
    pub status: String,
    #[serde(default)]
    pub progress: f64,
    #[serde(default)]
    pub step: u64,
    #[serde(default)]
    pub total_steps: u64,
    #[serde(default)]
    pub phase: String,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub output_files: Vec<String>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaestroTestResult {
    pub ok: bool,
    pub latency_ms: u128,
    pub message: String,
}

#[derive(Deserialize)]
struct ModelsEnvelope {
    #[serde(default)]
    models: Vec<MaestroModel>,
}

#[derive(Deserialize)]
struct LorasEnvelope {
    #[serde(default)]
    loras: Vec<MaestroLora>,
}

#[derive(Deserialize)]
struct GenerateResponse {
    job_id: String,
    status: String,
}

#[derive(Deserialize)]
struct StatusResponse {
    job_id: String,
    status: String,
    #[serde(default)]
    progress: f64,
    #[serde(default)]
    step: u64,
    #[serde(default)]
    total_steps: u64,
    #[serde(default)]
    phase: String,
    #[serde(default)]
    message: String,
    #[serde(default)]
    output_files: Vec<String>,
    #[serde(default)]
    error: Option<String>,
}

pub fn list_instances(db: &Db) -> AppResult<Vec<MaestroInstance>> {
    let Some(raw) = db.get_setting(INSTANCES_KEY)? else {
        return Ok(Vec::new());
    };
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub fn save_instance(db: &Db, incoming: MaestroInstance) -> AppResult<Vec<MaestroInstance>> {
    let incoming = incoming.normalized()?;
    let mut instances = list_instances(db)?;
    match instances.iter_mut().find(|item| item.id == incoming.id) {
        Some(existing) => *existing = incoming,
        None => instances.push(incoming),
    }
    db.set_setting(INSTANCES_KEY, &serde_json::to_string(&instances)?)?;
    Ok(instances)
}

pub fn delete_instance(db: &Db, id: &str) -> AppResult<Vec<MaestroInstance>> {
    let mut instances = list_instances(db)?;
    instances.retain(|item| item.id != id);
    db.set_setting(INSTANCES_KEY, &serde_json::to_string(&instances)?)?;
    Ok(instances)
}

pub fn load_instance(db: &Db, id: &str) -> AppResult<MaestroInstance> {
    list_instances(db)?
        .into_iter()
        .find(|item| item.id == id)
        .ok_or_else(|| AppError::Other(format!("No existe la instancia Maestro «{id}».")))
}

pub async fn test(instance: MaestroInstance) -> AppResult<MaestroTestResult> {
    let instance = instance.normalized()?;
    let started = Instant::now();
    let envelope: ModelsEnvelope = get_json(&instance, "/api/v1/models").await?;
    let h3 = envelope
        .models
        .iter()
        .filter(|m| m.architecture.starts_with("minimax_h3"))
        .count();
    Ok(MaestroTestResult {
        ok: true,
        latency_ms: started.elapsed().as_millis(),
        message: format!("Conectado · {h3} modelos H3 disponibles"),
    })
}

pub async fn models(instance: &MaestroInstance) -> AppResult<Vec<MaestroModel>> {
    let envelope: ModelsEnvelope = get_json(instance, "/api/v1/models").await?;
    Ok(envelope
        .models
        .into_iter()
        .filter(|m| m.architecture.starts_with("minimax_h3"))
        .collect())
}

pub async fn capabilities(
    instance: &MaestroInstance,
    model_type: &str,
) -> AppResult<MaestroCapabilities> {
    let encoded = urlencoding::encode(model_type);
    let options: Value = get_json(instance, &format!("/api/v1/model-options/{encoded}")).await?;
    let defaults: Value = get_json(instance, &format!("/api/v1/defaults/{encoded}"))
        .await
        .unwrap_or(Value::Object(Default::default()));
    let resolutions: Value = get_json(instance, "/api/v1/resolutions")
        .await
        .unwrap_or(Value::Object(Default::default()));
    let sliding = options
        .get("sliding_window_defaults")
        .and_then(Value::as_object);
    let read_u32 = |key: &str, fallback: u32| {
        options
            .get(key)
            .and_then(Value::as_u64)
            .map(|v| v as u32)
            .unwrap_or(fallback)
    };
    let slide_u32 = |key: &str, alternate: &str, fallback: u32| {
        sliding
            .and_then(|s| s.get(key).or_else(|| s.get(alternate)))
            .and_then(Value::as_u64)
            .map(|v| v as u32)
            .unwrap_or(fallback)
    };
    let resolution_list = resolutions
        .get("resolutions")
        .cloned()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(MaestroCapabilities {
        model_type: model_type.to_string(),
        omni_reference: options
            .get("omni_reference")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        fps: options.get("fps").and_then(Value::as_f64).unwrap_or(24.0),
        frames_minimum: read_u32("frames_minimum", 124),
        frames_maximum: read_u32("frames_maximum", 345),
        frames_step: read_u32("frames_steps", 17),
        overlap_default: slide_u32("overlap_default", "overlap_default", 18),
        overlap_minimum: slide_u32("overlap_minimum", "overlap_min", 1),
        overlap_maximum: slide_u32("overlap_maximum", "overlap_max", 103),
        overlap_step: slide_u32("overlap_step", "overlap_step", 17),
        resolutions: resolution_list,
        defaults,
        turbo: options
            .get("minimax_h3_turbo")
            .cloned()
            .filter(|value| !value.is_null()),
    })
}

pub async fn loras(instance: &MaestroInstance, model_type: &str) -> AppResult<Vec<MaestroLora>> {
    let encoded = urlencoding::encode(model_type);
    let envelope: LorasEnvelope =
        get_json(instance, &format!("/api/v1/loras/{encoded}/details")).await?;
    Ok(envelope.loras)
}

pub async fn upload(instance: &MaestroInstance, path: &str) -> AppResult<MaestroUpload> {
    let source = Path::new(path);
    let name = safe_file_name(source)?;
    let file = tokio::fs::File::open(source)
        .await
        .map_err(|e| AppError::FileRead {
            path: path.into(),
            source: e,
        })?;
    let length = file
        .metadata()
        .await
        .map_err(|e| AppError::FileRead {
            path: path.into(),
            source: e,
        })?
        .len();
    let body = reqwest::Body::wrap_stream(ReaderStream::new(file));
    let part = multipart::Part::stream_with_length(body, length).file_name(name);
    let response = client()
        .post(endpoint(instance, "/api/v1/upload")?)
        .multipart(multipart::Form::new().part("file", part))
        .send()
        .await?;
    response_json(response).await
}

pub async fn generate(
    db: &Db,
    instance: &MaestroInstance,
    project_id: &str,
    payload: Value,
) -> AppResult<MaestroJob> {
    let seed = payload.get("seed").and_then(Value::as_i64).unwrap_or(-1);
    let response = client()
        .post(endpoint(instance, "/api/v1/generate")?)
        .json(&payload)
        .send()
        .await?;
    let submitted: GenerateResponse = response_json(response).await?;
    let job = MaestroJob {
        job_id: submitted.job_id,
        instance_id: instance.id.clone(),
        project_id: project_id.to_string(),
        seed,
        status: submitted.status,
        progress: 0.0,
        step: 0,
        total_steps: 0,
        phase: String::new(),
        message: "Enviado a Maestro".into(),
        output_files: Vec::new(),
        error: None,
    };
    persist_job(db, &job)?;
    Ok(job)
}

pub async fn status(
    db: &Db,
    instance: &MaestroInstance,
    project_id: &str,
    job_id: &str,
) -> AppResult<MaestroJob> {
    let encoded = urlencoding::encode(job_id);
    let remote: StatusResponse = get_json(instance, &format!("/api/v1/status/{encoded}")).await?;
    let seed = list_jobs(db)?
        .into_iter()
        .find(|job| job.job_id == job_id)
        .map(|job| job.seed)
        .unwrap_or(-1);
    let job = MaestroJob {
        job_id: remote.job_id,
        instance_id: instance.id.clone(),
        project_id: project_id.to_string(),
        seed,
        status: remote.status,
        progress: remote.progress,
        step: remote.step,
        total_steps: remote.total_steps,
        phase: remote.phase,
        message: remote.message,
        output_files: remote.output_files,
        error: remote.error,
    };
    persist_job(db, &job)?;
    Ok(job)
}

pub async fn cancel(instance: &MaestroInstance, job_id: &str) -> AppResult<()> {
    let encoded = urlencoding::encode(job_id);
    let response = client()
        .post(endpoint(instance, &format!("/api/v1/cancel/{encoded}"))?)
        .send()
        .await?;
    ensure_success(response).await.map(|_| ())
}

pub fn list_jobs(db: &Db) -> AppResult<Vec<MaestroJob>> {
    Ok(db
        .list_maestro_jobs()?
        .into_iter()
        .filter_map(|raw| serde_json::from_str(&raw).ok())
        .collect())
}

pub async fn download(
    app: &AppHandle,
    instance: &MaestroInstance,
    filename: &str,
    destination: Option<String>,
) -> AppResult<String> {
    if filename.is_empty()
        || filename.contains('/')
        || filename.contains('\\')
        || Path::new(filename).file_name().and_then(|v| v.to_str()) != Some(filename)
    {
        return Err(AppError::Other("Nombre de salida Maestro inválido.".into()));
    }
    let target = match destination {
        Some(path) => PathBuf::from(path),
        None => {
            let dir = app
                .path()
                .app_data_dir()
                .map_err(|error| AppError::Other(error.to_string()))?
                .join("maestro-cache");
            tokio::fs::create_dir_all(&dir)
                .await
                .map_err(|e| AppError::FileRead {
                    path: dir.display().to_string(),
                    source: e,
                })?;
            dir.join(filename)
        }
    };
    let mut url = endpoint(instance, "/api/v1/file")?;
    url.path_segments_mut()
        .map_err(|_| AppError::InvalidBaseUrl)?
        .push(filename);
    let response = ensure_success(client().get(url).send().await?).await?;
    let partial = target.with_file_name(format!(
        "{}.part",
        target
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("maestro-output")
    ));
    let result: AppResult<()> = async {
        let mut stream = response.bytes_stream();
        let mut file = tokio::fs::File::create(&partial)
            .await
            .map_err(|e| AppError::FileRead {
                path: partial.display().to_string(),
                source: e,
            })?;
        while let Some(chunk) = stream.next().await {
            file.write_all(&chunk?)
                .await
                .map_err(|e| AppError::FileRead {
                    path: partial.display().to_string(),
                    source: e,
                })?;
        }
        file.flush().await.map_err(|e| AppError::FileRead {
            path: partial.display().to_string(),
            source: e,
        })?;
        drop(file);
        if target.exists() {
            tokio::fs::remove_file(&target)
                .await
                .map_err(|e| AppError::FileRead {
                    path: target.display().to_string(),
                    source: e,
                })?;
        }
        tokio::fs::rename(&partial, &target)
            .await
            .map_err(|e| AppError::FileRead {
                path: target.display().to_string(),
                source: e,
            })?;
        Ok(())
    }
    .await;
    if let Err(error) = result {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(error);
    }
    Ok(target.to_string_lossy().into_owned())
}

fn persist_job(db: &Db, job: &MaestroJob) -> AppResult<()> {
    db.upsert_maestro_job(
        &job.job_id,
        &job.project_id,
        &job.instance_id,
        &serde_json::to_string(job)?,
    )
}

fn validate_base_url(raw: &str) -> AppResult<()> {
    let url = Url::parse(raw).map_err(|_| AppError::InvalidBaseUrl)?;
    if matches!(url.scheme(), "http" | "https") && url.host_str().is_some() {
        Ok(())
    } else {
        Err(AppError::InvalidBaseUrl)
    }
}

fn endpoint(instance: &MaestroInstance, path: &str) -> AppResult<Url> {
    validate_base_url(&instance.base_url)?;
    Url::parse(&format!(
        "{}{}",
        instance.base_url.trim_end_matches('/'),
        path
    ))
    .map_err(|_| AppError::InvalidBaseUrl)
}

fn client() -> Client {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(300))
        .build()
        .expect("valid Maestro HTTP client")
}

async fn get_json<T: serde::de::DeserializeOwned>(
    instance: &MaestroInstance,
    path: &str,
) -> AppResult<T> {
    response_json(client().get(endpoint(instance, path)?).send().await?).await
}

async fn response_json<T: serde::de::DeserializeOwned>(
    response: reqwest::Response,
) -> AppResult<T> {
    let response = ensure_success(response).await?;
    response.json().await.map_err(Into::into)
}

async fn ensure_success(response: reqwest::Response) -> AppResult<reqwest::Response> {
    if response.status().is_success() {
        return Ok(response);
    }
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let message = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| v.get("detail").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| sanitize_error(&body));
    Err(AppError::Provider {
        status: status.as_u16(),
        message,
    })
}

fn sanitize_error(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "respuesta vacía".into()
    } else {
        trimmed.chars().take(500).collect()
    }
}

fn safe_file_name(path: &Path) -> AppResult<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .ok_or_else(|| {
            AppError::Other("La referencia no tiene un nombre de archivo válido.".into())
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    #[test]
    fn normalizes_instance_urls() {
        let value = MaestroInstance {
            id: " gpu0 ".into(),
            name: " GPU 0 ".into(),
            base_url: "http://192.0.2.10:7860/".into(),
        }
        .normalized()
        .unwrap();
        assert_eq!(value.id, "gpu0");
        assert_eq!(value.base_url, "http://192.0.2.10:7860");
    }

    #[test]
    fn rejects_non_http_instances() {
        let value = MaestroInstance {
            id: "x".into(),
            name: "x".into(),
            base_url: "file:///tmp".into(),
        };
        assert!(value.normalized().is_err());
    }

    #[tokio::test]
    async fn reads_and_filters_a_maestro_model_catalog() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0u8; 2048];
            let _ = stream.read(&mut buffer);
            let body = r#"{"models":[{"model_type":"minimax_h3","name":"H3","architecture":"minimax_h3","fps":24,"is_downloaded":true},{"model_type":"other","name":"Other","architecture":"wan","fps":16,"is_downloaded":true}]}"#;
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
        });
        let instance = MaestroInstance {
            id: "test".into(),
            name: "Test".into(),
            base_url: format!("http://{address}"),
        };
        let result = models(&instance).await.unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].model_type, "minimax_h3");
    }
}
