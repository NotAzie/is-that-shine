# Project plan — echo.us / is-that-shine

## Purpose
Turn the current proof-of-concept static WebGL piece into a mature, well-documented,
maintainable open-source project while preserving its reflection/refraction identity.

## Current reality
- Two public branches exist: `main` and `feat/phase-1-foundation`.
- The repo currently has a small, compressed commit history.
- There is a real risk of pushing token/auth mistakes if the session is treated casually.
- The project needs a clearer separation between the served artifact in `public/` and
  repository-level files at the root.

## What counts as progress
- Every phase should be a real improvement, not churn.
- Each commit should leave the tree coherent.
- History should read like a real project, not a bulk rewrite.
- No secrets in the repository.
- Documentation should stay aligned with the artifact, not drift from it.

## Phase sequence
1. Repository hygiene and docs alignment
2. Platform stability and architecture cleanup
3. New core capabilities that extend the light/reflection model
4. UX and visual polish
5. Performance, diagnostics, and testability
6. Production readiness and release hygiene

## Rules for this project
- One project per calendar day across the account.
- Skip dates that are already occupied.
- One meaningful commit per day minimum.
- Multiple commits only when a phase is technically large.
- Use conventional commit messages.
- Prefer the cleaner, more maintainable option even when it takes more care.

## Stop condition
Continue until the repository feels like a polished open-source project someone would
star, fork, use, contribute to, and recommend.
