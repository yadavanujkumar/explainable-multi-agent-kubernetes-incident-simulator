# Explainable Multi-Agent Kubernetes Incident Simulator

> An enterprise-grade, AI-driven DevSecOps training platform that dynamically provisions ephemeral Kubernetes clusters, injects realistic misconfigurations, and uses Explainable AI (XAI) agents to mentor engineers through real-time remediation via Slack.

[![CI](https://github.com/yadavanujkumar/explainable-multi-agent-kubernetes-incident-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/yadavanujkumar/explainable-multi-agent-kubernetes-incident-simulator/actions/workflows/ci.yml)
[![Security](https://github.com/yadavanujkumar/explainable-multi-agent-kubernetes-incident-simulator/actions/workflows/security.yml/badge.svg)](https://github.com/yadavanujkumar/explainable-multi-agent-kubernetes-incident-simulator/actions/workflows/security.yml)

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Slack Commands](#slack-commands)
- [API Reference](#api-reference)
- [Running Tests](#running-tests)
- [Infrastructure](#infrastructure)
- [Security](#security)
- [Contributing](#contributing)

---

## Architecture

The platform follows a **polyglot microservices** design, pairing each domain with the best-suited language and framework.

```
┌─────────────┐   /simulate   ┌─────────────────────┐   POST /provision  ┌──────────────────────┐
│  Slack User │──────────────▶│  Bot / Gateway       │───────────────────▶│  Orchestrator (Go)   │
└─────────────┘               │  (TypeScript/Bolt)   │                    │  Port 8080           │
                              │  Port 3000           │◀───────────────────│  • Provisions vcluster│
                              └──────────┬───────────┘   cluster_id        │  • Injects faults    │
                                         │                                 └──────────────────────┘
                                         │ POST /explain
                                         ▼
                              ┌─────────────────────┐
                              │  XAI Agent (Python)  │
                              │  FastAPI · Port 8000 │
                              │  • LangChain + OpenAI│
                              │  • Socratic hints    │
                              └─────────────────────┘
```

| Component | Language | Framework | Purpose |
|-----------|----------|-----------|---------|
| **Orchestrator** | Go 1.22 | `net/http` + OpenTelemetry | Cluster lifecycle, fault injection |
| **XAI Agent** | Python 3.11 | FastAPI + LangChain + OpenAI | Explainable AI reasoning |
| **Bot / Gateway** | TypeScript | Slack Bolt + Axios | Slack integration, command routing |
| **Infrastructure** | HCL | Terraform + Helm + Kubernetes | Base cluster provisioning (IaC) |

---

## Prerequisites

| Tool | Minimum Version |
|------|----------------|
| Docker & Docker Compose | 24.x |
| Go | 1.22+ (local dev) |
| Python | 3.11+ (local dev) |
| Node.js | 20 LTS (local dev) |
| Terraform | 1.6+ (infra deployment) |

---

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/yadavanujkumar/explainable-multi-agent-kubernetes-incident-simulator.git
cd explainable-multi-agent-kubernetes-incident-simulator
cp .env.example .env
# Edit .env — set SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, OPENAI_API_KEY
```

### 2. Start all services

```bash
docker compose up --build
```

Services start in dependency order (orchestrator → agent → bot). Health checks ensure each service is ready before the next starts.

| Service | URL |
|---------|-----|
| Slack Bot | `http://localhost:3000` |
| XAI Agent (API docs) | `http://localhost:8000/docs` |
| Orchestrator | `http://localhost:8080` |

### 3. Configure your Slack App

1. Create a new Slack App at [api.slack.com](https://api.slack.com/apps).
2. Add a Bot Token Scope: `commands`, `chat:write`.
3. Create Slash Commands: `/simulate`, `/hint`, `/explain`.
4. Set the Request URL to your public bot endpoint (use [ngrok](https://ngrok.com/) for local dev).
5. Install the app to your workspace.

---

## Slack Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/simulate <level>` | Start a training session. Level is 1–5. | `/simulate 3` |
| `/hint <question>` | Ask the AI tutor for a guided hint. | `/hint Why is my pod getting a 403?` |
| `/explain <topic>` | Get a background explanation of a K8s concept. | `/explain NetworkPolicy` |

---

## API Reference

### Orchestrator — Port 8080

#### `GET /healthz`
Service health check.

**Response `200`**
```json
{ "status": "ok", "timestamp": "2024-01-15T10:00:00Z", "version": "1.0.0" }
```

#### `POST /api/v1/cluster/provision`
Provisions an ephemeral vcluster for a user.

**Request**
```json
{ "user_id": "U12345", "level": 2 }
```

**Response `202 Accepted`**
```json
{ "cluster_id": "vcluster-U12345", "status": "provisioning", "message": "..." }
```

#### `POST /api/v1/cluster/inject-fault`
Injects a misconfiguration into an active cluster.

**Request**
```json
{ "cluster_id": "vcluster-U12345", "fault_type": "rbac-denial" }
```

**Response `200 OK`**
```json
{ "cluster_id": "vcluster-U12345", "fault_type": "rbac-denial", "status": "injected" }
```

---

### XAI Agent — Port 8000

Full interactive API docs: `http://localhost:8000/docs`

#### `GET /healthz`
Service health check.

#### `POST /api/v1/explain`
Generates a pedagogical hint for the given incident context.

**Request**
```json
{
  "cluster_id": "vcluster-U12345",
  "misconfig_type": "rbac-denial",
  "user_query": "Why is my pod getting a 403 Forbidden?"
}
```

**Response `200 OK`**
```json
{
  "explanation": "RBAC (Role-Based Access Control) governs what API actions ...",
  "suggested_hint": "Inspect the RoleBinding in your namespace and verify ..."
}
```

---

## Running Tests

```bash
# Go Orchestrator (with race detector)
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

## Infrastructure

Terraform provisions the base Kubernetes cluster and simulator namespace:

```bash
cd infra
terraform init
terraform plan -var="kubeconfig_path=~/.kube/config"
terraform apply
```

Dynamic vcluster provisioning is handled at runtime by the Go Orchestrator via the Kubernetes API. The Terraform configuration sets up the namespace, RBAC, and a default-deny NetworkPolicy.

---

## Security

See [SECURITY.md](SECURITY.md) for the full security policy, vulnerability reporting process, and controls in place.

Key controls:
- All containers run as **non-root users**
- Strict input validation on all API endpoints
- Automated dependency vulnerability scanning (CI)
- CodeQL SAST analysis (CI)
- Network isolation via Docker network and Kubernetes NetworkPolicies

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and the pull request process.

