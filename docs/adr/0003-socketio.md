# ADR 3: WebSocket Protocol with Socket.IO

## Status

Accepted

## Context

Multiplayer matches require real-time collaborative coding workspace synchronization, timer broadcast, and user availability event propagation. Raw WebSockets require custom connection heartbeat ping/pong handling, automatic reconnection, and namespace isolation logic.

## Decision

We utilize Express paired with Socket.IO for real-time synchronization.

## Consequences

- Socket.IO provides native connection recovery, room orchestration, and client status broadcasts.
- Automatic fallback transports ensure reliability in restrictive network environments.
