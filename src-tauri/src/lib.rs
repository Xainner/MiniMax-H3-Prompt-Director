mod commands;
mod db;
mod error;
mod llm;
mod media;
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
            commands::add_history,
            commands::list_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
