#!/bin/bash

# TradeSimulator Setup Script

echo "🚀 Setting up TradeSimulator development environment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go first."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "✅ All prerequisites are installed."

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend && go mod download
if [ $? -ne 0 ]; then
    echo "❌ Failed to install backend dependencies."
    exit 1
fi

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd ../frontend && npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install frontend dependencies."
    exit 1
fi

cd ..

echo "✅ Dependencies installed successfully."

# Start development environment
echo "🐳 Starting development environment..."
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

echo "✅ Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Run 'make dev-up' to start all services"
echo "2. Run 'make dev-logs' to see logs"
echo "3. Access frontend at http://localhost:3000"
echo "4. Access backend at http://localhost:8080"