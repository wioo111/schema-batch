# 构建与发布说明

## 目标

本文档说明如何在本地构建 SchemaBatch 的桌面应用开发版与发布版。
发布版目标是让最终用户下载 `exe/msi` 后直接使用，而不是自行安装 Python、Node.js 或 Rust。

## 前置依赖

- `Python 3.11+`（构建发布版推荐与 GitHub Actions 保持一致）
- `Node.js 18+`
- `Rust + Cargo`

Windows 下建议先确认以下命令可用：

```powershell
python --version
node --version
npm --version
cargo --version
```

## 安装依赖

```bash
npm install
pip install -r requirements.txt
```

如果要本机构建发布版，还需要允许脚本自动安装 `PyInstaller`。

## 开发态运行

```bash
npm run tauri dev
```

这会启动：

- Vite 前端开发服务器
- Tauri 桌面壳
- 本地 Python 引擎桥接流程

开发态默认允许回退到 `python schema_batch_engine.py`。发布态不会依赖这条链路。

## 发布前检查

建议至少完成以下检查：

```bash
npm run build
python -m py_compile schema_batch_engine.py
cd src-tauri
cargo check
```

## 构建桌面安装包

### 1. 构建内置引擎 exe

在仓库根目录执行：

```powershell
npm run build:engine
```

执行完成后，应生成：

- `src-tauri/binaries/schema-batch-engine.exe`

### 2. 构建桌面安装包

在仓库根目录执行：

```bash
npm run release:windows
```

构建产物会由 Tauri 输出到 `src-tauri/target/` 下的对应发布目录。

这一步会自动执行：

- 前端生产构建
- Python 引擎封装为单文件 `exe`
- Tauri 安装包构建

### 3. 发布到 GitHub

- 开发者上传 `src-tauri/target/release/bundle/` 下的 `exe/msi` 到 GitHub Release
- 普通用户只下载安装包，不下载源码 ZIP
- 普通用户运行时只需填写自己的 API Key

## 常见问题

### `cargo` 不存在

说明本机未安装 Rust，或环境变量未生效。先安装 Rust 工具链，再重新打开终端。

### 前端可以构建，但 Tauri 不能打包

先单独执行：

```bash
cd src-tauri
cargo check
```

如果这一步失败，优先修复 Rust/Tauri 环境或依赖问题。

### 模型调用失败

确认环境变量已正确配置，例如：

```powershell
$env:DASHSCOPE_API_KEY="your-api-key"
```

## 发布建议

- 发布前删除本地缓存、输出结果和私有数据
- 不要提交真实 API Key
- 使用最小样例验证默认模板可跑通
- 在 GitHub Release 中附上平台、已知限制和最小运行要求
- 把源码依赖和用户依赖分开写清楚：源码构建需要 Python，最终用户安装包不需要
