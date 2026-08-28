use crate::db::{Db, HistoryEntry};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const FORMAT: &str = "director-project";
const FORMAT_VERSION: u32 = 1;
const PROJECT_SCHEMA_VERSION: u32 = 2;
const MAX_ENTRIES: usize = 10_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAsset {
    pub id: String,
    pub category: String,
    pub original_file_name: String,
    pub path: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageAsset {
    pub id: String,
    pub category: String,
    pub original_file_name: String,
    pub archive_path: String,
    pub size_bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPackageManifest {
    pub format: String,
    pub format_version: u32,
    pub project_schema_version: u32,
    pub app_version: String,
    pub exported_at: i64,
    pub project_id: String,
    pub project_name: String,
    pub assets: Vec<PackageAsset>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectExportOptions {
    pub destination: String,
    pub project_data: String,
    #[serde(default)]
    pub included_output_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectExportReport {
    pub path: String,
    pub asset_count: usize,
    pub total_size: u64,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectImportPreview {
    pub project_id: String,
    pub project_name: String,
    pub format_version: u32,
    pub app_version: String,
    pub reference_count: usize,
    pub output_count: usize,
    pub total_size: u64,
    pub has_conflict: bool,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectImportStrategy {
    Copy,
    Replace,
}

pub fn ingest(
    app: &AppHandle,
    project_id: &str,
    source: &str,
    category: &str,
) -> AppResult<ProjectAsset> {
    validate_project_id(project_id)?;
    if !matches!(category, "reference" | "output") {
        return Err(AppError::Other("Categoría de recurso inválida.".into()));
    }
    let source_path = Path::new(source);
    let file_name = source_path
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or_else(|| AppError::Other("El recurso no tiene un nombre válido.".into()))?;
    let file_name = safe_file_name(file_name)?;
    let (sha256, size_bytes) = hash_file(source_path)?;
    let id = format!("asset_{sha256}");
    let destination = project_dir(app, project_id)?
        .join(if category == "reference" {
            "references"
        } else {
            "outputs"
        })
        .join(&id)
        .join(&file_name);
    copy_atomic(source_path, &destination)?;
    Ok(ProjectAsset {
        id,
        category: category.into(),
        original_file_name: file_name,
        path: destination.to_string_lossy().into_owned(),
        size_bytes,
        sha256,
        available: true,
    })
}

pub fn delete_project_assets(app: &AppHandle, project_id: &str) -> AppResult<()> {
    validate_project_id(project_id)?;
    let dir = project_dir(app, project_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|source| file_error(&dir, source))?;
    }
    Ok(())
}

pub fn preview(db: &Db, path: &str) -> AppResult<ProjectImportPreview> {
    let manifest = read_manifest(path)?;
    validate_manifest(&manifest)?;
    Ok(ProjectImportPreview {
        project_id: manifest.project_id.clone(),
        project_name: manifest.project_name.clone(),
        format_version: manifest.format_version,
        app_version: manifest.app_version.clone(),
        reference_count: manifest
            .assets
            .iter()
            .filter(|a| a.category == "reference")
            .count(),
        output_count: manifest
            .assets
            .iter()
            .filter(|a| a.category == "output")
            .count(),
        total_size: manifest.assets.iter().map(|a| a.size_bytes).sum(),
        has_conflict: db.load_project(&manifest.project_id)?.is_some(),
    })
}

pub fn export(
    _app: &AppHandle,
    db: &Db,
    options: ProjectExportOptions,
) -> AppResult<ProjectExportReport> {
    let mut project: Value = serde_json::from_str(&options.project_data)?;
    let project_id = string_field(&project, "id")?;
    let project_name = string_field(&project, "name")?;
    validate_project_id(&project_id)?;
    let mut assets = Vec::new();
    let mut sources = HashMap::new();
    let mut warnings = Vec::new();

    let references = project
        .get_mut("references")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| AppError::Other("El proyecto no contiene referencias válidas.".into()))?;
    for reference in references {
        let source = reference
            .get("path")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let id = reference
            .get("assetId")
            .and_then(Value::as_str)
            .or_else(|| reference.get("id").and_then(Value::as_str))
            .unwrap_or_default();
        let name = reference
            .get("fileName")
            .and_then(Value::as_str)
            .unwrap_or("reference");
        let asset = package_asset(id, "reference", name, source)?;
        sources.insert(asset.id.clone(), PathBuf::from(source));
        reference["path"] = Value::String(asset.archive_path.clone());
        reference["assetId"] = Value::String(asset.id.clone());
        reference["sha256"] = Value::String(asset.sha256.clone());
        reference["available"] = Value::Bool(true);
        assets.push(asset);
    }

    let selected: HashSet<&str> = options
        .included_output_ids
        .iter()
        .map(String::as_str)
        .collect();
    if let Some(outputs) = project.get_mut("outputs").and_then(Value::as_array_mut) {
        outputs.retain(|output| {
            selected.contains(output.get("id").and_then(Value::as_str).unwrap_or_default())
        });
        for output in outputs.iter_mut() {
            let id = output.get("id").and_then(Value::as_str).unwrap_or_default();
            let source = output
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let name = output
                .get("fileName")
                .and_then(Value::as_str)
                .unwrap_or("output");
            match package_asset(id, "output", name, source) {
                Ok(asset) => {
                    sources.insert(asset.id.clone(), PathBuf::from(source));
                    output["path"] = Value::String(asset.archive_path.clone());
                    output["sha256"] = Value::String(asset.sha256.clone());
                    output["available"] = Value::Bool(true);
                    assets.push(asset);
                }
                Err(_) => warnings.push(format!(
                    "No se incluyó el resultado «{name}» porque no está disponible."
                )),
            }
        }
        outputs.retain(|output| {
            assets.iter().any(|asset| {
                asset.category == "output"
                    && asset.id == output.get("id").and_then(Value::as_str).unwrap_or_default()
            })
        });
    }
    if let Some(maestro) = project.get_mut("maestro").and_then(Value::as_object_mut) {
        maestro.insert("instanceId".into(), Value::String(String::new()));
    }

    let history = db.list_history(&project_id)?;
    let manifest = ProjectPackageManifest {
        format: FORMAT.into(),
        format_version: FORMAT_VERSION,
        project_schema_version: project
            .get("schemaVersion")
            .and_then(Value::as_u64)
            .unwrap_or(PROJECT_SCHEMA_VERSION as u64) as u32,
        app_version: env!("CARGO_PKG_VERSION").into(),
        exported_at: now_millis(),
        project_id,
        project_name,
        assets,
    };
    let destination = PathBuf::from(&options.destination);
    write_package(&destination, &manifest, &project, &history, &sources)?;
    Ok(ProjectExportReport {
        path: destination.to_string_lossy().into_owned(),
        asset_count: manifest.assets.len(),
        total_size: manifest.assets.iter().map(|asset| asset.size_bytes).sum(),
        warnings,
    })
}

pub fn import(
    app: &AppHandle,
    db: &Db,
    path: &str,
    strategy: ProjectImportStrategy,
) -> AppResult<String> {
    let manifest = read_manifest(path)?;
    validate_manifest(&manifest)?;
    let conflict = db.load_project(&manifest.project_id)?.is_some();
    if conflict
        && matches!(strategy, ProjectImportStrategy::Replace)
        && db.has_active_maestro_jobs(&manifest.project_id)?
    {
        return Err(AppError::Other(
            "No se puede reemplazar el proyecto mientras tenga un trabajo Maestro activo.".into(),
        ));
    }
    let target_id = if conflict && matches!(strategy, ProjectImportStrategy::Copy) {
        new_project_id()
    } else {
        manifest.project_id.clone()
    };
    validate_project_id(&target_id)?;
    let root = projects_root(app)?;
    fs::create_dir_all(&root).map_err(|source| file_error(&root, source))?;
    let staging = root.join(format!(".import-{}", new_project_id()));
    fs::create_dir_all(&staging).map_err(|source| file_error(&staging, source))?;
    let result = import_into_staging(
        path,
        &manifest,
        &staging,
        &root.join(&target_id),
        &target_id,
    );
    let (project, history) = match result {
        Ok(value) => value,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }
    };
    let target = root.join(&target_id);
    let backup = root.join(format!(".backup-{}", new_project_id()));
    if target.exists() {
        fs::rename(&target, &backup).map_err(|source| file_error(&target, source))?;
    }
    if let Err(source) = fs::rename(&staging, &target) {
        if backup.exists() {
            let _ = fs::rename(&backup, &target);
        }
        return Err(file_error(&staging, source));
    }
    if conflict && matches!(strategy, ProjectImportStrategy::Replace) {
        db.delete_project(&manifest.project_id)?;
    }
    let raw = serde_json::to_string(&project)?;
    let name = string_field(&project, "name")?;
    db.save_project(&target_id, &name, &raw)?;
    for item in history {
        db.add_history(
            &format!("hist_{}", new_project_id()),
            &target_id,
            &item.mode,
            &item.content,
        )?;
    }
    if backup.exists() {
        let _ = fs::remove_dir_all(&backup);
    }
    Ok(raw)
}

fn write_package(
    destination: &Path,
    manifest: &ProjectPackageManifest,
    project: &Value,
    history: &[HistoryEntry],
    sources: &HashMap<String, PathBuf>,
) -> AppResult<()> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|source| file_error(parent, source))?;
    }
    let partial = destination.with_extension("directorproj.part");
    let result = (|| -> AppResult<()> {
        let file = File::create(&partial).map_err(|source| file_error(&partial, source))?;
        let mut zip = ZipWriter::new(file);
        let json_options =
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        let media_options =
            SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        write_json(&mut zip, "manifest.json", manifest, json_options)?;
        write_json(&mut zip, "project.json", project, json_options)?;
        write_json(&mut zip, "history.json", history, json_options)?;
        for asset in &manifest.assets {
            zip.start_file(&asset.archive_path, media_options)
                .map_err(zip_error)?;
            let source_path = sources.get(&asset.id).ok_or_else(|| {
                AppError::Other(format!(
                    "No se encontró el origen de «{}».",
                    asset.original_file_name
                ))
            })?;
            let mut source =
                File::open(source_path).map_err(|source| file_error(source_path, source))?;
            std::io::copy(&mut source, &mut zip)
                .map_err(|error| AppError::Other(error.to_string()))?;
        }
        let mut file = zip.finish().map_err(zip_error)?;
        file.flush()
            .map_err(|source| file_error(&partial, source))?;
        drop(file);
        let backup = destination.with_extension("directorproj.bak");
        if backup.exists() {
            fs::remove_file(&backup).map_err(|source| file_error(&backup, source))?;
        }
        if destination.exists() {
            fs::rename(destination, &backup).map_err(|source| file_error(destination, source))?;
        }
        if let Err(source) = fs::rename(&partial, destination) {
            if backup.exists() {
                let _ = fs::rename(&backup, destination);
            }
            return Err(file_error(destination, source));
        }
        if backup.exists() {
            let _ = fs::remove_file(backup);
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&partial);
    }
    result
}

fn package_asset(id: &str, category: &str, name: &str, source: &str) -> AppResult<PackageAsset> {
    let name = safe_file_name(name)?;
    let source_path = Path::new(source);
    let (sha256, size_bytes) = hash_file(source_path)?;
    let id = if id.trim().is_empty() {
        format!("asset_{sha256}")
    } else {
        id.to_string()
    };
    Ok(PackageAsset {
        archive_path: format!(
            "assets/{}/{}/{}",
            if category == "reference" {
                "references"
            } else {
                "outputs"
            },
            id,
            name
        ),
        id,
        category: category.into(),
        original_file_name: name,
        size_bytes,
        sha256,
    })
}

fn import_into_staging(
    path: &str,
    manifest: &ProjectPackageManifest,
    staging: &Path,
    final_dir: &Path,
    target_id: &str,
) -> AppResult<(Value, Vec<HistoryEntry>)> {
    let file = File::open(path).map_err(|source| file_error(Path::new(path), source))?;
    let mut zip = ZipArchive::new(file).map_err(zip_error)?;
    if zip.len() > MAX_ENTRIES {
        return Err(AppError::Other(
            "El paquete contiene demasiadas entradas.".into(),
        ));
    }
    let declared: HashMap<&str, &PackageAsset> = manifest
        .assets
        .iter()
        .map(|asset| (asset.archive_path.as_str(), asset))
        .collect();
    let mut seen = HashSet::new();
    let mut project_bytes = Vec::new();
    let mut history_bytes = Vec::new();
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(zip_error)?;
        let name = entry.name().to_string();
        validate_archive_path(&name)?;
        if !seen.insert(name.clone()) {
            return Err(AppError::Other(format!(
                "Entrada duplicada en el paquete: {name}"
            )));
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(AppError::Other(
                "El paquete contiene enlaces simbólicos.".into(),
            ));
        }
        match name.as_str() {
            "manifest.json" => {
                std::io::copy(&mut entry.take(8 * 1024 * 1024), &mut std::io::sink()).ok();
            }
            "project.json" => {
                entry
                    .take(32 * 1024 * 1024)
                    .read_to_end(&mut project_bytes)
                    .map_err(|e| AppError::Other(e.to_string()))?;
            }
            "history.json" => {
                entry
                    .take(64 * 1024 * 1024)
                    .read_to_end(&mut history_bytes)
                    .map_err(|e| AppError::Other(e.to_string()))?;
            }
            _ => {
                let asset = declared.get(name.as_str()).ok_or_else(|| {
                    AppError::Other(format!("Archivo no declarado en el manifiesto: {name}"))
                })?;
                let destination = staging
                    .join(if asset.category == "reference" {
                        "references"
                    } else {
                        "outputs"
                    })
                    .join(&asset.id)
                    .join(safe_file_name(&asset.original_file_name)?);
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent).map_err(|source| file_error(parent, source))?;
                }
                let mut output = File::create(&destination)
                    .map_err(|source| file_error(&destination, source))?;
                let mut hasher = Sha256::new();
                let mut size = 0u64;
                let mut buffer = [0u8; 128 * 1024];
                loop {
                    let read = entry
                        .read(&mut buffer)
                        .map_err(|e| AppError::Other(e.to_string()))?;
                    if read == 0 {
                        break;
                    }
                    output
                        .write_all(&buffer[..read])
                        .map_err(|source| file_error(&destination, source))?;
                    hasher.update(&buffer[..read]);
                    size += read as u64;
                    if size > asset.size_bytes {
                        return Err(AppError::Other(format!(
                            "Tamaño inválido para «{}».",
                            asset.original_file_name
                        )));
                    }
                }
                if size != asset.size_bytes || format!("{:x}", hasher.finalize()) != asset.sha256 {
                    return Err(AppError::Other(format!(
                        "Checksum inválido para «{}».",
                        asset.original_file_name
                    )));
                }
            }
        }
    }
    for asset in &manifest.assets {
        if !seen.contains(&asset.archive_path) {
            return Err(AppError::Other(format!(
                "Falta el recurso «{}».",
                asset.original_file_name
            )));
        }
    }
    let mut project: Value = serde_json::from_slice(&project_bytes)?;
    let mut history: Vec<HistoryEntry> = if history_bytes.is_empty() {
        Vec::new()
    } else {
        serde_json::from_slice(&history_bytes)?
    };
    project["id"] = Value::String(target_id.into());
    project["schemaVersion"] = Value::from(PROJECT_SCHEMA_VERSION);
    if target_id != manifest.project_id {
        project["createdAt"] = Value::from(now_millis());
    }
    project["updatedAt"] = Value::from(now_millis());
    if let Some(maestro) = project.get_mut("maestro").and_then(Value::as_object_mut) {
        maestro.insert("instanceId".into(), Value::String(String::new()));
    }
    rewrite_import_paths(&mut project, manifest, final_dir);
    history.iter_mut().for_each(|item| item.id.clear());
    Ok((project, history))
}

