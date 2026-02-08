---
description: Build or refactor a frontend component with UX best practices + empty/loading/error states
allowed-tools: Read, Glob, Grep, Edit, Write
argument-hint: "[component] e.g. ListingCard, PriceBadge, FilterBar, EmptyState"
---

# UX Component Builder

Component: $ARGUMENTS

Requirements:
- Responsive layout + good spacing
- Accessible (aria, labels, keyboard focus)
- States: loading / empty / error
- Consistent with current design system
- No duplicated logic (extract helpers/hooks if needed)

Deliver:
- Component implementation
- Any necessary styles
- Optional: minimal unit test if the repo has a test setup for components
