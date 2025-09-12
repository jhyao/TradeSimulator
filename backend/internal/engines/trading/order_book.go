package trading

import (
	"container/heap"
	"fmt"
	"log"
	"sync"

	"tradesimulator/internal/models"
)

// BuyOrderHeap implements heap.Interface for buy orders (max heap - highest price first)
type BuyOrderHeap []*models.Order

func (h BuyOrderHeap) Len() int { return len(h) }
func (h BuyOrderHeap) Less(i, j int) bool {
	priceI := h[i].GetLimitPrice()
	priceJ := h[j].GetLimitPrice()
	if priceI == nil || priceJ == nil {
		return false
	}
	return *priceI > *priceJ // Max heap - highest price first
}
func (h BuyOrderHeap) Swap(i, j int) { h[i], h[j] = h[j], h[i] }

func (h *BuyOrderHeap) Push(x interface{}) {
	*h = append(*h, x.(*models.Order))
}

func (h *BuyOrderHeap) Pop() interface{} {
	old := *h
	n := len(old)
	item := old[n-1]
	*h = old[0 : n-1]
	return item
}

// SellOrderHeap implements heap.Interface for sell orders (min heap - lowest price first)
type SellOrderHeap []*models.Order

func (h SellOrderHeap) Len() int { return len(h) }
func (h SellOrderHeap) Less(i, j int) bool {
	priceI := h[i].GetLimitPrice()
	priceJ := h[j].GetLimitPrice()
	if priceI == nil || priceJ == nil {
		return false
	}
	return *priceI < *priceJ // Min heap - lowest price first
}
func (h SellOrderHeap) Swap(i, j int) { h[i], h[j] = h[j], h[i] }

func (h *SellOrderHeap) Push(x interface{}) {
	*h = append(*h, x.(*models.Order))
}

func (h *SellOrderHeap) Pop() interface{} {
	old := *h
	n := len(old)
	item := old[n-1]
	*h = old[0 : n-1]
	return item
}

// SymbolOrderBook holds buy and sell orders for a specific symbol
type SymbolOrderBook struct {
	Symbol     string
	BuyOrders  *BuyOrderHeap  // Max heap for buy orders (highest price first)
	SellOrders *SellOrderHeap // Min heap for sell orders (lowest price first)
	OrderIndex map[uint]*models.Order // Quick lookup by order ID
}

// NewSymbolOrderBook creates a new order book for a symbol
func NewSymbolOrderBook(symbol string) *SymbolOrderBook {
	buyOrders := &BuyOrderHeap{}
	sellOrders := &SellOrderHeap{}
	heap.Init(buyOrders)
	heap.Init(sellOrders)
	
	return &SymbolOrderBook{
		Symbol:     symbol,
		BuyOrders:  buyOrders,
		SellOrders: sellOrders,
		OrderIndex: make(map[uint]*models.Order),
	}
}

// OrderBook manages all orders across multiple symbols
type OrderBook struct {
	mu          sync.RWMutex
	symbolBooks map[string]*SymbolOrderBook
}

// NewOrderBook creates a new order book
func NewOrderBook() *OrderBook {
	return &OrderBook{
		symbolBooks: make(map[string]*SymbolOrderBook),
	}
}

// getSymbolBook gets or creates a symbol-specific order book
func (ob *OrderBook) getSymbolBook(symbol string) *SymbolOrderBook {
	if book, exists := ob.symbolBooks[symbol]; exists {
		return book
	}
	
	book := NewSymbolOrderBook(symbol)
	ob.symbolBooks[symbol] = book
	return book
}

// AddOrder adds a limit order to the order book
func (ob *OrderBook) AddOrder(order *models.Order) error {
	if order.Type != models.OrderTypeLimit {
		return fmt.Errorf("only limit orders can be added to order book")
	}
	
	limitPrice := order.GetLimitPrice()
	if limitPrice == nil {
		return fmt.Errorf("limit order must have a limit price")
	}
	
	ob.mu.Lock()
	defer ob.mu.Unlock()
	
	book := ob.getSymbolBook(order.Symbol)
	
	// Check if order already exists
	if _, exists := book.OrderIndex[order.ID]; exists {
		return fmt.Errorf("order %d already exists in order book", order.ID)
	}
	
	// Add to order index
	book.OrderIndex[order.ID] = order
	
	// Add order to appropriate heap
	if order.Side == models.OrderSideBuy {
		heap.Push(book.BuyOrders, order)
	} else {
		heap.Push(book.SellOrders, order)
	}
	
	log.Printf("Added %s limit order %d to order book: %s %.8f at %.8f",
		order.Side, order.ID, order.Symbol, order.Quantity, *limitPrice)
	
	return nil
}

// RemoveOrder removes an order from the order book
func (ob *OrderBook) RemoveOrder(orderID uint) (*models.Order, error) {
	ob.mu.Lock()
	defer ob.mu.Unlock()
	
	// Find the order across all symbol books
	for _, book := range ob.symbolBooks {
		if order, exists := book.OrderIndex[orderID]; exists {
			// Remove from order index
			delete(book.OrderIndex, orderID)
			
			// Remove from appropriate heap
			if order.Side == models.OrderSideBuy {
				// Find and remove from buy orders heap
				for i, o := range *book.BuyOrders {
					if o.ID == orderID {
						heap.Remove(book.BuyOrders, i)
						break
					}
				}
			} else {
				// Find and remove from sell orders heap
				for i, o := range *book.SellOrders {
					if o.ID == orderID {
						heap.Remove(book.SellOrders, i)
						break
					}
				}
			}
			
			log.Printf("Removed order %d from order book", orderID)
			return order, nil
		}
	}
	
	return nil, fmt.Errorf("order %d not found in order book", orderID)
}

