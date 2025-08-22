package handlers

import (
	"crypto/rand"
	"fmt"
	"time"
)

// GetCurrentTimestamp returns the current Unix timestamp in milliseconds
func GetCurrentTimestamp() int64 {
	return time.Now().UnixMilli()
}

// generateClientID generates a unique client ID
func generateClientID() string {
	bytes := make([]byte, 4)
	rand.Read(bytes)
	return fmt.Sprintf("client_%x", bytes)
}