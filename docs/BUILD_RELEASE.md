# 构建与发布说明

## 目标

本文档说明如何在本地构建 Universal Data Refiner 的桌面应用开发版与发布版。

## 前置依赖

- `Python 3.10+`
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

## 开发态运行

```bash
npm run tauri dev
```

这会启动：

- Vite 前端开发服务器
- Tauri 桌面壳
- 本地 Python 引擎桥接流程

## 发布前检查

建议至少完成以下检查：

```bash
npm run build
python -m py_compile universal_engine.py
cd src-tauri
cargo check
```

## 构建桌面安装包

在仓库根目录执行：

```bash
npm run tauri build
```

构建产物会由 Tauri 输出到 `src-tauri/target/` 下的对应发布目录。

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
