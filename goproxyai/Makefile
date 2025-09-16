.PHONY: build run test clean deps help

help:
	@echo "Available commands:"
	@echo "  build    - Build the application"
	@echo "  run      - Run the application"
	@echo "  test     - Run tests"
	@echo "  clean    - Clean build artifacts"
	@echo "  deps     - Download dependencies"
	@echo "  help     - Show this help message"

build:
	go build -o bin/goproxyai cmd/server/main.go

run:
	go run cmd/server/main.go

test:
	go test -v ./...

clean:
	rm -rf bin/
	go clean

deps:
	go mod download
	go mod tidy

dev:
	@echo "Starting development server..."
	@echo "PORT=8080, RATE_LIMIT=60, CACHE_TTL=5m"
	PORT=8080 RATE_LIMIT=60 CACHE_TTL=5m go run cmd/server/main.go
