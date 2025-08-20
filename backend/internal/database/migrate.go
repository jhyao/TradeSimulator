package database

import (
	"log"
	"tradesimulator/internal/models"
)

func AutoMigrate() error {
	err := DB.AutoMigrate(
		&models.User{},
	)
	
	if err != nil {
		log.Printf("Failed to auto-migrate: %v", err)
		return err
	}
	
	log.Println("Database migration completed successfully")
	return nil
}