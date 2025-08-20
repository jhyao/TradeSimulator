@echo off
echo Stopping TradeSimulator Development Environment...

echo.
echo Stopping PostgreSQL database...
docker-compose -f docker-compose.db.yml down

echo.
echo Development environment stopped!