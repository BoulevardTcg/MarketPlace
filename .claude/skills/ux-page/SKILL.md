---
description: Implement/refactor a full page with conversion-oriented UX, clear layout, and stable data states
allowed-tools: Read, Glob, Grep, Edit, Write
argument-hint: "[page] e.g. MarketplaceBrowse, ListingDetail, PortfolioDashboard"
---

# UX Page Implementation

Page: $ARGUMENTS

Must include:
- Clear information hierarchy (title, summary, actions)
- Sticky primary CTA on mobile when relevant
- Skeleton/loading state
- Empty state with call-to-action
- Error state with retry guidance
- Microcopy: short, reassuring, marketplace-trust oriented

Rules:
- Use backend response shape { data }.
- Avoid over-engineering; ship something clean.
- Keep performance in mind (memoization only if necessary).
