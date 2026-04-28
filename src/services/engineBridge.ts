import { invoke } from "@tauri-apps/api/core";

import type {
  InputPreviewSample,
  LoadedProject,
  LoadedTemplate,
  OutputPreflightReport,
  ProjectFile,
  RowTask,
  RunJob,
  RunLogs,
  TaskTemplate,
  TemplateSummary,
} from "../core/types";

export interface EngineRunPayload {
  project: ProjectFile;
  context: string;
}

export interface EngineBridge {
  startRun(payload: EngineRunPayload): Promise<RunJob>;
  stopRun(runId: string): Promise<RunJob>;
  getRunJob(runId: string): Promise<RunJob>;
  listRowTasks(runId: string): Promise<RowTask[]>;
  getRunLogs(runId: string): Promise<RunLogs>;
  previewInput(project: ProjectFile, limit?: number): Promise<InputPreviewSample[]>;
  preflightOutput(project: ProjectFile): Promise<OutputPreflightReport>;
  openSourceFile(): Promise<string | null>;
  chooseOutputFile(): Promise<string | null>;
  saveProject(project: ProjectFile, targetPath?: string): Promise<string>;
  saveAutosaveProject(project: ProjectFile): Promise<string>;
  loadProject(filePath?: string): Promise<LoadedProject>;
  loadAutosaveProject(): Promise<LoadedProject | null>;
  listTemplates(): Promise<TemplateSummary[]>;
  loadTemplate(filePath: string): Promise<LoadedTemplate>;
  saveTemplate(template: TaskTemplate, targetPath?: string): Promise<string>;
  exportResult(runId: string, targetPath: string): Promise<void>;
}

export const engineBridge: EngineBridge = {
  async startRun(payload) {
    return invoke<RunJob>("start_run", { payload });
  },

  async stopRun(runId) {
    return invoke<RunJob>("stop_run", { runId });
  },

  async getRunJob(runId) {
    return invoke<RunJob>("get_run_job", { runId });
  },

  async listRowTasks(runId) {
    return invoke<RowTask[]>("list_row_tasks", { runId });
  },

  async getRunLogs(runId) {
    return invoke<RunLogs>("get_run_logs", { runId });
  },

  async previewInput(project, limit) {
    return invoke<InputPreviewSample[]>("preview_input", { project, limit });
  },

  async preflightOutput(project) {
    return invoke<OutputPreflightReport>("preflight_output", { project });
  },

  async openSourceFile() {
    return invoke<string | null>("open_source_file");
  },

  async chooseOutputFile() {
    return invoke<string | null>("choose_output_file");
  },

  async saveProject(project, targetPath) {
    return invoke<string>("save_project", { project, targetPath });
  },

  async saveAutosaveProject(project) {
    return invoke<string>("save_autosave_project", { project });
  },

  async loadProject(filePath) {
    return invoke<LoadedProject>("load_project", { filePath });
  },

  async loadAutosaveProject() {
    return invoke<LoadedProject | null>("load_autosave_project");
  },

  async listTemplates() {
    return invoke<TemplateSummary[]>("list_templates");
  },

  async loadTemplate(filePath) {
    return invoke<LoadedTemplate>("load_template", { filePath });
  },

  async saveTemplate(template, targetPath) {
    return invoke<string>("save_template", { template, targetPath });
  },

  async exportResult(runId, targetPath) {
    await invoke("export_result", { runId, targetPath });
  },
};