// GetOrdersToExecute returns orders that should execute at the current price
func (ob *OrderBook) GetOrdersToExecute(symbol string, currentPrice float64) []*models.Order {
	if currentPrice <= 0 {
		log.Printf("Invalid price for order execution: %.8f", currentPrice)
		return nil
	}
	
	ob.mu.Lock() // Use write lock since we'll be removing orders
	defer ob.mu.Unlock()
	
	book, exists := ob.symbolBooks[symbol]
	if !exists {
		return nil // No orders for this symbol
	}
	
	var ordersToExecute []*models.Order
	
	// Check buy orders (execute when current price <= limit price)
	// Use heap to get best prices first (highest price buy orders)
	for book.BuyOrders.Len() > 0 {
		order := (*book.BuyOrders)[0] // Peek at top of heap
		limitPrice := order.GetLimitPrice()
		if limitPrice == nil {
			// Remove invalid order
			heap.Pop(book.BuyOrders)
			delete(book.OrderIndex, order.ID)
			continue
		}
		
		// Buy orders execute when current price <= limit price
		if currentPrice <= *limitPrice {
			ordersToExecute = append(ordersToExecute, order)
			// Remove from buy orders heap and index
			heap.Pop(book.BuyOrders)
			delete(book.OrderIndex, order.ID)
		} else {
			break // No more buy orders will execute (heap is sorted)
		}
	}
	
	// Check sell orders (execute when current price >= limit price)  
	// Use heap to get best prices first (lowest price sell orders)
	for book.SellOrders.Len() > 0 {
		order := (*book.SellOrders)[0] // Peek at top of heap
		limitPrice := order.GetLimitPrice()
		if limitPrice == nil {
			// Remove invalid order
			heap.Pop(book.SellOrders)
			delete(book.OrderIndex, order.ID)
			continue
		}
		
		// Sell orders execute when current price >= limit price
		if currentPrice >= *limitPrice {
			ordersToExecute = append(ordersToExecute, order)
			// Remove from sell orders heap and index
			heap.Pop(book.SellOrders)
			delete(book.OrderIndex, order.ID)
		} else {
			break // No more sell orders will execute (heap is sorted)
		}
	}
	
	if len(ordersToExecute) > 0 {
		log.Printf("Found %d orders to execute for %s at price %.8f", 
			len(ordersToExecute), symbol, currentPrice)
	}
	
	return ordersToExecute
}

// GetOrdersByUser returns all pending orders for a specific user and simulation
func (ob *OrderBook) GetOrdersByUser(userID uint, simulationID *uint) []*models.Order {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	
	var userOrders []*models.Order
	
	for _, book := range ob.symbolBooks {
		for _, order := range book.OrderIndex {
			// Check if order belongs to the user and simulation
			if order.UserID == userID {
				// Handle simulation ID comparison (both could be nil)
				if (simulationID == nil && order.SimulationID == nil) ||
				   (simulationID != nil && order.SimulationID != nil && *simulationID == *order.SimulationID) {
					userOrders = append(userOrders, order)
				}
			}
		}
	}
	
	return userOrders
}

// GetOrderCount returns the total number of orders in the order book
func (ob *OrderBook) GetOrderCount() int {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	
	count := 0
	for _, book := range ob.symbolBooks {
		count += len(book.OrderIndex)
	}
	return count
}

// GetOrderCountBySymbol returns the number of orders for a specific symbol
func (ob *OrderBook) GetOrderCountBySymbol(symbol string) int {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	
	book, exists := ob.symbolBooks[symbol]
	if !exists {
		return 0
	}
	return len(book.OrderIndex)
}

// LoadOrdersFromDatabase loads pending limit orders from database into the order book
func (ob *OrderBook) LoadOrdersFromDatabase(orders []*models.Order) error {
	if len(orders) == 0 {
		return nil
	}
	
	ob.mu.Lock()
	defer ob.mu.Unlock()
	
	loadedCount := 0
	skippedCount := 0
	errorCount := 0
	buyOrdersCount := 0
	sellOrdersCount := 0
	
	for _, order := range orders {
		if order == nil {
			errorCount++
			continue
		}
		
		if order.Type != models.OrderTypeLimit || order.Status != models.OrderStatusPending {
			skippedCount++
			continue // Skip non-limit or non-pending orders
		}
		
		if err := ob.addOrderUnsafe(order); err != nil {
			log.Printf("Failed to load order %d into order book: %v", order.ID, err)
			errorCount++
			continue
		}
		
		loadedCount++
		if order.Side == models.OrderSideBuy {
			buyOrdersCount++
		} else {
			sellOrdersCount++
		}
	}
	
	log.Printf("Order book loading complete: %d loaded (%d buy, %d sell), %d skipped, %d errors out of %d total", 
		loadedCount, buyOrdersCount, sellOrdersCount, skippedCount, errorCount, len(orders))
	return nil
}

// addOrderUnsafe adds an order without acquiring locks (internal use)
func (ob *OrderBook) addOrderUnsafe(order *models.Order) error {
	if order.Type != models.OrderTypeLimit {
		return fmt.Errorf("only limit orders can be added to order book")
	}
	
	limitPrice := order.GetLimitPrice()
	if limitPrice == nil {
		return fmt.Errorf("limit order must have a limit price")
	}
	
	book := ob.getSymbolBook(order.Symbol)
	
	// Check if order already exists
	if _, exists := book.OrderIndex[order.ID]; exists {
		return fmt.Errorf("order %d already exists in order book", order.ID)
	}
	
	// Add to order index
	book.OrderIndex[order.ID] = order
	
	// Add order to appropriate heap
	if order.Side == models.OrderSideBuy {
		heap.Push(book.BuyOrders, order)
	} else {
		heap.Push(book.SellOrders, order)
	}
	
	return nil
}