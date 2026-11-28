#!/bin/bash

# KFC Application Docker Compose Startup Script

set -e

echo "================================"
echo "KFC Application - Docker Setup"
echo "================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available."
    exit 1
fi

echo "✅ Docker is installed: $(docker --version)"
echo "✅ Docker Compose is installed: $(docker compose version)"

# Build images if needed
echo "🏗️  Building Docker images..."
docker compose build --no-cache

echo ""
echo "🚀 Starting services..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service status
echo ""
echo "📊 Service Status:"
docker compose ps

echo ""
echo "✅ All services are running!"
echo ""
echo "================================"
echo "Access Points:"
echo "================================"
echo "Cart API:             http://localhost:8080"
echo "Orders API:           http://localhost:8081"
echo "Users API:            http://localhost:8082"
echo "Products API:         http://localhost:8083"
echo "Digital Experience API: http://localhost:9000"
echo "SQL Server:           localhost:14330"
echo ""
echo "================================"
echo "Useful Commands:"
echo "================================"
echo "View logs:            docker compose logs -f"
echo "View cart logs:       docker compose logs -f cart-service"
echo "Stop services:        docker compose down"
echo ""
