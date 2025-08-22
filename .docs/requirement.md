# Trade Simulator

## Purpose
Practice trading skills with real market data to improve trend analysis and price point judgment.
**Target Security Type**: Cryptocurrency

## Core Concept
Use historical market data replay to simulate real-time trading experience, enabling skill development without financial risk.

## Phase 1 Requirements

### Core Simulation Features
1. **Trading Pair Selection**: Manually choose or randomly pick (hide name)
2. **Trading Modes**: Spot, margin, perpetual futures
3. **Time Point Selection**: Manual or random start time
4. **Initial Fund Setup**: User-defined starting capital
5. **Chart Display**: Candlestick chart with historical data before start point, all timeframes
6. **Simulation Control**: 
   - Start/stop simulation
   - Variable speed replay (1-100x)
   - Pause/resume functionality
   - State persistence for long-term interruptions

### Enhanced Order Management
- **Order Types**: Market, limit, stop-loss, take-profit, trailing stops
- **Order Execution**: Realistic simulation with fees and slippage
- **Position Management**: Support for multiple concurrent positions

### Risk Management Features
- **Position Sizing Calculator**: Automatic risk-based position sizing
- **Liquidation Simulation**: Accurate margin and liquidation calculations

### Performance Analytics
- **Core Metrics**: Win rate, total P&L, ROI percentage
- **Advanced Metrics**: Sharpe ratio, maximum drawdown, profit factor
- **Trade Statistics**: Average win/loss, largest win/loss, consecutive wins/losses
- **Real-time Performance Tracking**: Live updates during simulation

### Technical Architecture
- **Modular Design**: Separate data layer, simulation engine, and UI components
- **Real-time Updates**: WebSocket-like simulation for smooth price updates
- **Database Storage**: Use database (not SQLite) for state persistence and simulation records
- **API Integration**: Binance API for historical data (fetch as needed, no bulk storage)

### Data Management
- **Historical Data**: Fetch from Binance API during simulation
- **State Storage**: Simulation state, user positions, order history
- **Performance Records**: Trade logs and performance metrics

## Phase 2 Backlog

### Learning & Analytics
- Trade journal with entry/exit reasons
- Pattern recognition highlighting
- Scenario replay functionality
- Progress tracking and skill improvement metrics

### Enhanced User Experience
- Difficulty levels (beginner to expert)
- Preset trading challenges
- Different market condition scenarios
- News event integration

### Advanced Features
- Multi-exchange support
- Portfolio correlation analysis
- Social features and benchmarking
- Advanced charting tools and indicators
 