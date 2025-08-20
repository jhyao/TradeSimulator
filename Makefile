.PHONY: help build run test clean dev-up dev-down

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build the backend application
	cd backend && go build -o bin/server cmd/server/main.go

run: ## Run the backend application
	cd backend && go run cmd/server/main.go

test: ## Run tests
	cd backend && go test ./...

clean: ## Clean build artifacts
	cd backend && rm -rf bin/

dev-up: ## Start development environment with Docker
	docker-compose up -d

dev-down: ## Stop development environment
	docker-compose down

dev-logs: ## Show development logs
	docker-compose logs -f

fmt: ## Format Go code
	cd backend && go fmt ./...

vet: ## Run go vet
	cd backend && go vet ./...

lint: fmt vet ## Run all linting

deps: ## Download dependencies
	cd backend && go mod download
	cd frontend && npm install