# GitHub 上线清单

## 已完成

- 首页 `README` 已与当前桌面工作台状态对齐
- 已补 `.env.example`
- 已补最小输入样例 `examples/minimal-comments.csv`
- 已清理 `dist/` 与 `__pycache__/`
- 已补充 `examples/`、`templates/`、`PROJECT_STATUS.md`、`docs/REPO_SKELETON.md` 的说明
- 已补正式 `LICENSE`
- 已补 `CONTRIBUTING.md`
- 已补 `CODE_OF_CONDUCT.md`
- 已补 `SECURITY.md`
- 已补 `docs/BUILD_RELEASE.md`
- 已补 GitHub Issue / PR 模板

## 仍需你手动完成

### 1. 初始化 Git 仓库并推到 GitHub

```bash
git init
git add .
git commit -m "chore: prepare repository for github release"
```

### 2. 补 GitHub 仓库配置

- 仓库描述
- Topics
- GitHub 仓库主页链接与 About 区域

建议 Topics：

- `llm`
- `tauri`
- `react`
- `python`
- `batch-processing`
- `csv`
- `xlsx`
- `desktop-app`

## 发布前再检查一次

- `README` 是否能让第一次访问的人 1 分钟内看懂项目
- 根目录是否还有缓存、输出结果、私有数据文件
- 示例文件是否不含真实敏感数据
- 模型配置说明是否不包含真实密钥
- 默认模板是否能跑通最小样例
- 本机是否已安装 `Rust + Cargo`，并完成 `cargo check`
