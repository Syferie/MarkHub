#!/bin/bash
# Load environment variables from the root .env file
set -a
if [ -f ../.env ]; then
    source ../.env
else
    echo "Warning: Root .env file not found at ../.env" >&2
fi
set +a

# Run the Go application
echo "Starting Go application (main.go)..."
go run main.go