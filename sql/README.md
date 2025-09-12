# Database Migrations

This folder contains SQL migration scripts for the TradeSimulator database.

## Migration Files

### 001_add_flexible_order_params.sql
Adds flexible order parameters support to the orders table:
- Adds `order_params JSONB` column for storing order-type specific parameters
- Adds index for efficient pending limit order queries
- Adds constraint to ensure limit orders have valid limit_price
- Supports current limit orders and future order types (stop-limit, take-profit, stop-loss)

### Usage

```bash
# Apply migration
psql -d tradesimulator -f sql/001_add_flexible_order_params.sql

# Verify migration
psql -d tradesimulator -f sql/001_verify_migration.sql

# Rollback if needed
psql -d tradesimulator -f sql/001_add_flexible_order_params_rollback.sql
```

## Order Parameters Schema

The `order_params` JSONB field can contain:

```json
{
  "limit_price": 45000.00,           // For limit orders
  "stop_price": 48000.00,            // For stop-limit orders (future)
  "stop_limit_price": 47900.00,      // For stop-limit orders (future)
  "take_profit_price": 50000.00,     // For take-profit orders (future)
  "stop_loss_price": 40000.00        // For stop-loss orders (future)
}
```

## Example Queries

```sql
-- Find all pending limit orders
SELECT * FROM orders 
WHERE status = 'pending' AND type = 'limit';

-- Get limit price for limit orders
SELECT id, (order_params->>'limit_price')::numeric as limit_price 
FROM orders 
WHERE order_params ? 'limit_price';
```