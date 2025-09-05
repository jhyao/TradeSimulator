package websocket

import (
	"encoding/json"
	"tradesimulator/internal/types"
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
	// Remove global engine - now each client has its own
}

// NewSimulationEventHandler creates a new simulation event handler
func NewSimulationEventHandler() *SimulationEventHandlerImpl {
	return &SimulationEventHandlerImpl{}
}

// HandleMessage handles simulation control messages
func (h *SimulationEventHandlerImpl) HandleMessage(client *Client, message types.WebSocketMessage) error {
	switch message.Type {
	case types.SimulationStart:
		return h.handleStart(client, message.Data)
	case types.SimulationStop:
		return h.handleStop(client)
	case types.SimulationPause:
		return h.handlePause(client)
	case types.SimulationResume:
		return h.handleResume(client)
	case types.SimulationSetSpeed:
		return h.handleSetSpeed(client, message.Data)
	case types.SimulationSetTimeframe:
		return h.handleSetTimeframe(client, message.Data)
	case types.SimulationGetStatus:
		return h.handleGetStatus(client)
	default:
		client.SendError("Unknown simulation message", "Unknown message type " + string(message.Type))
		return nil
	}
}

// handleStart handles simulation start requests
func (h *SimulationEventHandlerImpl) handleStart(client *Client, data interface{}) error {
	dataBytes, _ := json.Marshal(data)
	var startData SimulationStartData
	if err := json.Unmarshal(dataBytes, &startData); err != nil {
		client.SendError("Invalid start simulation data", err.Error())
		return nil
	}

	// Validate initial funding
	if startData.InitialFunding <= 0 {
		client.SendError("Invalid initial funding", "Initial funding must be greater than 0")
		return nil
	}

	if err := client.SimulationEngine.Start(startData.Symbol, startData.Interval, startData.StartTime, startData.Speed, startData.InitialFunding); err != nil {
		client.SendError("Failed to start simulation", err.Error())
		return nil
	}

	return nil
}

// handleStop handles simulation stop requests
func (h *SimulationEventHandlerImpl) handleStop(client *Client) error {
	if err := client.SimulationEngine.Stop(); err != nil {
		client.SendError("Failed to stop simulation", err.Error())
		return nil
	}

	return nil
}

// handlePause handles simulation pause requests
func (h *SimulationEventHandlerImpl) handlePause(client *Client) error {
	if err := client.SimulationEngine.Pause(); err != nil {
		client.SendError("Failed to pause simulation", err.Error())
		return nil
	}

	return nil
}

// handleResume handles simulation resume requests
func (h *SimulationEventHandlerImpl) handleResume(client *Client) error {
	if err := client.SimulationEngine.Resume(); err != nil {
		client.SendError("Failed to resume simulation", err.Error())
		return nil
	}

	return nil
}

// handleSetSpeed handles simulation speed change requests
func (h *SimulationEventHandlerImpl) handleSetSpeed(client *Client, data interface{}) error {
	dataBytes, _ := json.Marshal(data)
	var speedData SimulationSetSpeedData
	if err := json.Unmarshal(dataBytes, &speedData); err != nil {
		client.SendError("Invalid speed data", err.Error())
		return nil
	}

	if err := client.SimulationEngine.SetSpeed(speedData.Speed); err != nil {
		client.SendError("Failed to set speed", err.Error())
		return nil
	}

	return nil
}

// handleSetTimeframe handles simulation timeframe change requests
func (h *SimulationEventHandlerImpl) handleSetTimeframe(client *Client, data interface{}) error {
	dataBytes, _ := json.Marshal(data)
	var timeframeData SimulationSetTimeframeData
	if err := json.Unmarshal(dataBytes, &timeframeData); err != nil {
		client.SendError("Invalid timeframe data", err.Error())
		return nil
	}

	if err := client.SimulationEngine.SetTimeframe(timeframeData.Timeframe); err != nil {
		client.SendError("Failed to set timeframe", err.Error())
		return nil
	}

	return nil
}

// handleGetStatus handles simulation status requests
func (h *SimulationEventHandlerImpl) handleGetStatus(client *Client) error {
	// Explicitly send status update on request
	client.SimulationEngine.SendStatusUpdate("")
	return nil
}

