# ADR 4: Database Access Layer with Prisma

## Status

Accepted

## Context

Writing raw SQL query statements leads to syntax errors during schema alterations. We require a typesafe ORM client generated dynamically from the database schema that matches our typescript strict compile-time checks.

## Decision

We adopt Prisma ORM as the primary data schema manager and client query builder.

## Consequences

- Generates typesafe compiler objects from `schema.prisma`.
- Built-in schema migration tools handle staging updates.
- Centralized database configuration package `@coding-arena/database` simplifies importing clients into APIs or scripts.
