# 仓库骨架说明

## 当前目标

当前目标不是继续扩目录，而是让现有仓库结构足够适合开源发布、易于理解和后续维护。

## 当前目录职责

- `src/`
  - 桌面工作台前端
- `src/core/`
  - 领域模型与通用类型
- `src/services/`
  - 前端到桌面桥接层的窄接口
- `src-tauri/`
  - Tauri / Rust 本地文件与运行调度层
- `templates/`
  - 内置任务模板
- `examples/`
  - 最小输入样例与使用说明
- `docs/`
  - 架构、迁移、整理说明

## 当前保留的原型文件

以下文件仍然保留在仓库根目录，但角色已经更清晰：

- `universal_engine.py`
  - 当前 Python 批处理内核
- `task_config.yaml`
  - 兼容 Python 引擎的 YAML 示例配置
- `requirements.txt`
  - Python 依赖
- `qwen_batch-v2.py`
  - 历史参考代码，不属于当前主链路入口

## 下一步建议

1. 补齐 `examples/` 最小可运行样例
2. 补正式 `LICENSE` 与 GitHub 协作模板
3. 清理根目录中不必要的缓存和构建产物
4. 继续把安装包和发行说明补完整
