# Contributing Guide

Thank you for taking the time to contribute to the **Explainable Multi-Agent Kubernetes Incident Simulator**!

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Coding Standards](#coding-standards)

---

## Code of Conduct

Please be respectful and inclusive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/) v2.1.

---

## How to Contribute

1. **Report bugs** – Open a GitHub Issue with a clear title, reproduction steps, and expected vs. actual behaviour.
2. **Request features** – Open a GitHub Issue and tag it with `enhancement`.
3. **Write code** – Fork the repository, create a branch, and submit a Pull Request.

---

## Development Setup

### Prerequisites

| Tool | Minimum Version |
|------|----------------|
| Docker & Docker Compose | 24.x |
| Go | 1.22+ |
| Python | 3.11+ |
| Node.js | 20 LTS |
| Terraform | 1.6+ |

### Quick Start

```bash
# 1. Clone
git clone https://github.com/yadavanujkumar/explainable-multi-agent-kubernetes-incident-simulator.git
cd explainable-multi-agent-kubernetes-incident-simulator

# 2. Configure environment
cp .env.example .env
# Edit .env with your Slack and OpenAI credentials

# 3. Start all services
docker compose up --build
```

---

## Running Tests

```bash
# Go Orchestrator
cd orchestrator && go test -v -race ./...

# Python XAI Agent
cd agent
pip install -r requirements.txt
pip install pytest pytest-asyncio httpx
pytest tests/ -v

# TypeScript Bot
cd bot && npm ci && npm test
```

---

## Submitting a Pull Request

1. Fork the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes with clear, focused commits.
3. Ensure all existing tests still pass and add new tests where appropriate.
4. Update documentation if behaviour changes.
5. Open a Pull Request against `main`. Fill in the PR template.

All PRs must pass the automated CI pipeline (tests, lint, build) before merging.

---

## Coding Standards

### Go (Orchestrator)

- Run `go vet ./...` and `golangci-lint run` before pushing.
- Use `log/slog` for structured JSON logging.
- All public functions must have a GoDoc comment.

### Python (XAI Agent)

- Format with `ruff format .` and lint with `ruff check .`.
- Use `pydantic` models for all request/response types.
- Follow [PEP 257](https://peps.python.org/pep-0257/) docstring conventions.

### TypeScript (Bot)

- Run `npm run lint` (ESLint + `@typescript-eslint`) before pushing.
- Enable strict TypeScript mode (already configured in `tsconfig.json`).
- Avoid `any` types.
