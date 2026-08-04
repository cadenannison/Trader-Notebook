.PHONY: install dev test format lint worker

VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn
PYTEST := $(VENV)/bin/pytest

install:
	python3 -m venv $(VENV)
	$(PIP) install -r server/requirements.txt
	$(PIP) install -r worker/requirements.txt
	cd client && npm install
	pre-commit install

dev:
	@echo "Starting FastAPI on :8000 and Next.js on :3000..."
	(cd server && PYTHONPATH=. $(abspath $(UVICORN)) app.main:app --reload --port 8000) & \
	cd client && npm run dev

test:
	cd server && PYTHONPATH=. $(abspath $(PYTEST)) tests/ -v
	PYTHONPATH=. $(PYTEST) worker/tests/ -v
	cd client && npm run test -- --run

format:
	$(VENV)/bin/ruff format server/ worker/
	cd client && npx prettier --write "src/**/*.{ts,tsx}"

lint:
	$(VENV)/bin/ruff check server/ worker/

worker:
	$(PYTHON) worker/trigger_worker.py
