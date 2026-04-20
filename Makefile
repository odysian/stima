.PHONY: help verify backend-verify backend-static-verify backend-test-verify frontend-verify db-verify template-verify extraction-live extraction-eval extraction-quality

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-20s %s\n", $$1, $$2}'

verify: ## Run all backend and frontend verification checks
	@bash scripts/check_file_sizes.sh --scope all
	@$(MAKE) backend-verify SKIP_FILE_SIZE_CHECK=1
	@$(MAKE) frontend-verify SKIP_FILE_SIZE_CHECK=1

backend-verify: ## Run backend lint, type checks, security scan, and tests
	@$(MAKE) backend-static-verify SKIP_FILE_SIZE_CHECK=$(SKIP_FILE_SIZE_CHECK)
	@$(MAKE) backend-test-verify

backend-static-verify: ## Run backend boundaries, lint, type checks, and security scan
	@bash scripts/check_backend_boundaries.sh
	@if [ "$(SKIP_FILE_SIZE_CHECK)" != "1" ]; then bash scripts/check_file_sizes.sh --scope backend; fi
	@test -x backend/.venv/bin/ruff || (echo "Missing backend/.venv. Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" && exit 1)
	@cd backend && \
		.venv/bin/ruff check . --cache-dir .ruff_cache && \
		.venv/bin/ruff format --check . && \
		.venv/bin/mypy . --cache-dir .mypy_cache && \
		.venv/bin/bandit -r app/ -x app/core/tests,app/features/auth/tests,app/features/customers/tests,app/features/invoices/tests,app/features/line_item_catalog/tests,app/features/profile/tests,app/features/quotes/tests,app/shared/tests

backend-test-verify: ## Run backend pytest suite (excluding live/eval markers)
	@test -x backend/.venv/bin/pytest || (echo "Missing backend/.venv. Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" && exit 1)
	@cd backend && \
		.venv/bin/pytest -v -m "not live and not extraction_eval and not extraction_quality" -o cache_dir=.pytest_cache

frontend-verify: ## Run frontend type checks, lint, tests, and build
	@if [ "$(SKIP_FILE_SIZE_CHECK)" != "1" ]; then bash scripts/check_file_sizes.sh --scope frontend; fi
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

extraction-eval: ## Run manual extraction eval harness (offline by default, set EXTRACTION_EVAL_LIVE=1 for live probes)
	@test -x backend/.venv/bin/pytest || (echo "Missing backend/.venv. Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" && exit 1)
	@cd backend && .venv/bin/pytest -v -m extraction_eval -o cache_dir=.pytest_cache
	@if [ "$$EXTRACTION_EVAL_LIVE" = "1" ]; then \
		echo "Running optional live extraction probes (requires ANTHROPIC_API_KEY in backend/.env)"; \
		cd backend && .venv/bin/pytest app/features/quotes/tests/test_extraction_live.py -m live -s -v -o cache_dir=.pytest_cache; \
	fi

extraction-quality: ## Run extraction quality eval against real API (requires ANTHROPIC_API_KEY)
	@test -x backend/.venv/bin/pytest || (echo "Missing backend/.venv. Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" && exit 1)
	@cd backend && .venv/bin/pytest app/features/quotes/tests/test_extraction_quality.py -m extraction_quality -s -v -o cache_dir=.pytest_cache
