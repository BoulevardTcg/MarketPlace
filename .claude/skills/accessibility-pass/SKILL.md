---
description: Accessibility and mobile usability pass; fixes focus, labels, contrast, keyboard, tap targets
allowed-tools: Read, Glob, Grep, Edit
argument-hint: "[scope] e.g. marketplace pages, forms, modals"
---

# Accessibility + Mobile Pass

Scope: $ARGUMENTS

Do:
- Identify a11y issues (labels, aria, focus traps, semantic headings)
- Fix the most critical ones in code
- Ensure tap targets >= 44px on mobile
- Ensure keyboard navigation works end-to-end
- Ensure error messages are announced or visible

Output:
- List of issues found
- Exact files changed + what changed
