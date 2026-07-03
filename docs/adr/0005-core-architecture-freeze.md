# ADR 0005 — Core Architecture Freeze

## Status

Accepted

## Context

The platform has reached a point where its foundational architecture is complete and validated through integration tests.

The following systems have been implemented and are considered mature:

- Monorepo architecture
- Authentication
- User/Profile separation
- Versioned Problem Service
- Judge execution pipeline
- Submission + SubmissionJob model
- Queue architecture
- Event Broker
- Domain Event layer
- WebSocket infrastructure
- Connection Registry
- Session Manager
- Room finite state machine
- Collaborative editor
- Operational Transformation engine

These systems form the platform's core infrastructure and are depended upon by every future gameplay feature.
Repeated architectural refactoring at this stage would introduce unnecessary instability without providing proportional value.

## Decision

The above components are declared architecturally stable.
Future development should extend the platform by introducing new modules rather than redesigning these foundational systems.

New features—including matchmaking, MMR, match lifecycle, friends, chat, spectators, replay, tournaments, achievements, analytics, and notifications—must integrate through the existing extension points whenever possible.

The preferred extension points are:

- Domain Events
- Event Broker
- Shared API contracts
- Queue workers
- Repository interfaces
- Service layer boundaries
- WebSocket event handlers

Changes that modify public interfaces or architectural boundaries should require a new ADR explaining the motivation and tradeoffs.

### Frozen Components

The following architectural boundaries are considered stable:

- **Core Platform**: Turborepo workspace layout, Package boundaries, Shared contracts, Validation layer, Logging infrastructure
- **Authentication**: User identity model, Profile separation, Refresh-token architecture, JWT authentication flow
- **Problem Domain**: Immutable problem identity, Versioned problem specifications
- **Judge**: Sandbox abstraction, Language registry, Execution engine, Result parser
- **Submission Pipeline**: Submission, SubmissionJob, Queue abstraction
- **Realtime**: Event Broker, Domain Event layer, Connection Registry, Session Manager, Room Manager, Room FSM
- **Collaborative Editing**: Operation Log, Editor Engine, Operational Transformation pipeline

### Allowed Evolution

Future work may:

- add new modules
- add new events
- add new DTOs
- add new services
- add new workers
- add new room states
- add new game modes
- add supported languages
- optimize implementations
- improve performance
- improve observability

These changes should preserve existing architectural contracts.

### Breaking Changes

Breaking changes to the frozen architecture should be considered only when they provide clear long-term value.
Such changes require:

- a new ADR
- migration strategy
- compatibility assessment
- impact analysis

## Consequences

### Positive

- Stable architecture
- Lower refactoring cost
- Faster feature development
- Clear extension points
- Consistent testing strategy
- Easier onboarding
- Predictable module ownership

### Tradeoffs

- Some implementation choices become intentionally harder to change.
- Large architectural changes require explicit design review instead of ad hoc refactoring.

## Guiding Principle

Extend the architecture. Do not rebuild it.