fn rewrite_import_paths(project: &mut Value, manifest: &ProjectPackageManifest, final_dir: &Path) {
    for (collection, category, folder) in [
        ("references", "reference", "references"),
        ("outputs", "output", "outputs"),
    ] {
        if let Some(items) = project.get_mut(collection).and_then(Value::as_array_mut) {
            for item in items {
                let id = item
                    .get("assetId")
                    .or_else(|| item.get("id"))
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if let Some(asset) = manifest
                    .assets
                    .iter()
                    .find(|asset| asset.category == category && asset.id == id)
                {
                    let path = final_dir
                        .join(folder)
                        .join(&asset.id)
                        .join(&asset.original_file_name);
                    item["path"] = Value::String(path.to_string_lossy().into_owned());
                    item["sha256"] = Value::String(asset.sha256.clone());
                    item["available"] = Value::Bool(true);
                }
            }
        }
    }
}

fn read_manifest(path: &str) -> AppResult<ProjectPackageManifest> {
    let file = File::open(path).map_err(|source| file_error(Path::new(path), source))?;
    let mut zip = ZipArchive::new(file).map_err(zip_error)?;
    let mut entry = zip.by_name("manifest.json").map_err(zip_error)?;
    if entry.size() > 8 * 1024 * 1024 {
        return Err(AppError::Other("El manifiesto es demasiado grande.".into()));
    }
    let mut bytes = Vec::new();
    entry
        .read_to_end(&mut bytes)
        .map_err(|e| AppError::Other(e.to_string()))?;
    serde_json::from_slice(&bytes).map_err(Into::into)
}

