-- Migration: Add flexible order parameters to support limit orders and future order types
-- Date: 2025-01-15
-- Description: Add order_params JSON field to orders table for flexible order parameters

-- Begin transaction
BEGIN;

-- Add the order_params JSON column to store flexible order parameters
ALTER TABLE orders 
ADD COLUMN order_params JSONB DEFAULT '{}' NOT NULL;

-- Commit the transaction
COMMIT;