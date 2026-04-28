# Contributing

Thanks for contributing to SchemaBatch.

## Before You Start

- Read `README.md` to understand the project boundary and local setup.
- Keep changes aligned with the core workflow: import tabular data, configure a task, run model calls in batch, export structured results.
- Prefer small, reviewable pull requests over broad rewrites.

## Development Setup

### Prerequisites

- `Python 3.10+`
- `Node.js 18+`
- `Rust + Cargo`

### Install Dependencies

```bash
npm install
pip install -r requirements.txt
```

### Run The App

```bash
npm run tauri dev
```

### Run Focused Checks

```bash
npm run build
python -m py_compile schema_batch_engine.py
cd src-tauri
cargo check
```

## Scope Rules

- Keep the repository focused on the desktop batch-processing workflow.
- Do not turn the project into a SaaS platform, a generic web admin system, or a crawler-first product.
- Prefer improving templates, validation, and usability before adding heavy framework layers.

## Pull Request Guidelines

- Explain the user problem first, then the implementation.
- Include screenshots for visible UI changes.
- Add or update examples when a workflow changes.
- Avoid bundling unrelated refactors in the same pull request.
- Do not commit secrets, private datasets, generated outputs, or local cache files.

## Code Style

- Match existing naming and file organization.
- Keep comments concise and only where logic is not obvious.
- Favor clear data flow over clever abstractions.

## Documentation

- Update `README.md`, `examples/README.md`, or template docs when behavior changes.
- If a new feature needs a non-obvious setup step, document it in the same pull request.

## Reporting Issues

- Use the GitHub issue templates.
- Provide a minimal reproducible sample when possible.
- Include logs, environment details, and the exact task/template input that failed.
