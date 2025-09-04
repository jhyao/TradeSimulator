package models

import (
	"time"
)

type SimulationStatus string

const (
	SimulationStatusRunning   SimulationStatus = "running"
	SimulationStatusPaused    SimulationStatus = "paused"
	SimulationStatusCompleted SimulationStatus = "completed"
	SimulationStatusStopped   SimulationStatus = "stopped"
)

type SimulationMode string

const (
	SimulationModeSpot   SimulationMode = "spot"
	SimulationModeFuture SimulationMode = "future"
)

// Simulation represents a trading simulation session record
type Simulation struct {
	ID             uint             `json:"id" gorm:"primaryKey"`
	UserID         uint             `json:"user_id" gorm:"index;not null;default:1"`
	Symbol         string           `json:"symbol" gorm:"not null;index"`
	StartSimTime   int64            `json:"start_sim_time" gorm:"not null"` // Simulation start time in milliseconds
	EndSimTime     int64            `json:"end_sim_time" gorm:"not null"`   // Simulation end time in milliseconds
	InitialFunding float64          `json:"initial_funding" gorm:"not null"`
	Mode           SimulationMode   `json:"mode" gorm:"not null;default:spot"`
	ExtraConfigs   string           `json:"extra_configs" gorm:"type:text"` // JSON format for additional configs
	Status         SimulationStatus `json:"status" gorm:"not null;default:running"`
	TotalValue     *float64         `json:"total_value,omitempty"` // Final portfolio value when completed
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`
}

func (Simulation) TableName() string {
	return "simulations"
}