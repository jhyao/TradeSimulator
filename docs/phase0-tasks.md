# Phase 0 Implementation Tasks

## Overview
Break down Phase 0 MVP into small, manageable tasks that build incrementally toward a playable trading simulator.

**Goal**: Working trading simulator in 2 weeks with basic functionality only.

---

## Task 1: Project Setup & Basic Structure
**Duration**: 1 day  
**Priority**: Critical

### Description
Set up the basic project structure with Go backend and React frontend, establish development environment.

### Requirements
- Go backend with basic HTTP server
- React frontend with TypeScript
- Basic database connection and user table
- Basic project structure and build scripts
- Development environment setup

### What to Do
1. Initialize Go module with basic project structure
2. Set up React app with TypeScript
3. Set up PostgreSQL database connection with GORM
4. Create basic user table schema (for future multi-user support)
5. Create basic Dockerfile/docker-compose for development (including PostgreSQL)
6. Set up basic CI/build scripts
7. Create basic HTTP server with health check endpoint
8. Set up development environment and dependencies
9. Basic project documentation and folder structure

### What NOT to Do
- Don't create trading-related tables (orders, positions, trades) yet
- Don't implement user authentication or registration
- Don't implement any trading logic
- Don't set up WebSocket connections
- Don't optimize for production deployment
- Don't add complex middleware or logging

### Success Criteria
- [ ] Go server starts and responds to health check
- [ ] React app loads in browser
- [ ] Database connection established and user table created
- [ ] Development environment working (can build both frontend/backend)
- [ ] Basic project structure documented
- [ ] Docker development setup functional with PostgreSQL

---

## Task 2: Binance API Integration
**Duration**: 1-2 days  
**Priority**: Critical

### Description
Implement basic Binance API client to fetch historical price data for hardcoded trading pairs.

### Requirements
- Fetch historical kline data from Binance
- Support for BTC/USDT and ETH/USDT only
- Basic error handling and rate limiting
- Simple data structure for price data

### What to Do
1. Install Go Binance SDK
2. Create Binance client wrapper
3. Implement kline data fetching for specific symbols
4. Add basic rate limiting and error handling
5. Create data models for price data (OHLCV)
7. Create REST endpoint to serve historical data
8. Add Swagger documentation for backend APIs

### What NOT to Do
- Don't implement real-time WebSocket streams
- Don't support all trading pairs (only BTC/USDT, ETH/USDT)
- Don't implement complex caching strategies
- Don't add data persistence to database yet
- Don't handle all possible API errors

### Success Criteria
- [ ] Can fetch 1000 klines for BTC/USDT from specific date
- [ ] Data returned in proper OHLCV format
- [ ] Basic error handling for API failures
- [ ] REST endpoint returns historical data

---

## Task 3: Basic Chart Display
**Duration**: 1-2 days  
**Priority**: High

### Description
Implement basic candlestick chart using TradingView Lightweight Charts to display historical price data.

### Requirements
- Display candlestick chart with OHLCV data
- Support basic zoom and pan
- Simple, clean chart interface
- Load data from backend API

### What to Do
1. Install TradingView Lightweight Charts
2. Create Chart component in React
3. Implement basic candlestick series
4. Add simple zoom and pan controls
5. Connect chart to backend data API
6. Add loading states and basic error handling
7. Make chart responsive

### What NOT to Do
- Don't add technical indicators
- Don't implement real-time price updates yet
- Don't add complex chart controls or timeframes
- Don't implement drawing tools
- Don't optimize for mobile

### Success Criteria
- [ ] Chart displays historical BTC/USDT data
- [ ] Candlesticks render correctly with proper colors
- [ ] Basic zoom/pan functionality works
- [ ] Chart loads data from backend API
- [ ] Responsive design works on desktop

---

## Task 4: Real-time Price Updates & WebSocket
**Duration**: 2 days  
**Priority**: Critical

### Description
Establish WebSocket infrastructure for real-time communication between frontend and backend, creating the foundation for simulation updates.

### Requirements
- WebSocket connection between frontend and backend
- Price update broadcasting system
- Basic connection management and message handling
- Foundation for simulation price streaming

### What to Do
1. Set up Gorilla WebSocket on backend
2. Create WebSocket connection handler and upgrade logic
3. Implement basic message broadcasting system
4. Create WebSocket client in React frontend
5. Add connection/disconnection handling
6. Implement JSON message serialization
7. Create basic WebSocket message types (price updates, connection status)

### What NOT to Do
- Don't implement complex message routing or queuing
- Don't add WebSocket authentication yet
- Don't optimize for high-frequency trading updates
- Don't implement message persistence
- Don't handle multiple concurrent users

### Success Criteria
- [ ] WebSocket connection established between frontend/backend
- [ ] Can send and receive JSON messages
- [ ] Connection reconnects automatically on disconnect
- [ ] Basic message broadcasting system working
- [ ] Foundation ready for price streaming

---

## Task 5: Price Replay Simulation Engine
**Duration**: 2-3 days  
**Priority**: Critical

### Description
Create simulation engine that replays historical data at fixed speeds using the WebSocket foundation from Task 4.

### Requirements
- Replay historical data sequentially at 1x, 5x, 10x speeds
- Start/pause/resume/stop controls
- Current price tracking during simulation
- Stream price updates via existing WebSocket

### What to Do
1. Create simulation engine with goroutines
2. Implement fixed speed controls (1x, 5x, 10x)
3. Add start/pause/resume/stop state management
4. Implement timer-based historical data replay
5. Stream price updates through WebSocket from Task 4
6. Track current simulation price and position in dataset
7. Create simulation control API endpoints
8. Update chart in real-time via WebSocket price updates

