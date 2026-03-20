# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ Yes |
| Older branches | ❌ No |

---

## Reporting a Vulnerability

**Please do NOT open a public GitHub Issue for security vulnerabilities.**

Instead, report security issues via **GitHub's private vulnerability reporting** feature:

1. Go to the repository's **Security** tab.
2. Click **"Report a vulnerability"**.
3. Provide as much detail as possible: affected component, reproduction steps, and potential impact.

We aim to acknowledge receipt within **48 hours** and provide a remediation timeline within **7 days**.

---

## Security Controls

### Secrets Management

- **Never commit secrets** to the repository.
- Use `.env` (gitignored) locally, and a secrets manager (AWS Secrets Manager, HashiCorp Vault, or Kubernetes Secrets) in production.
- Rotate all credentials immediately if exposed.

### Container Security

- All service containers run as **non-root users**.
- Docker images are based on `alpine` / `slim` variants to minimise attack surface.
- Multi-stage builds ensure no build tools are present in the runtime image.

### Network Security

- Services communicate over an isolated Docker network in development.
- In production, Kubernetes **NetworkPolicies** enforce a default-deny posture.
- The Terraform configuration applies a `default-deny-ingress` NetworkPolicy to the simulator namespace.

### Input Validation

- The Go Orchestrator validates all inputs with strict regex patterns before processing.
- The Python Agent uses Pydantic field validators to reject malformed requests.
- The TypeScript Bot validates command arguments before forwarding to downstream services.

### Dependency Scanning

- Automated dependency scanning runs on every PR via the **Security** GitHub Actions workflow.
- Python: `pip-audit`
- Node.js: `npm audit`
- Go: `govulncheck`
- SAST: GitHub CodeQL (Go, Python, JavaScript/TypeScript)

---

## Known Limitations

- The K8s vcluster provisioning in the Orchestrator is currently a **stub** implementation. Production deployments must replace it with authenticated `client-go` calls and proper RBAC controls.
- The OpenAI API key is passed as an environment variable. For production, use a dedicated secrets manager and rotate keys regularly.
