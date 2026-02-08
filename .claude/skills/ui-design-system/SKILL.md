---
description: Create/normalize a minimal design system (spacing, typography, colors usage, components rules)
allowed-tools: Read, Glob, Grep, Edit, Write
argument-hint: "[goal] e.g. premium marketplace, clean SaaS, dark mode"
---

# UI Design System

Goal: $ARGUMENTS

Tasks:
- Inspect existing styling approach (Tailwind/CSS modules/etc.)
- Define a consistent system:
  - spacing scale
  - typography scale (H1/H2/body/caption)
  - button sizes & variants
  - card layout rules
  - form field rules (label, hint, error)
- Implement only what is needed to make the UI consistent:
  - create/update a single source of truth (tokens file / css variables / theme file)
  - refactor the most visible shared components (Layout, Button, Card, Input)

Rules:
- Keep changes incremental (avoid huge rewrites).
- No new UI library unless the project already uses it.
- Ensure mobile + dark mode (if present) remain clean.
Output must list which files were edited/created.
