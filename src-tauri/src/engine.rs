use std::{
    collections::HashMap,
    fs::{self, File},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use calamine::{open_workbook_auto, Reader};
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

const BUNDLED_ENGINE_RELATIVE_PATH: &str = "bin/schema-batch-engine.exe";
const BUNDLED_TEMPLATES_RELATIVE_PATH: &str = "bootstrap/templates";

#[derive(Default)]
pub struct RunStore {
    runs: Mutex<HashMap<String, RunRecord>>,
}

struct RunRecord {
    run_id: String,
    output_path: PathBuf,
    preview_path: PathBuf,
    progress_path: PathBuf,
    stdout_path: PathBuf,
    stderr_path: PathBuf,
    status: String,
    total_rows: usize,
    completed_rows: usize,
    failed_rows: usize,
    output_fields: Vec<String>,
    updated_at: String,
    child: Option<Child>,
}

struct AppPaths {
    data_dir: PathBuf,
    autosave_dir: PathBuf,
    templates_dir: PathBuf,
    runs_dir: PathBuf,
    resource_dir: Option<PathBuf>,
}

struct EngineCommandSpec {
    program: PathBuf,
    args: Vec<String>,
    current_dir: PathBuf,
    display_name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRunPayload {
    pub project: ProjectFilePayload,
    pub context: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFilePayload {
    pub id: String,
    pub name: String,
    pub context: Option<String>,
    pub source_file_path: String,
    pub input_source_mode: Option<String>,
    pub inline_input_rows: Option<Vec<InlineInputRowPayload>>,
    pub output_file_path: Option<String>,
    pub python_executable: Option<String>,
    pub template: TaskTemplatePayload,
    pub model_config: ModelConfigPayload,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskTemplatePayload {
    pub id: String,
    pub name: String,
    pub description: String,
    pub input_columns: Vec<InputColumnPayload>,
    pub preprocess: Option<InputPreprocessPayload>,
    pub join_separator: Option<String>,
    pub system_prompt: String,
    pub user_prompt: String,
    pub output_fields: Vec<OutputFieldPayload>,
    pub include_combined_text: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct InputColumnPayload {
    pub name: String,
    pub label: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineInputRowPayload {
    pub values: HashMap<String, String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputPreprocessPayload {
    pub trim_whitespace: Option<bool>,
    pub collapse_whitespace: Option<bool>,
    pub remove_line_breaks: Option<bool>,
    pub strip_html: Option<bool>,
    pub max_chars: Option<usize>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputFieldPayload {
    pub name: String,
    #[allow(dead_code)]
    pub r#type: String,
    #[allow(dead_code)]
    pub required: bool,
    pub default_value: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfigPayload {
    #[allow(dead_code)]
    pub provider: String,
    pub model: String,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub api_key_env: Option<String>,
    pub concurrency: usize,
    #[allow(dead_code)]
    pub timeout_ms: usize,
    #[allow(dead_code)]
    pub max_retries: usize,
    pub temperature: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunJobResponse {
    pub id: String,
    pub status: String,
    pub total_rows: usize,
    pub completed_rows: usize,
    pub failed_rows: usize,
    pub output_file_path: Option<String>,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RowTaskResponse {
    pub row_index: i64,
    pub raw_text: Option<String>,
    pub status: String,
    pub raw_response: Option<String>,
    pub parsed_result: Option<HashMap<String, String>>,
    pub error_message: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunLogsResponse {
    pub stdout: String,
    pub stderr: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDialogResponse {
    pub path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedProjectResponse {
    pub file_path: String,
    pub project: ProjectFilePayload,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSummaryResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub file_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedTemplateResponse {
    pub file_path: String,
    pub template: TaskTemplatePayload,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputPreviewSampleResponse {
    pub row_index: usize,
    pub source_values: HashMap<String, String>,
    pub combined_text: String,
    pub rendered_system_prompt: String,
    pub rendered_user_prompt: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputPreflightIssueResponse {
    pub severity: String,
    pub code: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputPreflightReportResponse {
    pub ok: bool,
    pub issues: Vec<OutputPreflightIssueResponse>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProgressSnapshot {
    status: String,
    total_rows: usize,
    completed_rows: usize,
    failed_rows: usize,
    output_file_path: Option<String>,
    preview_file_path: Option<String>,
    updated_at: String,
}

#[derive(Serialize)]
struct GeneratedConfig {
    name: String,
    description: String,
    llm: GeneratedLlmConfig,
    input: GeneratedInputConfig,
    prompt: GeneratedPromptConfig,
    output: GeneratedOutputConfig,
}

#[derive(Serialize)]
struct GeneratedLlmConfig {
    model: String,
    temperature: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_key_env: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    base_url: Option<String>,
}

#[derive(Serialize)]
struct GeneratedInputConfig {
    columns: Vec<GeneratedInputColumn>,
    preprocess: GeneratedInputPreprocess,
    join_separator: String,
}

#[derive(Serialize)]
struct GeneratedInputColumn {
    name: String,
    label: String,
}

#[derive(Serialize)]
struct GeneratedInputPreprocess {
    trim_whitespace: bool,
    collapse_whitespace: bool,
    remove_line_breaks: bool,
    strip_html: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_chars: Option<usize>,
}

#[derive(Serialize)]
struct GeneratedPromptConfig {
    system: String,
    user: String,
}

#[derive(Serialize)]
struct GeneratedOutputConfig {
    include_combined_text: bool,
    fields: Vec<GeneratedOutputField>,
}

#[derive(Serialize)]
struct GeneratedOutputField {
    name: String,
    default: String,
}

#[tauri::command]
pub fn start_run(
    app: AppHandle,
    payload: StartRunPayload,
    state: State<'_, RunStore>,
) -> Result<RunJobResponse, String> {
    let app_paths = AppPaths::resolve(&app)?;
    ensure_app_dirs(&app_paths)?;
    ensure_seeded_templates(&app)?;

    let run_id = format!("run-{}", now_string());
    let run_dir = app_paths.runs_dir.join(&run_id);
    fs::create_dir_all(&run_dir).map_err(|err| format!("创建运行目录失败: {err}"))?;
    let source_path = prepare_project_input_source(&payload.project, &run_dir)?;
    validate_start_payload(&payload, &source_path)?;

    let output_path = resolve_output_path(&payload.project, &run_dir);
    let preview_path = resolve_preview_path(&output_path);
    let progress_path = run_dir.join("progress.json");
    let config_path = run_dir.join("task_config.generated.yaml");
    let config = build_generated_config(&payload.project);
    let config_text =
        serde_yaml::to_string(&config).map_err(|err| format!("生成 YAML 配置失败: {err}"))?;
    fs::write(&config_path, config_text).map_err(|err| format!("写入 YAML 配置失败: {err}"))?;

    let stdout_path = run_dir.join("engine.stdout.log");
    let stderr_path = run_dir.join("engine.stderr.log");
    let stdout_file =
        File::create(&stdout_path).map_err(|err| format!("创建 stdout 日志失败: {err}"))?;
    let stderr_file =
        File::create(&stderr_path).map_err(|err| format!("创建 stderr 日志失败: {err}"))?;

    let total_rows = count_input_rows(&source_path)?;
    let engine_command =
        resolve_engine_command(&app, payload.project.python_executable.as_deref())?;

    let mut command = Command::new(&engine_command.program);
    command
        .current_dir(&engine_command.current_dir);

    for arg in &engine_command.args {
        command.arg(arg);
    }

    command
        .arg("-c")
        .arg(&config_path)
        .arg("-i")
        .arg(&source_path)
        .arg("-o")
        .arg(&output_path)
        .arg("--progress-file")
        .arg(&progress_path)
        .arg("--context")
        .arg(&payload.context)
        .arg("--concurrency")
        .arg(payload.project.model_config.concurrency.to_string())
        .arg("--model")
        .arg(&payload.project.model_config.model)
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file));

    if let Some(base_url) = payload.project.model_config.base_url.as_deref() {
        if !base_url.trim().is_empty() {
            command.arg("--base-url").arg(base_url);
        }
    }

    if let Some(api_key) = payload.project.model_config.api_key.as_deref() {
        if !api_key.trim().is_empty() {
            command.arg("--api-key").arg(api_key);
        }
    }

    let child = command
        .spawn()
        .map_err(|err| {
            format!(
                "启动批处理引擎失败，请检查内置引擎资源或开发环境配置。当前命令入口: {}。错误: {err}",
                engine_command.display_name
            )
        })?;

    let output_fields = payload
        .project
        .template
        .output_fields
        .iter()
        .map(|field| field.name.clone())
        .collect::<Vec<_>>();
    let updated_at = now_string();

    let run_job = RunJobResponse {
        id: run_id.clone(),
        status: "running".to_string(),
        total_rows,
        completed_rows: 0,
        failed_rows: 0,
        output_file_path: Some(output_path.display().to_string()),
        updated_at: updated_at.clone(),
    };

    let record = RunRecord {
        run_id: run_id.clone(),
        output_path,
        preview_path,
        progress_path,
        stdout_path,
        stderr_path,
        status: "running".to_string(),
        total_rows,
        completed_rows: 0,
        failed_rows: 0,
        output_fields,
        updated_at,
        child: Some(child),
    };

    let mut runs = state
        .runs
        .lock()
        .map_err(|_| "运行状态锁已损坏，无法写入任务。".to_string())?;
    runs.insert(run_id, record);

    Ok(run_job)
}

#[tauri::command]
pub fn get_run_job(
    run_id: String,
    state: State<'_, RunStore>,
) -> Result<RunJobResponse, String> {
    let mut runs = state
        .runs
        .lock()
        .map_err(|_| "运行状态锁已损坏，无法读取任务。".to_string())?;
    let record = runs
        .get_mut(&run_id)
        .ok_or_else(|| format!("未找到运行任务: {run_id}"))?;

    refresh_run_record(record)?;
    Ok(record_to_job(record))
}

#[tauri::command]
pub fn stop_run(
    run_id: String,
    state: State<'_, RunStore>,
) -> Result<RunJobResponse, String> {
    let mut runs = state
        .runs
        .lock()
        .map_err(|_| "运行状态锁已损坏，无法读取任务。".to_string())?;
    let record = runs
        .get_mut(&run_id)
        .ok_or_else(|| format!("未找到运行任务: {run_id}"))?;

    if let Some(child) = record.child.as_mut() {
        child
            .kill()
            .map_err(|err| format!("停止运行失败: {err}"))?;
        record.child = None;
        record.status = "stopped".to_string();
        record.updated_at = now_string();
    }

    refresh_run_record(record)?;
    Ok(record_to_job(record))
}

#[tauri::command]
pub fn list_row_tasks(
    run_id: String,
    state: State<'_, RunStore>,
) -> Result<Vec<RowTaskResponse>, String> {
    let mut runs = state
        .runs
        .lock()
        .map_err(|_| "运行状态锁已损坏，无法读取任务。".to_string())?;
    let record = runs
        .get_mut(&run_id)
        .ok_or_else(|| format!("未找到运行任务: {run_id}"))?;

    refresh_run_record(record)?;
    let preview_source = if record.preview_path.exists() {
        &record.preview_path
    } else {
        &record.output_path
    };
    read_output_rows(preview_source, &record.output_fields)
}

#[tauri::command]
pub fn get_run_logs(
    run_id: String,
    state: State<'_, RunStore>,
) -> Result<RunLogsResponse, String> {
    let mut runs = state
        .runs
        .lock()
        .map_err(|_| "运行状态锁已损坏，无法读取任务。".to_string())?;
    let record = runs
        .get_mut(&run_id)
        .ok_or_else(|| format!("未找到运行任务: {run_id}"))?;

    refresh_run_record(record)?;

    Ok(RunLogsResponse {
        stdout: read_log_tail(&record.stdout_path, 6000)?,
        stderr: read_log_tail(&record.stderr_path, 6000)?,
    })
}

#[tauri::command]
pub fn export_result(
    run_id: String,
    target_path: String,
    state: State<'_, RunStore>,
) -> Result<(), String> {
    let mut runs = state
        .runs
        .lock()
        .map_err(|_| "运行状态锁已损坏，无法读取任务。".to_string())?;
    let record = runs
        .get_mut(&run_id)
        .ok_or_else(|| format!("未找到运行任务: {run_id}"))?;

    refresh_run_record(record)?;
    if !record.output_path.exists() {
        return Err("当前运行尚未产生可导出的结果文件。".to_string());
    }

    let target = PathBuf::from(target_path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建导出目录失败: {err}"))?;
    }
    fs::copy(&record.output_path, &target).map_err(|err| format!("复制结果文件失败: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn preview_input(
    project: ProjectFilePayload,
    limit: Option<usize>,
) -> Result<Vec<InputPreviewSampleResponse>, String> {
    if project.template.input_columns.is_empty() {
        return Err("至少需要配置一个输入列。".to_string());
    }

    if is_inline_input(&project) {
        return read_inline_input_preview_rows(&project, limit.unwrap_or(5));
    }

    let source_path = Path::new(&project.source_file_path);
    if !source_path.exists() {
        return Err(format!("输入文件不存在: {}", source_path.display()));
    }

    let source_headers = read_input_headers(source_path)?;
    ensure_input_columns_exist(&source_headers, &project.template.input_columns)?;
    read_input_preview_rows(&project, limit.unwrap_or(5))
}

#[tauri::command]
pub fn preflight_output(project: ProjectFilePayload) -> Result<OutputPreflightReportResponse, String> {
    let mut issues = Vec::new();
    let template = &project.template;
    let prompt_text = format!("{}\n{}", template.system_prompt, template.user_prompt);
    let prompt_text_lower = prompt_text.to_lowercase();
    let prompt_placeholders = collect_prompt_placeholders(&prompt_text);

    if template.output_fields.is_empty() {
        issues.push(OutputPreflightIssueResponse {
            severity: "error".to_string(),
            code: "missing_output_fields".to_string(),
            message: "至少需要配置一个输出字段。".to_string(),
        });
    }

    let mut seen_names = HashMap::<String, String>::new();
    for field in &template.output_fields {
        let trimmed_name = field.name.trim();
        if trimmed_name.is_empty() {
            issues.push(OutputPreflightIssueResponse {
                severity: "error".to_string(),
                code: "blank_output_field_name".to_string(),
                message: "输出字段名不能为空。".to_string(),
            });
            continue;
        }

        let normalized_name = trimmed_name.to_lowercase();
        if let Some(previous_name) = seen_names.insert(normalized_name, trimmed_name.to_string()) {
            issues.push(OutputPreflightIssueResponse {
                severity: "error".to_string(),
                code: "duplicate_output_field_name".to_string(),
                message: format!("输出字段 `{trimmed_name}` 与 `{previous_name}` 重复。"),
            });
        }
    }

    if !template.system_prompt.contains("{text}") && !template.user_prompt.contains("{text}") {
        issues.push(OutputPreflightIssueResponse {
            severity: "error".to_string(),
            code: "missing_text_placeholder".to_string(),
            message: "System Prompt 和 User Prompt 都没有 `{text}`，模型将看不到输入文本。".to_string(),
        });
    }

    let unsupported_placeholders = prompt_placeholders
        .iter()
        .filter(|placeholder| {
            !matches!(
                placeholder.as_str(),
                "text" | "context" | "global_context"
            )
        })
        .cloned()
        .collect::<Vec<_>>();
    if !unsupported_placeholders.is_empty() {
        issues.push(OutputPreflightIssueResponse {
            severity: "warning".to_string(),
            code: "unsupported_prompt_placeholder".to_string(),
            message: format!(
                "发现未识别的占位符：{}。当前仅支持 `{{text}}`、`{{context}}`、`{{global_context}}`。",
                unsupported_placeholders.join(", ")
            ),
        });
    }

    if project.context.as_deref().is_some_and(|context| !context.trim().is_empty())
        && !template.system_prompt.contains("{context}")
        && !template.system_prompt.contains("{global_context}")
        && !template.user_prompt.contains("{context}")
        && !template.user_prompt.contains("{global_context}")
    {
        issues.push(OutputPreflightIssueResponse {
            severity: "warning".to_string(),
            code: "unused_global_context".to_string(),
            message:
                "当前已填写任务背景，但 prompt 没有使用 `{context}` 或 `{global_context}`，这段背景不会进入模型请求。"
                    .to_string(),
        });
    }

    if !prompt_text_lower.contains("json") {
        issues.push(OutputPreflightIssueResponse {
            severity: "warning".to_string(),
            code: "missing_json_instruction".to_string(),
            message: "当前 prompt 没有明显要求 JSON 输出，结构化稳定性会下降。".to_string(),
        });
    }

    if !prompt_text_lower.contains("合法 json")
        && !prompt_text_lower.contains("json object")
        && !prompt_text_lower.contains("json格式")
        && !prompt_text_lower.contains("json 格式")
    {
        issues.push(OutputPreflightIssueResponse {
            severity: "warning".to_string(),
            code: "missing_strict_json_instruction".to_string(),
            message: "建议在 prompt 里明确要求“返回合法 JSON 对象”，减少 markdown 或自然语言污染。".to_string(),
        });
    }

    let missing_field_mentions = template
        .output_fields
        .iter()
        .map(|field| field.name.trim())
        .filter(|field_name| !field_name.is_empty())
        .filter(|field_name| !prompt_text.contains(field_name))
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    if !missing_field_mentions.is_empty() {
        issues.push(OutputPreflightIssueResponse {
            severity: "warning".to_string(),
            code: "field_not_mentioned_in_prompt".to_string(),
            message: format!(
                "以下输出字段没有在 prompt 中被显式提到：{}。",
                missing_field_mentions.join(", ")
            ),
        });
    }

    if template.output_fields.len() > 12 {
        issues.push(OutputPreflightIssueResponse {
            severity: "warning".to_string(),
            code: "too_many_output_fields".to_string(),
            message: format!(
                "当前配置了 {} 个输出字段，第一版建议收敛字段数量以提升稳定性。",
                template.output_fields.len()
            ),
        });
    }

    let ok = !issues.iter().any(|issue| issue.severity == "error");
    Ok(OutputPreflightReportResponse { ok, issues })
}

#[tauri::command]
pub fn open_source_file() -> Result<Option<String>, String> {
    Ok(FileDialog::new()
        .add_filter("表格文件", &["csv", "xlsx", "xls"])
        .pick_file()
        .map(|path| path.display().to_string()))
}

#[tauri::command]
pub fn choose_output_file() -> Result<Option<String>, String> {
    Ok(FileDialog::new()
        .add_filter("CSV 文件", &["csv"])
        .set_file_name("result.csv")
        .save_file()
        .map(|path| path.display().to_string()))
}

#[tauri::command]
pub fn save_project(
    project: ProjectFilePayload,
    target_path: Option<String>,
) -> Result<String, String> {
    let selected_path = match target_path {
        Some(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => FileDialog::new()
            .add_filter("UDR Project", &["json"])
            .set_file_name("project.udr.json")
            .save_file()
            .ok_or_else(|| "用户取消了项目保存。".to_string())?,
    };

    write_project_file(&selected_path, &project)?;
    Ok(selected_path.display().to_string())
}

#[tauri::command]
pub fn load_project(file_path: Option<String>) -> Result<LoadedProjectResponse, String> {
    let selected_path = match file_path {
        Some(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => FileDialog::new()
            .add_filter("UDR Project", &["json"])
            .pick_file()
            .ok_or_else(|| "用户取消了加载项目。".to_string())?,
    };

    let content = fs::read_to_string(&selected_path)
        .map_err(|err| format!("读取项目文件失败: {err}"))?;
    let project = serde_json::from_str::<ProjectFilePayload>(&content)
        .map_err(|err| format!("解析项目文件失败: {err}"))?;

    Ok(LoadedProjectResponse {
        file_path: selected_path.display().to_string(),
        project,
    })
}

#[tauri::command]
pub fn save_autosave_project(app: AppHandle, project: ProjectFilePayload) -> Result<String, String> {
    let autosave_path = autosave_project_path(&app)?;
    write_project_file(&autosave_path, &project)?;
    Ok(autosave_path.display().to_string())
}

#[tauri::command]
pub fn load_autosave_project(app: AppHandle) -> Result<Option<LoadedProjectResponse>, String> {
    let autosave_path = autosave_project_path(&app)?;
    if !autosave_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&autosave_path)
        .map_err(|err| format!("读取自动保存项目失败: {err}"))?;
    let project = serde_json::from_str::<ProjectFilePayload>(&content)
        .map_err(|err| format!("解析自动保存项目失败: {err}"))?;

    Ok(Some(LoadedProjectResponse {
        file_path: autosave_path.display().to_string(),
        project,
    }))
}

#[tauri::command]
pub fn list_templates(app: AppHandle) -> Result<Vec<TemplateSummaryResponse>, String> {
    let templates_dir = templates_dir(&app)?;

    let mut templates = Vec::new();
    for entry in fs::read_dir(&templates_dir).map_err(|err| format!("读取模板目录失败: {err}"))? {
        let entry = entry.map_err(|err| format!("读取模板项失败: {err}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }

        let content = fs::read_to_string(&path)
            .map_err(|err| format!("读取模板文件失败 {}: {err}", path.display()))?;
        let template = serde_json::from_str::<TaskTemplatePayload>(&content)
            .map_err(|err| format!("解析模板文件失败 {}: {err}", path.display()))?;

        templates.push(TemplateSummaryResponse {
            id: template.id,
            name: template.name,
            description: template.description,
            file_path: path.display().to_string(),
        });
    }

    templates.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(templates)
}

#[tauri::command]
pub fn load_template(file_path: String) -> Result<LoadedTemplateResponse, String> {
    let path = PathBuf::from(&file_path);
    let content = fs::read_to_string(&path)
        .map_err(|err| format!("读取模板文件失败 {}: {err}", path.display()))?;
    let template = serde_json::from_str::<TaskTemplatePayload>(&content)
        .map_err(|err| format!("解析模板文件失败 {}: {err}", path.display()))?;

    Ok(LoadedTemplateResponse {
        file_path,
        template,
    })
}

#[tauri::command]
pub fn save_template(
    app: AppHandle,
    template: TaskTemplatePayload,
    target_path: Option<String>,
) -> Result<String, String> {
    let selected_path = match target_path {
        Some(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => {
            let default_dir = templates_dir(&app)?;
            fs::create_dir_all(&default_dir)
                .map_err(|err| format!("创建模板目录失败: {err}"))?;
            FileDialog::new()
                .set_directory(&default_dir)
                .add_filter("UDR Template", &["json"])
                .set_file_name(&format!("{}.template.json", slugify(&template.name)))
                .save_file()
                .ok_or_else(|| "用户取消了模板保存。".to_string())?
        }
    };

    write_template_file(&selected_path, &template)?;
    Ok(selected_path.display().to_string())
}

fn record_to_job(record: &RunRecord) -> RunJobResponse {
    RunJobResponse {
        id: record.run_id.clone(),
        status: record.status.clone(),
        total_rows: record.total_rows,
        completed_rows: record.completed_rows,
        failed_rows: record.failed_rows,
        output_file_path: Some(record.output_path.display().to_string()),
        updated_at: record.updated_at.clone(),
    }
}

fn validate_start_payload(payload: &StartRunPayload, source_path: &Path) -> Result<(), String> {
    if !source_path.exists() {
        return Err(format!(
            "输入文件不存在: {}",
            source_path.display()
        ));
    }

    if payload.context.trim().is_empty() {
        return Err("任务背景不能为空。".to_string());
    }

    if payload.project.template.input_columns.is_empty() {
        return Err("至少需要配置一个输入列。".to_string());
    }

    let source_headers = read_input_headers(source_path)?;
    ensure_input_columns_exist(&source_headers, &payload.project.template.input_columns)?;

    if payload.project.template.output_fields.is_empty() {
        return Err("至少需要配置一个输出字段。".to_string());
    }

    if payload.project.model_config.model.trim().is_empty() {
        return Err("模型名称不能为空。".to_string());
    }

    let api_key = payload.project.model_config.api_key.as_deref().unwrap_or("").trim();
    let api_key_env = payload
        .project
        .model_config
        .api_key_env
        .as_deref()
        .unwrap_or("")
        .trim();
    if api_key.is_empty() && api_key_env.is_empty() {
        return Err("请至少提供 API Key 或 API Key 环境变量名。".to_string());
    }

    if api_key.is_empty() && !api_key_env.is_empty() && std::env::var(api_key_env).is_err() {
        return Err(format!("环境变量 `{api_key_env}` 未设置，无法读取 API Key。"));
    }

    Ok(())
}

fn is_inline_input(project: &ProjectFilePayload) -> bool {
    matches!(project.input_source_mode.as_deref(), Some("inline"))
}

fn prepare_project_input_source(project: &ProjectFilePayload, run_dir: &Path) -> Result<PathBuf, String> {
    if !is_inline_input(project) {
        return Ok(PathBuf::from(&project.source_file_path));
    }

    let inline_rows = project
        .inline_input_rows
        .as_ref()
        .ok_or_else(|| "当前选择了程序内输入，但还没有录入任何数据。".to_string())?;
    if inline_rows.is_empty() {
        return Err("当前选择了程序内输入，但还没有录入任何数据。".to_string());
    }

    let source_path = run_dir.join("inline-input.csv");
    write_inline_input_csv(project, &source_path)?;
    Ok(source_path)
}

fn collect_inline_headers(project: &ProjectFilePayload) -> Vec<String> {
    let mut headers = project
        .template
        .input_columns
        .iter()
        .map(|column| column.name.trim())
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    if let Some(rows) = project.inline_input_rows.as_ref() {
        for row in rows {
            for key in row.values.keys() {
                let trimmed = key.trim();
                if trimmed.is_empty() || headers.iter().any(|header| header == trimmed) {
                    continue;
                }
                headers.push(trimmed.to_string());
            }
        }
    }

    headers
}

fn write_inline_input_csv(project: &ProjectFilePayload, target_path: &Path) -> Result<(), String> {
    let headers = collect_inline_headers(project);
    if headers.is_empty() {
        return Err("程序内输入缺少可用列，请先配置输入列。".to_string());
    }

    let rows = project
        .inline_input_rows
        .as_ref()
        .ok_or_else(|| "当前选择了程序内输入，但还没有录入任何数据。".to_string())?;

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建临时输入目录失败: {err}"))?;
    }

    let mut writer =
        csv::Writer::from_path(target_path).map_err(|err| format!("创建临时输入文件失败: {err}"))?;
    writer
        .write_record(&headers)
        .map_err(|err| format!("写入程序内输入表头失败: {err}"))?;

    for row in rows {
        let record = headers
            .iter()
            .map(|header| row.values.get(header).cloned().unwrap_or_default())
            .collect::<Vec<_>>();
        writer
            .write_record(&record)
            .map_err(|err| format!("写入程序内输入行失败: {err}"))?;
    }

    writer
        .flush()
        .map_err(|err| format!("写入程序内输入文件失败: {err}"))?;
    Ok(())
}

fn refresh_run_record(record: &mut RunRecord) -> Result<(), String> {
    if let Some(child) = record.child.as_mut() {
        if let Some(exit_status) = child
            .try_wait()
            .map_err(|err| format!("检查引擎状态失败: {err}"))?
        {
            if record.status != "stopped" {
                record.status = if exit_status.success() {
                    "completed".to_string()
                } else {
                    "failed".to_string()
                };
            }
            record.updated_at = now_string();
            record.child = None;
        }
    }

    if let Some(snapshot) = read_progress_snapshot(&record.progress_path)? {
        if record.status != "stopped" {
            record.status = snapshot.status;
        }
        record.total_rows = snapshot.total_rows;
        record.completed_rows = snapshot.completed_rows;
        record.failed_rows = snapshot.failed_rows;
        record.updated_at = snapshot.updated_at;
        if let Some(output_file_path) = snapshot.output_file_path {
            record.output_path = PathBuf::from(output_file_path);
        }
        if let Some(preview_file_path) = snapshot.preview_file_path {
            record.preview_path = PathBuf::from(preview_file_path);
        }
    } else {
        let preview_source = if record.preview_path.exists() {
            &record.preview_path
        } else {
            &record.output_path
        };
        let tasks = read_output_rows(preview_source, &record.output_fields)?;
        record.completed_rows = tasks.len();
        record.failed_rows = tasks.iter().filter(|task| task.status == "failed").count();
    }

    if record.status == "idle" && record.completed_rows > 0 {
        record.status = "running".to_string();
    }

    if record.status == "running" && record.completed_rows >= record.total_rows && record.total_rows > 0 {
        record.status = "completed".to_string();
        record.updated_at = now_string();
    }

    Ok(())
}

fn read_progress_snapshot(path: &Path) -> Result<Option<ProgressSnapshot>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path)
        .map_err(|err| format!("读取进度文件失败 {}: {err}", path.display()))?;
    let snapshot = serde_json::from_str::<ProgressSnapshot>(&content)
        .map_err(|err| format!("解析进度文件失败 {}: {err}", path.display()))?;
    Ok(Some(snapshot))
}

fn build_generated_config(project: &ProjectFilePayload) -> GeneratedConfig {
    GeneratedConfig {
        name: project.template.name.clone(),
        description: project.template.description.clone(),
        llm: GeneratedLlmConfig {
            model: project.model_config.model.clone(),
            temperature: project.model_config.temperature,
            api_key_env: project.model_config.api_key_env.clone(),
            base_url: project.model_config.base_url.clone(),
        },
        input: GeneratedInputConfig {
            columns: project
                .template
                .input_columns
                .iter()
                .map(|column| GeneratedInputColumn {
                    name: column.name.clone(),
                    label: column.label.clone().unwrap_or_else(|| column.name.clone()),
                })
                .collect(),
            preprocess: build_generated_input_preprocess(project.template.preprocess.as_ref()),
            join_separator: project
                .template
                .join_separator
                .clone()
                .unwrap_or_else(|| " | ".to_string()),
        },
        prompt: GeneratedPromptConfig {
            system: project.template.system_prompt.clone(),
            user: project.template.user_prompt.clone(),
        },
        output: GeneratedOutputConfig {
            include_combined_text: project.template.include_combined_text.unwrap_or(true),
            fields: project
                .template
                .output_fields
                .iter()
                .map(|field| GeneratedOutputField {
                    name: field.name.clone(),
                    default: json_value_to_string(field.default_value.as_ref()),
                })
                .collect(),
        },
    }
}

fn resolve_output_path(project: &ProjectFilePayload, run_dir: &Path) -> PathBuf {
    if let Some(path) = project.output_file_path.as_deref() {
        if !path.trim().is_empty() {
            return PathBuf::from(path);
        }
    }

    let input_path = Path::new(&project.source_file_path);
    let file_stem = input_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("result");
    run_dir.join(format!("{file_stem}_result.csv"))
}

fn resolve_preview_path(output_path: &Path) -> PathBuf {
    let stem = output_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("result");
    output_path.with_file_name(format!("{stem}.working.csv"))
}

fn build_generated_input_preprocess(
    preprocess: Option<&InputPreprocessPayload>,
) -> GeneratedInputPreprocess {
    GeneratedInputPreprocess {
        trim_whitespace: preprocess
            .and_then(|value| value.trim_whitespace)
            .unwrap_or(true),
        collapse_whitespace: preprocess
            .and_then(|value| value.collapse_whitespace)
            .unwrap_or(true),
        remove_line_breaks: preprocess
            .and_then(|value| value.remove_line_breaks)
            .unwrap_or(false),
        strip_html: preprocess
            .and_then(|value| value.strip_html)
            .unwrap_or(false),
        max_chars: preprocess.and_then(|value| value.max_chars),
    }
}

fn count_input_rows(path: &Path) -> Result<usize, String> {
    match extension_name(path).as_deref() {
        Some("csv") => {
            let mut reader =
                csv::Reader::from_path(path).map_err(|err| format!("读取 CSV 输入失败: {err}"))?;
            let mut count = 0usize;
            for record in reader.records() {
                record.map_err(|err| format!("读取 CSV 输入记录失败: {err}"))?;
                count += 1;
            }
            Ok(count)
        }
        Some("xlsx") | Some("xls") => {
            let mut workbook =
                open_workbook_auto(path).map_err(|err| format!("读取 Excel 输入失败: {err}"))?;
            let sheet_name = workbook
                .sheet_names()
                .first()
                .cloned()
                .ok_or_else(|| "Excel 输入文件没有可用工作表。".to_string())?;
            let range = workbook
                .worksheet_range(&sheet_name)
                .map_err(|err| format!("读取 Excel 工作表失败: {err}"))?;
            Ok(range.rows().skip(1).count())
        }
        _ => Err("当前仅支持 csv / xlsx / xls 作为输入文件。".to_string()),
    }
}

fn read_input_headers(path: &Path) -> Result<Vec<String>, String> {
    match extension_name(path).as_deref() {
        Some("csv") => {
            let mut reader =
                csv::Reader::from_path(path).map_err(|err| format!("读取 CSV 输入失败: {err}"))?;
            let headers = reader
                .headers()
                .map_err(|err| format!("读取 CSV 表头失败: {err}"))?
                .iter()
                .map(|header| header.trim().to_string())
                .collect::<Vec<_>>();
            Ok(headers)
        }
        Some("xlsx") | Some("xls") => {
            let mut workbook =
                open_workbook_auto(path).map_err(|err| format!("读取 Excel 输入失败: {err}"))?;
            let sheet_name = workbook
                .sheet_names()
                .first()
                .cloned()
                .ok_or_else(|| "Excel 输入文件没有可用工作表。".to_string())?;
            let range = workbook
                .worksheet_range(&sheet_name)
                .map_err(|err| format!("读取 Excel 工作表失败: {err}"))?;
            let headers = range
                .rows()
                .next()
                .ok_or_else(|| "输入文件缺少表头。".to_string())?
                .iter()
                .map(|cell| cell.to_string().trim().to_string())
                .collect::<Vec<_>>();
            Ok(headers)
        }
        _ => Err("当前仅支持 csv / xlsx / xls 作为输入文件。".to_string()),
    }
}

fn ensure_input_columns_exist(
    source_headers: &[String],
    input_columns: &[InputColumnPayload],
) -> Result<(), String> {
    let missing_columns = input_columns
        .iter()
        .filter(|column| {
            let expected = column.name.trim();
            !source_headers.iter().any(|header| header == expected)
        })
        .map(|column| column.name.clone())
        .collect::<Vec<_>>();
    if !missing_columns.is_empty() {
        return Err(format!(
            "输入文件缺少模板所需列: {}。当前表头为: {}",
            missing_columns.join(", "),
            source_headers.join(", ")
        ));
    }
    Ok(())
}

fn read_input_preview_rows(
    project: &ProjectFilePayload,
    limit: usize,
) -> Result<Vec<InputPreviewSampleResponse>, String> {
    let limit = limit.max(1);
    let path = Path::new(&project.source_file_path);
    match extension_name(path).as_deref() {
        Some("csv") => read_csv_input_preview(path, project, &project.template, limit),
        Some("xlsx") | Some("xls") => {
            read_excel_input_preview(path, project, &project.template, limit)
        }
        _ => Err("当前仅支持 csv / xlsx / xls 作为输入文件。".to_string()),
    }
}

fn read_inline_input_preview_rows(
    project: &ProjectFilePayload,
    limit: usize,
) -> Result<Vec<InputPreviewSampleResponse>, String> {
    let rows = project
        .inline_input_rows
        .as_ref()
        .ok_or_else(|| "当前选择了程序内输入，但还没有录入任何数据。".to_string())?;

    if rows.is_empty() {
        return Err("当前选择了程序内输入，但还没有录入任何数据。".to_string());
    }

    Ok(rows
        .iter()
        .take(limit.max(1))
        .enumerate()
        .map(|(index, row)| build_input_preview_sample(index, &row.values, project, &project.template))
        .collect())
}

fn read_csv_input_preview(
    path: &Path,
    project: &ProjectFilePayload,
    template: &TaskTemplatePayload,
    limit: usize,
) -> Result<Vec<InputPreviewSampleResponse>, String> {
    let mut reader =
        csv::Reader::from_path(path).map_err(|err| format!("读取 CSV 输入失败: {err}"))?;
    let headers = reader
        .headers()
        .map_err(|err| format!("读取 CSV 表头失败: {err}"))?
        .iter()
        .map(|header| header.trim().to_string())
        .collect::<Vec<_>>();

    let mut rows = Vec::new();
    for (index, record) in reader.records().enumerate() {
        if rows.len() >= limit {
            break;
        }
        let row = record.map_err(|err| format!("读取 CSV 输入记录失败: {err}"))?;
        let row_map = headers
            .iter()
            .zip(row.iter())
            .map(|(header, value)| (header.clone(), value.to_string()))
            .collect::<HashMap<_, _>>();
        rows.push(build_input_preview_sample(index, &row_map, project, template));
    }
    Ok(rows)
}

fn read_excel_input_preview(
    path: &Path,
    project: &ProjectFilePayload,
    template: &TaskTemplatePayload,
    limit: usize,
) -> Result<Vec<InputPreviewSampleResponse>, String> {
    let mut workbook =
        open_workbook_auto(path).map_err(|err| format!("读取 Excel 输入失败: {err}"))?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "Excel 输入文件没有可用工作表。".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|err| format!("读取 Excel 工作表失败: {err}"))?;

    let mut rows_iter = range.rows();
    let headers = rows_iter
        .next()
        .ok_or_else(|| "输入文件缺少表头。".to_string())?
        .iter()
        .map(|cell| cell.to_string().trim().to_string())
        .collect::<Vec<_>>();

    let mut rows = Vec::new();
    for (index, row) in rows_iter.enumerate() {
        if rows.len() >= limit {
            break;
        }
        let row_map = headers
            .iter()
            .zip(row.iter())
            .map(|(header, value)| (header.clone(), value.to_string()))
            .collect::<HashMap<_, _>>();
        rows.push(build_input_preview_sample(index, &row_map, project, template));
    }
    Ok(rows)
}

fn build_input_preview_sample(
    row_index: usize,
    row_map: &HashMap<String, String>,
    project: &ProjectFilePayload,
    template: &TaskTemplatePayload,
) -> InputPreviewSampleResponse {
    let preprocess = build_generated_input_preprocess(template.preprocess.as_ref());
    let join_separator = template
        .join_separator
        .clone()
        .unwrap_or_else(|| " | ".to_string());

    let mut source_values = HashMap::new();
    let mut text_parts = Vec::new();
    for column in &template.input_columns {
        let raw_value = row_map.get(column.name.trim()).cloned().unwrap_or_default();
        source_values.insert(column.name.clone(), raw_value.clone());
        let cleaned_value = preprocess_input_text(&raw_value, &preprocess);
        if !cleaned_value.is_empty() {
            let label = column.label.as_deref().unwrap_or(&column.name);
            text_parts.push(format!("{label}：{cleaned_value}"));
        }
    }

    let combined_text = text_parts.join(&join_separator);
    let global_context = project.context.clone().unwrap_or_default();
    let rendered_system_prompt =
        render_prompt_template(&template.system_prompt, &combined_text, &global_context);
    let rendered_user_prompt =
        render_prompt_template(&template.user_prompt, &combined_text, &global_context);

    InputPreviewSampleResponse {
        row_index,
        source_values,
        combined_text,
        rendered_system_prompt,
        rendered_user_prompt,
    }
}

fn render_prompt_template(template: &str, combined_text: &str, global_context: &str) -> String {
    template
        .replace("{text}", combined_text)
        .replace("{global_context}", global_context)
        .replace("{context}", global_context)
}

fn collect_prompt_placeholders(template: &str) -> Vec<String> {
    let mut placeholders = Vec::new();
    let mut chars = template.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch != '{' {
            continue;
        }

        let mut placeholder = String::new();
        let mut closed = false;

        while let Some(next_ch) = chars.next() {
            if next_ch == '}' {
                closed = true;
                break;
            }
            placeholder.push(next_ch);
        }

        let trimmed = placeholder.trim();
        if closed && !trimmed.is_empty() && !placeholders.iter().any(|item| item == trimmed) {
            placeholders.push(trimmed.to_string());
        }
    }

    placeholders
}

fn preprocess_input_text(raw_value: &str, preprocess: &GeneratedInputPreprocess) -> String {
    let mut text = raw_value.trim().to_string();
    if matches!(
        text.to_ascii_lowercase().as_str(),
        "nan" | "none" | "null"
    ) {
        return String::new();
    }

    if preprocess.strip_html {
        text = strip_html_tags(&text);
    }
    if preprocess.remove_line_breaks {
        text = text.replace(['\r', '\n'], " ");
    }
    if preprocess.collapse_whitespace {
        text = collapse_whitespace(&text);
    }
    if preprocess.trim_whitespace {
        text = text.trim().to_string();
    }
    if let Some(max_chars) = preprocess.max_chars {
        if text.chars().count() > max_chars {
            text = text.chars().take(max_chars).collect::<String>();
            if preprocess.trim_whitespace {
                text = text.trim().to_string();
            }
        }
    }

    text
}

fn collapse_whitespace(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut last_was_whitespace = false;
    for ch in value.chars() {
        if ch.is_whitespace() {
            if !last_was_whitespace {
                output.push(' ');
                last_was_whitespace = true;
            }
        } else {
            output.push(ch);
            last_was_whitespace = false;
        }
    }
    output
}

fn strip_html_tags(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                output.push(' ');
            }
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }
    output
}

fn read_output_rows(path: &Path, output_fields: &[String]) -> Result<Vec<RowTaskResponse>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    match extension_name(path).as_deref() {
        Some("csv") => read_csv_output(path, output_fields),
        Some("xlsx") | Some("xls") => read_excel_output(path, output_fields),
        _ => Err("当前仅支持 csv / xlsx / xls 作为输出文件。".to_string()),
    }
}

fn read_csv_output(path: &Path, output_fields: &[String]) -> Result<Vec<RowTaskResponse>, String> {
    let mut reader =
        csv::Reader::from_path(path).map_err(|err| format!("读取 CSV 输出失败: {err}"))?;
    let headers = reader
        .headers()
        .map_err(|err| format!("读取 CSV 表头失败: {err}"))?
        .iter()
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    let mut rows = Vec::new();
    for record in reader.records() {
        let row = record.map_err(|err| format!("读取 CSV 记录失败: {err}"))?;
        let mut row_map = HashMap::new();
        for (header, value) in headers.iter().zip(row.iter()) {
            row_map.insert(header.clone(), value.to_string());
        }
        rows.push(build_row_task(&row_map, output_fields));
    }

    Ok(rows)
}

fn read_excel_output(path: &Path, output_fields: &[String]) -> Result<Vec<RowTaskResponse>, String> {
    let mut workbook =
        open_workbook_auto(path).map_err(|err| format!("读取 Excel 输出失败: {err}"))?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "Excel 输出文件没有可用工作表。".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|err| format!("读取 Excel 工作表失败: {err}"))?;

    let mut rows_iter = range.rows();
    let headers = rows_iter
        .next()
        .ok_or_else(|| "Excel 输出文件缺少表头。".to_string())?
        .iter()
        .map(|cell| cell.to_string())
        .collect::<Vec<_>>();

    let mut rows = Vec::new();
    for row in rows_iter {
        let row_map = headers
            .iter()
            .zip(row.iter())
            .map(|(header, cell)| (header.clone(), cell.to_string()))
            .collect::<HashMap<_, _>>();
        rows.push(build_row_task(&row_map, output_fields));
    }

    Ok(rows)
}

fn build_row_task(row_map: &HashMap<String, String>, output_fields: &[String]) -> RowTaskResponse {
    let parsed_result = output_fields
        .iter()
        .map(|field| {
            (
                field.clone(),
                row_map.get(field).cloned().unwrap_or_default(),
            )
        })
        .collect::<HashMap<_, _>>();

    let error_message = parsed_result
        .values()
        .find(|value| value.starts_with("Error:"))
        .cloned();

    let status = if error_message.is_some() {
        "failed".to_string()
    } else if parsed_result.values().all(|value| value == "空数据") {
        "skipped".to_string()
    } else {
        "succeeded".to_string()
    };

    let row_index = row_map
        .get("原始索引")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or_default();

    RowTaskResponse {
        row_index,
        raw_text: row_map.get("拼接文本").cloned(),
        status,
        raw_response: None,
        parsed_result: Some(parsed_result),
        error_message,
    }
}

fn read_log_tail(path: &Path, max_chars: usize) -> Result<String, String> {
    if !path.exists() {
        return Ok(String::new());
    }

    let content = fs::read_to_string(path)
        .map_err(|err| format!("读取日志文件失败 {}: {err}", path.display()))?;
    let char_count = content.chars().count();
    if char_count <= max_chars {
        return Ok(content);
    }

    Ok(content
        .chars()
        .skip(char_count.saturating_sub(max_chars))
        .collect())
}

fn write_project_file(path: &Path, project: &ProjectFilePayload) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建项目目录失败: {err}"))?;
    }

    let content = serde_json::to_string_pretty(project)
        .map_err(|err| format!("序列化项目文件失败: {err}"))?;
    fs::write(path, content).map_err(|err| format!("写入项目文件失败: {err}"))?;
    Ok(())
}

fn write_template_file(path: &Path, template: &TaskTemplatePayload) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建模板目录失败: {err}"))?;
    }

    let content = serde_json::to_string_pretty(template)
        .map_err(|err| format!("序列化模板文件失败: {err}"))?;
    fs::write(path, content).map_err(|err| format!("写入模板文件失败: {err}"))?;
    Ok(())
}

impl AppPaths {
    fn resolve(app: &AppHandle) -> Result<Self, String> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|err| format!("定位应用数据目录失败: {err}"))?;
        let resource_dir = app.path().resource_dir().ok();

        Ok(Self {
            autosave_dir: data_dir.join("autosave"),
            templates_dir: data_dir.join("templates"),
            runs_dir: data_dir.join("runs"),
            data_dir,
            resource_dir,
        })
    }
}

fn ensure_app_dirs(app_paths: &AppPaths) -> Result<(), String> {
    for dir in [
        &app_paths.data_dir,
        &app_paths.autosave_dir,
        &app_paths.templates_dir,
        &app_paths.runs_dir,
    ] {
        fs::create_dir_all(dir).map_err(|err| format!("创建应用目录失败 {}: {err}", dir.display()))?;
    }
    Ok(())
}

fn resolve_template_seed_dir(app_paths: &AppPaths) -> Option<PathBuf> {
    if let Some(resource_dir) = &app_paths.resource_dir {
        let bundled_templates_dir = resource_dir.join(BUNDLED_TEMPLATES_RELATIVE_PATH);
        if bundled_templates_dir.exists() {
            return Some(bundled_templates_dir);
        }
    }

    let repo_templates_dir = repo_root().ok()?.join("templates");
    if repo_templates_dir.exists() {
        Some(repo_templates_dir)
    } else {
        None
    }
}

fn copy_missing_dir_contents(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    if !source_dir.exists() {
        return Ok(());
    }

    fs::create_dir_all(target_dir)
        .map_err(|err| format!("创建目标目录失败 {}: {err}", target_dir.display()))?;

    for entry in fs::read_dir(source_dir)
        .map_err(|err| format!("读取目录失败 {}: {err}", source_dir.display()))?
    {
        let entry = entry.map_err(|err| format!("读取目录项失败: {err}"))?;
        let source_path = entry.path();
        let target_path = target_dir.join(entry.file_name());

        if source_path.is_dir() {
            copy_missing_dir_contents(&source_path, &target_path)?;
            continue;
        }

        if !target_path.exists() {
            fs::copy(&source_path, &target_path).map_err(|err| {
                format!(
                    "复制内置资源失败 {} -> {}: {err}",
                    source_path.display(),
                    target_path.display()
                )
            })?;
        }
    }

    Ok(())
}

fn ensure_seeded_templates(app: &AppHandle) -> Result<PathBuf, String> {
    let app_paths = AppPaths::resolve(app)?;
    ensure_app_dirs(&app_paths)?;

    if let Some(seed_dir) = resolve_template_seed_dir(&app_paths) {
        copy_missing_dir_contents(&seed_dir, &app_paths.templates_dir)?;
    }

    Ok(app_paths.templates_dir)
}

fn autosave_project_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(AppPaths::resolve(app)?
        .autosave_dir
        .join("latest-project.udr.json"))
}

fn templates_dir(app: &AppHandle) -> Result<PathBuf, String> {
    ensure_seeded_templates(app)
}

fn resolve_engine_command(
    app: &AppHandle,
    preferred_python_executable: Option<&str>,
) -> Result<EngineCommandSpec, String> {
    let app_paths = AppPaths::resolve(app)?;
    ensure_app_dirs(&app_paths)?;

    if let Ok(override_path) = std::env::var("SCHEMABATCH_ENGINE_PATH") {
        let override_program = PathBuf::from(override_path.trim());
        if override_program.exists() {
            return Ok(EngineCommandSpec {
                display_name: override_program.display().to_string(),
                program: override_program,
                args: Vec::new(),
                current_dir: app_paths.data_dir.clone(),
            });
        }
    }

    if let Some(resource_dir) = &app_paths.resource_dir {
        let bundled_engine = resource_dir.join(BUNDLED_ENGINE_RELATIVE_PATH);
        if bundled_engine.exists() {
            return Ok(EngineCommandSpec {
                display_name: bundled_engine.display().to_string(),
                program: bundled_engine,
                args: Vec::new(),
                current_dir: app_paths.data_dir.clone(),
            });
        }
    }

    if let Ok(repo_root) = repo_root() {
        let local_engine = repo_root.join("src-tauri").join("binaries").join("schema-batch-engine.exe");
        if local_engine.exists() {
            return Ok(EngineCommandSpec {
                display_name: local_engine.display().to_string(),
                program: local_engine,
                args: Vec::new(),
                current_dir: repo_root.clone(),
            });
        }

        let engine_script = repo_root.join("schema_batch_engine.py");
        if engine_script.exists() {
            let python_program = preferred_python_executable
                .filter(|value| !value.trim().is_empty())
                .unwrap_or("python");
            return Ok(EngineCommandSpec {
                display_name: python_program.to_string(),
                program: PathBuf::from(python_program),
                args: vec![engine_script.display().to_string()],
                current_dir: repo_root,
            });
        }
    }

    Err(
        "未找到可用的批处理引擎。发布版请确认安装包内置了 engine 资源；开发版请确认 `schema_batch_engine.py` 存在。"
            .to_string(),
    )
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_separator = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_was_separator = false;
        } else if !last_was_separator {
            slug.push('-');
            last_was_separator = true;
        }
    }

    let trimmed = slug.trim_matches('-');
    if trimmed.is_empty() {
        "template".to_string()
    } else {
        trimmed.to_string()
    }
}

fn json_value_to_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::Bool(boolean)) => boolean.to_string(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

fn extension_name(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

fn repo_root() -> Result<PathBuf, String> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "无法定位仓库根目录。".to_string())
}

fn now_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}
