---
id: deploy-to-production
type: procedure
created: 2026-04-18T15:00:00Z
modified: 2026-04-18T15:00:00Z
author: agent:assistant
source: conversation:003
status: active
tags: [deployment, ci-cd, procedure]
scope: workspace
links:
  - target: project-stack
    relation: depends_on
---

# Deploy to Production

## Steps

1. Ensure all tests pass locally: `make test`
2. Push to `main` branch
3. GitHub Actions runs CI pipeline automatically
4. On CI pass, Docker image is built and pushed to GHCR
5. Production server pulls new image via SSH deploy step
6. Health check confirms deployment

## Rollback

If deployment fails:
1. Revert the merge commit on `main`
2. Push — this triggers a new deploy with the previous version
3. Investigate the failure on a branch

## Notes

- Never deploy on Fridays
- Always check [[project-stack]] for current versions before upgrading dependencies
