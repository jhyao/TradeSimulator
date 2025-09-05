package main

import (
	"log"
	_ "tradesimulator/docs" // Import generated docs
	"tradesimulator/internal/config"
	"tradesimulator/internal/dao/simulation"
	"tradesimulator/internal/dao/trading"
	"tradesimulator/internal/database"
	simulationEngine "tradesimulator/internal/engines/simulation"
	tradingEngine "tradesimulator/internal/engines/trading"
	"tradesimulator/internal/handlers"
	wsHandlers "tradesimulator/internal/handlers/websocket"
	"tradesimulator/internal/integrations/binance"
	"tradesimulator/internal/services"
	"tradesimulator/internal/services/market"

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
	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Run database migrations
	if err := database.AutoMigrate(); err != nil {
		log.Fatalf("Failed to run database migrations: %v", err)
	}

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

	// Initialize integrations
	binanceClient := binance.NewBinanceService()
	
	// Initialize services
	marketDataService := market.NewMarketDataService(binanceClient)

	// Initialize handlers
	healthHandler := handlers.NewHealthHandler()
	marketHandler := handlers.NewMarketHandler(marketDataService)

	// Initialize DAOs
	simulationDAO := simulation.NewSimulationDAO(database.GetDB())
	orderDAO := trading.NewOrderDAO(database.GetDB())
	tradeDAO := trading.NewTradeDAO(database.GetDB())
	positionDAO := trading.NewPositionDAO(database.GetDB())

	// Initialize portfolio service
	portfolioService := services.NewPortfolioService()
	
	// Initialize WebSocket handler with dependencies (engines will be created per-client)
	wsHandler := wsHandlers.NewWebSocketHandler(binanceClient, portfolioService, simulationDAO, orderDAO, tradeDAO, positionDAO)

	// Initialize order service (for REST API endpoints) 
	// Create a simple order execution engine for REST API usage
	restOrderExecutionEngine := tradingEngine.NewOrderExecutionEngine(orderDAO, tradeDAO, positionDAO, nil, database.GetDB())
	orderService := services.NewOrderService(orderDAO, tradeDAO, restOrderExecutionEngine)

	// Initialize event handlers (no longer need global engines)
	simulationEventHandler := wsHandlers.NewSimulationEventHandler()
	orderEventHandler := wsHandlers.NewOrderEventHandler(orderService, portfolioService)
	
	// Set handlers on WebSocket handler for message processing
	wsHandler.SetHandlers(simulationEventHandler, orderEventHandler)

	// Initialize REST API handlers (will use their own engines if needed)
	// Create simple engines for REST API usage
	restSimulationEngine := simulationEngine.NewSimulationEngine(nil, binanceClient, portfolioService, simulationDAO)
	simulationHandler := handlers.NewSimulationHandler(restSimulationEngine, simulationDAO)
	orderHandler := handlers.NewOrderHandler(orderService, portfolioService, restSimulationEngine)

	// Health check endpoint
	r.GET("/health", healthHandler.Health)

	// Swagger endpoint
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	// WebSocket routes group
	ws := r.Group("/websocket/v1")
	{
		ws.GET("/simulation", wsHandler.HandleWebSocket)
	}

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

		// Order and portfolio endpoints
		orders := api.Group("/orders")
		{
			orders.GET("/", orderHandler.GetOrders)
		}

		trades := api.Group("/trades")
		{
			trades.GET("/", orderHandler.GetTrades)
		}

		positions := api.Group("/positions")
		{
			positions.GET("/", orderHandler.GetPositions)
		}
	}

	// Start server
	log.Printf("Server starting on port %s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
