package websocket

import (
	"encoding/json"

	simulationEngine "tradesimulator/internal/engines/simulation"
)

// Simulation control message structures
type SimulationStartData struct {
	Symbol         string  `json:"symbol"`
	StartTime      int64   `json:"startTime"`
	Interval       string  `json:"interval"`
	Speed          int     `json:"speed"`
	InitialFunding float64 `json:"initialFunding"`
}

type SimulationSetSpeedData struct {
	Speed int `json:"speed"`
}

type SimulationSetTimeframeData struct {
	Timeframe string `json:"timeframe"`
}

type SimulationControlResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// SimulationEventHandlerImpl handles simulation-related WebSocket events
type SimulationEventHandlerImpl struct {
	engine *simulationEngine.SimulationEngine
	hub    *Hub
}

// NewSimulationEventHandler creates a new simulation event handler
func NewSimulationEventHandler(engine *simulationEngine.SimulationEngine, hub *Hub) *SimulationEventHandlerImpl {
	return &SimulationEventHandlerImpl{
		engine: engine,
		hub:    hub,
	}
}

// HandleMessage handles simulation control messages
func (h *SimulationEventHandlerImpl) HandleMessage(client *Client, message WebSocketMessage) error {
	switch message.Type {
	case SimulationStart:
		return h.handleStart(client, message.Data)
	case SimulationStop:
		return h.handleStop(client)
	case SimulationPause:
		return h.handlePause(client)
	case SimulationResume:
		return h.handleResume(client)
	case SimulationSetSpeed:
		return h.handleSetSpeed(client, message.Data)
	case SimulationSetTimeframe:
		return h.handleSetTimeframe(client, message.Data)
	case SimulationGetStatus:
		return h.handleGetStatus(client)
	default:
		return h.sendResponse(client, false, "Unknown simulation message", nil, "Unknown message type")
	}
}

// handleStart handles simulation start requests
func (h *SimulationEventHandlerImpl) handleStart(client *Client, data interface{}) error {
	dataBytes, _ := json.Marshal(data)
	var startData SimulationStartData
	if err := json.Unmarshal(dataBytes, &startData); err != nil {
		return h.sendResponse(client, false, "Invalid start simulation data", nil, err.Error())
	}

	// Validate initial funding
	if startData.InitialFunding <= 0 {
		return h.sendResponse(client, false, "Invalid initial funding", nil, "Initial funding must be greater than 0")
	}

	if err := h.engine.Start(startData.Symbol, startData.Interval, startData.StartTime, startData.Speed, startData.InitialFunding); err != nil {
		return h.sendResponse(client, false, "Failed to start simulation", nil, err.Error())
	}

	// Get updated status and broadcast it
	status := h.engine.GetStatus()
	h.hub.BroadcastMessage(StatusUpdate, status)

	return h.sendResponse(client, true, "Simulation started", map[string]interface{}{
		"symbol":         startData.Symbol,
		"startTime":      startData.StartTime,
		"interval":       startData.Interval,
		"speed":          startData.Speed,
		"initialFunding": startData.InitialFunding,
	}, "")
}

// handleStop handles simulation stop requests
func (h *SimulationEventHandlerImpl) handleStop(client *Client) error {
	if err := h.engine.Stop(); err != nil {
		return h.sendResponse(client, false, "Failed to stop simulation", nil, err.Error())
	}

	// Get updated status and broadcast it
	status := h.engine.GetStatus()
	h.hub.BroadcastMessage(StatusUpdate, status)

	return h.sendResponse(client, true, "Simulation stopped", nil, "")
}

// handlePause handles simulation pause requests
func (h *SimulationEventHandlerImpl) handlePause(client *Client) error {
	if err := h.engine.Pause(); err != nil {
		return h.sendResponse(client, false, "Failed to pause simulation", nil, err.Error())
	}

	// Get updated status and broadcast it
	status := h.engine.GetStatus()
	h.hub.BroadcastMessage(StatusUpdate, status)

	return h.sendResponse(client, true, "Simulation paused", nil, "")
}

// handleResume handles simulation resume requests
func (h *SimulationEventHandlerImpl) handleResume(client *Client) error {
	if err := h.engine.Resume(); err != nil {
		return h.sendResponse(client, false, "Failed to resume simulation", nil, err.Error())
	}

	// Get updated status and broadcast it
	status := h.engine.GetStatus()
	h.hub.BroadcastMessage(StatusUpdate, status)

	return h.sendResponse(client, true, "Simulation resumed", nil, "")
}

// handleSetSpeed handles simulation speed change requests
func (h *SimulationEventHandlerImpl) handleSetSpeed(client *Client, data interface{}) error {
	dataBytes, _ := json.Marshal(data)
	var speedData SimulationSetSpeedData
	if err := json.Unmarshal(dataBytes, &speedData); err != nil {
		return h.sendResponse(client, false, "Invalid speed data", nil, err.Error())
	}

	if err := h.engine.SetSpeed(speedData.Speed); err != nil {
		return h.sendResponse(client, false, "Failed to set speed", nil, err.Error())
	}

	return h.sendResponse(client, true, "Speed updated", map[string]interface{}{
		"speed": speedData.Speed,
	}, "")
}

// handleSetTimeframe handles simulation timeframe change requests
func (h *SimulationEventHandlerImpl) handleSetTimeframe(client *Client, data interface{}) error {
	dataBytes, _ := json.Marshal(data)
	var timeframeData SimulationSetTimeframeData
	if err := json.Unmarshal(dataBytes, &timeframeData); err != nil {
		return h.sendResponse(client, false, "Invalid timeframe data", nil, err.Error())
	}

	if err := h.engine.SetTimeframe(timeframeData.Timeframe); err != nil {
		return h.sendResponse(client, false, "Failed to set timeframe", nil, err.Error())
	}

	return h.sendResponse(client, true, "Timeframe updated", map[string]interface{}{
		"timeframe": timeframeData.Timeframe,
	}, "")
}

// handleGetStatus handles simulation status requests
func (h *SimulationEventHandlerImpl) handleGetStatus(client *Client) error {
	status := h.engine.GetStatus()
	return h.sendResponse(client, true, "Status retrieved", status, "")
}

// sendResponse sends a control response back to the client
func (h *SimulationEventHandlerImpl) sendResponse(client *Client, success bool, message string, data interface{}, errorMsg string) error {
	response := SimulationControlResponse{
		Success: success,
		Message: message,
		Data:    data,
		Error:   errorMsg,
	}

	responseMsgType := "simulation_control_response"
	if !success {
		responseMsgType = "simulation_control_error"
	}

	responseMessage := WebSocketMessage{
		Type: MessageType(responseMsgType),
		Data: response,
	}

	client.SendMessage(responseMessage)
	return nil
}
