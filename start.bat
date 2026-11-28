@echo off

REM KFC Application Docker Compose Startup Script for Windows

echo ================================
echo KFC Application - Docker Setup
echo ================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not installed or not in PATH
    echo Please install Docker Desktop from: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM Check if Docker Compose is available
docker compose version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker Compose is not available
    pause
    exit /b 1
)

echo ✅ Docker is installed: 
docker --version
echo ✅ Docker Compose is installed:
docker compose version

echo.
echo 🏗️  Building Docker images...
docker compose build --no-cache

echo.
echo 🚀 Starting services...
docker compose up -d

echo.
echo ⏳ Waiting for services to be healthy...
timeout /t 10 /nobreak

echo.
echo 📊 Service Status:
docker compose ps

echo.
echo ✅ All services are running!
echo.
echo ================================
echo Access Points:
echo ================================
echo Cart API:             http://localhost:8080
echo Orders API:           http://localhost:8081
echo Users API:            http://localhost:8082
echo Products API:         http://localhost:8083
echo Digital Experience API: http://localhost:9000
echo SQL Server:           localhost:14330
echo.
echo ================================
echo Useful Commands:
echo ================================
echo View logs:            docker compose logs -f
echo View cart logs:       docker compose logs -f cart-service
echo Stop services:        docker compose down
echo.
pause
