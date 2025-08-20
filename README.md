# TradeSimulator

A cryptocurrency trading simulator for skill development and practice.

## Project Structure

```
TradeSimulator/
├── backend/                 # Go backend application
│   ├── cmd/server/         # Main application entry point
│   ├── internal/           # Private application code
│   │   ├── config/         # Configuration management
│   │   ├── database/       # Database connection and migrations
│   │   ├── handlers/       # HTTP request handlers
│   │   ├── models/         # Data models
│   │   └── services/       # Business logic
│   └── pkg/                # Public packages
├── frontend/               # React TypeScript frontend
├── docs/                   # Project documentation
└── scripts/                # Build and deployment scripts
```

## Getting Started

### Prerequisites

- Go 1.21+
- Node.js 18+
- PostgreSQL 15+
- Docker & Docker Compose

### Quick Start

1. **Clone and setup:**
   ```bash
   git clone <repository-url>
   cd TradeSimulator
   ./scripts/setup.sh
   ```

2. **Start development environment:**
   ```bash
   make dev-up
   ```

3. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8080
   - Health Check: http://localhost:8080/health

### Development Commands

```bash
# Start all services
make dev-up

# Stop all services
make dev-down

# View logs
make dev-logs

# Build backend
make build

# Run tests
make test

# Format and lint code
make lint

# Install dependencies
make deps
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
DATABASE_URL=postgres://trader:traderpwd@localhost:5432/tradesimulator?sslmode=disable
PORT=8080
ENVIRONMENT=development
```

## API Endpoints

### Health Check
- `GET /health` - Service health status
- `GET /api/v1/health` - API health status

## Development Phases

This project follows a phased development approach:

- **Phase 0**: Basic project setup and structure ✅
- **Phase 1**: Price display and basic charts
- **Phase 2**: Simulation engine and controls
- **Phase 3**: Trading functionality
- **Phase 4**: Advanced features and analytics

See `docs/` for detailed planning documentation.

## Technology Stack

### Backend
- **Language**: Go 1.21
- **Framework**: Gin
- **Database**: PostgreSQL with GORM
- **Architecture**: Clean Architecture

### Frontend
- **Language**: TypeScript
- **Framework**: React 18
- **Charts**: TradingView Lightweight Charts
- **Styling**: CSS Modules / Tailwind CSS

### Infrastructure
- **Containerization**: Docker
- **Database**: PostgreSQL 15
- **Development**: Docker Compose

## Contributing

1. Follow the existing code style
2. Write tests for new features
3. Update documentation as needed
4. Use conventional commit messages

## License

This project is for educational purposes.