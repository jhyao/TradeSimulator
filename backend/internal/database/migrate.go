package database

import (
	"log"
	"tradesimulator/internal/models"
)

func AutoMigrate() error {
	// First, handle data migration for existing records
	if err := migrateExistingData(); err != nil {
		log.Printf("Failed to migrate existing data: %v", err)
		return err
	}
	
	err := DB.AutoMigrate(
		&models.User{},
		&models.Order{},
		&models.Trade{},
		&models.Position{},
	)
	
	if err != nil {
		log.Printf("Failed to auto-migrate: %v", err)
		return err
	}
	
	log.Println("Database migration completed successfully")
	return nil
}

// migrateExistingData handles migration of existing data before schema changes
func migrateExistingData() error {
	// Check if orders table exists and has base_currency column
	var count int64
	if err := DB.Raw("SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'base_currency'").Scan(&count).Error; err != nil {
		log.Printf("Warning: could not check orders table structure: %v", err)
		return nil // Continue if we can't check
	}
	
	// If base_currency column doesn't exist, add it with default value first
	if count == 0 {
		log.Println("Adding base_currency column to orders table with default value")
		if err := DB.Exec("ALTER TABLE orders ADD COLUMN IF NOT EXISTS base_currency TEXT DEFAULT 'USDT'").Error; err != nil {
			return err
		}
		// Update all existing null values
		if err := DB.Exec("UPDATE orders SET base_currency = 'USDT' WHERE base_currency IS NULL").Error; err != nil {
			return err
		}
	}
	
	// Handle timestamp to bigint conversion for orders table
	if err := migrateOrdersTimestamps(); err != nil {
		return err
	}
	
	// Check if trades table exists and has base_currency column
	if err := DB.Raw("SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'trades' AND column_name = 'base_currency'").Scan(&count).Error; err != nil {
		log.Printf("Warning: could not check trades table structure: %v", err)
		return nil // Continue if we can't check
	}
	
	// If base_currency column doesn't exist, add it with default value first
	if count == 0 {
		log.Println("Adding base_currency column to trades table with default value")
		if err := DB.Exec("ALTER TABLE trades ADD COLUMN IF NOT EXISTS base_currency TEXT DEFAULT 'USDT'").Error; err != nil {
			return err
		}
		// Update all existing null values
		if err := DB.Exec("UPDATE trades SET base_currency = 'USDT' WHERE base_currency IS NULL").Error; err != nil {
			return err
		}
	}
	
	// Check if positions table exists and has base_currency column
	if err := DB.Raw("SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'positions' AND column_name = 'base_currency'").Scan(&count).Error; err != nil {
		log.Printf("Warning: could not check positions table structure: %v", err)
		return nil // Continue if we can't check
	}
	
	// If base_currency column doesn't exist, add it with default value first
	if count == 0 {
		log.Println("Adding base_currency column to positions table with default value")
		if err := DB.Exec("ALTER TABLE positions ADD COLUMN IF NOT EXISTS base_currency TEXT DEFAULT 'USDT'").Error; err != nil {
			return err
		}
		// Update all existing null values
		if err := DB.Exec("UPDATE positions SET base_currency = 'USDT' WHERE base_currency IS NULL").Error; err != nil {
			return err
		}
	}
	
	log.Println("Existing data migration completed successfully")
	return nil
}

// migrateOrdersTimestamps handles conversion of timestamp columns to bigint (milliseconds)
func migrateOrdersTimestamps() error {
	// Check if placed_at is still timestamp type
	var dataType string
	if err := DB.Raw("SELECT data_type FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'placed_at'").Scan(&dataType).Error; err != nil {
		log.Printf("Warning: could not check placed_at column type: %v", err)
		return nil
	}

	if dataType == "timestamp with time zone" || dataType == "timestamp without time zone" {
		log.Println("Converting orders timestamp columns to bigint (milliseconds)")
		
		// Convert placed_at from timestamp to bigint (milliseconds since epoch)
		if err := DB.Exec("ALTER TABLE orders ALTER COLUMN placed_at TYPE bigint USING EXTRACT(EPOCH FROM placed_at) * 1000").Error; err != nil {
			return err
		}
		
		// Convert executed_at from timestamp to bigint (milliseconds since epoch)
		// Handle nullable column carefully
		if err := DB.Exec("ALTER TABLE orders ALTER COLUMN executed_at TYPE bigint USING CASE WHEN executed_at IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM executed_at) * 1000 END").Error; err != nil {
			return err
		}
	}

	// Check if trades table exists and handle executed_at timestamp conversion
	if err := DB.Raw("SELECT data_type FROM information_schema.columns WHERE table_name = 'trades' AND column_name = 'executed_at'").Scan(&dataType).Error; err == nil {
		if dataType == "timestamp with time zone" || dataType == "timestamp without time zone" {
			log.Println("Converting trades executed_at column to bigint (milliseconds)")
			if err := DB.Exec("ALTER TABLE trades ALTER COLUMN executed_at TYPE bigint USING EXTRACT(EPOCH FROM executed_at) * 1000").Error; err != nil {
				return err
			}
		}
	}

	return nil
}