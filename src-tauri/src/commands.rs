use crate::db::{Db, HistoryEntry, ProjectSummary};
use crate::error::{AppError, AppResult};
use crate::llm::client::{self, CancelRegistry};
use crate::llm::types::{ChatMessage, TestResult};
use crate::llm::vision::{self, VisionResult};
use crate::maestro::{
    self, MaestroCapabilities, MaestroInstance, MaestroJob, MaestroLora, MaestroModel,
    MaestroTestResult, MaestroUpload,
};
use crate::media::{self, MediaInfo};
use crate::project_package::{
    self, ProjectAsset, ProjectExportOptions, ProjectExportReport, ProjectImportPreview,
    ProjectImportStrategy,
};
use crate::secrets;
use crate::settings::{self, Profile, SettingsView};
use tauri::{AppHandle, State};

// ---- settings ---------------------------------------------------------------

#[tauri::command]
pub fn get_settings(db: State<'_, Db>) -> AppResult<SettingsView> {
    settings::view(&db)
}

#[tauri::command]
pub fn save_profile(db: State<'_, Db>, profile: Profile) -> AppResult<SettingsView> {
    settings::save(&db, profile)?;
    settings::view(&db)
}

#[tauri::command]
pub fn set_api_key(db: State<'_, Db>, profile_id: String, key: String) -> AppResult<SettingsView> {
    secrets::set_key(&profile_id, &key)?;
    settings::view(&db)
}

#[tauri::command]
pub fn clear_api_key(db: State<'_, Db>, profile_id: String) -> AppResult<SettingsView> {
    secrets::clear_key(&profile_id)?;
    settings::view(&db)
}

/// Copies a stored credential between profiles. Done in Rust so that reusing
/// one provider for both models never round-trips the key through the webview.
#[tauri::command]
pub fn copy_api_key(db: State<'_, Db>, from: String, to: String) -> AppResult<SettingsView> {
    match secrets::get_key(&from) {
        Ok(key) => secrets::set_key(&to, &key)?,
        // Nothing to copy: leave the destination empty rather than stale.
        Err(AppError::MissingApiKey(_)) => secrets::clear_key(&to)?,
        Err(e) => return Err(e),
    }
    settings::view(&db)
}

/// Tests the values currently on screen, not the saved ones, so the user can
/// verify before committing. An empty `key` falls back to the stored one.
#[tauri::command]
pub async fn test_profile(profile: Profile, key: Option<String>) -> AppResult<TestResult> {
    let api_key = resolve_key(&profile.id, key)?;
    // The vision profile is probed with a real image: an endpoint that answers
    // text fine can still be unable to see.
    let with_image = profile.id == settings::VISION_PROFILE;
    client::test_connection(&profile, &api_key, with_image).await
}

fn resolve_key(profile_id: &str, provided: Option<String>) -> AppResult<String> {
    match provided.map(|k| k.trim().to_string()) {
        Some(k) if !k.is_empty() => Ok(k),
        _ => match secrets::get_key(profile_id) {
            Ok(k) => Ok(k),
            // Local servers (Ollama, LM Studio) need no key at all.
            Err(AppError::MissingApiKey(_)) => Ok(String::new()),
            Err(e) => Err(e),
        },
    }
}

// ---- media ------------------------------------------------------------------

