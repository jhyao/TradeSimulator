package websocket

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	simulationDAO "tradesimulator/internal/dao/simulation"
	tradingDAO "tradesimulator/internal/dao/trading"
	"tradesimulator/internal/database"
	simulationEngine "tradesimulator/internal/engines/simulation"
	"tradesimulator/internal/engines/trading"
	"tradesimulator/internal/integrations/binance"
	"tradesimulator/internal/services"
)

// WebSocketHandler handles WebSocket connections and manages event routing
type WebSocketHandler struct {
	hub               *Hub
	simulationHandler SimulationEventHandler
	orderHandler      OrderEventHandler
	
	// Dependencies for creating session-specific engines
	binanceService   *binance.BinanceService
	portfolioService *services.PortfolioService
	simulationDAO    simulationDAO.SimulationDAOInterface
	orderDAO         tradingDAO.OrderDAOInterface
	tradeDAO         tradingDAO.TradeDAOInterface
	positionDAO      tradingDAO.PositionDAOInterface
}

// NewWebSocketHandler creates a new WebSocket handler with initialized event handlers
func NewWebSocketHandler(binanceService *binance.BinanceService, portfolioService *services.PortfolioService, simulationDAO simulationDAO.SimulationDAOInterface, orderDAO tradingDAO.OrderDAOInterface, tradeDAO tradingDAO.TradeDAOInterface, positionDAO tradingDAO.PositionDAOInterface, orderService *services.OrderService) *WebSocketHandler {
	hub := NewHub()
	go hub.Run()
	
	// Initialize event handlers
	simulationHandler := NewSimulationEventHandler()
	orderHandler := NewOrderEventHandler(orderService, portfolioService)
	
	return &WebSocketHandler{
		hub:               hub,
		simulationHandler: simulationHandler,
		orderHandler:      orderHandler,
		binanceService:    binanceService,
		portfolioService:  portfolioService,
		simulationDAO:     simulationDAO,
		orderDAO:          orderDAO,
		tradeDAO:          tradeDAO,
		positionDAO:       positionDAO,
	}
}


// HandleWebSocket upgrades HTTP connection to WebSocket and manages client
func (wh *WebSocketHandler) HandleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to upgrade connection"})
		return
	}
	
	// Create client first
	client := NewClient(conn, wh.hub, wh.simulationHandler, wh.orderHandler, nil, nil)
	
	// Create client message adapter
	clientAdapter := NewClientMessageAdapter(client)
	
	// Create order engine first
	orderEngineInstance := wh.createOrderEngineForClient(clientAdapter)
	
	// Create simulation engine with order engine dependency
	simulationEngineInstance := wh.createSimulationEngineForClient(clientAdapter, orderEngineInstance)
	
	// Set the engines on the client
	client.SimulationEngine = simulationEngineInstance
	client.OrderEngine = orderEngineInstance
	
	// Register client and start processing
	wh.hub.RegisterClient(client)
	client.Start()
}

// createSimulationEngineForClient creates a new simulation engine instance for a client
func (wh *WebSocketHandler) createSimulationEngineForClient(clientAdapter *ClientMessageAdapter, orderEngine trading.OrderExecutionEngineInterface) *simulationEngine.SimulationEngine {
	return simulationEngine.NewSimulationEngine(clientAdapter, wh.binanceService, wh.portfolioService, wh.simulationDAO, wh.positionDAO, orderEngine)
}

// createOrderEngineForClient creates a new order execution engine instance for a client
func (wh *WebSocketHandler) createOrderEngineForClient(clientAdapter *ClientMessageAdapter) trading.OrderExecutionEngineInterface {
	return trading.NewOrderExecutionEngine(wh.orderDAO, wh.tradeDAO, wh.positionDAO, clientAdapter, database.DB)
}

// GetHub returns the WebSocket hub for broadcasting messages
func (wh *WebSocketHandler) GetHub() *Hub {
	return wh.hub
}