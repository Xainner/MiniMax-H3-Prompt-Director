mod commands;
mod db;
mod error;
mod llm;
mod maestro;
mod media;
mod project_package;
mod secrets;
mod settings;

use llm::client::CancelRegistry;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            app.manage(db::Db::open(&dir)?);
            app.manage(CancelRegistry::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_profile,
            commands::set_api_key,
            commands::clear_api_key,
            commands::copy_api_key,
            commands::test_profile,
            commands::inspect_media,
            commands::media_preview,
            commands::export_text,
            commands::analyze_reference,
            commands::clear_vision_cache,
            commands::generate_prompt,
            commands::cancel_request,
            commands::list_projects,
            commands::load_project,
            commands::save_project,
            commands::delete_project,
            commands::ingest_project_asset,
            commands::project_asset_available,
            commands::preview_project_package,
            commands::export_project_package,
            commands::import_project_package,
            commands::add_history,
            commands::list_history,
            commands::copy_project_history,
            commands::list_maestro_instances,
            commands::save_maestro_instance,
            commands::delete_maestro_instance,
            commands::test_maestro_instance,
            commands::maestro_models,
            commands::maestro_model_capabilities,
            commands::maestro_loras,
            commands::maestro_upload,
            commands::maestro_generate,
            commands::maestro_job_status,
            commands::maestro_cancel_job,
            commands::list_maestro_jobs,
            commands::maestro_download_output,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
