# WebSocket Message Reference

This document provides a comprehensive reference for all WebSocket message formats used in the TradeSimulator application for simulation control and order management.

## Table of Contents

1. [Message Structure](#message-structure)
2. [Connection Messages](#connection-messages)
3. [Simulation Control Messages](#simulation-control-messages)
4. [Simulation Update Messages](#simulation-update-messages)
5. [Order Control Messages](#order-control-messages)
6. [Error Messages](#error-messages)

## Message Structure

All WebSocket messages follow a common structure:

```json
{
  "type": "message_type",
  "data": { /* message-specific data */ }
}
```

### Base Message Types

| Type | Value | Description |
|------|-------|-------------|
| `ConnectionStatus` | `"connection_status"` | Connection status messages |
| `StatusUpdate` | `"status_update"` | General status updates |
| `SimulationUpdate` | `"simulation_update"` | Simulation data updates |
| `Error` | `"error"` | Error responses |

## Connection Messages

### Connection Status
**Type:** `"connection_status"`

Sent when client connects or connection status changes.

**Data Structure:**
```json
{
  "status": "connected",
  "message": "Successfully connected to WebSocket",
  "timestamp": 1703001600000
}
```

**Fields:**
- `status` (string): Connection status ("connected", "disconnected", etc.)
- `message` (string): Human-readable status message
- `timestamp` (number): Unix timestamp in milliseconds

## Simulation Control Messages

### Start Simulation
**Type:** `"simulation_control_start"`

**Direction:** Client → Server

**Data Structure:**
```json
{
  "symbol": "BTCUSDT",
  "startTime": 1703001600000,
  "interval": "1m",
  "speed": 1,
  "initialFunding": 10000.0
}
```

**Fields:**
- `symbol` (string): Trading symbol to simulate
- `startTime` (number): Start timestamp in milliseconds
- `interval` (string): Candlestick interval ("1m", "5m", "15m", "1h", etc.)
- `speed` (number): Simulation speed multiplier (1, 5, 10, 60, 120, 300)
- `initialFunding` (number): Initial funding amount (must be > 0)

### Stop Simulation
**Type:** `"simulation_control_stop"`

**Direction:** Client → Server

**Data Structure:** No data required
```json
{}
```

### Pause Simulation
**Type:** `"simulation_control_pause"`

**Direction:** Client → Server

**Data Structure:** No data required
```json
{}
```

### Resume Simulation
**Type:** `"simulation_control_resume"`

**Direction:** Client → Server

**Data Structure:** No data required
```json
{}
```

### Set Simulation Speed
**Type:** `"simulation_control_set_speed"`

**Direction:** Client → Server

**Data Structure:**
```json
{
  "speed": 10
}
```

**Fields:**
- `speed` (number): New speed multiplier (1, 5, 10, 60, 120, 300)

### Set Simulation Timeframe
**Type:** `"simulation_control_set_timeframe"`

**Direction:** Client → Server

**Data Structure:**
```json
{
  "timeframe": "5m"
}
```

**Fields:**
- `timeframe` (string): New timeframe interval ("1m", "5m", "15m", "1h", etc.)

### Get Simulation Status
**Type:** `"simulation_control_get_status"`

**Direction:** Client → Server

**Data Structure:** No data required
```json
{}
```

## Simulation Update Messages

### Simulation Update
**Type:** `"simulation_update"`

**Direction:** Server → Client

Sent periodically during simulation with current market data.

**Data Structure:**
```json
{
  "symbol": "BTCUSDT",
  "baseCandle": {
    "startTime": 1703001600000,
    "endTime": 1703001660000,
    "open": 43200.00,
    "high": 43280.50,
    "low": 43150.25,
    "close": 43250.50,
    "volume": 125.4567,
    "isComplete": true
  },
  "simulationTime": 1703001660000,
  "progress": 25.5,
  "state": "playing",
  "speed": 10
}
```

**Fields:**
- `symbol` (string): Trading symbol
- `baseCandle` (object): Current OHLCV candle data
  - `startTime` (number): Candle start timestamp
  - `endTime` (number): Candle end timestamp
  - `open` (number): Opening price
  - `high` (number): Highest price
  - `low` (number): Lowest price
  - `close` (number): Closing price
  - `volume` (number): Trading volume
  - `isComplete` (boolean): Whether candle is complete
- `simulationTime` (number): Current simulation timestamp in milliseconds
- `progress` (number): Simulation progress (0-100%)
- `state` (string): Current state ("stopped", "playing", "paused")
- `speed` (number): Current speed multiplier

### Status Update
**Type:** `"status_update"`

**Direction:** Server → Client

General status updates with current simulation state.

**Data Structure:**
```json
{
  "state": "playing",
  "symbol": "BTCUSDT",
  "interval": "1m",
  "speed": 10,
  "progress": 25.5,
  "startTime": 1703001600000,
  "currentPriceTime": 1703001720000,
  "currentPrice": 43250.50,
  "simulationID": 123,
  "isRunning": true,
  "simulationTime": 1703001720000,
  "message": "Simulation running normally"
}
```

**Fields:**
- `state` (string): Current simulation state
- `symbol` (string): Trading symbol
- `interval` (string): Current timeframe
- `speed` (number): Current speed multiplier
- `progress` (number): Progress percentage
- `startTime` (number): Simulation start timestamp
- `currentPriceTime` (number): Current price timestamp
- `currentPrice` (number): Current market price
- `simulationID` (number): Unique simulation ID
- `isRunning` (boolean): Whether simulation is active
- `simulationTime` (number): Current simulation timestamp
- `message` (string): Status message

## Order Control Messages

### Place Order
**Type:** `"order_place"`

**Direction:** Client → Server

**Data Structure:**
```json
{
  "symbol": "BTCUSDT",
  "side": "buy",
  "quantity": 0.1
}
```

**Fields:**
- `symbol` (string): Trading symbol
- `side` (string): Order side ("buy" or "sell")
- `quantity` (number): Order quantity

### Cancel Order
**Type:** `"order_cancel"`

**Direction:** Client → Server

**Data Structure:**
```json
{
  "orderId": 123
}
```

**Fields:**
- `orderId` (number): ID of order to cancel

**Note:** Order cancellation is not yet implemented.

### Order Placed
**Type:** `"order_placed"`

**Direction:** Server → Client

Confirmation that an order has been placed.

**Data Structure:**
```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": {
    "order": {
      "id": 123,
      "symbol": "BTCUSDT",
      "side": "buy",
      "quantity": 0.1,
      "price": 43250.50,
      "status": "filled",
      "timestamp": 1703001600000
    }
  }
}
```

**Fields:**
- `success` (boolean): Whether order placement succeeded
- `message` (string): Success message
- `data` (object): Order details
  - `order` (object): Order information

### Order Executed
**Type:** `"order_executed"`

**Direction:** Server → Client

Notification that an order has been executed.

**Data Structure:**
```json
{
  "success": true,
  "message": "Order executed successfully",
  "data": {
    "order": {
      "id": 123,
      "symbol": "BTCUSDT",
      "side": "buy",
      "quantity": 0.1,
      "price": 43250.50,
      "status": "filled",
      "timestamp": 1703001600000
    },
    "trade": {
      "id": 456,
      "orderId": 123,
      "symbol": "BTCUSDT",
      "side": "buy",
      "quantity": 0.1,
      "price": 43250.50,
      "fee": 4.325,
      "timestamp": 1703001600000
    }
  }
}
```

**Fields:**
- `success` (boolean): Whether execution succeeded
- `message` (string): Success message
- `data` (object): Execution details
  - `order` (object): Order information
  - `trade` (object): Trade information (if execution created a trade)

## Error Messages

### Error Response
**Type:** `"error"`

**Direction:** Server → Client

General error response format used for all error conditions.

**Data Structure:**
```json
{
  "success": false,
  "message": "Invalid order data",
  "error": "Side must be 'buy' or 'sell'"
}
```

**Fields:**
- `success` (boolean): Always `false` for errors
- `message` (string): High-level error message
- `error` (string): Detailed error description

### Common Error Scenarios

#### Simulation Errors
- **Invalid start data**: Validation errors in simulation start parameters
- **Invalid initial funding**: Initial funding must be greater than 0
- **Failed to start**: Simulation engine errors during startup
- **Failed to stop/pause/resume**: Engine state transition errors
- **Invalid speed/timeframe**: Invalid parameter values

#### Order Errors
- **Invalid order data**: JSON parsing or validation errors
- **Invalid order side**: Side must be "buy" or "sell"
- **Simulation not running**: Orders can only be placed during active simulation
- **Invalid current price**: Unable to determine current market price
- **Failed to place order**: Order execution engine errors

#### Connection Errors
- **Invalid message format**: JSON parsing errors
- **Unknown message type**: Unsupported message type received
- **Handler not available**: Internal server configuration error

## Message Flow Examples

### Starting a Simulation

1. **Client sends:**
```json
{
  "type": "simulation_control_start",
  "data": {
    "symbol": "BTCUSDT",
    "startTime": 1703001600000,
    "interval": "1m",
    "speed": 1,
    "initialFunding": 10000.0
  }
}
```

2. **Server responds with status updates:**
```json
{
  "type": "status_update",
  "data": {
    "state": "playing",
    "isRunning": true,
    "message": "Simulation started"
  }
}
```

3. **Server sends periodic updates:**
```json
{
  "type": "simulation_update",
  "data": {
    "symbol": "BTCUSDT",
    "baseCandle": { /* candle data */ },
    "simulationTime": 1703001720000,
    "progress": 1.0,
    "state": "playing",
    "speed": 1
  }
}
```

### Placing an Order

1. **Client sends:**
```json
{
  "type": "order_place",
  "data": {
    "symbol": "BTCUSDT",
    "side": "buy",
    "quantity": 0.1
  }
}
```

2. **Server responds:**
```json
{
  "type": "order_placed",
  "data": {
    "success": true,
    "message": "Order placed successfully",
    "data": {
      "order": { /* order details */ }
    }
  }
}
```

3. **Server may send execution notification:**
```json
{
  "type": "order_executed",
  "data": {
    "success": true,
    "message": "Order executed successfully",
    "data": {
      "order": { /* order details */ },
      "trade": { /* trade details */ }
    }
  }
}
```

## Implementation Notes

- All timestamps are Unix timestamps in milliseconds
- Prices and quantities are represented as floating-point numbers
- Message types are defined in `backend/internal/types/websocket.go`
- Data structures are defined in respective handler files
- The WebSocket connection automatically sends `connection_status` on connect
- Errors are always sent with `type: "error"` regardless of the original message type
- Some message types like order cancellation are defined but not yet implemented