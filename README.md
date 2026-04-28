# SchemaBatch

[![Release](https://img.shields.io/github/v/release/wioo111/schema-batch?label=Release)](https://github.com/wioo111/schema-batch/releases/tag/v0.1.3)
[![Windows](https://img.shields.io/badge/Windows-x64-blue)](https://github.com/wioo111/schema-batch/releases/tag/v0.1.3)
[![License](https://img.shields.io/github/license/wioo111/schema-batch?label=License)](https://github.com/wioo111/schema-batch/blob/main/LICENSE)

一个面向开源发布的桌面式 LLM 批处理工具。

它只做一条主链路：

> 导入表格或直接录入文本 -> 配置任务模板 -> 批量调用模型 -> 导出结构化结果

项目当前定位是一个小而清晰的本地应用，不做大而全平台，不做网页后台，也不把爬虫当第一阶段主线。

## 下载

- Windows 安装包下载：[v0.1.3 Release](https://github.com/wioo111/schema-batch/releases/tag/v0.1.3)
- 推荐下载：`SchemaBatch_0.1.0_x64-setup.exe`
- 备选安装包：`SchemaBatch_0.1.0_x64_en-US.msi`
- 适用人群：普通用户直接安装使用，不需要单独安装 `Python / Node.js / Rust`
- 运行前准备：首次使用只需要填写你自己的模型 API Key

## 项目适合做什么

- 评论、问卷、访谈、舆情文本的结构化分析
- 主题分类、观点抽取、情感识别、摘要生成
- 任意“表格输入 -> 结构化输出”的轻量批处理任务

## 当前状态

仓库已经不是单纯的 Python 脚本原型。

当前代码已经具备一套可运行的桌面工作台骨架：

- `React + TypeScript + Vite` 前端工作台
- `Tauri + Rust` 本地桌面桥接层
- `Python` 批处理引擎
- 发布版内置引擎封装
- 图形化流程工作台
- 程序内数据录入与表格编辑
- 模板向导、Ready Check、结果预览、日志面板

当前仍然处于开源 MVP 阶段，但已经开始收口发布版链路：桌面安装包会内置批处理引擎，不要求最终用户手动安装 Python。

## 已有能力

- `CSV / XLSX / XLS` 导入与导出
- 程序内原始数据录入、二维粘贴、批量删行
- 输入列与输出字段的图形化编辑
- Prompt 变量插入、模板片段插入、模板向导
- 输入预处理、输入预览、请求预览、输出预检
- Ready Check 总览
- 有界并发、失败重试、超时控制
- 中间结果落盘、日志读取、停止任务
- 结果预览、错误高亮、运行状态图形化展示

## 运行方式

### 方式一：桌面工作台开发版

适合体验当前主界面。

#### 1. 安装依赖

- `Python 3.10+`
- `Node.js 18+`
- `Rust + Cargo`

#### 2. 安装前端与 Python 依赖

```bash
npm install
pip install -r requirements.txt
```

#### 3. 配置环境变量

复制 `.env.example`，按你自己的模型服务填写。

Windows PowerShell 示例：

```powershell
$env:DASHSCOPE_API_KEY="your-api-key"
```

#### 4. 启动桌面开发版

```bash
npm run tauri dev
```

安装包构建与发布说明见 `docs/BUILD_RELEASE.md`。

### 方式二：下载安装包直接使用

适合普通用户。

- 去 GitHub 的 `Releases` 页面下载 Windows 安装包：[v0.1.3 Release](https://github.com/wioo111/schema-batch/releases/tag/v0.1.3)
- 安装后直接打开应用
- 运行时只需要你自己的模型 API Key
- 不需要单独安装 `Python / Node.js / Rust`

### 方式三：直接运行 Python 引擎

适合只验证底层批处理能力。

```powershell
python .\schema_batch_engine.py `
  -c .\examples\comment-analysis.task.yaml `
  -i .\examples\minimal-comments.csv `
  -o .\output.xlsx `
  --context "本次任务的全局背景" `
  --model "qwen-plus"
```

## 仓库结构

```text
project-root/
  src/              React 工作台
  src-tauri/        Tauri/Rust 桌面桥接层
  templates/        内置任务模板
  examples/         示例输入与说明
  docs/             发布与补充说明
  schema_batch_engine.py
```

### 关键文件

- `src/app/App.tsx`
  - 当前桌面工作台主界面
- `src-tauri/src/engine.rs`
  - 本地文件、预览、预检、运行调度桥接
- `schema_batch_engine.py`
  - 真正执行 LLM 批处理的引擎
- `templates/comment-analysis.template.json`
  - 当前内置模板样例
- `examples/comment-analysis.task.yaml`
  - Python 引擎兼容的示例 YAML 配置

## 当前边界

### 当前主线

- 把分析引擎做稳
- 把配置模板做清楚
- 把仓库做得易懂、易跑、易复用

### 当前不做

- 在线 SaaS
- 账号系统
- 多人协作
- 大而全平台化架构
- 复杂采集链路
- 强绑定单一模型厂商

## 模板扩展方式

优先改模板，不优先改引擎。

通常只需要调整三块：

1. 输入列定义
2. `system_prompt / user_prompt`
3. 输出字段定义

## 开源仓库基线

- 已补 `LICENSE`
- 已补 `.github/CONTRIBUTING.md`
- 已补 `.github/CODE_OF_CONDUCT.md`
- 已补 `.github/SECURITY.md`
- 已补 `docs/BUILD_RELEASE.md`
- 已补 GitHub Issue / PR 模板
- 仍建议继续增加更多 `examples/` 最小样例

## 一句话总结

`SchemaBatch` 做的不是平台，而是一个面向普通用户的本地批处理工具：

> 把表格文本稳定送进 LLM，再把结果可靠落成结构化输出。
