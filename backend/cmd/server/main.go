package main

import (
	"log"
	_ "tradesimulator/docs" // Import generated docs
	"tradesimulator/internal/config"
	"tradesimulator/internal/handlers"
	"tradesimulator/internal/services"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

// @title Trade Simulator API
// @version 1.0
// @description Trading simulation API for historical data replay and order execution
// @termsOfService http://swagger.io/terms/
// @contact.name API Support
// @contact.email support@tradesimulator.com
// @license.name MIT
// @license.url https://opensource.org/licenses/MIT
// @host localhost:8080
// @BasePath /api/v1
// @schemes http

func main() {
	// Load configuration
	cfg := config.Load()

	// Connect to database
	// if err := database.Connect(cfg.DatabaseURL); err != nil {
	// 	log.Fatalf("Failed to connect to database: %v", err)
	// }

	// Run database migrations
	// if err := database.AutoMigrate(); err != nil {
	// 	log.Fatalf("Failed to run database migrations: %v", err)
	// }

	// Initialize Gin router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// CORS middleware for development
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Initialize services
	binanceService := services.NewBinanceService()

	// Initialize handlers
	healthHandler := handlers.NewHealthHandler()
	marketHandler := handlers.NewMarketHandler()
	wsHandler := handlers.NewWebSocketHandler()

	// Initialize simulation engine and handler
	simulationEngine := services.NewSimulationEngine(wsHandler.GetHub(), binanceService)
	simulationHandler := handlers.NewSimulationHandler(simulationEngine)

	// Set simulation handler on WebSocket handler for control message processing
	wsHandler.SetSimulationHandler(simulationHandler)

	// Health check endpoint
	r.GET("/health", healthHandler.Health)

	// Swagger endpoint
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	// WebSocket endpoint
	r.GET("/ws", wsHandler.HandleWebSocket)

	// Test endpoint for WebSocket broadcasting
	r.POST("/test/broadcast", wsHandler.TestBroadcast)

	// API routes group
	api := r.Group("/api/v1")
	{
		api.GET("/health", healthHandler.Health)

		// Market data endpoints
		market := api.Group("/market")
		{
			market.GET("/historical", marketHandler.GetHistoricalData)
			market.GET("/symbols", marketHandler.GetSupportedSymbols)
			market.GET("/earliest-time/:symbol", marketHandler.GetEarliestTime)
		}

		// Simulation endpoints
		handlers.RegisterSimulationRoutes(api, simulationHandler)
	}

	// Start server
	log.Printf("Server starting on port %s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