#[tauri::command]
pub async fn inspect_media(path: String) -> AppResult<MediaInfo> {
    // Hashing + decoding is CPU-bound; keep it off the async runtime's poll.
    tauri::async_runtime::spawn_blocking(move || media::inspect(&path))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn media_preview(path: String, max_px: Option<u32>) -> AppResult<String> {
    let max = max_px.unwrap_or(1600);
    tauri::async_runtime::spawn_blocking(move || media::preview(&path, max))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

/// Writes a text file to a path the user picked in the native save dialog.
/// Narrower than granting the fs plugin a filesystem scope.
#[tauri::command]
pub fn export_text(path: String, contents: String) -> AppResult<()> {
    std::fs::write(&path, contents).map_err(|e| AppError::FileRead { path, source: e })
}

// ---- vision -----------------------------------------------------------------

#[tauri::command]
pub async fn analyze_reference(
    app: AppHandle,
    path: String,
    hash: String,
    hint: Option<String>,
    force: Option<bool>,
) -> AppResult<VisionResult> {
    let (profile, cached) = {
        let db = state_db(&app);
        let profile = settings::load(&db, settings::VISION_PROFILE)?;
        profile.ensure_usable()?;
        let cached = if force.unwrap_or(false) {
            None
        } else {
            db.get_vision(&hash, &profile.model)?
        };
        (profile, cached)
    };

    if let Some(raw) = cached {
        if let Ok(analysis) = serde_json::from_str(&raw) {
            return Ok(VisionResult {
                analysis,
                cached: true,
            });
        }
    }

    let api_key = resolve_key(&profile.id, None)?;
    let data_url = {
        let path = path.clone();
        tauri::async_runtime::spawn_blocking(move || media::for_vision(&path, 1024))
            .await
            .map_err(|e| AppError::Other(e.to_string()))??
    };

    let analysis = vision::analyze(&profile, &api_key, data_url, hint).await?;

    let db = state_db(&app);
    db.put_vision(&hash, &profile.model, &serde_json::to_string(&analysis)?)?;

    Ok(VisionResult {
        analysis,
        cached: false,
    })
}

#[tauri::command]
pub fn clear_vision_cache(db: State<'_, Db>) -> AppResult<usize> {
    db.clear_vision_cache()
}

// ---- generation -------------------------------------------------------------

/// The frontend owns prompt assembly (see `src/core/h3`); this command only
/// transports it, so the structural rules stay in one testable place.
#[tauri::command]
pub async fn generate_prompt(
    app: AppHandle,
    registry: State<'_, CancelRegistry>,
    request_id: String,
    system: String,
    user: String,
    temperature: Option<f32>,
) -> AppResult<String> {
    let profile = {
        let db = state_db(&app);
        settings::load(&db, settings::WRITER_PROFILE)?
    };
    profile.ensure_usable()?;
    let api_key = resolve_key(&profile.id, None)?;
    let messages = [ChatMessage::system(system), ChatMessage::user(user)];

    client::complete_streaming(
        &app,
        &registry,
        &request_id,
        &profile,
        &api_key,
        &messages,
        temperature,
    )
    .await
}

#[tauri::command]
pub fn cancel_request(registry: State<'_, CancelRegistry>, request_id: String) {
    registry.cancel(&request_id);
}

// ---- projects ---------------------------------------------------------------

#[tauri::command]
pub fn list_projects(db: State<'_, Db>) -> AppResult<Vec<ProjectSummary>> {
    db.list_projects()
}

#[tauri::command]
pub fn load_project(db: State<'_, Db>, id: String) -> AppResult<Option<String>> {
    db.load_project(&id)
}

#[tauri::command]
pub fn save_project(db: State<'_, Db>, id: String, name: String, data: String) -> AppResult<()> {
    db.save_project(&id, &name, &data)
}

#[tauri::command]
pub fn delete_project(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    if db.has_active_maestro_jobs(&id)? {
        return Err(AppError::Other(
            "No se puede eliminar un proyecto con trabajos Maestro activos.".into(),
        ));
    }
    project_package::delete_project_assets(&app, &id)?;
    db.delete_project(&id)
}

#[tauri::command]
pub fn ingest_project_asset(
    app: AppHandle,
    project_id: String,
    path: String,
    category: String,
) -> AppResult<ProjectAsset> {
    project_package::ingest(&app, &project_id, &path, &category)
}

#[tauri::command]
pub fn project_asset_available(path: String, size_bytes: u64) -> bool {
    std::fs::metadata(path).is_ok_and(|metadata| metadata.is_file() && metadata.len() == size_bytes)
}

#[tauri::command]
pub fn preview_project_package(db: State<'_, Db>, path: String) -> AppResult<ProjectImportPreview> {
    project_package::preview(&db, &path)
}

#[tauri::command]
pub fn export_project_package(
    app: AppHandle,
    db: State<'_, Db>,
    options: ProjectExportOptions,
) -> AppResult<ProjectExportReport> {
    project_package::export(&app, &db, options)
}

#[tauri::command]
pub fn import_project_package(
    app: AppHandle,
    db: State<'_, Db>,
    path: String,
    strategy: ProjectImportStrategy,
) -> AppResult<String> {
    project_package::import(&app, &db, &path, strategy)
}

#[tauri::command]
pub fn add_history(
    db: State<'_, Db>,
    id: String,
    project_id: String,
    mode: String,
    content: String,
) -> AppResult<()> {
    db.add_history(&id, &project_id, &mode, &content)
}

#[tauri::command]
pub fn list_history(db: State<'_, Db>, project_id: String) -> AppResult<Vec<HistoryEntry>> {
    db.list_history(&project_id)
}

#[tauri::command]
pub fn copy_project_history(
    db: State<'_, Db>,
    from_project_id: String,
    to_project_id: String,
) -> AppResult<()> {
    db.copy_history(&from_project_id, &to_project_id)
}

// ---- Maestro ---------------------------------------------------------------

#[tauri::command]
pub fn list_maestro_instances(db: State<'_, Db>) -> AppResult<Vec<MaestroInstance>> {
    maestro::list_instances(&db)
}

#[tauri::command]
pub fn save_maestro_instance(
    db: State<'_, Db>,
    instance: MaestroInstance,
) -> AppResult<Vec<MaestroInstance>> {
    maestro::save_instance(&db, instance)
}

#[tauri::command]
pub fn delete_maestro_instance(db: State<'_, Db>, id: String) -> AppResult<Vec<MaestroInstance>> {
    maestro::delete_instance(&db, &id)
}

#[tauri::command]
pub async fn test_maestro_instance(instance: MaestroInstance) -> AppResult<MaestroTestResult> {
    maestro::test(instance).await
}

#[tauri::command]
pub async fn maestro_models(
    db: State<'_, Db>,
    instance_id: String,
) -> AppResult<Vec<MaestroModel>> {
    let instance = maestro::load_instance(&db, &instance_id)?;
    maestro::models(&instance).await
}

#[tauri::command]
pub async fn maestro_model_capabilities(
    db: State<'_, Db>,
    instance_id: String,
    model_type: String,
) -> AppResult<MaestroCapabilities> {
    let instance = maestro::load_instance(&db, &instance_id)?;
    maestro::capabilities(&instance, &model_type).await
}

#[tauri::command]
pub async fn maestro_loras(
    db: State<'_, Db>,
    instance_id: String,
    model_type: String,
) -> AppResult<Vec<MaestroLora>> {
    let instance = maestro::load_instance(&db, &instance_id)?;
    maestro::loras(&instance, &model_type).await
}

#[tauri::command]
pub async fn maestro_upload(
    db: State<'_, Db>,
    instance_id: String,
    path: String,
) -> AppResult<MaestroUpload> {
    let instance = maestro::load_instance(&db, &instance_id)?;
    maestro::upload(&instance, &path).await
}

#[tauri::command]
pub async fn maestro_generate(
    db: State<'_, Db>,
    instance_id: String,
    project_id: String,
    payload: serde_json::Value,
) -> AppResult<MaestroJob> {
    let instance = maestro::load_instance(&db, &instance_id)?;
    maestro::generate(&db, &instance, &project_id, payload).await
}

#[tauri::command]
pub async fn maestro_job_status(
    db: State<'_, Db>,
    instance_id: String,
    project_id: String,
    job_id: String,
) -> AppResult<MaestroJob> {
    let instance = maestro::load_instance(&db, &instance_id)?;
    maestro::status(&db, &instance, &project_id, &job_id).await
}

#[tauri::command]
pub async fn maestro_cancel_job(
    db: State<'_, Db>,
    instance_id: String,
    job_id: String,
) -> AppResult<()> {
    let instance = maestro::load_instance(&db, &instance_id)?;
    maestro::cancel(&instance, &job_id).await
}

#[tauri::command]
pub fn list_maestro_jobs(db: State<'_, Db>) -> AppResult<Vec<MaestroJob>> {
    maestro::list_jobs(&db)
}

#[tauri::command]
pub async fn maestro_download_output(
    app: AppHandle,
    db: State<'_, Db>,
    instance_id: String,
    filename: String,
    destination: Option<String>,
) -> AppResult<String> {
    let instance = maestro::load_instance(&db, &instance_id)?;
    maestro::download(&app, &instance, &filename, destination).await
}

fn state_db(app: &AppHandle) -> State<'_, Db> {
    use tauri::Manager;
    app.state::<Db>()
}
