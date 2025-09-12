package types

// MessageType defines the type of WebSocket message
type MessageType string

const (
	ConnectionStatus MessageType = "connection_status"
	StatusUpdate     MessageType = "status_update"
	SimulationUpdate MessageType = "simulation_update"
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
	OrderPlaced         MessageType = "order_placed"
	OrderExecuted       MessageType = "order_executed"
	OrderCancelled      MessageType = "order_cancelled"
)

// WebSocketMessage represents a WebSocket message
type WebSocketMessage struct {
	Type MessageType `json:"type"`
	Data interface{} `json:"data"`
}

// ConnectionStatusData represents connection status message data
type ConnectionStatusData struct {
	Status    string `json:"status"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
}