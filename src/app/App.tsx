import { useEffect, useMemo, useRef, useState } from "react";

import type {
  InputColumn,
  InputPreviewSample,
  InputPreprocess,
  InputSourceMode,
  InlineInputRow,
  LoadedTemplate,
  OutputField,
  OutputPreflightReport,
  ProjectFile,
  ReadyCheckItem,
  ReadyCheckReport,
  RowTask,
  RunJob,
  RunLogs,
  TaskTemplate,
  TemplateSummary,
} from "../core/types";
import { engineBridge } from "../services/engineBridge";

const defaultInputColumnsText = ["评论内容|主评论", "二级评论内容|回复"].join("\n");

const defaultOutputFieldsText = [
  "情感倾向|string|true|",
  "是否存在解构情绪|string|true|",
  "社会信任敏感度|string|true|",
  "危害领域归属|string|true|",
  "核心观点|string|true|",
].join("\n");

const sectionStyle = {
  border: "1px solid #d0d7de",
  borderRadius: 12,
  padding: 16,
  background: "#ffffff",
} satisfies React.CSSProperties;

const labelStyle = {
  display: "grid",
  gap: 6,
  fontSize: 14,
  fontWeight: 600,
} satisfies React.CSSProperties;

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #c7ced6",
  fontSize: 14,
  boxSizing: "border-box",
} satisfies React.CSSProperties;

const textareaStyle = {
  ...inputStyle,
  minHeight: 110,
  resize: "vertical",
  fontFamily: "Consolas, 'Courier New', monospace",
} satisfies React.CSSProperties;

const workflowSteps = ["导入表格", "配置任务", "批量运行", "导出结果"];

const promptVariableTokens = [
  {
    label: "文本",
    value: "{text}",
    description: "当前行拼接后的文本内容",
  },
  {
    label: "任务背景",
    value: "{context}",
    description: "任务背景说明",
  },
  {
    label: "全局背景",
    value: "{global_context}",
    description: "与 {context} 等价的别名",
  },
] as const;

const systemPromptSnippets = [
  {
    label: "JSON 约束",
    value: "只返回合法 JSON 对象，不要输出 markdown，不要补充解释。",
  },
  {
    label: "角色约束",
    value: "你是一个严谨的结构化分析助手，必须严格遵循字段定义输出结果。",
  },
] as const;

const userPromptSnippets = [
  {
    label: "任务说明",
    value: "请阅读下面文本，并按输出字段定义返回 JSON：\n\n{text}",
  },
  {
    label: "带背景",
    value: "任务背景：\n{context}\n\n请阅读下面文本，并按输出字段定义返回 JSON：\n\n{text}",
  },
  {
    label: "字段提醒",
    value: "输出时必须覆盖所有必填字段；缺失信息请按默认值或空字符串处理。",
  },
] as const;

const taskTemplatePresets = [
  {
    key: "comment-analysis",
    title: "评论分析",
    description: "适合评论、回复、弹幕、短文本反馈的结构化分析。",
    accent: "#0969da",
    tags: ["评论", "观点", "风险"],
    outputPreview: ["情感倾向", "核心观点", "风险归类"],
    templateId: "comment-analysis",
    templateName: "评论结构化分析",
    templateDescription: "面向评论文本的结构化抽取模板。",
    inputColumnsText: ["评论内容|主评论", "二级评论内容|回复"].join("\n"),
    outputFieldsText: [
      "情感倾向|string|true|",
      "是否存在解构情绪|string|true|",
      "社会信任敏感度|string|true|",
      "危害领域归属|string|true|",
      "核心观点|string|true|",
    ].join("\n"),
    systemPrompt:
      "你是一个严谨的评论结构化分析助手。只返回合法 JSON 对象，不要输出 markdown，不要补充解释。",
    userPrompt:
      "任务背景：\n{context}\n\n请阅读下面的评论文本，识别情绪、核心观点和风险归属，并按输出字段定义返回 JSON：\n\n{text}",
  },
  {
    key: "classification",
    title: "文本分类",
    description: "适合主题归类、标签判断、风险等级识别。",
    accent: "#8250df",
    tags: ["分类", "标签", "判定"],
    outputPreview: ["分类结果", "置信说明", "判定依据"],
    templateId: "text-classification",
    templateName: "文本分类模板",
    templateDescription: "面向单条文本分类判断的模板。",
    inputColumnsText: ["文本内容|文本"].join("\n"),
    outputFieldsText: [
      "分类结果|string|true|",
      "判定依据|string|true|",
      "是否需要人工复核|boolean|true|false",
    ].join("\n"),
    systemPrompt:
      "你是一个严谨的文本分类助手。只返回合法 JSON 对象，不要输出 markdown，不要补充解释。",
    userPrompt:
      "任务背景：\n{context}\n\n请阅读下面文本，完成分类判断，并按输出字段定义返回 JSON：\n\n{text}",
  },
  {
    key: "extraction",
    title: "信息抽取",
    description: "适合从文本里抽取实体、时间、地点、事件要点。",
    accent: "#1a7f37",
    tags: ["抽取", "实体", "结构化"],
    outputPreview: ["主体", "时间", "地点"],
    templateId: "information-extraction",
    templateName: "信息抽取模板",
    templateDescription: "面向实体与关键信息抽取的模板。",
    inputColumnsText: ["文本内容|文本"].join("\n"),
    outputFieldsText: [
      "主体|string|true|",
      "时间|string|false|",
      "地点|string|false|",
      "关键信息|string|true|",
    ].join("\n"),
    systemPrompt:
      "你是一个严谨的信息抽取助手。只返回合法 JSON 对象，不要输出 markdown，不要补充解释。",
    userPrompt:
      "请阅读下面文本，抽取关键实体与事件信息，并按输出字段定义返回 JSON：\n\n{text}",
  },
  {
    key: "summary",
    title: "内容摘要",
    description: "适合长文本压缩、会议纪要、材料摘要。",
    accent: "#bc4c00",
    tags: ["摘要", "总结", "长文本"],
    outputPreview: ["摘要", "关键词", "待跟进事项"],
    templateId: "content-summary",
    templateName: "内容摘要模板",
    templateDescription: "面向长文本摘要和要点提炼的模板。",
    inputColumnsText: ["文本内容|文本"].join("\n"),
    outputFieldsText: [
      "摘要|string|true|",
      "关键词|string|true|",
      "待跟进事项|string|false|",
    ].join("\n"),
    systemPrompt:
      "你是一个严谨的内容摘要助手。只返回合法 JSON 对象，不要输出 markdown，不要补充解释。",
    userPrompt:
      "任务背景：\n{context}\n\n请阅读下面文本，生成简洁摘要、关键词和待跟进事项，并按输出字段定义返回 JSON：\n\n{text}",
  },
  {
    key: "sentiment",
    title: "情感识别",
    description: "适合评价倾向、用户反馈、舆情态度判断。",
    accent: "#cf222e",
    tags: ["情感", "态度", "反馈"],
    outputPreview: ["情感倾向", "情绪强度", "原因"],
    templateId: "sentiment-analysis",
    templateName: "情感识别模板",
    templateDescription: "面向情绪倾向和原因分析的模板。",
    inputColumnsText: ["文本内容|文本"].join("\n"),
    outputFieldsText: [
      "情感倾向|string|true|",
      "情绪强度|number|true|0",
      "主要原因|string|true|",
    ].join("\n"),
    systemPrompt:
      "你是一个严谨的情感分析助手。只返回合法 JSON 对象，不要输出 markdown，不要补充解释。",
    userPrompt:
      "请阅读下面文本，判断情感倾向与情绪强度，提炼主要原因，并按输出字段定义返回 JSON：\n\n{text}",
  },
] as const;

const readyCheckLevelMeta: Record<
  ReadyCheckItem["level"],
  { label: string; borderColor: string; background: string; textColor: string }
> = {
  success: {
    label: "通过",
    borderColor: "#1a7f3733",
    background: "#eef9f0",
    textColor: "#1a7f37",
  },
  warning: {
    label: "待确认",
    borderColor: "#9a670033",
    background: "#fff8e6",
    textColor: "#9a6700",
  },
  error: {
    label: "阻断",
    borderColor: "#cf222e33",
    background: "#fff8f8",
    textColor: "#cf222e",
  },
};

const runStatusMeta: Record<
  RunJob["status"],
  { label: string; borderColor: string; background: string; textColor: string }
> = {
  idle: {
    label: "未开始",
    borderColor: "#d0d7de",
    background: "#f6f8fa",
    textColor: "#57606a",
  },
  running: {
    label: "运行中",
    borderColor: "#9a670033",
    background: "#fff8e6",
    textColor: "#9a6700",
  },
  paused: {
    label: "已暂停",
    borderColor: "#8250df33",
    background: "#f8f2ff",
    textColor: "#8250df",
  },
  completed: {
    label: "已完成",
    borderColor: "#1a7f3733",
    background: "#eef9f0",
    textColor: "#1a7f37",
  },
  failed: {
    label: "失败",
    borderColor: "#cf222e33",
    background: "#fff8f8",
    textColor: "#cf222e",
  },
  stopped: {
    label: "已停止",
    borderColor: "#d0d7de",
    background: "#fafbfc",
    textColor: "#57606a",
  },
};

function parseInputColumns(value: string): InputColumn[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, labelPart] = line.split("|").map((item) => item.trim());
      return {
        name: namePart,
        label: labelPart || namePart,
      };
    })
    .filter((column) => column.name);
}

function parseBoolean(value: string): boolean {
  return ["true", "1", "yes", "y"].includes(value.trim().toLowerCase());
}

function parseDefaultValue(
  rawValue: string,
  fieldType: OutputField["type"]
): OutputField["defaultValue"] {
  if (!rawValue.trim()) {
    return undefined;
  }

  if (fieldType === "number") {
    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  if (fieldType === "boolean") {
    return parseBoolean(rawValue);
  }

  return rawValue;
}

function normalizeOutputType(value: string): OutputField["type"] {
  if (value === "number" || value === "boolean") {
    return value;
  }
  return "string";
}

function parseOutputFields(value: string): OutputField[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, typePart, requiredPart, defaultPart = ""] = line
        .split("|")
        .map((item) => item.trim());
      const fieldType = normalizeOutputType(typePart);
      return {
        name: namePart,
        type: fieldType,
        required: parseBoolean(requiredPart),
        defaultValue: parseDefaultValue(defaultPart, fieldType),
      };
    })
    .filter((field) => field.name);
}

function parseMaxChars(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

function parseInlineInputRows(
  inputColumns: InputColumn[],
  rawValue: string
): InlineInputRow[] {
  if (inputColumns.length === 0) {
    return [];
  }

  return rawValue
    .split(/\r?\n/)
    .map((line) => line.replace(/\r/g, ""))
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cells = line.split("\t");
      const values: Record<string, string> = {};

      inputColumns.forEach((column, index) => {
        values[column.name] = cells[index] ?? "";
      });

      return { values };
    })
    .filter((row) =>
      Object.values(row.values).some((value) => value.trim().length > 0)
    );
}

function serializeInlineInputRows(
  rows: InlineInputRow[] | undefined,
  inputColumns: InputColumn[]
): string {
  if (!rows || rows.length === 0 || inputColumns.length === 0) {
    return "";
  }

  return rows
    .map((row) =>
      inputColumns.map((column) => row.values[column.name] || "").join("\t")
    )
    .join("\n");
}

function buildInlineRowValues(inputColumns: InputColumn[]): Record<string, string> {
  return Object.fromEntries(inputColumns.map((column) => [column.name, ""]));
}

