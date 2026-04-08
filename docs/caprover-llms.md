# CapRover (CaptainRover) — LLM-Ready Documentation

> **Scope:** This document describes **CapRover**, the self-hosted PaaS (often mistakenly called “Captain Rover”). It is optimized for LLM ingestion: normalized terms, clear structure, minimal redundancy, and explicit operational constraints.

**Primary sources:** CapRover website + docs and official GitHub repositories. ([caprover.com][1])

---

## 1) What CapRover Is

**CapRover** is a **self-hosted Platform-as-a-Service (PaaS)** for deploying and managing web apps and databases on your own server. It provides:

* A **web dashboard** for app/service management
* A **CLI** for scripted deployments
* Built-in **reverse proxy (nginx)**, **TLS automation (Let’s Encrypt)**, and operational helpers like monitoring integrations (e.g., NetData mentioned in the repo) ([GitHub][2])

**Core promise:** simple deploy experience (often “Heroku-like”) while remaining **Docker-based** and “no lock-in” (removing CapRover should not break running containers). ([GitHub][2])

---

## 2) Key Concepts and Terminology

### 2.1 “App”

In CapRover, an **App** is a deployable unit (usually a containerized web service) that can be built from source (templates/buildpacks or Dockerfile) or deployed from an image.

### 2.2 Captain Definition File (`captain-definition`)

A small JSON file placed at your project root that tells CapRover **how to build and deploy**. It supports:

* Template-based builds (`templateId`)
* Or custom builds via `dockerfilePath` (deploy any language/framework that Docker supports) ([caprover.com][3])

### 2.3 One-Click Apps

A catalog mechanism to deploy popular services (e.g., WordPress, MongoDB, Postgres, Redis, etc.) quickly. ([caprover.com][4])

### 2.4 CLI (`caprover`)

The command-line tool supports multiple deployment methods (captain-definition, Dockerfile, tarball, image name). ([GitHub][5])

---

## 3) Architecture Overview

CapRover is built around **Docker** and a managed routing/TLS layer:

* **Docker** orchestrates app containers.
* **nginx** acts as reverse proxy / web server manager.
* **Let’s Encrypt** provides automated TLS (common default flow). ([GitHub][2])

Operationally, CapRover exposes a dashboard and API/CLI for:

* Deploying new versions
* Scaling instances
* Setting environment variables
* Configuring ports/domains
* Managing persistent directories/volumes (via UI flows) ([caprover.com][1])

---

## 4) Installation and Versioning Constraints

### 4.1 Server setup

CapRover is designed to be installed on a VPS/bare-metal server where Docker is available. (Install steps live in official docs; this section focuses on constraints and what to record for reproducibility.) ([caprover.com][1])

### 4.2 Notable upgrade constraint (example)

CapRover **v1.12.0** (released **11 Nov 2025**) notes a **minimum Docker API version of 1.43** requirement. This is important for upgrade playbooks and compatibility checks. ([GitHub][6])

**LLM ingestion note:** treat version constraints as mutable; always verify against current release notes for the deployed version.

---

## 5) Deployment Workflows

### 5.1 CLI deployment (recommended for feedback)

CapRover docs recommend deploying with the CLI because it can surface build failures more directly. Typical flow:

1. Ensure `captain-definition` exists in repo root.
2. Run:

   * `caprover deploy`
3. Answer interactive prompts (server, app name, branch/path). ([caprover.com][7])

### 5.2 Deployment methods supported (high level)

* From local repo via CLI upload/build
* From Dockerfile
* From tar file
* From image name ([GitHub][5])

### 5.3 CI/CD integration (example: GitHub Actions)

CapRover docs describe deploying directly from GitHub using a community-maintained GitHub Action and secrets like `APP_NAME`. ([caprover.com][8])

---

## 6) Captain Definition File: Practical Reference

### 6.1 Minimal example (template-based)

```json
{
  "schemaVersion": 2,
  "templateId": "node/8.7.0"
}
```

([caprover.com][9])

### 6.2 Dockerfile-based example (common pattern)

```json
{
  "schemaVersion": 2,
  "dockerfilePath": "./Dockerfile"
}
```

This pattern is referenced in CapRover ecosystem guides and aligns with the “deploy any language via Dockerfile” capability. ([caprover.com][3])

**Operational rule:** if you need nonstandard runtimes or multi-step builds, prefer `dockerfilePath` (and treat `templateId` as an optimization for common stacks).

---

## 7) One-Click Apps Catalog

CapRover supports “One-Click Apps” for rapid provisioning of common services (databases, CMS, tooling). The official docs list examples and mention a growing GitHub-backed repository/catalog. ([caprover.com][4])

**Typical use cases:**

