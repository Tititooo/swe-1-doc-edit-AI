# Collaborative Editor Submission Package Outline

This directory packages the missing report-ready artifacts for Assignment 1. It is designed to complement, not replace, the broader draft in `docs/contract.md`. The contract remains the source for the detailed functional requirements, non-functional requirements, user stories, API contract, repository layout, and team workflow; the files here split out the submission artifacts that the brief explicitly asks to provide as standalone deliverables.

## How to Assemble the Final Report

### 1. Front Matter

- Title page: "Collaborative Document Editor with AI Writing Assistant"
- Team: Teya (Infra), Tanisha (Frontend), Temiko (AI), Atharv (Backend)
- One-paragraph executive summary explaining the product, architectural focus, and scope of the proof of concept

### 2. Part 1: Requirements Engineering

- Stakeholder analysis
  - Source: `requirements/stakeholder-analysis.md`
- Functional requirements
  - Source: `docs/contract.md`, "Functional Requirements"
- Non-functional requirements
  - Source: `docs/contract.md`, "Non-Functional Requirements"
- User stories and scenarios
  - Source: `docs/contract.md`, "User Stories"
- Requirements traceability
  - Source: `requirements/traceability-matrix.md`

### 3. Part 2: System Architecture

- Architectural drivers
  - Source: `docs/contract.md`, "Architectural Drivers (Ranked)"
- C4 Level 1: System Context
  - Source diagram: `../master_contract/diagrams/c4-context.mmd`
- C4 Level 2: Container Diagram
  - Source diagram: `../master_contract/diagrams/c4-container.mmd`
- C4 Level 3: Backend Component Diagram
  - Source diagram: `../master_contract/diagrams/c4-component-backend.mmd`
- Data model and ERD
  - Source diagram: `../master_contract/diagrams/erd.mmd`
  - Supporting narrative: `docs/contract.md`, "Data Model"
- Architecture Decision Records
  - Source: `architecture/adrs.md`

### 4. Part 3: Project Management and Team Collaboration

- Team structure and ownership
  - Source: `docs/contract.md`, "Team Roles & Ownership"
- Development workflow and methodology
  - Source: `docs/contract.md`, "Development Methodology", "Branching & Code Review", and "Communication Plan"
- Risk assessment
  - Source: `management/risk-register.md`
- Timeline and milestones
  - Source: `management/milestones-timeline.md`

### 5. Part 4: Proof of Concept

- Scope, setup, and acceptance criteria
  - Source: `docs/contract.md`, "Proof of Concept Scope (Sprint 1)"
- Repository README and recorded demo
  - Out of scope for this documentation-only package

## Editable Diagram Source Inventory

| Figure in Final PDF | Mermaid Source | Purpose |
| --- | --- | --- |
| Figure 1. System Context | `../master_contract/diagrams/c4-context.mmd` | Shows actors, external services, and system boundary |
| Figure 2. Container Diagram | `../master_contract/diagrams/c4-container.mmd` | Shows major deployable/runtime containers and protocols |
| Figure 3. Backend Component Diagram | `../master_contract/diagrams/c4-component-backend.mmd` | Explains internal FastAPI backend structure |
| Figure 4. Entity Relationship Diagram | `../master_contract/diagrams/erd.mmd` | Shows persistent storage for users, documents, versions, permissions, and AI history |

## Editorial Notes

- Keep the identifiers from `docs/contract.md` unchanged in the final PDF so that FR, NFR, US, and ADR references remain consistent.
- Render each Mermaid source into PNG or PDF for embedding, but also submit the `.mmd` sources unchanged alongside the final report.
- The ERD intentionally adds organization policy entities so that FR-UM-04 has an explicit storage model; this closes a gap in the draft contract without changing the rest of the architecture.
- Use `docs/master_contract/diagrams/render.sh` to regenerate the PNG exports before assembling the final PDF.
