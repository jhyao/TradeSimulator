# Task7 - Limit Order

## Main - Limit order

### Requirements
- **Session-Based Trading**: Each user session has its own isolated order execution engine
- **In-Memory Order Book**: Hold pending limit orders in memory for efficient processing
- **Price-Priority Execution**: Execute best price orders first (highest buy prices, lowest sell prices)
- **Simulation Integration**: Process orders during price updates within simulation engine
- **Real-Time Notifications**: Send WebSocket updates for order placement, execution, and cancellation

### Key Architecture Changes

#### **Before: Database Polling Approach**
- Orders stored only in database
- WebSocket triggers database queries on every price update
- Reactive execution after price broadcasts
- Performance: O(n) database queries per price update

#### **After: In-Memory Order Book**
- Orders stored in database + in-memory heaps
- Direct integration with simulation engine
- Proactive execution during price updates
- Performance: O(log n) heap operations

### Important Points

#### **Order Book Design**
- **BuyOrderHeap**: Max heap (highest price first) for buy limit orders
- **SellOrderHeap**: Min heap (lowest price first) for sell limit orders  
- **OrderIndex**: Quick O(1) lookup by order ID for cancellation
- **Session Isolation**: Each WebSocket client gets own order execution engine

#### **Execution Logic**
- **Buy Limits**: Execute when market price ≤ limit price
- **Sell Limits**: Execute when market price ≥ limit price
- **Price Priority**: Best prices execute first within each side
- **Atomic Operations**: Order execution happens during simulation tick

#### **Data Flow**
- **Order Placement**: Database → Order Book → WebSocket confirmation
- **Price Updates**: Simulation → Order Execution → Database → WebSocket notifications
- **Order Loading**: Database → Order Book (on simulation start/resume)

### Key Workflow

#### **1. Order Placement Flow**
```
User Places Limit Order → Validation → Database Save → Order Book Add → WebSocket Confirmation
```

#### **2. Price Update & Execution Flow**  
```
Simulation Price Update → Order Book Query → Execute Matching Orders → Database Update → WebSocket Notifications
```

#### **3. Session Lifecycle**
```
WebSocket Connect → Create Order Engine → Load Pending Orders → Process During Simulation → Clean Up on Disconnect
```

#### **4. Simulation Integration**
```
processNextBaseUpdate() → Update Price → Process Limit Orders → Send Price to Client
```

### Technical Specifications

#### **Order Book Operations**
- **AddOrder()**: O(log n) heap insertion
- **RemoveOrder()**: O(log n) heap removal  
- **GetOrdersToExecute()**: O(k log n) where k = executable orders
- **LoadPendingOrders()**: Bulk load from database on startup

#### **Database Schema** 
- Orders table includes `order_params` JSON field for flexible order types
- `limit_price` stored in order_params for limit orders
- Status tracking: pending → executed/cancelled

#### **WebSocket Messages**
- `order_placed`: Confirmation of limit order placement
- `order_executed`: Notification when limit order fills
- `order_cancelled`: Confirmation of order cancellation

### Performance Benefits
- **No Database Polling**: Eliminated per-price-update database queries
- **Reduced Latency**: Orders execute during simulation tick vs after WebSocket broadcast
- **Better Scalability**: In-memory operations scale better than database operations
- **Atomic Execution**: Price updates and order execution are synchronized

### Backwards Compatibility
- **API Unchanged**: Existing order placement endpoints work identically
- **Database Schema**: Added fields, no breaking changes
- **WebSocket Protocol**: Enhanced with new message types, existing messages unchanged
- **Frontend Compatible**: No UI changes required

### Error Handling & Recovery
- **Order Book Isolation**: Failures in one session don't affect others
- **Database Consistency**: Failed executions roll back cleanly
- **Order Recovery**: Pending orders reload from database on session restart
- **Graceful Degradation**: System continues if order book operations fail
