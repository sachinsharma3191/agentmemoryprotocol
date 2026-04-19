---
id: tests-before-deploy
type: reflection
created: 2026-04-18T16:00:00Z
modified: 2026-04-18T16:00:00Z
author: agent:assistant
source: observation
confidence: 0.90
status: active
tags: [testing, deployment, lesson-learned]
scope: workspace
---

# Always Run Tests Before Deploying

Learned from [[2026-04-18-initial-setup]]: skipping tests during initial setup caused a broken deploy that took 2 hours to debug.

## Evidence

- Initial deploy failed because a database migration was missing
- Tests would have caught the missing migration
- Added to [[deploy-to-production]] procedure as step 1

## Takeaway

The 5 minutes spent running tests saves hours of debugging in production. No exceptions.
