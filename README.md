# Explainable Multi-Agent Kubernetes Incident Simulator

An interactive, AI-driven DevSecOps training platform. This platform dynamically provisions ephemeral Kubernetes clusters using `vcluster`, injects complex misconfigurations, and uses XAI (Explainable AI) agents to tutor engineers through real-time remediation via Slack.

## Architecture Overview
This enterprise project leverages a polyglot microservices architecture to utilize the best tools for each domain:
1. **Orchestrator (Go):** Manages lifecycle of ephemeral Kubernetes clusters (vcluster) and injects faults. Built for high concurrency and resilience.
2. **XAI Agent (Python/FastAPI):** Hosts LangChain-based AI logic. Analyzes incidents, reads K8s manifests, and explains the root cause and remediation steps without giving away the direct answer immediately.
3. **Bot / Gateway (TypeScript/Node.js):** Connects to Slack API, handling user interactions, routing commands to the Orchestrator, and passing telemetrics to the AI agent. Includes Jest for robust testing.
4. **Infrastructure (Terraform):** IAC to provision the base Kubernetes cluster that hosts the `vcluster` instances.
5. **Telemetry:** OpenTelemetry integrated for tracing interactions.

## Setup Instructions

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local bot development)
- Go 1.21+
- Python 3.10+
- Terraform

### Running Locally (Docker Compose)
1. Clone the repository.
2. Copy `.env.example` to `.env` and fill in your Slack App Token and OpenAI API Key.
3. Run `docker-compose up --build`.

### Running Tests
- **Bot (TypeScript):** `cd bot && npm install && npm test`
- **Orchestrator (Go):** `cd orchestrator && go test ./...`

## API Documentation

### Orchestrator (Go) - Port 8080
- `POST /api/v1/cluster/provision`: Starts a new vcluster instance.
- `POST /api/v1/cluster/inject-fault`: Injects a specific misconfiguration (e.g., RBAC denial).

### XAI Agent (Python) - Port 8000
- `POST /api/v1/explain`: Receives incident context and returns an explainable hint.