### What NOT to Do
- Don't implement variable speed control
- Don't add state persistence to database
- Don't support multiple concurrent simulations
- Don't implement complex error recovery
- Don't add simulation analytics or statistics

### Success Criteria
- [ ] Can start simulation and see chart updating in real-time
- [ ] Pause/resume works correctly without data loss
- [ ] Stop resets simulation to beginning
- [ ] Speed controls (1x, 5x, 10x) work smoothly
- [ ] Current simulation price available for order execution

---

## Task 6: Market Order Execution
**Duration**: 2-3 days  
**Priority**: Critical

### Description
Implement market order execution system that creates positions by executing trades at current simulation price.

### Requirements
- Execute market buy/sell orders at current simulation price
- Create position/trade records from successful orders
- Simple 0.1% flat fee calculation
- Basic order validation and error handling

### What to Do
1. Create orders and trades table schema (extend existing database connection)
2. Create order and trade data structures
4. Implement market order execution logic
5. Execute orders at current simulation price from Task 5
6. Add simple fee calculation (0.1% flat rate)
7. Store order/trade records in database
8. Implement order validation (sufficient funds, valid amounts)
9. Create order API endpoints (POST /orders)
10. Add basic order placement UI in frontend

### What NOT to Do
- Don't implement limit orders or stop orders
- Don't add slippage simulation
- Don't implement order queue or matching engine
- Don't add complex fee structures (maker/taker)
- Don't implement margin trading or leverage

### Success Criteria
- [ ] Can place market buy order during simulation
- [ ] Order executes at exact current simulation price
- [ ] Position created with correct entry price and quantity
- [ ] Fees calculated and deducted correctly
- [ ] Order validation prevents invalid trades
- [ ] Can place sell order to close position

---

## Task 7: Basic Portfolio Tracking
**Duration**: 1-2 days  
**Priority**: High

### Description
Implement portfolio display that shows positions created by order execution and calculates real-time P&L.

### Requirements
- Display positions created by market orders from Task 6
- Track cash balance (updated by order execution)
- Calculate unrealized P&L using current simulation price
- Real-time portfolio updates via WebSocket

### What to Do
1. Create portfolio and positions table schema (extend existing database)
2. Create portfolio data structures to hold cash and positions
3. Implement P&L calculation using current simulation price
4. Update portfolio state when orders execute from Task 6
5. Store portfolio state in database
6. Create portfolio API endpoints (GET /portfolio)
7. Add portfolio display in frontend (cash, position, P&L)
8. Listen to price updates from Task 5 for real-time P&L updates
9. Handle portfolio updates via WebSocket

### What NOT to Do
- Don't implement multiple concurrent positions
- Don't add margin trading calculations
- Don't implement complex risk metrics
- Don't add trade history or analytics
- Don't persist portfolio state to database

### Success Criteria
- [ ] Portfolio shows current cash balance
- [ ] Displays position created by orders (if any)
- [ ] Shows unrealized P&L updating in real-time during simulation
- [ ] Portfolio reflects order execution immediately
- [ ] P&L calculations are accurate

---

## Task 8: Integration & Basic UI Polish
**Duration**: 1-2 days  
**Priority**: Medium

### Description
Integrate all components into complete user flow and add basic UI polish for MVP completion.

### Requirements
- Complete end-to-end user flow working
- Basic responsive design
- Simple, clean user interface
- Basic error handling and user feedback

### What to Do
1. Create main trading interface layout integrating chart, portfolio, and controls
2. Add simulation controls UI (start/pause/resume/stop)
3. Integrate order placement form with portfolio display
4. Implement basic error handling and user feedback
5. Add loading states for data fetching and order execution
6. Test complete user flow: start simulation → place orders → see portfolio updates
7. Basic responsive design for desktop

### What NOT to Do
- Don't add complex animations or transitions
- Don't optimize for mobile devices
- Don't implement user preferences or settings
- Don't add advanced UI components
- Don't implement themes or complex styling

### Success Criteria
- [ ] Complete trading interface with chart, portfolio, order controls
- [ ] User can: start simulation → place buy order → see position → place sell order → see P&L
- [ ] Real-time updates work throughout entire flow
- [ ] Error messages display appropriately
- [ ] Interface works well on desktop browsers
- [ ] All Phase 0 features integrated and working smoothly

---

## Implementation Order

### Week 1: Foundation
**Days 1-2**: Task 1 (Project Setup) + Task 2 (Binance API)  
**Days 3-4**: Task 3 (Chart Display) + Start Task 4 (Simulation Engine)  
**Day 5**: Complete Task 4 (Simulation Engine)

### Week 2: Core Features
**Days 1-2**: Task 5 (Simulation Engine) completion  
**Days 3-4**: Task 6 (Market Orders) + Task 7 (Portfolio)  
**Day 5**: Task 8 (Integration) + Testing, bug fixes, and MVP completion

## Success Metrics for Phase 0
- Complete end-to-end user flow: start simulation → place orders → see P&L
- Simulation runs smoothly for 1+ hours without crashes
- All basic features work as documented
- Clean, simple codebase < 1000 lines total
- Ready for Phase 1 feature additions

## Notes
- Each task should be completed and tested before moving to the next
- Keep implementations simple - resist adding extra features
- Focus on core functionality over optimization
- Document any decisions or trade-offs made during implementation