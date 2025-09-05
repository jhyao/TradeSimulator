package websocket

import (
	"time"
	"fmt"
)

// GetCurrentTimestamp returns current timestamp in milliseconds
func GetCurrentTimestamp() int64 {
	return time.Now().UnixMilli()
}

// generateClientID generates a unique client ID
func generateClientID() string {
	return fmt.Sprintf("client_%d", time.Now().UnixNano())
}