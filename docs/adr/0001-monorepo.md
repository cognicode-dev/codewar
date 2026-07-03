# ADR 1: Monorepo Workspace Strategy

## Status

Accepted

## Context

The platform consists of multiple web portals (web client, admin panel), backend services (Express API, Socket.IO coordinator, Node Judge runner), and shared libraries (database client, typescript presets, ui component system, utility packages). Working in isolated repositories slows down development iteration due to package publishing overhead and dependency version mismatch.

## Decision

We adopt a single monorepo workspace managed with Turborepo and pnpm workspaces.

## Consequences

- Single repository simplifies dependency updating and atomic refactoring.
- Build/dev task execution pipelines are centralized and cached via Turborepo.
- PNPM handles workspace linking out-of-the-box, ensuring zero deployment publishing friction.
