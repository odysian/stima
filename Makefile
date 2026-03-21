.PHONY: help verify backend-verify frontend-verify db-verify template-verify extraction-live

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-20s %s\n", $$1, $$2}'

verify: backend-verify frontend-verify ## Run all backend and frontend verification checks

backend-verify: ## Run backend lint, type checks, security scan, and tests
	@bash scripts/check_backend_boundaries.sh
	@test -x backend/.venv/bin/ruff || (echo "Missing backend/.venv. Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" && exit 1)
	@cd backend && \
		.venv/bin/ruff check . --cache-dir .ruff_cache && \
		.venv/bin/ruff format --check . && \
		.venv/bin/mypy . --cache-dir .mypy_cache && \
		.venv/bin/bandit -r app/ -x app/core/tests,app/features/auth/tests,app/features/customers/tests,app/features/profile/tests,app/features/quotes/tests,app/shared/tests && \
		.venv/bin/pytest -v -m "not live" -o cache_dir=.pytest_cache

frontend-verify: ## Run frontend type checks, lint, tests, and build
	@test -x frontend/node_modules/.bin/tsc || (echo "Missing frontend dependencies. Run: cd frontend && npm install" && exit 1)
	@cd frontend && \
		./node_modules/.bin/tsc --noEmit && \
		./node_modules/.bin/eslint src/ && \
		./node_modules/.bin/vitest run && \
		npm run build

db-verify: ## Apply database migrations to head
	@test -x backend/.venv/bin/alembic || (echo "Missing backend/.venv. Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" && exit 1)
	@cd backend && .venv/bin/alembic upgrade head

template-verify: ## Check template docs for unresolved placeholders
	@./scripts/check-unresolved-template-tokens.sh

extraction-live: ## Run live extraction tests against real Claude API (requires ANTHROPIC_API_KEY in .env)
	@test -x backend/.venv/bin/pytest || (echo "Missing backend/.venv. Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" && exit 1)
	@cd backend && .venv/bin/pytest -m live -s -v