function makeUniqueInputColumnName(
  baseName: string,
  inputColumns: InputColumn[],
  excludingIndex?: number
): string {
  const normalizedBase = baseName.trim() || "字段";
  let candidate = normalizedBase;
  let suffix = 2;

  while (
    inputColumns.some(
      (column, index) =>
        index !== excludingIndex && column.name.trim().toLowerCase() === candidate.toLowerCase()
    )
  ) {
    candidate = `${normalizedBase}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function makeUniqueOutputFieldName(
  baseName: string,
  outputFields: OutputField[],
  excludingIndex?: number
): string {
  const normalizedBase = baseName.trim() || "字段";
  let candidate = normalizedBase;
  let suffix = 2;

  while (
    outputFields.some(
      (field, index) =>
        index !== excludingIndex && field.name.trim().toLowerCase() === candidate.toLowerCase()
    )
  ) {
    candidate = `${normalizedBase}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

function insertTextAtCursor(
  currentValue: string,
  insertion: string,
  textarea: HTMLTextAreaElement | null
): { nextValue: string; nextCursor: number } {
  const selectionStart = textarea?.selectionStart ?? currentValue.length;
  const selectionEnd = textarea?.selectionEnd ?? currentValue.length;
  const nextValue =
    currentValue.slice(0, selectionStart) + insertion + currentValue.slice(selectionEnd);

  return {
    nextValue,
    nextCursor: selectionStart + insertion.length,
  };
}

function findTaskTemplatePreset(presetKeyOrTemplateId: string) {
  return taskTemplatePresets.find(
    (preset) =>
      preset.key === presetKeyOrTemplateId || preset.templateId === presetKeyOrTemplateId
  );
}

function scrollToWorkflowSection(sectionId: string) {
  const target = document.getElementById(sectionId);
  if (!target) {
    return;
  }

  target.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function parseClipboardTable(rawValue: string): string[][] {
  return rawValue
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));
}

function buildInputPreviewSignature(params: {
  inputSourceMode: InputSourceMode;
  sourceFilePath: string;
  inlineInputText: string;
  inputColumnsText: string;
  trimWhitespace: boolean;
  collapseWhitespace: boolean;
  removeLineBreaks: boolean;
  stripHtml: boolean;
  maxCharsText: string;
  systemPrompt: string;
  userPrompt: string;
}): string {
  return JSON.stringify(params);
}

function buildOutputPreflightSignature(params: {
  inputSourceMode: InputSourceMode;
  sourceFilePath: string;
  inlineInputText: string;
  outputFieldsText: string;
  systemPrompt: string;
  userPrompt: string;
}): string {
  return JSON.stringify(params);
}

function buildReadyCheckReport(params: {
  inputSourceMode: InputSourceMode;
  sourceFilePath: string;
  inlineInputRowCount: number;
  context: string;
  inputColumnsCount: number;
  outputFieldsCount: number;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  apiKey: string;
  apiKeyEnv: string;
  concurrency: number;
  hasInputPreview: boolean;
  isInputPreviewFresh: boolean;
  outputPreflight: OutputPreflightReport | null;
  isOutputPreflightFresh: boolean;
}): ReadyCheckReport {
  const items: ReadyCheckItem[] = [];

  if (params.inputSourceMode === "inline") {
    if (params.inlineInputRowCount === 0) {
      items.push({
        key: "input-data",
        label: "原始数据",
        level: "error",
        message: "程序内还没有录入任何数据。",
      });
    } else {
      items.push({
        key: "input-data",
        label: "原始数据",
        level: "success",
        message: `程序内已录入 ${params.inlineInputRowCount} 行数据。`,
      });
    }
  } else {
    if (!params.sourceFilePath.trim()) {
      items.push({
        key: "source-file",
        label: "输入文件",
        level: "error",
        message: "还没有选择输入文件。",
      });
    } else {
      items.push({
        key: "source-file",
        label: "输入文件",
        level: "success",
        message: "输入文件路径已配置。",
      });
    }
  }

  if (params.inputColumnsCount === 0) {
    items.push({
      key: "input-columns",
      label: "输入列",
      level: "error",
      message: "至少需要配置一个输入列。",
    });
  } else {
    items.push({
      key: "input-columns",
      label: "输入列",
      level: "success",
      message: `当前已配置 ${params.inputColumnsCount} 个输入列。`,
    });
  }

  if (!params.context.trim()) {
    items.push({
      key: "context",
      label: "任务背景",
      level: "error",
      message: "任务背景为空，运行会被直接拦截。",
    });
  } else {
    items.push({
      key: "context",
      label: "任务背景",
      level: "success",
      message: "任务背景已填写。",
    });
  }

  if (!params.systemPrompt.trim() || !params.userPrompt.trim()) {
    items.push({
      key: "prompt",
      label: "Prompt",
      level: "error",
      message: "System Prompt 和 User Prompt 都需要填写。",
    });
  } else {
    items.push({
      key: "prompt",
      label: "Prompt",
      level: "success",
      message: "Prompt 已配置。",
    });
  }

  if (!params.hasInputPreview) {
    items.push({
      key: "input-preview",
      label: "请求预览",
      level: "warning",
      message: "还没有生成输入预览，建议先确认实际送模文本。",
    });
  } else if (!params.isInputPreviewFresh) {
    items.push({
      key: "input-preview",
      label: "请求预览",
      level: "warning",
      message: "输入预览基于旧配置生成，建议重新预览。",
    });
  } else {
    items.push({
      key: "input-preview",
      label: "请求预览",
      level: "success",
      message: "输入预览与当前配置一致。",
    });
  }

  if (params.outputFieldsCount === 0) {
    items.push({
      key: "output-fields",
      label: "输出字段",
      level: "error",
      message: "至少需要配置一个输出字段。",
    });
  } else {
    items.push({
      key: "output-fields",
      label: "输出字段",
      level: "success",
      message: `当前已配置 ${params.outputFieldsCount} 个输出字段。`,
    });
  }

  if (!params.outputPreflight) {
    items.push({
      key: "output-preflight",
      label: "输出预检",
      level: "warning",
      message: "还没有执行输出预检，启动前会自动补做一次。",
    });
  } else if (!params.isOutputPreflightFresh) {
    items.push({
      key: "output-preflight",
      label: "输出预检",
      level: "warning",
      message: "输出预检结果已过期，修改模板后需要重新预检。",
    });
  } else if (!params.outputPreflight.ok) {
    items.push({
      key: "output-preflight",
      label: "输出预检",
      level: "error",
      message: `输出预检未通过，仍有 ${
        params.outputPreflight.issues.filter((issue) => issue.severity === "error").length
      } 个错误项。`,
    });
  } else if (params.outputPreflight.issues.length > 0) {
    items.push({
      key: "output-preflight",
      label: "输出预检",
      level: "warning",
      message: `输出预检通过，但还有 ${params.outputPreflight.issues.length} 个提示项。`,
    });
  } else {
    items.push({
      key: "output-preflight",
      label: "输出预检",
      level: "success",
      message: "输出预检已通过。",
    });
  }

  if (!params.model.trim()) {
    items.push({
      key: "model",
      label: "模型名称",
      level: "error",
      message: "还没有填写模型名称。",
    });
  } else {
    items.push({
      key: "model",
      label: "模型名称",
      level: "success",
      message: `当前模型：${params.model.trim()}`,
    });
  }

  if (!params.apiKey.trim() && !params.apiKeyEnv.trim()) {
    items.push({
      key: "auth",
      label: "鉴权配置",
      level: "error",
      message: "请提供 API Key 或 API Key 环境变量名。",
    });
  } else if (params.apiKey.trim()) {
    items.push({
      key: "auth",
      label: "鉴权配置",
      level: "success",
      message: "已直接填写 API Key。",
    });
  } else {
    items.push({
      key: "auth",
      label: "鉴权配置",
      level: "success",
      message: `使用环境变量：${params.apiKeyEnv.trim()}`,
    });
  }

  if (params.concurrency <= 0) {
    items.push({
      key: "concurrency",
      label: "并发数",
      level: "error",
      message: "并发数必须大于 0。",
    });
  } else if (params.concurrency > 10) {
    items.push({
      key: "concurrency",
      label: "并发数",
      level: "warning",
      message: `当前并发为 ${params.concurrency}，较高并发更容易触发限流或超时。`,
    });
  } else {
    items.push({
      key: "concurrency",
      label: "并发数",
      level: "success",
      message: `当前并发为 ${params.concurrency}。`,
    });
  }

  const blockerCount = items.filter((item) => item.level === "error").length;
  const warningCount = items.filter((item) => item.level === "warning").length;
  const ready = blockerCount === 0;

  let summary = "配置已就绪，可以开始运行。";
  if (blockerCount > 0) {
    summary = `当前还有 ${blockerCount} 个阻断项，不能开始运行。`;
  } else if (warningCount > 0) {
    summary = `当前可以启动，但还有 ${warningCount} 个待确认项。`;
  }

  return {
    ready,
    blockerCount,
    warningCount,
    items,
    summary,
  };
}

function buildProjectFile(params: {
  projectName: string;
  context: string;
  templateId: string;
  templateName: string;
  templateDescription: string;
  preprocess: InputPreprocess;
  inputSourceMode: InputSourceMode;
  inlineInputRows: InlineInputRow[];
  sourceFilePath: string;
  outputFilePath: string;
  pythonExecutable: string;
  inputColumnsText: string;
  outputFieldsText: string;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  apiKeyEnv: string;
  concurrency: number;
}): ProjectFile {
  return {
    id: `project-${Date.now()}`,
    name: params.projectName.trim() || "未命名任务",
    context: params.context,
    sourceFilePath:
      params.inputSourceMode === "file" ? params.sourceFilePath.trim() : "",
    inputSourceMode: params.inputSourceMode,
    inlineInputRows:
      params.inputSourceMode === "inline" ? params.inlineInputRows : undefined,
    outputFilePath: params.outputFilePath.trim() || undefined,
    pythonExecutable: params.pythonExecutable.trim() || undefined,
    template: {
      id: params.templateId.trim() || `template-${Date.now()}`,
      name: params.templateName.trim() || "未命名模板",
      description: params.templateDescription.trim(),
      inputColumns: parseInputColumns(params.inputColumnsText),
      preprocess: params.preprocess,
      joinSeparator: " | ",
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      outputFields: parseOutputFields(params.outputFieldsText),
      includeCombinedText: true,
    },
    modelConfig: {
      provider: "openai-compatible",
      model: params.model.trim(),
      baseUrl: params.baseUrl.trim() || undefined,
      apiKey: params.apiKey.trim() || undefined,
      apiKeyEnv: params.apiKeyEnv.trim() || undefined,
      concurrency: params.concurrency,
      timeoutMs: 120000,
      maxRetries: 3,
      temperature: 0.1,
    },
  };
}

function buildTemplateFromForm(params: {
  templateId: string;
  templateName: string;
  templateDescription: string;
  preprocess: InputPreprocess;
  inputColumnsText: string;
  outputFieldsText: string;
  systemPrompt: string;
  userPrompt: string;
}): TaskTemplate {
  return {
    id: params.templateId.trim() || `template-${Date.now()}`,
    name: params.templateName.trim() || "未命名模板",
    description: params.templateDescription.trim(),
    inputColumns: parseInputColumns(params.inputColumnsText),
    preprocess: params.preprocess,
    joinSeparator: " | ",
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    outputFields: parseOutputFields(params.outputFieldsText),
    includeCombinedText: true,
  };
}

function formatParsedResult(rowTask: RowTask) {
  if (!rowTask.parsedResult) {
    return "-";
  }
  return JSON.stringify(rowTask.parsedResult, null, 2);
}

function formatResultValue(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "string") {
    return value.trim() || "-";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

function getLogLines(logText: string) {
  return logText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getRecentMatchingLogLines(logText: string, matcher: RegExp, limit: number) {
  return getLogLines(logText).filter((line) => matcher.test(line)).slice(-limit).reverse();
}

function getRecentLogTimeline(runLogs: RunLogs, limit: number) {
  const stdoutTimeline = getLogLines(runLogs.stdout)
    .slice(-limit)
    .map((line) => ({ source: "stdout" as const, line }));
  const stderrTimeline = getLogLines(runLogs.stderr)
    .slice(-limit)
    .map((line) => ({ source: "stderr" as const, line }));

  return [...stderrTimeline, ...stdoutTimeline].slice(-limit).reverse();
}

function serializeInputColumns(inputColumns: InputColumn[]): string {
  return inputColumns
    .map((column) => `${column.name}|${column.label || column.name}`)
    .join("\n");
}

function serializeOutputFields(outputFields: OutputField[]): string {
  return outputFields
    .map((field) => {
      const defaultValue =
        field.defaultValue === undefined ? "" : String(field.defaultValue);
      return `${field.name}|${field.type}|${field.required}|${defaultValue}`;
    })
    .join("\n");
}

function applyProjectToForm(
  project: ProjectFile,
  setters: {
    setProjectName: (value: string) => void;
    setContext: (value: string) => void;
    setTemplateId: (value: string) => void;
    setTemplateName: (value: string) => void;
    setTemplateDescription: (value: string) => void;
    setTrimWhitespace: (value: boolean) => void;
    setCollapseWhitespace: (value: boolean) => void;
    setRemoveLineBreaks: (value: boolean) => void;
    setStripHtml: (value: boolean) => void;
    setMaxCharsText: (value: string) => void;
    setInputSourceMode: (value: InputSourceMode) => void;
    setInlineInputText: (value: string) => void;
    setSourceFilePath: (value: string) => void;
    setOutputFilePath: (value: string) => void;
    setPythonExecutable: (value: string) => void;
    setInputColumnsText: (value: string) => void;
    setOutputFieldsText: (value: string) => void;
    setSystemPrompt: (value: string) => void;
    setUserPrompt: (value: string) => void;
    setModel: (value: string) => void;
    setBaseUrl: (value: string) => void;
    setApiKey: (value: string) => void;
    setApiKeyEnv: (value: string) => void;
    setConcurrency: (value: number) => void;
  }
) {
  setters.setProjectName(project.name);
  setters.setContext(project.context || "");
  setters.setTemplateId(project.template.id);
  setters.setTemplateName(project.template.name);
  setters.setTemplateDescription(project.template.description);
  setters.setTrimWhitespace(project.template.preprocess?.trimWhitespace ?? true);
  setters.setCollapseWhitespace(project.template.preprocess?.collapseWhitespace ?? true);
  setters.setRemoveLineBreaks(project.template.preprocess?.removeLineBreaks ?? false);
  setters.setStripHtml(project.template.preprocess?.stripHtml ?? false);
  setters.setMaxCharsText(
    project.template.preprocess?.maxChars
      ? String(project.template.preprocess.maxChars)
      : ""
  );
  setters.setInputSourceMode(project.inputSourceMode || "file");
  setters.setInlineInputText(
    serializeInlineInputRows(project.inlineInputRows, project.template.inputColumns)
  );
  setters.setSourceFilePath(project.sourceFilePath);
  setters.setOutputFilePath(project.outputFilePath || "");
  setters.setPythonExecutable(project.pythonExecutable || "python");
  setters.setInputColumnsText(serializeInputColumns(project.template.inputColumns));
  setters.setOutputFieldsText(serializeOutputFields(project.template.outputFields));
  setters.setSystemPrompt(project.template.systemPrompt);
  setters.setUserPrompt(project.template.userPrompt);
  setters.setModel(project.modelConfig.model);
  setters.setBaseUrl(project.modelConfig.baseUrl || "");
  setters.setApiKey(project.modelConfig.apiKey || "");
  setters.setApiKeyEnv(project.modelConfig.apiKeyEnv || "");
  setters.setConcurrency(project.modelConfig.concurrency);
}

function applyTemplateToForm(
  loaded: LoadedTemplate,
  setters: {
    setTemplateFilePath: (value: string) => void;
    setTemplateId: (value: string) => void;
    setTemplateName: (value: string) => void;
    setTemplateDescription: (value: string) => void;
    setTrimWhitespace: (value: boolean) => void;
    setCollapseWhitespace: (value: boolean) => void;
    setRemoveLineBreaks: (value: boolean) => void;
    setStripHtml: (value: boolean) => void;
    setMaxCharsText: (value: string) => void;
    setInputColumnsText: (value: string) => void;
    setOutputFieldsText: (value: string) => void;
    setSystemPrompt: (value: string) => void;
    setUserPrompt: (value: string) => void;
    setSelectedTemplatePath: (value: string) => void;
  }
) {
  setters.setTemplateFilePath(loaded.filePath);
  setters.setSelectedTemplatePath(loaded.filePath);
  setters.setTemplateId(loaded.template.id);
  setters.setTemplateName(loaded.template.name);
  setters.setTemplateDescription(loaded.template.description);
  setters.setTrimWhitespace(loaded.template.preprocess?.trimWhitespace ?? true);
  setters.setCollapseWhitespace(loaded.template.preprocess?.collapseWhitespace ?? true);
  setters.setRemoveLineBreaks(loaded.template.preprocess?.removeLineBreaks ?? false);
  setters.setStripHtml(loaded.template.preprocess?.stripHtml ?? false);
  setters.setMaxCharsText(
    loaded.template.preprocess?.maxChars
      ? String(loaded.template.preprocess.maxChars)
      : ""
  );
  setters.setInputColumnsText(serializeInputColumns(loaded.template.inputColumns));
  setters.setOutputFieldsText(serializeOutputFields(loaded.template.outputFields));
  setters.setSystemPrompt(loaded.template.systemPrompt);
  setters.setUserPrompt(loaded.template.userPrompt);
}

export function App() {
  const [autosavePath, setAutosavePath] = useState("");
  const [projectFilePath, setProjectFilePath] = useState("");
  const [templateFilePath, setTemplateFilePath] = useState("");
  const [templateId, setTemplateId] = useState("comment-analysis");
  const [templateName, setTemplateName] = useState("评论结构化模板");
  const [templateDescription, setTemplateDescription] = useState(
    "面向评论文本的结构化抽取模板。"
  );
  const [templateCatalog, setTemplateCatalog] = useState<TemplateSummary[]>([]);
  const [selectedTemplatePath, setSelectedTemplatePath] = useState("");
  const [selectedWizardPresetKey, setSelectedWizardPresetKey] = useState("comment-analysis");
  const [trimWhitespace, setTrimWhitespace] = useState(true);
  const [collapseWhitespace, setCollapseWhitespace] = useState(true);
  const [removeLineBreaks, setRemoveLineBreaks] = useState(false);
  const [stripHtml, setStripHtml] = useState(false);
  const [maxCharsText, setMaxCharsText] = useState("4000");
  const [projectName, setProjectName] = useState("评论结构化分析");
  const [inputSourceMode, setInputSourceMode] = useState<InputSourceMode>("inline");
  const [inlineInputText, setInlineInputText] = useState("");
  const [sourceFilePath, setSourceFilePath] = useState("");
  const [outputFilePath, setOutputFilePath] = useState("");
  const [pythonExecutable, setPythonExecutable] = useState("python");
  const [context, setContext] = useState("");
  const [model, setModel] = useState("qwen-plus");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyEnv, setApiKeyEnv] = useState("DASHSCOPE_API_KEY");
  const [concurrency, setConcurrency] = useState(5);
  const [inputColumnsText, setInputColumnsText] = useState(defaultInputColumnsText);
  const [outputFieldsText, setOutputFieldsText] = useState(defaultOutputFieldsText);
  const [inlineDraftValues, setInlineDraftValues] = useState<Record<string, string>>({});
  const [selectedInlineRowIndexes, setSelectedInlineRowIndexes] = useState<number[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(
    "你是一个严谨的文本结构化分析助手。输出必须是合法 JSON，不要输出 markdown。"
  );
  const [userPrompt, setUserPrompt] = useState(
    "请阅读以下文本，并按照预定义字段返回 JSON：\n\n{text}"
  );
  const [exportTargetPath, setExportTargetPath] = useState("");
  const [runJob, setRunJob] = useState<RunJob | null>(null);
  const [runLogs, setRunLogs] = useState<RunLogs>({ stdout: "", stderr: "" });
  const [rowTasks, setRowTasks] = useState<RowTask[]>([]);
  const [inputPreview, setInputPreview] = useState<InputPreviewSample[]>([]);
  const [outputPreflight, setOutputPreflight] = useState<OutputPreflightReport | null>(null);
  const [lastInputPreviewSignature, setLastInputPreviewSignature] = useState("");
  const [lastOutputPreflightSignature, setLastOutputPreflightSignature] = useState("");
  const [activeRunId, setActiveRunId] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [isRefreshingTemplates, setIsRefreshingTemplates] = useState(false);
  const [isPreviewingInput, setIsPreviewingInput] = useState(false);
  const [isPreflightingOutput, setIsPreflightingOutput] = useState(false);
  const [isAutosaveReady, setIsAutosaveReady] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "先完成 Ready Check，再启动批处理。"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [activeWorkflowSectionId, setActiveWorkflowSectionId] = useState("section-data");
  const systemPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const userPromptRef = useRef<HTMLTextAreaElement | null>(null);

  const parsedInputColumns = useMemo(
    () => parseInputColumns(inputColumnsText),
    [inputColumnsText]
  );
  const parsedOutputFields = useMemo(
    () => parseOutputFields(outputFieldsText),
    [outputFieldsText]
  );
  const parsedInlineInputRows = useMemo(
    () => parseInlineInputRows(parsedInputColumns, inlineInputText),
    [parsedInputColumns, inlineInputText]
  );
  const inputPreviewSignature = useMemo(
    () =>
      buildInputPreviewSignature({
        inputSourceMode,
        sourceFilePath,
        inlineInputText,
        inputColumnsText,
        trimWhitespace,
        collapseWhitespace,
        removeLineBreaks,
        stripHtml,
        maxCharsText,
        systemPrompt,
        userPrompt,
      }),
    [
      inputSourceMode,
      sourceFilePath,
      inlineInputText,
      inputColumnsText,
      trimWhitespace,
      collapseWhitespace,
      removeLineBreaks,
      stripHtml,
      maxCharsText,
      systemPrompt,
      userPrompt,
    ]
  );
  const outputPreflightSignature = useMemo(
    () =>
      buildOutputPreflightSignature({
        inputSourceMode,
        sourceFilePath,
        inlineInputText,
        outputFieldsText,
        systemPrompt,
        userPrompt,
      }),
    [inputSourceMode, sourceFilePath, inlineInputText, outputFieldsText, systemPrompt, userPrompt]
  );
  const isInputPreviewFresh =
    inputPreview.length > 0 && lastInputPreviewSignature === inputPreviewSignature;
  const isOutputPreflightFresh =
    outputPreflight !== null &&
    lastOutputPreflightSignature === outputPreflightSignature;
  const readyCheck = useMemo(
    () =>
      buildReadyCheckReport({
        inputSourceMode,
        sourceFilePath,
        inlineInputRowCount: parsedInlineInputRows.length,
        context,
        inputColumnsCount: parsedInputColumns.length,
        outputFieldsCount: parsedOutputFields.length,
        systemPrompt,
        userPrompt,
        model,
        apiKey,
        apiKeyEnv,
        concurrency,
        hasInputPreview: inputPreview.length > 0,
        isInputPreviewFresh,
        outputPreflight,
        isOutputPreflightFresh,
      }),
    [
      inputSourceMode,
      sourceFilePath,
      parsedInlineInputRows.length,
      context,
      parsedInputColumns.length,
      parsedOutputFields.length,
      systemPrompt,
      userPrompt,
      model,
      apiKey,
      apiKeyEnv,
      concurrency,
      inputPreview.length,
      isInputPreviewFresh,
      outputPreflight,
      isOutputPreflightFresh,
    ]
  );
  const workflowStageCards = useMemo(() => {
    const inputLevel: ReadyCheckItem["level"] =
      inputSourceMode === "file"
        ? sourceFilePath.trim()
          ? "success"
          : "error"
        : parsedInlineInputRows.length > 0
          ? "success"
          : "warning";
    const inputSummary =
      inputSourceMode === "file"
        ? sourceFilePath.trim()
          ? "已选择文件，可直接做预览和校验。"
          : "还没选择输入文件。"
        : parsedInlineInputRows.length > 0
          ? `程序内已录入 ${parsedInlineInputRows.length} 行数据。`
          : "还没有程序内数据。";

    const templateLevel: ReadyCheckItem["level"] =
      parsedInputColumns.length > 0 &&
      parsedOutputFields.length > 0 &&
      systemPrompt.trim() &&
      userPrompt.trim()
        ? "success"
        : "warning";
    const templateSummary = `${templateName || "未命名模板"} · ${parsedInputColumns.length} 个输入列 · ${parsedOutputFields.length} 个输出字段`;

    const checkLevel: ReadyCheckItem["level"] =
      readyCheck.blockerCount > 0
        ? "error"
        : readyCheck.warningCount > 0
          ? "warning"
          : "success";
    const checkSummary = readyCheck.ready
      ? "启动前检查已通过。"
      : `还有 ${readyCheck.blockerCount} 个阻断项，${readyCheck.warningCount} 个待确认项。`;

    let runLevel: ReadyCheckItem["level"] = "warning";
    let runSummary = "还没有启动任务。";
    if (runJob?.status === "running") {
      runLevel = "warning";
      runSummary = `任务运行中，已完成 ${runJob.completedRows}/${runJob.totalRows} 行。`;
    } else if (runJob?.status === "completed") {
      runLevel = "success";
      runSummary = `任务已完成，共处理 ${runJob.totalRows} 行。`;
    } else if (runJob?.status === "failed") {
      runLevel = "error";
      runSummary = "任务运行失败，请查看日志和错误信息。";
    } else if (runJob?.status === "stopped") {
      runLevel = "warning";
      runSummary = "任务已停止，可调整配置后重新运行。";
    }

    return [
      {
        index: 1,
        title: "数据输入",
        level: inputLevel,
        summary: inputSummary,
        sectionId: "section-data",
        meta:
          inputSourceMode === "file"
            ? sourceFilePath || "文件导入模式"
            : `${parsedInputColumns.length} 列 / ${parsedInlineInputRows.length} 行`,
      },
      {
        index: 2,
        title: "任务模板",
        level: templateLevel,
        summary: templateSummary,
        sectionId: "section-template",
        meta: selectedWizardPresetKey
          ? `当前向导：${findTaskTemplatePreset(selectedWizardPresetKey)?.title || "自定义"}`
          : "自定义模板",
      },
      {
        index: 3,
        title: "启动检查",
        level: checkLevel,
        summary: checkSummary,
        sectionId: "section-ready-check",
        meta: `请求预览 ${isInputPreviewFresh ? "已更新" : "待刷新"} / 输出预检 ${
          isOutputPreflightFresh ? "已更新" : "待刷新"
        }`,
      },
      {
        index: 4,
        title: "运行结果",
        level: runLevel,
        summary: runSummary,
        sectionId: "section-run",
        meta: activeRunId ? `运行 ID: ${activeRunId}` : "尚未开始",
      },
    ];
  }, [
    inputSourceMode,
    sourceFilePath,
    parsedInlineInputRows.length,
    templateName,
    parsedInputColumns.length,
    parsedOutputFields.length,
    systemPrompt,
    userPrompt,
    readyCheck.ready,
    readyCheck.blockerCount,
    readyCheck.warningCount,
    selectedWizardPresetKey,
    isInputPreviewFresh,
    isOutputPreflightFresh,
    runJob,
    activeRunId,
  ]);
  const runProgressPercent = useMemo(() => {
    if (!runJob || runJob.totalRows <= 0) {
      return 0;
    }

    return Math.min(100, Math.max(0, (runJob.completedRows / runJob.totalRows) * 100));
  }, [runJob]);
  const latestRunError = useMemo(() => {
    const failedTask = [...rowTasks]
      .reverse()
      .find((task) => task.errorMessage || task.status === "failed");

    if (!failedTask) {
      return null;
    }

    return {
      rowIndex: failedTask.rowIndex,
      message: failedTask.errorMessage || "该行执行失败，但没有记录更多错误信息。",
    };
  }, [rowTasks]);
  const previewRowTasks = useMemo(() => rowTasks.slice(0, 20), [rowTasks]);
  const resultPreviewSummary = useMemo(() => {
    const failed = previewRowTasks.filter(
      (task) => task.status === "failed" || task.errorMessage
    );
    const succeeded = previewRowTasks.filter(
      (task) => task.status === "succeeded" && task.parsedResult
    );
    const pending = previewRowTasks.length - failed.length - succeeded.length;

    return {
      total: previewRowTasks.length,
      failed: failed.length,
      succeeded: succeeded.length,
      pending,
      failedTasks: failed,
      succeededTasks: succeeded,
    };
  }, [previewRowTasks]);
  const logPanelSummary = useMemo(() => {
    const recentErrors = getRecentMatchingLogLines(
      runLogs.stderr || runLogs.stdout,
      /(error|traceback|exception|failed|timeout|invalid|429|500)/i,
      5
    );
    const recentRetries = getRecentMatchingLogLines(
      `${runLogs.stdout}\n${runLogs.stderr}`,
      /(retry|重试|attempt)/i,
      5
    );
    const recentTimeline = getRecentLogTimeline(runLogs, 8);

    return {
      recentErrors,
      recentRetries,
      recentTimeline,
    };
  }, [runLogs]);

  useEffect(() => {
    setInlineDraftValues((current) => {
      const next = buildInlineRowValues(parsedInputColumns);
      parsedInputColumns.forEach((column) => {
        next[column.name] = current[column.name] || "";
      });
      return next;
    });
  }, [parsedInputColumns]);

  useEffect(() => {
    setSelectedInlineRowIndexes((current) =>
      current.filter((rowIndex) => rowIndex >= 0 && rowIndex < parsedInlineInputRows.length)
    );
  }, [parsedInlineInputRows.length]);

  useEffect(() => {
    const sectionIds = workflowStageCards.map((stage) => stage.sectionId);

    function updateActiveWorkflowSection() {
      let nextActiveSectionId = sectionIds[0] || "section-data";
      let nearestDistance = Number.POSITIVE_INFINITY;

      sectionIds.forEach((sectionId) => {
        const element = document.getElementById(sectionId);
        if (!element) {
          return;
        }

        const rect = element.getBoundingClientRect();
        const anchorY = 180;

        if (rect.top <= anchorY && rect.bottom >= anchorY) {
          nextActiveSectionId = sectionId;
          nearestDistance = -1;
          return;
        }

        if (nearestDistance >= 0) {
          const distance = Math.abs(rect.top - anchorY);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nextActiveSectionId = sectionId;
          }
        }
      });

      setActiveWorkflowSectionId(nextActiveSectionId);
    }

    updateActiveWorkflowSection();
    window.addEventListener("scroll", updateActiveWorkflowSection, { passive: true });
    window.addEventListener("resize", updateActiveWorkflowSection);

    return () => {
      window.removeEventListener("scroll", updateActiveWorkflowSection);
      window.removeEventListener("resize", updateActiveWorkflowSection);
    };
  }, [workflowStageCards]);

  function collectProjectFromForm(): ProjectFile {
    return buildProjectFile({
      projectName,
      context,
      templateId,
      templateName,
      templateDescription,
      preprocess: {
        trimWhitespace,
        collapseWhitespace,
        removeLineBreaks,
        stripHtml,
        maxChars: parseMaxChars(maxCharsText),
      },
      inputSourceMode,
      inlineInputRows: parsedInlineInputRows,
      sourceFilePath,
      outputFilePath,
      pythonExecutable,
      inputColumnsText,
      outputFieldsText,
      systemPrompt,
      userPrompt,
      model,
      baseUrl,
      apiKey,
      apiKeyEnv,
      concurrency,
    });
  }

  function collectTemplateFromForm(): TaskTemplate {
    return buildTemplateFromForm({
      templateId,
      templateName,
      templateDescription,
      preprocess: {
        trimWhitespace,
        collapseWhitespace,
        removeLineBreaks,
        stripHtml,
        maxChars: parseMaxChars(maxCharsText),
      },
      inputColumnsText,
      outputFieldsText,
      systemPrompt,
      userPrompt,
    });
  }

  async function refreshRunData(runId: string) {
    const [job, tasks, logs] = await Promise.all([
      engineBridge.getRunJob(runId),
      engineBridge.listRowTasks(runId),
      engineBridge.getRunLogs(runId),
    ]);
    setRunJob(job);
    setRowTasks(tasks);
    setRunLogs(logs);
    setStatusMessage(`最近刷新成功，当前状态：${job.status}`);
  }

  async function refreshTemplateCatalog() {
    setIsRefreshingTemplates(true);
    try {
      const templates = await engineBridge.listTemplates();
      setTemplateCatalog(templates);
      if (templates.length > 0 && !selectedTemplatePath) {
        setSelectedTemplatePath(templates[0].filePath);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "刷新模板列表失败。");
    } finally {
      setIsRefreshingTemplates(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function restoreAutosave() {
      try {
        const loaded = await engineBridge.loadAutosaveProject();
        if (cancelled) {
          return;
        }

        if (loaded) {
          applyProjectToForm(loaded.project, {
            setProjectName,
            setContext,
            setTemplateId,
            setTemplateName,
            setTemplateDescription,
            setTrimWhitespace,
            setCollapseWhitespace,
            setRemoveLineBreaks,
            setStripHtml,
            setMaxCharsText,
            setInputSourceMode,
            setInlineInputText,
            setSourceFilePath,
            setOutputFilePath,
            setPythonExecutable,
            setInputColumnsText,
            setOutputFieldsText,
            setSystemPrompt,
            setUserPrompt,
            setModel,
            setBaseUrl,
            setApiKey,
            setApiKeyEnv,
            setConcurrency,
          });
          setTemplateFilePath("");
          setExportTargetPath(loaded.project.outputFilePath || "");
          setAutosavePath(loaded.filePath);
          setStatusMessage(`已恢复自动保存项目：${loaded.filePath}`);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "恢复自动保存项目失败。"
          );
        }
      }

      try {
        const templates = await engineBridge.listTemplates();
        if (!cancelled) {
          setTemplateCatalog(templates);
          if (templates.length > 0) {
            setSelectedTemplatePath((currentPath) => currentPath || templates[0].filePath);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "加载模板目录失败。");
        }
      } finally {
        if (!cancelled) {
          setIsAutosaveReady(true);
        }
      }
    }

    void restoreAutosave();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAutosaveReady) {
      return;
    }

    const timer = window.setTimeout(() => {
      void engineBridge
        .saveAutosaveProject(collectProjectFromForm())
        .then((savedPath) => {
          setAutosavePath(savedPath);
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "自动保存项目失败。";
          setErrorMessage(message);
        });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [
    isAutosaveReady,
    projectName,
    templateId,
    templateName,
    templateDescription,
    trimWhitespace,
    collapseWhitespace,
    removeLineBreaks,
    stripHtml,
    maxCharsText,
    inputSourceMode,
    inlineInputText,
    sourceFilePath,
    outputFilePath,
    pythonExecutable,
    context,
    model,
    baseUrl,
    apiKey,
    apiKeyEnv,
    concurrency,
    inputColumnsText,
    outputFieldsText,
    systemPrompt,
    userPrompt,
  ]);

  useEffect(() => {
    if (!activeRunId) {
      return;
    }

    void refreshRunData(activeRunId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "刷新运行状态失败。";
      setErrorMessage(message);
    });

    if (runJob?.status && runJob.status !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshRunData(activeRunId).catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "刷新运行状态失败。";
        setErrorMessage(message);
      });
    }, 2000);

    return () => window.clearInterval(timer);
  }, [activeRunId, runJob?.status]);

  useEffect(() => {
    setOutputPreflight(null);
  }, [
    inputSourceMode,
    inlineInputText,
    sourceFilePath,
    context,
    outputFieldsText,
    systemPrompt,
    userPrompt,
    templateId,
    templateName,
    templateDescription,
  ]);

  async function handleStartRun() {
    setErrorMessage("");
    if (!readyCheck.ready) {
      setErrorMessage(readyCheck.summary);
      return;
    }

    const project = buildProjectFile({
      projectName,
      context,
      templateId,
      templateName,
      templateDescription,
      preprocess: {
        trimWhitespace,
        collapseWhitespace,
        removeLineBreaks,
        stripHtml,
        maxChars: parseMaxChars(maxCharsText),
      },
      inputSourceMode,
      inlineInputRows: parsedInlineInputRows,
      sourceFilePath,
      outputFilePath,
      pythonExecutable,
      inputColumnsText,
      outputFieldsText,
      systemPrompt,
      userPrompt,
      model,
      baseUrl,
      apiKey,
      apiKeyEnv,
      concurrency,
    });

    setIsStarting(true);

    try {
      const preflightReport = await engineBridge.preflightOutput(project);
      setOutputPreflight(preflightReport);
      setLastOutputPreflightSignature(outputPreflightSignature);

      const nextReadyCheck = buildReadyCheckReport({
        inputSourceMode,
        sourceFilePath,
        inlineInputRowCount: parsedInlineInputRows.length,
        context,
        inputColumnsCount: parsedInputColumns.length,
        outputFieldsCount: parsedOutputFields.length,
        systemPrompt,
        userPrompt,
        model,
        apiKey,
        apiKeyEnv,
        concurrency,
        hasInputPreview: inputPreview.length > 0,
        isInputPreviewFresh,
        outputPreflight: preflightReport,
        isOutputPreflightFresh: true,
      });

      if (!nextReadyCheck.ready) {
        setErrorMessage(nextReadyCheck.summary);
        return;
      }

      const job = await engineBridge.startRun({ project, context });
      setRunJob(job);
      setRunLogs({ stdout: "", stderr: "" });
      setActiveRunId(job.id);
      setRowTasks([]);
      if (!outputFilePath && job.outputFilePath) {
        setOutputFilePath(job.outputFilePath);
        setExportTargetPath(job.outputFilePath);
      }
      setStatusMessage(`任务已启动：${job.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "启动任务失败。");
    } finally {
      setIsStarting(false);
    }
  }

  async function handlePreviewInput() {
    setErrorMessage("");
    if (inputSourceMode === "file" && !sourceFilePath.trim()) {
      setErrorMessage("请先选择输入文件，再预览输入。");
      return;
    }
    if (inputSourceMode === "inline" && parsedInlineInputRows.length === 0) {
      setErrorMessage("请先在程序内录入原始数据，再预览输入。");
      return;
    }
    if (parsedInputColumns.length === 0) {
      setErrorMessage("至少配置一个输入列后才能预览。");
      return;
    }

    setIsPreviewingInput(true);
    try {
      const previewRows = await engineBridge.previewInput(collectProjectFromForm(), 5);
      setInputPreview(previewRows);
      setLastInputPreviewSignature(inputPreviewSignature);
      setStatusMessage(`已生成输入预览，共展示 ${previewRows.length} 行。`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "预览输入失败。");
    } finally {
      setIsPreviewingInput(false);
    }
  }

  async function handlePreflightOutput() {
    setErrorMessage("");
    if (parsedOutputFields.length === 0) {
      setErrorMessage("至少配置一个输出字段后才能执行输出预检。");
      return;
    }

    setIsPreflightingOutput(true);
    try {
      const report = await engineBridge.preflightOutput(collectProjectFromForm());
      setOutputPreflight(report);
      setLastOutputPreflightSignature(outputPreflightSignature);
      setStatusMessage(
        report.ok
          ? `输出预检通过，共发现 ${report.issues.length} 个提示项。`
          : "输出预检发现错误，请先修复。"
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "输出预检失败。");
    } finally {
      setIsPreflightingOutput(false);
    }
  }

  function replaceInlineRows(nextRows: InlineInputRow[]) {
    setInlineInputText(serializeInlineInputRows(nextRows, parsedInputColumns));
  }

  function handleInlineCellChange(rowIndex: number, columnName: string, value: string) {
    const nextRows = parsedInlineInputRows.map((row, currentIndex) =>
      currentIndex === rowIndex
        ? {
            values: {
              ...row.values,
              [columnName]: value,
            },
          }
        : row
    );
    replaceInlineRows(nextRows);
  }

  function handleInlineDeleteRow(rowIndex: number) {
    replaceInlineRows(parsedInlineInputRows.filter((_, currentIndex) => currentIndex !== rowIndex));
    setSelectedInlineRowIndexes((current) =>
      current
        .filter((currentIndex) => currentIndex !== rowIndex)
        .map((currentIndex) => (currentIndex > rowIndex ? currentIndex - 1 : currentIndex))
    );
  }

  function handleInlineAddRow() {
    if (parsedInputColumns.length === 0) {
      setErrorMessage("请先配置输入列，再新增程序内数据。");
      return;
    }

    const nextRow = {
      values: parsedInputColumns.reduce<Record<string, string>>((result, column) => {
        result[column.name] = inlineDraftValues[column.name] || "";
        return result;
      }, {}),
    };

    const hasAnyValue = Object.values(nextRow.values).some((value) => value.trim().length > 0);
    if (!hasAnyValue) {
      setErrorMessage("新增记录前，至少填写一个单元格。");
      return;
    }

    replaceInlineRows([...parsedInlineInputRows, nextRow]);
    setInlineDraftValues(buildInlineRowValues(parsedInputColumns));
    setErrorMessage("");
    setStatusMessage("已新增一条程序内数据。");
  }

  function handleInlineClearRows() {
    setInlineInputText("");
    setInlineDraftValues(buildInlineRowValues(parsedInputColumns));
    setSelectedInlineRowIndexes([]);
    setStatusMessage("已清空程序内原始数据。");
  }

  function handleInlineToggleRowSelection(rowIndex: number, checked: boolean) {
    setSelectedInlineRowIndexes((current) => {
      if (checked) {
        return current.includes(rowIndex) ? current : [...current, rowIndex].sort((a, b) => a - b);
      }
      return current.filter((currentIndex) => currentIndex !== rowIndex);
    });
  }

  function handleInlineToggleSelectAll(checked: boolean) {
    setSelectedInlineRowIndexes(
      checked ? parsedInlineInputRows.map((_, rowIndex) => rowIndex) : []
    );
  }

  function handleInlineDeleteSelectedRows() {
    if (selectedInlineRowIndexes.length === 0) {
      setErrorMessage("请先选择要删除的行。");
      return;
    }

    const selectedSet = new Set(selectedInlineRowIndexes);
    replaceInlineRows(
      parsedInlineInputRows.filter((_, rowIndex) => !selectedSet.has(rowIndex))
    );
    setSelectedInlineRowIndexes([]);
    setErrorMessage("");
    setStatusMessage(`已删除 ${selectedInlineRowIndexes.length} 行程序内数据。`);
  }

  function handleMoveInputColumn(fromIndex: number, offset: -1 | 1) {
    const toIndex = fromIndex + offset;
    if (toIndex < 0 || toIndex >= parsedInputColumns.length) {
      return;
    }

    const nextColumns = moveArrayItem(parsedInputColumns, fromIndex, toIndex);
    setInputColumnsText(serializeInputColumns(nextColumns));

    if (parsedInlineInputRows.length > 0) {
      setInlineInputText(serializeInlineInputRows(parsedInlineInputRows, nextColumns));
    }

    setStatusMessage(
      `已调整输入列顺序：${parsedInputColumns[fromIndex].label || parsedInputColumns[fromIndex].name}`
    );
  }

  function handleAddInputColumn() {
    const nextName = makeUniqueInputColumnName(`字段${parsedInputColumns.length + 1}`, parsedInputColumns);
    const nextColumns = [
      ...parsedInputColumns,
      {
        name: nextName,
        label: nextName,
      },
    ];
    setInputColumnsText(serializeInputColumns(nextColumns));
    if (parsedInlineInputRows.length > 0) {
      setInlineInputText(serializeInlineInputRows(parsedInlineInputRows, nextColumns));
    }
    setStatusMessage(`已新增输入列：${nextName}`);
  }

  function handleUpdateInputColumn(
    columnIndex: number,
    key: "name" | "label",
    rawValue: string
  ) {
    const currentColumn = parsedInputColumns[columnIndex];
    if (!currentColumn) {
      return;
    }

    const nextColumns = [...parsedInputColumns];
    const nextColumn = { ...currentColumn };

    if (key === "name") {
      const nextName = makeUniqueInputColumnName(rawValue || currentColumn.name, parsedInputColumns, columnIndex);
      if (nextName === currentColumn.name) {
        return;
      }
      nextColumn.name = nextName;
      if (!nextColumn.label || nextColumn.label === currentColumn.name) {
        nextColumn.label = nextName;
      }
      nextColumns[columnIndex] = nextColumn;

      const nextRows = parsedInlineInputRows.map((row) => {
        const nextValues = { ...row.values };
        nextValues[nextName] = nextValues[currentColumn.name] || "";
        delete nextValues[currentColumn.name];
        return { values: nextValues };
      });
      setInputColumnsText(serializeInputColumns(nextColumns));
      setInlineInputText(serializeInlineInputRows(nextRows, nextColumns));
      setInlineDraftValues((current) => {
        const nextDraftValues = { ...current };
        nextDraftValues[nextName] = nextDraftValues[currentColumn.name] || "";
        delete nextDraftValues[currentColumn.name];
        return nextDraftValues;
      });
      return;
    }

    nextColumn.label = rawValue.trim() || nextColumn.name;
    nextColumns[columnIndex] = nextColumn;
    setInputColumnsText(serializeInputColumns(nextColumns));
  }

  function handleDeleteInputColumn(columnIndex: number) {
    const currentColumn = parsedInputColumns[columnIndex];
    if (!currentColumn) {
      return;
    }

    const nextColumns = parsedInputColumns.filter((_, index) => index !== columnIndex);
    setInputColumnsText(serializeInputColumns(nextColumns));
    if (nextColumns.length === 0) {
      setInlineInputText("");
      setSelectedInlineRowIndexes([]);
    } else if (parsedInlineInputRows.length > 0) {
      setInlineInputText(serializeInlineInputRows(parsedInlineInputRows, nextColumns));
    }
    setStatusMessage(`已删除输入列：${currentColumn.label || currentColumn.name}`);
  }

  function handleAddOutputField() {
    const nextName = makeUniqueOutputFieldName(`字段${parsedOutputFields.length + 1}`, parsedOutputFields);
    const nextFields: OutputField[] = [
      ...parsedOutputFields,
      {
        name: nextName,
        type: "string",
        required: true,
      },
    ];
    setOutputFieldsText(serializeOutputFields(nextFields));
    setStatusMessage(`已新增输出字段：${nextName}`);
  }

  function handleUpdateOutputField(
    fieldIndex: number,
    key: "name" | "type" | "required" | "defaultValue",
    rawValue: string | boolean
  ) {
    const currentField = parsedOutputFields[fieldIndex];
    if (!currentField) {
      return;
    }

    const nextFields = [...parsedOutputFields];
    const nextField: OutputField = { ...currentField };

    if (key === "name") {
      nextField.name = makeUniqueOutputFieldName(String(rawValue), parsedOutputFields, fieldIndex);
    } else if (key === "type") {
      nextField.type = normalizeOutputType(String(rawValue));
    } else if (key === "required") {
      nextField.required = Boolean(rawValue);
    } else {
      nextField.defaultValue = parseDefaultValue(String(rawValue), nextField.type);
    }

    if (key === "type" && nextField.defaultValue !== undefined) {
      nextField.defaultValue = parseDefaultValue(String(nextField.defaultValue), nextField.type);
    }

    nextFields[fieldIndex] = nextField;
    setOutputFieldsText(serializeOutputFields(nextFields));
  }

  function handleDeleteOutputField(fieldIndex: number) {
    const currentField = parsedOutputFields[fieldIndex];
    if (!currentField) {
      return;
    }

    const nextFields = parsedOutputFields.filter((_, index) => index !== fieldIndex);
    setOutputFieldsText(serializeOutputFields(nextFields));
    setStatusMessage(`已删除输出字段：${currentField.name}`);
  }

  function handleInsertIntoPrompt(
    target: "system" | "user",
    insertion: string,
    label: string
  ) {
    if (target === "system") {
      const { nextValue, nextCursor } = insertTextAtCursor(
        systemPrompt,
        insertion,
        systemPromptRef.current
      );
      setSystemPrompt(nextValue);
      window.setTimeout(() => {
        if (systemPromptRef.current) {
          systemPromptRef.current.focus();
          systemPromptRef.current.setSelectionRange(nextCursor, nextCursor);
        }
      }, 0);
    } else {
      const { nextValue, nextCursor } = insertTextAtCursor(
        userPrompt,
        insertion,
        userPromptRef.current
      );
      setUserPrompt(nextValue);
      window.setTimeout(() => {
        if (userPromptRef.current) {
          userPromptRef.current.focus();
          userPromptRef.current.setSelectionRange(nextCursor, nextCursor);
        }
      }, 0);
    }

    setStatusMessage(`已插入 Prompt 片段：${label}`);
  }

  function handleApplyTaskTemplatePreset(presetKey: string) {
    const preset = findTaskTemplatePreset(presetKey);
    if (!preset) {
      setErrorMessage("未找到对应的任务模板。");
      return;
    }

    setTemplateId(preset.templateId);
    setTemplateName(preset.templateName);
    setTemplateDescription(preset.templateDescription);
    setInputColumnsText(preset.inputColumnsText);
    setOutputFieldsText(preset.outputFieldsText);
    setSystemPrompt(preset.systemPrompt);
    setUserPrompt(preset.userPrompt);
    setTemplateFilePath("");
    setSelectedTemplatePath("");
    setSelectedWizardPresetKey(preset.key);
    setInputPreview([]);
    setOutputPreflight(null);
    setLastInputPreviewSignature("");
    setLastOutputPreflightSignature("");
    setErrorMessage("");
    setStatusMessage(`已应用任务模板：${preset.title}`);
  }

  function handleInlineCellPaste(
    event: React.ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number
  ) {
    const pastedText = event.clipboardData.getData("text");
    const matrix = parseClipboardTable(pastedText);
    if (matrix.length === 0 || parsedInputColumns.length === 0) {
      return;
    }

    event.preventDefault();

    const nextRows = [...parsedInlineInputRows];
    const requiredRowCount = rowIndex + matrix.length;
    while (nextRows.length < requiredRowCount) {
      nextRows.push({
        values: buildInlineRowValues(parsedInputColumns),
      });
    }

    matrix.forEach((cells, pastedRowOffset) => {
      const targetRowIndex = rowIndex + pastedRowOffset;
      const currentRow = nextRows[targetRowIndex] || {
        values: buildInlineRowValues(parsedInputColumns),
      };
      const nextValues = { ...currentRow.values };

      cells.forEach((cellValue, pastedColumnOffset) => {
        const targetColumn = parsedInputColumns[columnIndex + pastedColumnOffset];
        if (!targetColumn) {
          return;
        }
        nextValues[targetColumn.name] = cellValue;
      });

      nextRows[targetRowIndex] = { values: nextValues };
    });

    replaceInlineRows(nextRows);
    setErrorMessage("");
    setStatusMessage(`已从第 ${rowIndex + 1} 行开始粘贴 ${matrix.length} 行数据。`);
  }

  async function handleManualRefresh() {
    if (!activeRunId) {
      return;
    }

    try {
      await refreshRunData(activeRunId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "刷新失败。");
    }
  }

  async function handleStopRun() {
    if (!activeRunId) {
      return;
    }

    setErrorMessage("");
    setIsStopping(true);

    try {
      const job = await engineBridge.stopRun(activeRunId);
      setRunJob(job);
      await refreshRunData(activeRunId);
      setStatusMessage(`任务已停止：${activeRunId}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "停止任务失败。");
    } finally {
      setIsStopping(false);
    }
  }

  async function handleExport() {
    if (!activeRunId || !exportTargetPath.trim()) {
      setErrorMessage("请先输入导出路径。");
      return;
    }

    try {
      await engineBridge.exportResult(activeRunId, exportTargetPath.trim());
      setStatusMessage(`结果已复制到：${exportTargetPath}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "导出失败。");
    }
  }

  async function handlePickSourceFile() {
    try {
      const filePath = await engineBridge.openSourceFile();
      if (filePath) {
        setInputSourceMode("file");
        setSourceFilePath(filePath);
        setStatusMessage("已选择输入文件。");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "选择输入文件失败。");
    }
  }

  async function handlePickOutputFile(target: "run" | "export") {
    try {
      const filePath = await engineBridge.chooseOutputFile();
      if (!filePath) {
        return;
      }

      if (target === "run") {
        setOutputFilePath(filePath);
      } else {
        setExportTargetPath(filePath);
      }
      setStatusMessage("已选择输出路径。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "选择输出路径失败。");
    }
  }

  async function handleSaveProject() {
    setErrorMessage("");
    setIsSavingProject(true);

    try {
      const savedPath = await engineBridge.saveProject(
        collectProjectFromForm(),
        projectFilePath || undefined
      );
      setProjectFilePath(savedPath);
      setStatusMessage(`项目已保存：${savedPath}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存项目失败。");
    } finally {
      setIsSavingProject(false);
    }
  }

  async function handleLoadProject() {
    setErrorMessage("");
    setIsLoadingProject(true);

    try {
      const loaded = await engineBridge.loadProject(projectFilePath || undefined);
      applyProjectToForm(loaded.project, {
        setProjectName,
        setContext,
        setTemplateId,
        setTemplateName,
        setTemplateDescription,
        setTrimWhitespace,
        setCollapseWhitespace,
        setRemoveLineBreaks,
        setStripHtml,
        setMaxCharsText,
        setInputSourceMode,
        setInlineInputText,
        setSourceFilePath,
        setOutputFilePath,
        setPythonExecutable,
        setInputColumnsText,
        setOutputFieldsText,
        setSystemPrompt,
        setUserPrompt,
        setModel,
        setBaseUrl,
        setApiKey,
        setApiKeyEnv,
        setConcurrency,
      });
      setExportTargetPath(loaded.project.outputFilePath || "");
      setActiveRunId("");
      setRunJob(null);
      setRowTasks([]);
      setRunLogs({ stdout: "", stderr: "" });
      setInputPreview([]);
      setOutputPreflight(null);
      setLastInputPreviewSignature("");
      setLastOutputPreflightSignature("");
      setProjectFilePath(loaded.filePath);
      setTemplateFilePath("");
      setAutosavePath("");
      setSelectedWizardPresetKey(
        findTaskTemplatePreset(loaded.project.template.id)?.key ?? ""
      );
      setStatusMessage(`项目已加载：${loaded.filePath}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载项目失败。");
    } finally {
      setIsLoadingProject(false);
    }
  }

  async function handleLoadTemplate() {
    if (!selectedTemplatePath) {
      setErrorMessage("请先选择一个模板。");
      return;
    }

    setErrorMessage("");
    setIsLoadingTemplate(true);

    try {
      const loaded = await engineBridge.loadTemplate(selectedTemplatePath);
      applyTemplateToForm(loaded, {
        setTemplateFilePath,
        setTemplateId,
        setTemplateName,
        setTemplateDescription,
        setTrimWhitespace,
        setCollapseWhitespace,
        setRemoveLineBreaks,
        setStripHtml,
        setMaxCharsText,
        setInputColumnsText,
        setOutputFieldsText,
        setSystemPrompt,
        setUserPrompt,
        setSelectedTemplatePath,
      });
      setSelectedWizardPresetKey(findTaskTemplatePreset(loaded.template.id)?.key ?? "");
      setStatusMessage(`模板已加载：${loaded.filePath}`);
      setInputPreview([]);
      setOutputPreflight(null);
      setLastInputPreviewSignature("");
      setLastOutputPreflightSignature("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载模板失败。");
    } finally {
      setIsLoadingTemplate(false);
    }
  }

  async function handleSaveTemplate() {
    setErrorMessage("");
    setIsSavingTemplate(true);

    try {
      const savedPath = await engineBridge.saveTemplate(
        collectTemplateFromForm(),
        templateFilePath || undefined
      );
      setTemplateFilePath(savedPath);
      setSelectedTemplatePath(savedPath);
      setStatusMessage(`模板已保存：${savedPath}`);
      await refreshTemplateCatalog();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存模板失败。");
    } finally {
      setIsSavingTemplate(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: 24,
        display: "grid",
        gap: 16,
        background: "#f6f8fa",
        minHeight: "100vh",
        color: "#1f2328",
      }}
    >
      <section style={sectionStyle}>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>Universal Data Refiner</h1>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          当前界面已经按桌面工具的操作顺序收敛成可视流程：先准备数据，再选任务模板，确认启动检查，最后运行和导出。
        </p>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 12,
            marginBottom: 8,
          }}
        >
          <button
            type="button"
            onClick={() => void handleLoadProject()}
            disabled={isLoadingProject}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #c7ced6",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            {isLoadingProject ? "加载中..." : "加载项目"}
          </button>
          <button
            type="button"
            onClick={() => void handleSaveProject()}
            disabled={isSavingProject}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #c7ced6",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            {isSavingProject ? "保存中..." : "保存项目"}
          </button>
        </div>
        <p style={{ margin: 0, color: "#57606a", fontSize: 13 }}>
          当前项目文件：{projectFilePath || "尚未保存"}
        </p>
        <p style={{ margin: "4px 0 0", color: "#57606a", fontSize: 13 }}>
          自动保存文件：{autosavePath || "尚未生成"}
        </p>
        <p style={{ margin: "4px 0 0", color: "#57606a", fontSize: 13 }}>
          当前模板文件：{templateFilePath || "尚未保存"}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginTop: 12,
          }}
        >
          {workflowStageCards.map((stage) => {
            const meta = readyCheckLevelMeta[stage.level];
            const isActive = activeWorkflowSectionId === stage.sectionId;
            return (
            <button
              key={stage.title}
              type="button"
              onClick={() => {
                setActiveWorkflowSectionId(stage.sectionId);
                scrollToWorkflowSection(stage.sectionId);
              }}
              style={{
                display: "grid",
                gap: 8,
                padding: 14,
                borderRadius: 12,
                border: isActive ? `2px solid ${meta.textColor}` : `1px solid ${meta.borderColor}`,
                background: meta.background,
                textAlign: "left",
                cursor: "pointer",
                boxShadow: isActive ? `0 0 0 3px ${meta.borderColor}` : "none",
                transform: isActive ? "translateY(-1px)" : "none",
                transition: "all 120ms ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontWeight: 700 }}>
                  {stage.index}. {stage.title}
                </span>
                <span
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: isActive ? meta.textColor : "#fff",
                    color: isActive ? "#fff" : meta.textColor,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {meta.label}
                </span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>{stage.summary}</div>
              <div style={{ fontSize: 12, color: "#57606a" }}>{stage.meta}</div>
            </button>
            );
          })}
        </div>
      </section>

      <section id="section-ready-check" style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>3. Ready Check</h2>
        <p style={{ marginTop: 0, color: "#57606a", fontSize: 13 }}>
          这里把输入、请求预览、输出预检和模型配置收敛成一个启动前总览。
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              borderRadius: 10,
              padding: 12,
              background: readyCheck.ready ? "#eef9f0" : "#fff8f8",
              border: `1px solid ${readyCheck.ready ? "#1a7f3733" : "#cf222e33"}`,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: readyCheck.ready ? "#1a7f37" : "#cf222e",
              }}
            >
              {readyCheck.ready ? "可以启动" : "暂不能启动"}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: "#57606a" }}>
              {readyCheck.summary}
              {readyCheck.warningCount > 0
                ? ` 当前还有 ${readyCheck.warningCount} 个待确认项。`
                : ""}
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {readyCheck.items.map((item) => {
              const meta = readyCheckLevelMeta[item.level];

              return (
                <article
                  key={item.key}
                  style={{
                    borderRadius: 10,
                    padding: 12,
                    border: `1px solid ${meta.borderColor}`,
                    background: meta.background,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <strong>{item.label}</strong>
                    <span
                      style={{
                        fontSize: 12,
                        color: meta.textColor,
                        background: "#ffffffaa",
                        borderRadius: 999,
                        padding: "2px 8px",
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#57606a", lineHeight: 1.5 }}>
                    {item.message}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>1. 输入预览</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {inputPreview.length === 0 ? (
            <p style={{ margin: 0, color: "#57606a" }}>
              还没有输入预览。点击“预览输入”后，这里会显示前 5 行清洗并拼接后的送模文本。
            </p>
          ) : (
            inputPreview.map((sample) => (
              <article
                key={`preview-${sample.rowIndex}`}
                style={{
                  border: "1px solid #d8dee4",
                  borderRadius: 10,
                  padding: 12,
                  background: "#fff",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 13, color: "#57606a" }}>
                  原始行号：{sample.rowIndex}
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {Object.entries(sample.sourceValues).map(([columnName, value]) => (
                    <div key={`${sample.rowIndex}-${columnName}`} style={{ fontSize: 13 }}>
                      <strong>{columnName}：</strong>
                      <span>{value || "空值"}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#57606a", marginBottom: 6 }}>
                    清洗后送模文本
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      background: "#f6f8fa",
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 13,
                      fontFamily: "Consolas, 'Courier New', monospace",
                    }}
                  >
                    {sample.combinedText || "空数据"}
                  </pre>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#57606a", marginBottom: 6 }}>
                    渲染后的 System Prompt
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      background: "#f6f8fa",
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 13,
                      fontFamily: "Consolas, 'Courier New', monospace",
                    }}
                  >
                    {sample.renderedSystemPrompt || "空"}
                  </pre>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#57606a", marginBottom: 6 }}>
                    渲染后的 User Prompt
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      background: "#f6f8fa",
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 13,
                      fontFamily: "Consolas, 'Courier New', monospace",
                    }}
                  >
                    {sample.renderedUserPrompt || "空"}
                  </pre>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        <div id="section-data" style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>1. 数据与项目</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={labelStyle}>
              项目名称
              <input
                style={inputStyle}
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </label>
            <div style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>原始数据输入方式</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setInputSourceMode("inline")}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border:
                      inputSourceMode === "inline"
                        ? "1px solid #1f6feb"
                        : "1px solid #c7ced6",
                    background: inputSourceMode === "inline" ? "#e7f0ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  程序内录入
                </button>
                <button
                  type="button"
                  onClick={() => setInputSourceMode("file")}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border:
                      inputSourceMode === "file"
                        ? "1px solid #1f6feb"
                        : "1px solid #c7ced6",
                    background: inputSourceMode === "file" ? "#e7f0ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  导入表格文件
                </button>
              </div>
            </div>
            <label style={labelStyle}>
              {inputSourceMode === "file" ? "输入文件路径" : "程序内原始数据"}
              {inputSourceMode === "file" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                  <input
                    style={inputStyle}
                    placeholder="D:\\data\\input.xlsx"
                    value={sourceFilePath}
                    onChange={(event) => setSourceFilePath(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => void handlePickSourceFile()}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid #c7ced6",
                      background: "#fff",
                      cursor: "pointer",
                      height: 42,
                    }}
                  >
                    选择文件
                  </button>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  <textarea
                    style={{ ...textareaStyle, minHeight: 120 }}
                    placeholder={
                      parsedInputColumns.length > 1
                        ? "先批量粘贴：每行一条记录；多列时按输入列顺序用 Tab 分隔。\n例如：主评论第一列[TAB]回复第二列"
                        : "先批量粘贴：每行一条文本，直接粘贴即可。"
                    }
                    value={inlineInputText}
                    onChange={(event) => setInlineInputText(event.target.value)}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => handleInlineAddRow()}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "1px solid #c7ced6",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      新增一行
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInlineClearRows()}
                      disabled={parsedInlineInputRows.length === 0 && !inlineInputText.trim()}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "1px solid #c7ced6",
                        background: "#fff",
                        cursor:
                          parsedInlineInputRows.length === 0 && !inlineInputText.trim()
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      清空数据
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInlineDeleteSelectedRows()}
                      disabled={selectedInlineRowIndexes.length === 0}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "1px solid #d0d7de",
                        background: "#fff",
                        cursor: selectedInlineRowIndexes.length === 0 ? "not-allowed" : "pointer",
                      }}
                    >
                      批量删除
                    </button>
                  </div>
                  {parsedInputColumns.length > 0 ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 13, color: "#57606a" }}>新增记录</div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${Math.max(parsedInputColumns.length, 1)}, minmax(140px, 1fr))`,
                          gap: 8,
                        }}
                      >
                        {parsedInputColumns.map((column) => (
                          <input
                            key={`draft-${column.name}`}
                            style={inputStyle}
                            placeholder={column.label || column.name}
                            value={inlineDraftValues[column.name] || ""}
                            onChange={(event) =>
                              setInlineDraftValues((current) => ({
                                ...current,
                                [column.name]: event.target.value,
                              }))
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 13, color: "#57606a" }}>可编辑数据表</div>
                    {parsedInputColumns.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
                        先配置输入列，下面的表格才会出现。
                      </p>
                    ) : parsedInlineInputRows.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
                        还没有可编辑的数据。你可以先粘贴多行文本，或者在上面的“新增记录”里逐列填写。
                      </p>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            border: "1px solid #d0d7de",
                            borderRadius: 8,
                            overflow: "hidden",
                            background: "#fff",
                          }}
                        >
                          <thead style={{ background: "#f6f8fa" }}>
                            <tr>
                              <th
                                style={{
                                  textAlign: "left",
                                  padding: 10,
                                  borderBottom: "1px solid #d0d7de",
                                  width: 84,
                                  fontSize: 13,
                                }}
                              >
                                <label
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={
                                      parsedInlineInputRows.length > 0 &&
                                      selectedInlineRowIndexes.length === parsedInlineInputRows.length
                                    }
                                    onChange={(event) =>
                                      handleInlineToggleSelectAll(event.target.checked)
                                    }
                                  />
                                  <span>全选</span>
                                </label>
                              </th>
                              {parsedInputColumns.map((column) => (
                                <th
                                  key={`head-${column.name}`}
                                  style={{
                                    textAlign: "left",
                                    padding: 10,
                                    borderBottom: "1px solid #d0d7de",
                                    fontSize: 13,
                                    minWidth: 180,
                                  }}
                                >
                                  {column.label || column.name}
                                </th>
                              ))}
                              <th
                                style={{
                                  textAlign: "left",
                                  padding: 10,
                                  borderBottom: "1px solid #d0d7de",
                                  width: 88,
                                  fontSize: 13,
                                }}
                              >
                                操作
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedInlineInputRows.map((row, rowIndex) => (
                              <tr key={`inline-row-${rowIndex}`}>
                                <td
                                  style={{
                                    padding: 10,
                                    borderBottom: "1px solid #d8dee4",
                                    fontSize: 13,
                                    color: "#57606a",
                                    verticalAlign: "top",
                                  }}
                                >
                                  <label
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedInlineRowIndexes.includes(rowIndex)}
                                      onChange={(event) =>
                                        handleInlineToggleRowSelection(
                                          rowIndex,
                                          event.target.checked
                                        )
                                      }
                                    />
                                    <span>{rowIndex + 1}</span>
                                  </label>
                                </td>
                                {parsedInputColumns.map((column, columnIndex) => (
                                  <td
                                    key={`inline-row-${rowIndex}-${column.name}`}
                                    style={{
                                      padding: 8,
                                      borderBottom: "1px solid #d8dee4",
                                      verticalAlign: "top",
                                    }}
                                  >
                                    <input
                                      style={inputStyle}
                                      value={row.values[column.name] || ""}
                                      onChange={(event) =>
                                        handleInlineCellChange(
                                          rowIndex,
                                          column.name,
                                          event.target.value
                                        )
                                      }
                                      onPaste={(event) =>
                                        handleInlineCellPaste(event, rowIndex, columnIndex)
                                      }
                                    />
                                  </td>
                                ))}
                                <td
                                  style={{
                                    padding: 8,
                                    borderBottom: "1px solid #d8dee4",
                                    verticalAlign: "top",
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleInlineDeleteRow(rowIndex)}
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: 8,
                                      border: "1px solid #d0d7de",
                                      background: "#fff",
                                      cursor: "pointer",
                                    }}
                                  >
                                    删除
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </label>
            {inputSourceMode === "inline" ? (
              <>
                <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
                  当前已解析 {parsedInlineInputRows.length} 行。上面的文本区适合整批导入，下面的表格支持逐格修正、直接粘贴 Excel 区域，也支持勾选多行后批量删除。
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
                  当前列顺序：
                  {parsedInputColumns.length > 0
                    ? parsedInputColumns.map((column) => column.label || column.name).join(" / ")
                    : " 请先配置输入列"}
                </p>
              </>
            ) : null}
            <label style={labelStyle}>
              输出文件路径
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <input
                  style={inputStyle}
                  placeholder="可留空，后端会自动生成 .csv 结果路径"
                  value={outputFilePath}
                  onChange={(event) => setOutputFilePath(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void handlePickOutputFile("run")}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #c7ced6",
                    background: "#fff",
                    cursor: "pointer",
                    height: 42,
                  }}
                >
                  选择路径
                </button>
              </div>
            </label>
            <label style={labelStyle}>
              任务背景
              <textarea
                style={textareaStyle}
                placeholder="这里填写本次分析的全局背景"
                value={context}
                onChange={(event) => setContext(event.target.value)}
              />
            </label>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ ...labelStyle, gap: 8 }}>
                <span>输入列配置</span>
                <div style={{ display: "grid", gap: 8 }}>
                  {parsedInputColumns.map((column, columnIndex) => (
                    <div
                      key={`column-editor-${column.name}-${columnIndex}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(120px, 1fr) minmax(120px, 1fr) auto auto auto",
                        gap: 8,
                        alignItems: "center",
                        border: "1px solid #d0d7de",
                        borderRadius: 8,
                        padding: "8px 10px",
                        background: "#fff",
                      }}
                    >
                      <input
                        style={inputStyle}
                        value={column.name}
                        onChange={(event) =>
                          handleUpdateInputColumn(columnIndex, "name", event.target.value)
                        }
                        placeholder="列名"
                      />
                      <input
                        style={inputStyle}
                        value={column.label || column.name}
                        onChange={(event) =>
                          handleUpdateInputColumn(columnIndex, "label", event.target.value)
                        }
                        placeholder="显示名"
                      />
                      <button
                        type="button"
                        onClick={() => handleMoveInputColumn(columnIndex, -1)}
                        disabled={columnIndex === 0}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #c7ced6",
                          background: "#fff",
                          cursor: columnIndex === 0 ? "not-allowed" : "pointer",
                        }}
                      >
                        上移
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveInputColumn(columnIndex, 1)}
                        disabled={columnIndex === parsedInputColumns.length - 1}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #c7ced6",
                          background: "#fff",
                          cursor:
                            columnIndex === parsedInputColumns.length - 1
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        下移
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteInputColumn(columnIndex)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #d0d7de",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => handleAddInputColumn()}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #c7ced6",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  新增输入列
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
                当前识别到 {parsedInputColumns.length} 个输入列。这里的顺序会直接影响表格列顺序、Excel 粘贴落位和最终送模拼接顺序。
              </p>
              {showAdvancedSettings ? (
                <label style={labelStyle}>
                  原始输入列定义
                  <textarea
                    style={textareaStyle}
                    value={inputColumnsText}
                    onChange={(event) => setInputColumnsText(event.target.value)}
                  />
                </label>
              ) : null}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowAdvancedSettings((current) => !current)}
                style={{
                  justifySelf: "start",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #c7ced6",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                {showAdvancedSettings ? "收起高级设置" : "展开高级设置"}
              </button>
              {showAdvancedSettings ? (
                <label style={labelStyle}>
                  Python 可执行文件
                  <input
                    style={inputStyle}
                    value={pythonExecutable}
                    onChange={(event) => setPythonExecutable(event.target.value)}
                  />
                </label>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void handlePreviewInput()}
                disabled={isPreviewingInput}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #c7ced6",
                  background: "#fff",
                  cursor: "pointer",
                  height: 42,
                }}
              >
                {isPreviewingInput ? "预览中..." : "预览输入"}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
              预览会按当前列定义和预处理规则展示前 5 行送模文本，用来确认清洗和拼接结果是否正确。
            </p>
          </div>
        </div>

        <div id="section-template" style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>2. 任务模板</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                display: "grid",
                gap: 10,
                border: "1px solid #d0d7de",
                borderRadius: 12,
                padding: 12,
                background: "#f6f8fa",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700 }}>任务向导</div>
              <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
                先选一个任务类型，再微调字段和 Prompt。卡片会直接生成一套可运行的模板骨架。
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                {taskTemplatePresets.map((preset) => {
                  const isActive = selectedWizardPresetKey === preset.key;
                  return (
                    <div
                      key={preset.key}
                      style={{
                        display: "grid",
                        gap: 10,
                        border: isActive
                          ? `2px solid ${preset.accent}`
                          : "1px solid #d0d7de",
                        borderRadius: 12,
                        padding: 14,
                        background: "#fff",
                        boxShadow: isActive
                          ? "0 0 0 3px rgba(9, 105, 218, 0.08)"
                          : "none",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{preset.title}</div>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: `${preset.accent}18`,
                            color: preset.accent,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {isActive ? "当前已用" : "推荐"}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "#57606a", minHeight: 38 }}>
                        {preset.description}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {preset.tags.map((tag) => (
                          <span
                            key={`${preset.key}-${tag}`}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              background: "#eef2ff",
                              color: "#4c1d95",
                              fontSize: 12,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontSize: 12, color: "#57606a", fontWeight: 600 }}>
                          预计输出
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {preset.outputPreview.map((fieldName) => (
                            <span
                              key={`${preset.key}-field-${fieldName}`}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 8,
                                background: "#f6f8fa",
                                border: "1px solid #d0d7de",
                                fontSize: 12,
                              }}
                            >
                              {fieldName}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApplyTaskTemplatePreset(preset.key)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 10,
                          border: `1px solid ${preset.accent}`,
                          background: isActive ? preset.accent : "#fff",
                          color: isActive ? "#fff" : preset.accent,
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {isActive ? "已应用" : "应用这个模板"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <label style={labelStyle}>
              模板目录
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <select
                  style={inputStyle}
                  value={selectedTemplatePath}
                  onChange={(event) => setSelectedTemplatePath(event.target.value)}
                >
                  <option value="">选择模板</option>
                  {templateCatalog.map((template) => (
                    <option key={template.filePath} value={template.filePath}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void refreshTemplateCatalog()}
                  disabled={isRefreshingTemplates}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #c7ced6",
                    background: "#fff",
                    cursor: "pointer",
                    height: 42,
                  }}
                >
                  {isRefreshingTemplates ? "刷新中..." : "刷新"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleLoadTemplate()}
                  disabled={!selectedTemplatePath || isLoadingTemplate}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #c7ced6",
                    background: "#fff",
                    cursor: selectedTemplatePath ? "pointer" : "not-allowed",
                    height: 42,
                  }}
                >
                  {isLoadingTemplate ? "加载中..." : "加载"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveTemplate()}
                  disabled={isSavingTemplate}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #c7ced6",
                    background: "#fff",
                    cursor: "pointer",
                    height: 42,
                  }}
                >
                  {isSavingTemplate ? "保存中..." : "保存模板"}
                </button>
              </div>
            </label>
            <label style={labelStyle}>
              模板 ID
              <input
                style={inputStyle}
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
              />
            </label>
            <label style={labelStyle}>
              模板名称
              <input
                style={inputStyle}
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
              />
            </label>
            <label style={labelStyle}>
              模板说明
              <textarea
                style={{ ...textareaStyle, minHeight: 80 }}
                value={templateDescription}
                onChange={(event) => setTemplateDescription(event.target.value)}
              />
            </label>
            <div style={{ display: "grid", gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>输入预处理</span>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={trimWhitespace}
                    onChange={(event) => setTrimWhitespace(event.target.checked)}
                  />
                  去首尾空白
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={collapseWhitespace}
                    onChange={(event) => setCollapseWhitespace(event.target.checked)}
                  />
                  压缩连续空白
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={removeLineBreaks}
                    onChange={(event) => setRemoveLineBreaks(event.target.checked)}
                  />
                  去换行
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={stripHtml}
                    onChange={(event) => setStripHtml(event.target.checked)}
                  />
                  去 HTML 标签
                </label>
              </div>
              <label style={labelStyle}>
                单条最大字符数
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  placeholder="留空表示不截断"
                  value={maxCharsText}
                  onChange={(event) => setMaxCharsText(event.target.value)}
                />
              </label>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ ...labelStyle, gap: 8 }}>
                <span>System Prompt</span>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {promptVariableTokens.map((token) => (
                      <button
                        key={`system-token-${token.value}`}
                        type="button"
                        onClick={() =>
                          handleInsertIntoPrompt("system", token.value, `${token.label}变量`)
                        }
                        style={{
                          padding: "8px 10px",
                          borderRadius: 999,
                          border: "1px solid #c7ced6",
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                        title={token.description}
                      >
                        插入 {token.value}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {systemPromptSnippets.map((snippet) => (
                      <button
                        key={`system-snippet-${snippet.label}`}
                        type="button"
                        onClick={() =>
                          handleInsertIntoPrompt(
                            "system",
                            `${systemPrompt.trim() ? "\n" : ""}${snippet.value}`,
                            snippet.label
                          )
                        }
                        style={{
                          padding: "8px 10px",
                          borderRadius: 999,
                          border: "1px solid #c7ced6",
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        {snippet.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <textarea
                ref={systemPromptRef}
                style={{ ...textareaStyle, minHeight: 120 }}
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
              />
              <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
                这里适合放角色、规则和输出约束。<code>{"{text}"}</code>、
                <code>{"{context}"}</code>、<code>{"{global_context}"}</code>
                都可以生效，但更推荐把具体任务要求写清楚，不要只堆变量。
              </p>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ ...labelStyle, gap: 8 }}>
                <span>User Prompt</span>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {promptVariableTokens.map((token) => (
                      <button
                        key={`user-token-${token.value}`}
                        type="button"
                        onClick={() =>
                          handleInsertIntoPrompt("user", token.value, `${token.label}变量`)
                        }
                        style={{
                          padding: "8px 10px",
                          borderRadius: 999,
                          border: "1px solid #c7ced6",
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                        title={token.description}
                      >
                        插入 {token.value}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {userPromptSnippets.map((snippet) => (
                      <button
                        key={`user-snippet-${snippet.label}`}
                        type="button"
                        onClick={() =>
                          handleInsertIntoPrompt(
                            "user",
                            `${userPrompt.trim() ? "\n" : ""}${snippet.value}`,
                            snippet.label
                          )
                        }
                        style={{
                          padding: "8px 10px",
                          borderRadius: 999,
                          border: "1px solid #c7ced6",
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        {snippet.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <textarea
                ref={userPromptRef}
                style={{ ...textareaStyle, minHeight: 140 }}
                value={userPrompt}
                onChange={(event) => setUserPrompt(event.target.value)}
              />
              <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
                这里适合放具体任务指令。最常见写法是把 <code>{"{text}"}</code>
                放在这里，再按需要补 <code>{"{context}"}</code>。如果任务背景已填写但
                Prompt 没引用，预检会提示你。
              </p>
            </div>
            <div
              style={{
                display: "grid",
                gap: 8,
                border: "1px solid #d0d7de",
                borderRadius: 10,
                padding: 12,
                background: "#f6f8fa",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>可用占位符</div>
              <div style={{ display: "grid", gap: 6 }}>
                {promptVariableTokens.map((token) => (
                  <div key={`prompt-help-${token.value}`} style={{ fontSize: 13, color: "#57606a" }}>
                    <code>{token.value}</code> {token.description}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ ...labelStyle, gap: 8 }}>
                <span>输出字段配置</span>
                <div style={{ display: "grid", gap: 8 }}>
                  {parsedOutputFields.map((field, fieldIndex) => (
                    <div
                      key={`output-field-${field.name}-${fieldIndex}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(140px, 1.3fr) minmax(120px, 0.8fr) auto minmax(140px, 1fr) auto",
                        gap: 8,
                        alignItems: "center",
                        border: "1px solid #d0d7de",
                        borderRadius: 8,
                        padding: "8px 10px",
                        background: "#fff",
                      }}
                    >
                      <input
                        style={inputStyle}
                        value={field.name}
                        onChange={(event) =>
                          handleUpdateOutputField(fieldIndex, "name", event.target.value)
                        }
                        placeholder="字段名"
                      />
                      <select
                        style={inputStyle}
                        value={field.type}
                        onChange={(event) =>
                          handleUpdateOutputField(fieldIndex, "type", event.target.value)
                        }
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                      </select>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(event) =>
                            handleUpdateOutputField(fieldIndex, "required", event.target.checked)
                          }
                        />
                        必填
                      </label>
                      <input
                        style={inputStyle}
                        value={field.defaultValue === undefined ? "" : String(field.defaultValue)}
                        onChange={(event) =>
                          handleUpdateOutputField(fieldIndex, "defaultValue", event.target.value)
                        }
                        placeholder="默认值"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteOutputField(fieldIndex)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #d0d7de",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => handleAddOutputField()}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #c7ced6",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  新增输出字段
                </button>
              </div>
              {showAdvancedSettings ? (
                <label style={labelStyle}>
                  原始输出字段定义
                  <textarea
                    style={{ ...textareaStyle, minHeight: 140 }}
                    value={outputFieldsText}
                    onChange={(event) => setOutputFieldsText(event.target.value)}
                  />
                </label>
              ) : null}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
              当前识别到 {parsedOutputFields.length} 个输出字段。字段类型支持
              `string / number / boolean`，默认值会按当前类型自动解释。
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
              文件导入模式会检查输入文件是否真的包含这些列；程序内录入模式会直接按这些列生成临时表。
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
              模板列表来自仓库 `templates/` 目录，当前共 {templateCatalog.length} 个模板。
            </p>
          </div>
        </div>

        <div id="section-run" style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>4. 模型与运行</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={labelStyle}>
              模型名称
              <input
                style={inputStyle}
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </label>
            <label style={labelStyle}>
              Base URL
              <input
                style={inputStyle}
                placeholder="兼容 OpenAI SDK 时再填写"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </label>
            <label style={labelStyle}>
              API Key
              <input
                style={inputStyle}
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            <label style={labelStyle}>
              并发数
              <input
                style={inputStyle}
                type="number"
                min={1}
                value={concurrency}
                onChange={(event) =>
                  setConcurrency(Math.max(1, Number(event.target.value) || 1))
                }
              />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void handlePreflightOutput()}
                disabled={isPreflightingOutput}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #c7ced6",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                {isPreflightingOutput ? "预检中..." : "输出预检"}
              </button>
              <button
                type="button"
                onClick={() => void handleStartRun()}
                disabled={isStarting || readyCheck.blockerCount > 0}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#1f6feb",
                  color: "#fff",
                  cursor: isStarting || readyCheck.blockerCount > 0 ? "not-allowed" : "pointer",
                  opacity: isStarting || readyCheck.blockerCount > 0 ? 0.7 : 1,
                }}
              >
                {isStarting ? "启动中..." : "开始运行"}
              </button>
              <button
                type="button"
                onClick={() => void handleManualRefresh()}
                disabled={!activeRunId}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #c7ced6",
                  background: "#fff",
                  cursor: activeRunId ? "pointer" : "not-allowed",
                }}
              >
                手动刷新
              </button>
              <button
                type="button"
                onClick={() => void handleStopRun()}
                disabled={!activeRunId || isStopping || runJob?.status !== "running"}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #cf222e",
                  background: "#fff",
                  color: "#cf222e",
                  cursor:
                    activeRunId && runJob?.status === "running" && !isStopping
                      ? "pointer"
                      : "not-allowed",
                }}
              >
                {isStopping ? "停止中..." : "停止任务"}
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <article
                style={{
                  border: `1px solid ${runStatusMeta[runJob?.status || "idle"].borderColor}`,
                  background: runStatusMeta[runJob?.status || "idle"].background,
                  borderRadius: 12,
                  padding: 14,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, color: "#57606a" }}>当前状态</div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: runStatusMeta[runJob?.status || "idle"].textColor,
                  }}
                >
                  {runStatusMeta[runJob?.status || "idle"].label}
                </div>
                <div style={{ fontSize: 12, color: "#57606a" }}>
                  {runJob ? `最近更新 ${runJob.updatedAt}` : "还没有启动任务"}
                </div>
              </article>
              <article
                style={{
                  border: "1px solid #d0d7de",
                  background: "#fff",
                  borderRadius: 12,
                  padding: 14,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, color: "#57606a" }}>处理进度</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {runJob ? `${runJob.completedRows} / ${runJob.totalRows}` : "0 / 0"}
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: "#eaeef2",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${runProgressPercent}%`,
                      height: "100%",
                      background: "#1f6feb",
                    }}
                  />
                </div>
              </article>
              <article
                style={{
                  border: "1px solid #d0d7de",
                  background: "#fff",
                  borderRadius: 12,
                  padding: 14,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, color: "#57606a" }}>失败行数</div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: runJob && runJob.failedRows > 0 ? "#cf222e" : "#1f2328",
                  }}
                >
                  {runJob?.failedRows || 0}
                </div>
                <div style={{ fontSize: 12, color: "#57606a" }}>
                  {latestRunError ? `最近失败行：${latestRunError.rowIndex}` : "当前没有失败记录"}
                </div>
              </article>
              <article
                style={{
                  border: "1px solid #d0d7de",
                  background: "#fff",
                  borderRadius: 12,
                  padding: 14,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, color: "#57606a" }}>结果文件</div>
                <div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-all" }}>
                  {runJob?.outputFilePath || outputFilePath || "运行后自动生成"}
                </div>
                <div style={{ fontSize: 12, color: "#57606a" }}>
                  {activeRunId ? "可在运行完成后直接导出。" : "还没有可导出的运行结果。"}
                </div>
              </article>
            </div>
            {latestRunError ? (
              <article
                style={{
                  border: "1px solid #cf222e33",
                  background: "#fff8f8",
                  borderRadius: 12,
                  padding: 14,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "#cf222e" }}>
                  最近错误
                </div>
                <div style={{ fontSize: 13, color: "#57606a" }}>
                  行号 {latestRunError.rowIndex}
                </div>
                <div style={{ fontSize: 14 }}>{latestRunError.message}</div>
              </article>
            ) : null}
            {showAdvancedSettings ? (
              <label style={labelStyle}>
                API Key 环境变量
                <input
                  style={inputStyle}
                  value={apiKeyEnv}
                  onChange={(event) => setApiKeyEnv(event.target.value)}
                />
              </label>
            ) : null}
            <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
              {statusMessage}
            </p>
            {errorMessage ? (
              <p style={{ margin: 0, color: "#cf222e", fontSize: 13 }}>
                {errorMessage}
              </p>
            ) : null}
            <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
              普通用户直接填写 API Key 就够了；只有你明确要走本机环境变量时，才需要展开高级设置。
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#57606a" }}>
              开始运行按钮只会在阻断项清空后启用；待确认项不会硬拦截，但建议先处理。
            </p>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>3. 输出预检</h2>
        <p style={{ marginTop: 0, color: "#57606a", fontSize: 13 }}>
          这里检查输出字段和 prompt 约束是否明显失配。修改模板后，建议重新跑一次预检。
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          {outputPreflight ? (
            <>
              <p style={{ margin: 0, fontSize: 13, color: outputPreflight.ok ? "#1a7f37" : "#cf222e" }}>
                {outputPreflight.ok ? "预检通过" : "预检未通过"}
                ，共发现 {outputPreflight.issues.length} 个问题或提示。
              </p>
              {outputPreflight.issues.length > 0 ? (
                outputPreflight.issues.map((issue, index) => (
                  <article
                    key={`${issue.code}-${index}`}
                    style={{
                      border: `1px solid ${issue.severity === "error" ? "#ff818266" : "#d0d7de"}`,
                      borderRadius: 10,
                      padding: 12,
                      background: issue.severity === "error" ? "#fff8f8" : "#fafbfc",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {issue.severity === "error" ? "错误" : "警告"} · {issue.code}
                    </div>
                    <div style={{ fontSize: 14 }}>{issue.message}</div>
                  </article>
                ))
              ) : (
                <p style={{ margin: 0, color: "#57606a" }}>
                  当前没有发现明显的输出定义问题。
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: 0, color: "#57606a" }}>
              还没有执行输出预检。点击“输出预检”后，这里会显示错误项和警告项。
            </p>
          )}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>4. 运行状态</h2>
        {runJob ? (
          <div style={{ display: "grid", gap: 12 }}>
            <article
              style={{
                borderRadius: 12,
                border: `1px solid ${runStatusMeta[runJob.status].borderColor}`,
                background: runStatusMeta[runJob.status].background,
                padding: 14,
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "#57606a" }}>任务 ID</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{runJob.id}</div>
                </div>
                <span
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "#fff",
                    color: runStatusMeta[runJob.status].textColor,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {runStatusMeta[runJob.status].label}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "#57606a" }}>处理进度</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {runJob.completedRows} / {runJob.totalRows}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#57606a" }}>失败行数</div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: runJob.failedRows > 0 ? "#cf222e" : "#1f2328",
                    }}
                  >
                    {runJob.failedRows}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#57606a" }}>最近更新时间</div>
                  <div style={{ fontSize: 14 }}>{runJob.updatedAt}</div>
                </div>
              </div>
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: "#ffffffaa",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${runProgressPercent}%`,
                    height: "100%",
                    background: runStatusMeta[runJob.status].textColor,
                  }}
                />
              </div>
            </article>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
              }}
            >
              <article
                style={{
                  border: "1px solid #d0d7de",
                  borderRadius: 12,
                  padding: 14,
                  background: "#fff",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, color: "#57606a" }}>输出文件</div>
                <div style={{ wordBreak: "break-all", fontSize: 14, fontWeight: 600 }}>
                  {runJob.outputFilePath || "-"}
                </div>
              </article>
              <article
                style={{
                  border: "1px solid #d0d7de",
                  borderRadius: 12,
                  padding: 14,
                  background: latestRunError ? "#fff8f8" : "#fff",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, color: "#57606a" }}>最近错误摘要</div>
                {latestRunError ? (
                  <>
                    <div style={{ fontSize: 13, color: "#cf222e", fontWeight: 700 }}>
                      行号 {latestRunError.rowIndex}
                    </div>
                    <div style={{ fontSize: 14 }}>{latestRunError.message}</div>
                  </>
                ) : (
                  <div style={{ fontSize: 14, color: "#57606a" }}>当前没有错误摘要。</div>
                )}
              </article>
            </div>
          </div>
        ) : (
          <article
            style={{
              border: "1px dashed #d0d7de",
              borderRadius: 12,
              padding: 16,
              background: "#fafbfc",
              color: "#57606a",
            }}
          >
            还没有启动任务。先完成上面的数据、模板和检查步骤，再点击“开始运行”。
          </article>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>4. 结果导出</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <label style={labelStyle}>
            导出目标路径
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <input
                style={inputStyle}
                placeholder="D:\\data\\final-result.csv"
                value={exportTargetPath}
                onChange={(event) => setExportTargetPath(event.target.value)}
              />
              <button
                type="button"
                onClick={() => void handlePickOutputFile("export")}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #c7ced6",
                  background: "#fff",
                  cursor: "pointer",
                  height: 42,
                }}
              >
                选择路径
              </button>
            </div>
          </label>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!activeRunId}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #c7ced6",
              background: "#fff",
              cursor: activeRunId ? "pointer" : "not-allowed",
              height: 42,
            }}
          >
            导出结果
          </button>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>4. 结果预览</h2>
        <p style={{ marginTop: 0, color: "#57606a", fontSize: 13 }}>
          这里只展示前 20 行，够你确认结构和错误分布，不把界面做成第二个 Excel。
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <article
              style={{
                border: "1px solid #d0d7de",
                borderRadius: 12,
                padding: 14,
                background: "#fff",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#57606a" }}>预览样本</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {resultPreviewSummary.total} 行
              </div>
              <div style={{ fontSize: 12, color: "#57606a" }}>
                只展示当前前 20 行结果，避免界面过载。
              </div>
            </article>
            <article
              style={{
                border: "1px solid #d0d7de",
                borderRadius: 12,
                padding: 14,
                background: "#fff",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#57606a" }}>成功结果</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1a7f37" }}>
                {resultPreviewSummary.succeeded}
              </div>
              <div style={{ fontSize: 12, color: "#57606a" }}>
                已返回可解析结构化结果的记录数。
              </div>
            </article>
            <article
              style={{
                border: "1px solid #d0d7de",
                borderRadius: 12,
                padding: 14,
                background: "#fff",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#57606a" }}>失败结果</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#cf222e" }}>
                {resultPreviewSummary.failed}
              </div>
              <div style={{ fontSize: 12, color: "#57606a" }}>
                有错误信息或执行失败的记录数。
              </div>
            </article>
            <article
              style={{
                border: "1px solid #d0d7de",
                borderRadius: 12,
                padding: 14,
                background: "#fff",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#57606a" }}>待确认</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {resultPreviewSummary.pending}
              </div>
              <div style={{ fontSize: 12, color: "#57606a" }}>
                还没拿到结构化结果也没有明确错误的记录数。
              </div>
            </article>
          </div>
          {resultPreviewSummary.failedTasks.length > 0 ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>失败结果</div>
              {resultPreviewSummary.failedTasks.map((rowTask) => (
                <article
                  key={`${rowTask.rowIndex}-${rowTask.status}-failed`}
                  style={{
                    border: "1px solid #cf222e33",
                    borderRadius: 12,
                    padding: 14,
                    background: "#fff8f8",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <strong>第 {rowTask.rowIndex} 行</strong>
                    <span style={{ color: "#cf222e", fontSize: 12, fontWeight: 700 }}>
                      {rowTask.status === "failed" ? "执行失败" : "返回异常"}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#57606a", marginBottom: 6 }}>
                      错误信息
                    </div>
                    <div style={{ fontSize: 14 }}>{rowTask.errorMessage || "未记录更多错误细节"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#57606a", marginBottom: 6 }}>
                      原始输入
                    </div>
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        background: "#fff",
                        borderRadius: 8,
                        padding: 10,
                        fontSize: 13,
                      }}
                    >
                      {rowTask.rawText || "-"}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {resultPreviewSummary.succeededTasks.length > 0 ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>成功结果</div>
              {resultPreviewSummary.succeededTasks.map((rowTask) => (
                <article
                  key={`${rowTask.rowIndex}-${rowTask.status}-success`}
                  style={{
                    border: "1px solid #d8dee4",
                    borderRadius: 12,
                    padding: 14,
                    background: "#fafbfc",
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <strong>第 {rowTask.rowIndex} 行</strong>
                    <span style={{ color: "#1a7f37", fontSize: 12, fontWeight: 700 }}>
                      结构化成功
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#57606a", marginBottom: 6 }}>
                      原始输入
                    </div>
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        background: "#fff",
                        borderRadius: 8,
                        padding: 10,
                        fontSize: 13,
                      }}
                    >
                      {rowTask.rawText || "-"}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {Object.entries(rowTask.parsedResult || {}).map(([key, value]) => (
                      <div
                        key={key}
                        style={{
                          border: "1px solid #d0d7de",
                          borderRadius: 10,
                          background: "#fff",
                          padding: 12,
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div style={{ fontSize: 12, color: "#57606a" }}>{key}</div>
                        <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>
                          {formatResultValue(value)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <details>
                    <summary style={{ cursor: "pointer", color: "#57606a", fontSize: 13 }}>
                      查看原始结构化 JSON
                    </summary>
                    <pre
                      style={{
                        margin: "8px 0 0",
                        whiteSpace: "pre-wrap",
                        fontSize: 13,
                        background: "#fff",
                        padding: 10,
                        borderRadius: 8,
                        overflowX: "auto",
                      }}
                    >
                      {formatParsedResult(rowTask)}
                    </pre>
                  </details>
                </article>
              ))}
            </div>
          ) : null}
          {rowTasks.length === 0 ? (
            <p style={{ margin: 0 }}>任务启动后，这里会显示结构化结果预览。</p>
          ) : null}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>4. 运行日志</h2>
        <p style={{ marginTop: 0, color: "#57606a", fontSize: 13 }}>
          这里直接读取 Python 引擎最近的标准输出和标准错误，出问题先看这里。
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <article
              style={{
                border: "1px solid #d0d7de",
                borderRadius: 12,
                padding: 14,
                background: "#fff",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#57606a" }}>最近错误</div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: logPanelSummary.recentErrors.length > 0 ? "#cf222e" : "#1f2328",
                }}
              >
                {logPanelSummary.recentErrors.length}
              </div>
              <div style={{ fontSize: 12, color: "#57606a" }}>
                识别最近错误、超时、异常和失败日志。
              </div>
            </article>
            <article
              style={{
                border: "1px solid #d0d7de",
                borderRadius: 12,
                padding: 14,
                background: "#fff",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#57606a" }}>最近重试</div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: logPanelSummary.recentRetries.length > 0 ? "#9a6700" : "#1f2328",
                }}
              >
                {logPanelSummary.recentRetries.length}
              </div>
              <div style={{ fontSize: 12, color: "#57606a" }}>
                识别模型调用的重试与 attempt 记录。
              </div>
            </article>
            <article
              style={{
                border: "1px solid #d0d7de",
                borderRadius: 12,
                padding: 14,
                background: "#fff",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#57606a" }}>时间线事件</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {logPanelSummary.recentTimeline.length}
              </div>
              <div style={{ fontSize: 12, color: "#57606a" }}>
                最近关键运行事件，混合展示标准输出和错误输出。
              </div>
            </article>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            <article
              style={{
                border: "1px solid #cf222e33",
                borderRadius: 12,
                padding: 14,
                background: "#fff8f8",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#cf222e" }}>错误摘要</div>
              {logPanelSummary.recentErrors.length > 0 ? (
                logPanelSummary.recentErrors.map((line, index) => (
                  <div
                    key={`${index}-${line}`}
                    style={{
                      background: "#fff",
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 13,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {line}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 13, color: "#57606a" }}>最近没有识别到明显错误。</div>
              )}
            </article>

            <article
              style={{
                border: "1px solid #9a670033",
                borderRadius: 12,
                padding: 14,
                background: "#fff8e6",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#9a6700" }}>重试摘要</div>
              {logPanelSummary.recentRetries.length > 0 ? (
                logPanelSummary.recentRetries.map((line, index) => (
                  <div
                    key={`${index}-${line}`}
                    style={{
                      background: "#fff",
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 13,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {line}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 13, color: "#57606a" }}>最近没有重试记录。</div>
              )}
            </article>
          </div>

          <article
            style={{
              border: "1px solid #d0d7de",
              borderRadius: 12,
              padding: 14,
              background: "#fff",
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>关键事件时间线</div>
            {logPanelSummary.recentTimeline.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                {logPanelSummary.recentTimeline.map((item, index) => (
                  <div
                    key={`${item.source}-${index}-${item.line}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "64px 1fr",
                      gap: 10,
                      alignItems: "start",
                      padding: 10,
                      borderRadius: 8,
                      background: item.source === "stderr" ? "#fff8f8" : "#f6f8fa",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: item.source === "stderr" ? "#cf222e" : "#0969da",
                      }}
                    >
                      {item.source}
                    </span>
                    <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{item.line}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#57606a" }}>当前还没有可展示的事件时间线。</div>
            )}
          </article>

          <details>
            <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
              查看原始日志
            </summary>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 12,
                marginTop: 12,
              }}
            >
              <div>
                <strong>标准输出</strong>
                <pre
                  style={{
                    margin: "8px 0 0",
                    minHeight: 180,
                    maxHeight: 320,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    background: "#0d1117",
                    color: "#c9d1d9",
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  {runLogs.stdout || "暂无输出"}
                </pre>
              </div>
              <div>
                <strong>标准错误</strong>
                <pre
                  style={{
                    margin: "8px 0 0",
                    minHeight: 180,
                    maxHeight: 320,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    background: "#0d1117",
                    color: "#ffb4b4",
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  {runLogs.stderr || "暂无错误输出"}
                </pre>
              </div>
            </div>
          </details>
        </div>
      </section>
    </main>
  );
}