fn validate_manifest(manifest: &ProjectPackageManifest) -> AppResult<()> {
    if manifest.format != FORMAT || manifest.format_version != FORMAT_VERSION {
        return Err(AppError::Other(
            "Formato o versión .directorproj no compatible.".into(),
        ));
    }
    validate_project_id(&manifest.project_id)?;
    let mut paths = HashSet::new();
    let mut ids = HashSet::new();
    for asset in &manifest.assets {
        validate_archive_path(&asset.archive_path)?;
        safe_file_name(&asset.original_file_name)?;
        if !matches!(asset.category.as_str(), "reference" | "output")
            || !paths.insert(&asset.archive_path)
            || !ids.insert((asset.category.as_str(), asset.id.as_str()))
        {
            return Err(AppError::Other(
                "El manifiesto contiene recursos inválidos o duplicados.".into(),
            ));
        }
    }
    Ok(())
}

fn write_json<T: Serialize + ?Sized>(
    zip: &mut ZipWriter<File>,
    name: &str,
    value: &T,
    options: SimpleFileOptions,
) -> AppResult<()> {
    zip.start_file(name, options).map_err(zip_error)?;
    serde_json::to_writer(&mut *zip, value)?;
    Ok(())
}

fn copy_atomic(source: &Path, destination: &Path) -> AppResult<()> {
    if destination.exists() {
        return Ok(());
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|source| file_error(parent, source))?;
    }
    let partial = destination.with_extension("part");
    fs::copy(source, &partial).map_err(|error| file_error(source, error))?;
    fs::rename(&partial, destination).map_err(|source| file_error(destination, source))?;
    Ok(())
}

