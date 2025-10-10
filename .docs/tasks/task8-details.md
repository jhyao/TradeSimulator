# Task8 - Perpetual Futures Mode Support

## Overview
Implement perpetual futures trading support with simplified position tracking, reusing existing WebSocket messages, extending Side field, and adding trading mode controls to the control panel.

## Requirements
* Support perpetual futures trading mode
* Support open/close long/short
* Support leverage (1x-20x)
* Only support cross margin
* Support taker/maker fee rate

## Key Changes Based on Requirements

### 1. Simplified Futures Position Table
**New Table: `futures_positions`**
```sql
CREATE TABLE futures_positions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL DEFAULT 1,
    simulation_id INTEGER REFERENCES simulations(id),
    symbol VARCHAR NOT NULL,
    base_currency VARCHAR NOT NULL DEFAULT 'USDT',
    position_side VARCHAR NOT NULL, -- 'long' or 'short'
    size DECIMAL NOT NULL DEFAULT 0, -- Position size (always positive)
    entry_price DECIMAL NOT NULL DEFAULT 0,
    margin_amount DECIMAL NOT NULL DEFAULT 0, -- Allocated margin for this position
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, simulation_id, symbol, position_side)
);
```

### 2. Backend Model Updates

**New File: `backend/internal/models/futures.go`**
- FuturesPosition struct: PositionSide, Size, EntryPrice, MarginAmount
- Helper methods: CalculatePnL(currentPrice), CalculateLiquidationPrice(currentPrice, leverage)

**Update: `backend/internal/models/order.go`**
- Extend OrderSide constants to include:
  - `OrderSideBuy` (existing)
  - `OrderSideSell` (existing)
  - `OrderSideOpenLong` = "open_long"
  - `OrderSideOpenShort` = "open_short"
  - `OrderSideCloseLong` = "close_long"
  - `OrderSideCloseShort` = "close_short"
- Add leverage field to OrderParameters JSON

### 3. WebSocket Message Updates

**Update: `backend/internal/handlers/websocket/order_events.go`**
- OrderPlaceData.Side now accepts: "buy", "sell", "open_long", "open_short", "close_long", "close_short"
- Add leverage field to OrderPlaceData for futures orders
- Route orders based on side value to spot or futures engine

**Update: `backend/internal/handlers/websocket/simulation_events.go`**
- Add `Mode` field to `SimulationStartData` struct
- Store mode in simulation record, validate it's "spot" or "future"

### 4. Trading Engine Updates

**New: `backend/internal/engines/trading/futures_engine.go`**
- OpenPosition(userID, simulationID, symbol, side, size, leverage, currentPrice)
- ClosePosition(userID, simulationID, symbol, side, size, currentPrice)
- CalculateRequiredMargin(size, price, leverage)
- ValidateMarginRequirement(userID, simulationID, requiredMargin)

**Update: `backend/internal/engines/trading/order_execution_engine.go`**
- Check order.Side to route correctly:
  - "buy", "sell" → existing spot logic
  - "open_long", "open_short", "close_long", "close_short" → futures engine
- For futures orders: modify margin balance instead of asset quantities

### 5. Portfolio Service Updates

**Update: `backend/internal/services/portfolio.go`**
- Add GetFuturesPositions(userID, simulationID, currentPrice) method
- Update GetUserPortfolio() to include futures positions and margin usage

**New API Endpoint:**
- `GET /api/futures/positions` - Get futures positions with calculated metrics

### 6. Frontend Changes

**New Component: `frontend/src/components/TradingModePanel.tsx`**
- Trading mode selector: "Spot Trading" | "Futures Trading"
- Leverage input (1x-20x) for futures mode
- Trading mode only changeable when simulation is stopped
- **Leverage input always enabled** - no need to communicate changes to backend during simulation
- Leverage value only sent to backend when placing orders

**Update: `frontend/src/components/OrderPanel.tsx`**
- Remove any leverage input (use global leverage from TradingModePanel)
- Check global trading mode to show appropriate buttons:
  - Spot mode: "Buy" / "Sell" buttons (side: "buy"/"sell")
  - Futures mode: "Open Long" / "Open Short" / "Close Long" / "Close Short" buttons (side: "open_long"/"open_short"/"close_long"/"close_short")
- Show margin requirement calculation for futures orders using current leverage
- Display existing position info for futures mode

**Update: `frontend/src/components/Portfolio.tsx`**
- Add "Futures Positions" section when in futures mode
- Display positions with P&L, margin used, liquidation price (calculated client-side)

**Update: `frontend/src/App.tsx` or main layout**
- Add TradingModePanel to the control panel area (alongside simulation controls)
- Pass trading mode and leverage to OrderPanel component

**Update: `frontend/src/contexts/WebSocketContext.tsx`**
- Store current trading mode and leverage in context
- Modify placeOrder() to use current leverage for futures orders
- Trading mode change only allowed when simulation stopped
- No WebSocket events needed for leverage changes

### 7. Order Processing Flow

**Mode Selection (before simulation):**
1. User selects "Futures Trading" in TradingModePanel
2. Sets initial leverage to 10x
3. Starts simulation with mode="future"
4. Trading mode locked, but leverage slider remains usable

**During Simulation:**
1. User can adjust leverage slider (e.g., change from 10x to 5x)
2. No communication to backend - purely frontend state
3. Next order placement will use the current leverage value

**Futures Trading:**
1. User adjusts leverage to 15x in TradingModePanel
2. User clicks "Open Long" with quantity 1.0
3. Frontend sends: `{type: "order_place", data: {side: "open_long", quantity: 1.0, leverage: 15}}` (using current leverage)
4. Backend creates/updates position with calculated margin using leverage 15

## Frontend Layout Changes

**Control Panel Area (next to simulation controls):**
```
[Simulation Controls] [Trading Mode Panel]

Trading Mode Panel:
┌─────────────────────────┐
│ Trading Mode            │
│ ○ Spot   ● Futures      │
│ (locked during sim)     │
│                         │
│ Leverage: [15x] (slider)│
│ (always enabled)        │
└─────────────────────────┘
```

**Order Panel:**
- Spot mode: [BUY] [SELL] buttons
- Futures mode: [OPEN LONG] [OPEN SHORT] [CLOSE LONG] [CLOSE SHORT] buttons
- Shows margin requirement based on current leverage setting

## Key Features
- **Flexible Leverage**: User can adjust leverage anytime, applied to next order
- **Mode Locking**: Trading mode locked during simulation, leverage always adjustable
- **No Unnecessary Communication**: Leverage changes don't trigger backend calls
- **Extended Side Values**: Reuse existing WebSocket order structure

## File Changes Summary

### New Files:
- `backend/internal/models/futures.go`
- `backend/internal/engines/trading/futures_engine.go`
- `frontend/src/components/TradingModePanel.tsx`

### Modified Files:
- `backend/internal/models/order.go` (extend OrderSide enum)
- `backend/internal/handlers/websocket/order_events.go` (add leverage field, route by side)
- `backend/internal/handlers/websocket/simulation_events.go` (add mode to start data)
- `backend/internal/engines/trading/order_execution_engine.go` (route futures orders)
- `backend/internal/services/portfolio.go` (add futures positions)
- `frontend/src/components/OrderPanel.tsx` (futures UI, no leverage input)
- `frontend/src/components/Portfolio.tsx` (futures positions display)
- `frontend/src/contexts/WebSocketContext.tsx` (trading mode/leverage context)
- `frontend/src/App.tsx` (add TradingModePanel to layout)

