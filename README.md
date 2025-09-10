# Kanban Project (Playwright smoke tests)

This folder contains a lightweight Kanban app and an automated Playwright interaction test used as a smoke test.

## Run locally

Start a static server from the repository root (for example `npx http-server kanban-project -p 8000`) and then run the test:

```powershell
# from repo root
npx http-server kanban-project -p 8000
# In a separate terminal
cd kanban-project
npm ci
npm run ci:test
```

To run the test visually (headful):

```powershell
# from kanban-project
$env:HEADFUL=1; npm run ci:test
```

## CI

The repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` that installs dependencies and runs the test.

### Status badge (GitHub Actions)

Add this to your main README to show the workflow status (replace `owner`/`repo`):

```markdown
[![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yml)
```