fn hash_file(path: &Path) -> AppResult<(String, u64)> {
    let mut file = File::open(path).map_err(|source| file_error(path, source))?;
    let mut hasher = Sha256::new();
    let mut size = 0u64;
    let mut buffer = [0u8; 128 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|source| file_error(path, source))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        size += read as u64;
    }
    Ok((format!("{:x}", hasher.finalize()), size))
}

fn projects_root(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(e.to_string()))?
        .join("projects"))
}
fn project_dir(app: &AppHandle, id: &str) -> AppResult<PathBuf> {
    Ok(projects_root(app)?.join(id))
}
fn validate_project_id(id: &str) -> AppResult<()> {
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
    {
        Err(AppError::Other("ID de proyecto inválido.".into()))
    } else {
        Ok(())
    }
}
fn validate_archive_path(path: &str) -> AppResult<()> {
    let candidate = Path::new(path);
    if candidate.is_absolute()
        || candidate
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        || path.contains('\\')
    {
        Err(AppError::Other(format!(
            "Ruta insegura en el paquete: {path}"
        )))
    } else {
        Ok(())
    }
}
fn safe_file_name(name: &str) -> AppResult<String> {
    if name.is_empty() || name.contains(['/', '\\']) || matches!(name, "." | "..") {
        return Err(AppError::Other("Nombre de archivo inseguro.".into()));
    }
    Ok(name
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*') {
                '_'
            } else {
                c
            }
        })
        .collect())
}
fn string_field(value: &Value, field: &str) -> AppResult<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| AppError::Other(format!("Falta {field} en el proyecto.")))
}
fn new_project_id() -> String {
    format!(
        "proj_{:x}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    )
}
fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn file_error(path: &Path, source: std::io::Error) -> AppError {
    AppError::FileRead {
        path: path.display().to_string(),
        source,
    }
}
fn zip_error(error: zip::result::ZipError) -> AppError {
    AppError::Other(format!("Paquete .directorproj inválido: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_archive_traversal() {
        assert!(validate_archive_path("../secret.txt").is_err());
        assert!(validate_archive_path("C:\\secret.txt").is_err());
        assert!(validate_archive_path("assets/references/a.png").is_ok());
    }

    #[test]
    fn project_ids_are_directory_safe() {
        assert!(validate_project_id("proj_abc-123").is_ok());
        assert!(validate_project_id("../bad").is_err());
    }

    #[test]
    fn package_round_trip_preserves_original_bytes() {
        let root = std::env::temp_dir().join(format!("director-package-test-{}", new_project_id()));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("original.bin");
        let original = (0..=255u8).cycle().take(32_000).collect::<Vec<_>>();
        fs::write(&source, &original).unwrap();
        let (sha256, size_bytes) = hash_file(&source).unwrap();
        let asset = PackageAsset {
            id: format!("asset_{sha256}"),
            category: "reference".into(),
            original_file_name: "original.bin".into(),
            archive_path: format!("assets/references/asset_{sha256}/original.bin"),
            size_bytes,
            sha256,
        };
        let manifest = ProjectPackageManifest {
            format: FORMAT.into(),
            format_version: FORMAT_VERSION,
            project_schema_version: 2,
            app_version: "test".into(),
            exported_at: 0,
            project_id: "proj_test".into(),
            project_name: "Test".into(),
            assets: vec![asset.clone()],
        };
        let project = serde_json::json!({
            "schemaVersion": 2, "id": "proj_test", "name": "Test", "createdAt": 0, "updatedAt": 0, "videoSeed": 123456,
            "references": [{ "id": "ref", "assetId": asset.id, "fileName": "original.bin", "path": asset.archive_path }], "outputs": []
        });
        let package = root.join("test.directorproj");
        let sources = HashMap::from([(asset.id.clone(), source.clone())]);
        write_package(&package, &manifest, &project, &[], &sources).unwrap();
        let staging = root.join("staging");
        fs::create_dir_all(&staging).unwrap();
        let final_dir = root.join("final");
        let (imported, _) = import_into_staging(
            package.to_str().unwrap(),
            &manifest,
            &staging,
            &final_dir,
            "proj_imported",
        )
        .unwrap();
        let extracted = staging
            .join("references")
            .join(&asset.id)
            .join("original.bin");
        assert_eq!(fs::read(extracted).unwrap(), original);
        assert_eq!(imported["videoSeed"], 123456);
        let mut corrupt_manifest = manifest.clone();
        corrupt_manifest.assets[0].sha256 = "0".repeat(64);
        let corrupt_stage = root.join("corrupt");
        fs::create_dir_all(&corrupt_stage).unwrap();
        assert!(import_into_staging(
            package.to_str().unwrap(),
            &corrupt_manifest,
            &corrupt_stage,
            &final_dir,
            "proj_bad"
        )
        .is_err());
        let _ = fs::remove_dir_all(root);
    }
}
