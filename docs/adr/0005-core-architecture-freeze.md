# ADR 5: Core Architecture Stability & Freeze

## Status

Accepted

## Context

The core workspace systems are now fully implemented, integrated, typechecked, and verified via extensive test suites:

1. **Judge Pipeline**: Immutable ExecutionResult schema, runtime interfaces, and local/Docker sandboxes.
2. **Submission Queue**: Decoupled submission execution worker queue abstractions.
3. **Realtime Infrastructure**: In-memory `SessionManager`, `ConnectionRegistry`, and authoritative state room finite state machines (FSM).
4. **Collaborative Editor**: Text transformation `EditorEngine` supporting Operational Transformation (OT) index offsets and client baseVersion tracking.
5. **Domain Event Layer**: Decoupled handlers dispatching Domain Events (`ROOM_UPDATED`, `EDITOR_OPERATION_APPLIED`) via `EventBroker` to socket notifier broadcast mechanisms.

Establishing architectural stability is critical as the workspace shifts focus to competitive gameplay modules.

## Decision

We declare all existing core subsystems and abstractions frozen and stable.
All future features (Match Lifecycle, Invite flows, Matchmaking rooms, Leaderboards, Rankings, Social messaging, and Spectator Replays) must extend the platform by building on top of these existing interfaces, rather than rewriting or restructuring their internals.

## Consequences

- Prevents unnecessary code churn and refactoring cycles in stable services.
- Ensures new features (e.g. gameplay tracking, analytics, statistics, achievement logs) plug cleanly into the unified Event Broker as consumers of the existing Domain Event types.
- Standardizes testing strategies around stable mock interfaces.
- Secures a predictable codebase structure that scales easily.
