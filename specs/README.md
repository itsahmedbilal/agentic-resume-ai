# Specs Directory

This folder contains all project specification artifacts.

## Structure

- `requirements/index.md` - source requirements document (PRD + SRS hybrid)
- `SPEC-001-Agentic-Resume-AI.md` - consolidated baseline spec (single-file)
- `SPEC-001/` - breakout spec pack for clearer maintenance

## SPEC-001 Breakout Pack

- `SPEC-001/README.md` - navigation and document map
- `SPEC-001/SRS.md` - software requirements specification (what)
- `SPEC-001/NFR.md` - quality attributes and constraints
- `SPEC-001/SDD.md` - software design document (how)
- `SPEC-001/API.md` - normative API contracts and error model
- `SPEC-001/RTM.md` - requirement traceability matrix
- `SPEC-001/SOLUTION.md` - practical roadmap to achieve project goals

## Usage Guidance

1. Update requirements in `requirements/index.md`.
2. Reflect approved requirement changes in `SPEC-001/SRS.md` and `SPEC-001/NFR.md`.
3. Keep design and implementation implications in `SPEC-001/SDD.md`.
4. Update `SPEC-001/RTM.md` whenever new requirements or services are added.
5. Treat `SPEC-001-Agentic-Resume-AI.md` as the historical combined snapshot.
