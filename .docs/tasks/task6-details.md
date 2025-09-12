
## Task 6.1: Order Placement & WebSocket Notifications
**Duration**: 1-2 days  
**Priority**: Critical

### Description
Implement order placement, confirmation, execution notification through WebSocket and market order execution engine.

### Requirements
- Set initial funds when starting simulation
- Order placement with WebSocket-based confirmation and execution notifications
- Market order execution engine that processes orders at current simulation price
- Basic order validation and error handling
- Real-time order status updates via WebSocket

### What to Do
1. Create orders and trades table schema (extend existing database connection)
2. Create order and trade data structures
3. Implement market order execution engine
4. Execute orders at current simulation price from Task 5
5. Add WebSocket notification system for order events (placed, executed, failed)
6. Implement order validation (sufficient funds, valid amounts)
7. Create order message type via websocket 
8. Add simple fee calculation (0.1% flat rate)
9. Store order/trade records in database

### What NOT to Do
- Don't implement limit orders or stop orders
- Don't add slippage simulation
- Don't implement order queue or matching engine
- Don't add complex fee structures (maker/taker)
- Don't implement margin trading or leverage
- Don't implement UI components yet

### Success Criteria
- [ ] Market order execution engine processes orders correctly
- [ ] Orders execute at exact current simulation price
- [ ] WebSocket notifications sent for order placement/execution
- [ ] Position/trade records created correctly
- [ ] Fees calculated and deducted correctly
- [ ] Order validation prevents invalid trades

---

## Task 6.2: Order Placement UI Implementation
**Duration**: 1 day  
**Priority**: High

### Description
Implement user interface components for order placement, integrating with the order execution system from Task 6.1.

### Requirements
- Set initial funds before start simulation
- Order placement form with buy/sell controls
- Integration with WebSocket notifications for real-time feedback
- Basic order confirmation and status display
- Input validation and error handling

### What to Do
1. Create order placement form component
2. Add buy/sell order controls with quantity input
3. Integrate with order API endpoints from Task 6.1
4. Display order confirmation and execution status
5. Listen to WebSocket notifications for order updates
6. Add basic input validation and error display
7. Show loading states during order processing

### What NOT to Do
- Don't implement advanced order types UI
- Don't add complex order management features
- Don't implement order history display
- Don't add advanced validation beyond basic checks

### Success Criteria
- [ ] User can place market buy/sell orders via UI
- [ ] Order form validates input correctly
- [ ] Real-time feedback via WebSocket notifications
- [ ] Order confirmation and status updates display
- [ ] Error handling works for failed orders
- [ ] UI integrates smoothly with execution engine


Update1: model refactor
1. Order table shouldn't contain fee, fee should be determinted once order executed, so should be in trade table not in order table
2. Order table placed_at and executed_at should use simulation time
3. Trade table executed_at should use simulation time
4. Order table and Trade table add a cloumn for base currency, for ETHUSDT, base is USDT, it's unit of price
5. Merge position and portfolio to one, because USDT and ETH are all positions, add base currency column, for USDT position, base is USDT, price is 1


Update2: pnl update in frontend
1. change backend portfolio apis to position apis
2. move pnl calculation from backend to frontend, backend return holding quantity and average price, front end show pnl on price update.


Update3: simulation record
1. Add simulation table, record fixed simulation params (symbol, start simulation time, end simulation time, start time, end time, initial funding, mode(spot/future), not include variable params (speed, timeframe), reserve an extra column for other configs (json format), status, total value.
2. Create a new simulation record when start simulation, update status when pause/resume/stop.
3. Add simulation id in order, trade, position tables to bind these records with simulation batches.

Update4: websocket connection open/close
1. Create websocket connection when starting simulation, currently is open connection once open the ui.
2. Close websocket connection after simulation stopped, two stop cases: stop trigger front frontend and backend stop simulation on completion, but can both cases frontend will receive status_update event that status change to stopped, so can be handled in one place.
3. "pause" should keep the connection alive, only pause price update, "stop" should close the connection.
4. Once stopped, clear related things in backend, but keep things in UI.

Update5: resume stopped simulation
1. Support resume on stopped status, resume will create the connection again, but with last status of stopped simulation. On ui, after stop, if symbol, startTime, initialFunding not changed, then support resume
2. Still use old simulation id
3. Use end_sim_time as currentPriceTime in simulation engine, based on this time to load candle data
6. Once stopped, control button should become "Start New" and "Resume"

Update6: Simulation history view and load
1. Add simulation history tab in the bottom area, include simulation params, and P&L
2. On simulation history record, add a "open" button to load the whole to status of that history simulation, include selected symbol, startTime, initialFunding, current simulation time (end_sim_time in simulation history record), and load price chart end to current simulation time, load trade marks on price chart, load positions.
3. After load, will be able to resume, just like in update5.
4. Remove earliest time and selected time text on start time control card, instead display current simulation time
 


