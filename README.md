# Coding Arena Monorepo

A production-grade, highly-extensible Turborepo monorepo architecture for a competitive real-time multiplayer coding platform.

## Architecture & Workspaces

The platform employs a modular design structured using a Turborepo + `pnpm` workspaces layout:

```text
coding-arena/
├── apps/                        # Application Frontends
│   ├── web/                     # Developer portal (Next.js App Router + Tailwind)
│   └── admin/                   # Administrative backend panel (Next.js App Router + Tailwind)
├── services/                    # Autonomous Backend Services
│   ├── api/                     # REST API Gateway skeleton (Express + TS)
│   ├── websocket/               # Socket.IO match coordination engine (Express + Socket.IO)
│   └── judge/                   # Code compilation and validation worker (Node.js)
├── packages/                    # Shared Node/Typescript Modules
│   ├── api-contracts/           # Shared API Request/Response shapes and DTOs
│   ├── config/                  # Split configs (env, constants, feature-flags)
│   ├── database/                # Global Prisma client instance and connections
│   ├── eslint-config/           # Custom reusable ESLint configurations
│   ├── logger/                  # Global Pino logging wrapper
│   ├── sdk/                     # Client platform library wrapper
│   ├── tsconfig/                # Strict compiler preset bases
│   ├── types/                   # Shared TypeScript models and interface stubs
│   ├── ui/                      # Shared component system design skeleton
│   ├── utils/                   # System-wide utilities and helpers
│   └── validation/              # Shared Zod validation schemas
├── docker/                      # Containerized dependency configurations
│   ├── postgres/                # PostgreSQL config files
│   ├── redis/                   # Redis config files
│   ├── minio/                   # MinIO storage config files
│   ├── judge/                   # Judge execution sandbox config files
│   └── nginx/                   # Reverse proxy routing config files
├── docs/                        # Specifications, diagrams, and design records
│   └── adr/                     # Architectural Decision Records (ADRs)
└── scripts/                     # Operational build and utility scripts
```

---

## Development Workflow

We utilize a Makefile to simplify local operations.

### Core Developer Targets:

- **Start all containers**: `make docker`
- **Spin down containers**: `make docker-down`
- **Run dev pipeline**: `make dev` (Starts Turborepo live-watch hot reloading)
- **Compile all assets**: `make build`
- **Check code quality**: `make lint`
- **Apply format rules**: `make format`
- **Clean build states**: `make clean`

---

## Branching & Contribution Strategy

1. **Branch Names**:
   - `main`: Production-ready release state.
   - `develop`: Integration branch for pre-releases.
   - `feature/<name>`: Feature development branches targeting `develop`.
   - `bugfix/<name>`: Bug correction branches.
   - `adr/<number>`: Architectural adjustments.

2. **PR Pipeline**:
   - Create a branch from `develop`.
   - Implement configuration changes.
   - Run `make build` and `make lint` locally to confirm code compiles.
   - Submit a pull request to `develop`.

---

## Prerequisites

- Node.js (v18+)
- pnpm (v9.0.0+)
- Docker & Docker Compose
