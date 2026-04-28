#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod engine;

fn main() {
    tauri::Builder::default()
        .manage(engine::RunStore::default())
        .invoke_handler(tauri::generate_handler![
            engine::start_run,
            engine::stop_run,
            engine::get_run_job,
            engine::list_row_tasks,
            engine::get_run_logs,
            engine::preview_input,
            engine::preflight_output,
            engine::open_source_file,
            engine::choose_output_file,
            engine::save_project,
            engine::save_autosave_project,
            engine::load_project,
            engine::load_autosave_project,
            engine::list_templates,
            engine::load_template,
            engine::save_template,
            engine::export_result
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Universal Data Refiner desktop shell");
}
