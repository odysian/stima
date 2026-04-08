# Dependency Security Review Cadence

Dependency review cadence is operational policy even before automated scanning is fully wired.

## Minimum cadence

- Weekly during active development.
- Before each production deployment.
- Immediately after a new critical advisory affecting the Python or Node stack.

## Review scope

- Python application and worker dependencies.
- Frontend runtime and build dependencies.
- Infrastructure-sensitive packages touching auth, HTTP transport, templating, storage, Redis, background jobs, or provider SDKs.

## Release gate

- Treat known critical or high-severity vulnerabilities with a reachable exploit path as release blockers.
- When automated scanning is available, a failing scan must block release until triaged.
- When automated scanning is unavailable, record the manual review result in the release checklist.

## Related runbooks

- [production-readiness-checklist.md](/home/odys/stima/docs/runbooks/production-readiness-checklist.md)
