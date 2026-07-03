# ADR 2: PostgreSQL as Primary Relational Store

## Status

Accepted

## Context

Coding Arena requires structured relational records for managing authentication, user profiles, match score details, code submissions, global leaderboards, friendships, and audit histories.

## Decision

We select PostgreSQL as the core transactional datastore.

## Consequences

- ACID compliance guarantees safety of transactions (e.g. updating user scores/leaderboards).
- Robust JSONB support allows structured columns to double up for semi-structured submission telemetry.
- Seamless integration with Prisma ORM and local development Docker images.
