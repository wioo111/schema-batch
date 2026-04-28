export type RowTaskStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export interface InputColumn {
  name: string;
  label?: string;
}

export type InputSourceMode = "file" | "inline";

export interface InlineInputRow {
  values: Record<string, string>;
}

export interface InputPreprocess {
  trimWhitespace?: boolean;
  collapseWhitespace?: boolean;
  removeLineBreaks?: boolean;
  stripHtml?: boolean;
  maxChars?: number;
}

export interface OutputField {
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  defaultValue?: string | number | boolean;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  inputColumns: InputColumn[];
  preprocess?: InputPreprocess;
  joinSeparator?: string;
  systemPrompt: string;
  userPrompt: string;
  outputFields: OutputField[];
  includeCombinedText?: boolean;
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  filePath: string;
}

export interface LoadedTemplate {
  filePath: string;
  template: TaskTemplate;
}

export interface ModelConfig {
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  concurrency: number;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
}

export interface RowTask {
  rowIndex: number;
  rawText?: string;
  status: RowTaskStatus;
  rawResponse?: string;
  parsedResult?: Record<string, unknown>;
  errorMessage?: string;
}

export interface RunJob {
  id: string;
  status: "idle" | "running" | "paused" | "completed" | "failed" | "stopped";
  totalRows: number;
  completedRows: number;
  failedRows: number;
  outputFilePath?: string;
  updatedAt: string;
}

export interface RunLogs {
  stdout: string;
  stderr: string;
}

export interface InputPreviewSample {
  rowIndex: number;
  sourceValues: Record<string, string>;
  combinedText: string;
  renderedSystemPrompt: string;
  renderedUserPrompt: string;
}

export interface OutputPreflightIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface OutputPreflightReport {
  ok: boolean;
  issues: OutputPreflightIssue[];
}

export type ReadyCheckLevel = "success" | "warning" | "error";

export interface ReadyCheckItem {
  key: string;
  label: string;
  level: ReadyCheckLevel;
  message: string;
}

export interface ReadyCheckReport {
  ready: boolean;
  blockerCount: number;
  warningCount: number;
  items: ReadyCheckItem[];
  summary: string;
}

export interface LoadedProject {
  filePath: string;
  project: ProjectFile;
}

export interface ProjectFile {
  id: string;
  name: string;
  context?: string;
  sourceFilePath: string;
  inputSourceMode?: InputSourceMode;
  inlineInputRows?: InlineInputRow[];
  outputFilePath?: string;
  pythonExecutable?: string;
  template: TaskTemplate;
  modelConfig: ModelConfig;
}