* Stand up Postgres/Redis/MongoDB quickly for an app
* Deploy WordPress quickly
* Provide admin UIs (e.g., database GUIs) as separate services

---

## 8) HTTPS and TLS Notes

* CapRover commonly uses **Let’s Encrypt** automation as part of its managed web server layer. ([GitHub][2])
* Some users want alternative TLS termination patterns (e.g., Cloudflare or external proxies), which appears in community discussions/issues; treat this as “possible but not the default happy path” and confirm per current docs/issues when implementing. ([GitHub][10])

---

## 9) Operational Capabilities to Capture in Runbooks

When documenting a real deployment, record:

* CapRover version (e.g., v1.12.0) and Docker API version compatibility ([GitHub][6])
* Domain/DNS strategy (direct vs CDN proxy)
* TLS strategy (Let’s Encrypt vs external termination)
* Backup strategy for:

  * persistent volumes/directories
  * database one-click apps data paths
* Deployment method (CLI vs CI vs dashboard upload) ([caprover.com][1])

---

## 10) Normalized Glossary (LLM-friendly)

* **CapRover:** Self-hosted PaaS for Docker-based deployments.
* **Dashboard:** Web UI for creating/managing apps and settings.
* **CLI:** `caprover` tool for scripted deployments.
* **App:** A managed deployable service (usually a container behind nginx).
* **One-Click App:** Prepackaged service template for rapid deployment.
* **Captain Definition File:** `captain-definition` JSON controlling build/deploy.
* **Template:** Predefined build configuration (Node/PHP/Python/Ruby etc.).
* **Dockerfile deploy:** Custom build route for any language/runtime. ([caprover.com][3])

---

## 11) Structured Fact Pack (JSON for Retrieval / Tooling)

```json
{
  "product": "CapRover",
  "aliases": ["CaptainRover", "caprover"],
  "category": ["self-hosted", "PaaS", "application deployment", "web server manager"],
  "core_dependencies": ["Docker", "nginx", "Let's Encrypt"],
  "interfaces": ["Web dashboard", "CLI"],
  "deploy_inputs": [
    "captain-definition (schemaVersion: 2)",
    "Dockerfile",
    "tarball",
    "container image name"
  ],
  "features": [
    "one-click apps catalog",
    "easy app deploy from source",
    "reverse proxy routing",
    "TLS automation",
    "scaling/instance management"
  ],
  "version_notes": [
    {
      "version": "v1.12.0",
      "date": "2025-11-11",
      "note": "Minimum Docker API 1.43 required"
    }
  ]
}
```

([GitHub][6])

---

[1]: https://caprover.com/?utm_source=chatgpt.com "CapRover · Scalable, Free and Self-hosted PaaS!"
[2]: https://github.com/caprover/caprover?utm_source=chatgpt.com "caprover/caprover: Scalable PaaS (automated Docker ..."
[3]: https://caprover.com/docs/captain-definition-file.html?utm_source=chatgpt.com "Captain Definition File"
[4]: https://caprover.com/docs/one-click-apps.html?utm_source=chatgpt.com "One-Click Apps"
[5]: https://github.com/caprover/caprover-cli?utm_source=chatgpt.com "GitHub - caprover/caprover-cli: Command Line Interface for ..."
[6]: https://github.com/caprover/caprover/releases?utm_source=chatgpt.com "Releases · caprover/caprover"
[7]: https://caprover.com/docs/deployment-methods.html?utm_source=chatgpt.com "Deployment Methods"
[8]: https://caprover.com/docs/ci-cd-integration/deploy-from-github.html?utm_source=chatgpt.com "Build, Test and Deploy from GitHub"
[9]: https://caprover.com/docs/cli-commands.html?utm_source=chatgpt.com "CLI Commands"
[10]: https://github.com/caprover/caprover/issues/1057?utm_source=chatgpt.com "HTTPS - non \"Let's Encrypt\" support #1057"

---

## 12) Cooklang Kitchen Integration (This Repository)

This repository is configured for CapRover Dockerfile deployment.

### Files used by CapRover

- `captain-definition`
- `Dockerfile`
- `pyproject.toml`
- `src/cooklang_kitchen/wsgi.py`

### Runtime behavior

- App server: `gunicorn`
- Bind address: `0.0.0.0:${PORT:-80}`
- Flask app object: `cooklang_kitchen.wsgi:app`

### Required app env vars

- `SECRET_KEY` (required in production)

### Optional app env vars

- `DB_PATH` (default `/app/data/recipes.db` inside container)
- `PASSWORD_FILE` (default `/app/data/.admin_password`)
- `DATA_DIR` (default `/app/data`)

### Persistence recommendation

Create a persistent directory mount for `/app/data` in CapRover, otherwise SQLite data resets when containers are recreated.
