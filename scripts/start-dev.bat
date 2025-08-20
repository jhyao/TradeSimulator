@echo off
echo Starting TradeSimulator Development Environment...

echo.
echo Starting PostgreSQL database...
docker-compose -f docker-compose.db.yml up -d

echo.
echo Waiting for database to be ready...
timeout /t 10 /nobreak >nul

echo.
echo Database started successfully!
echo.
echo To start the backend:
echo   cd backend
echo   go run cmd/server/main.go
echo.
echo To start the frontend:
echo   cd frontend  
echo   npm start
echo.
echo Database connection: postgresql://trader:traderpwd@localhost:5432/tradesimulator
echo Backend will run on: http://localhost:8080
echo Frontend will run on: http://localhost:3000