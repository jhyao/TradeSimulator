package websocket

// MessageType defines the type of WebSocket message
type MessageType string

const (
	PriceUpdate      MessageType = "price_update"
	ConnectionStatus MessageType = "connection_status"
	StatusUpdate     MessageType = "status_update"
	Error           MessageType = "error"
	// Simulation control messages
	SimulationStart     MessageType = "simulation_control_start"
	SimulationStop      MessageType = "simulation_control_stop"
	SimulationPause     MessageType = "simulation_control_pause"
	SimulationResume    MessageType = "simulation_control_resume"
	SimulationSetSpeed  MessageType = "simulation_control_set_speed"
	SimulationSetTimeframe MessageType = "simulation_control_set_timeframe"
	SimulationGetStatus MessageType = "simulation_control_get_status"
	// Order control messages
	OrderPlace          MessageType = "order_place"
	OrderCancel         MessageType = "order_cancel"
)

// WebSocketMessage represents a WebSocket message
type WebSocketMessage struct {
	Type MessageType `json:"type"`
	Data interface{} `json:"data"`
}

// PriceUpdateData represents price update message data
type PriceUpdateData struct {
	Symbol    string  `json:"symbol"`
	Price     float64 `json:"price"`
	Timestamp int64   `json:"timestamp"`
}

// ConnectionStatusData represents connection status message data
type ConnectionStatusData struct {
	Status    string `json:"status"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
}