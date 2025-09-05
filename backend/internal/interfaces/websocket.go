package interfaces

// WebSocketHub interface to avoid import cycles
type WebSocketHub interface {
	BroadcastMessageString(msgType string, data interface{})
}