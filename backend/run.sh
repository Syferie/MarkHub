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
echo "Starting Go application (main.go) with 'serve' command..."
# Run the Go application with the 'serve' command and listen on all interfaces
# Add --dev for more verbose logging during development
go run main.go serve --http="0.0.0.0:8090" --dev