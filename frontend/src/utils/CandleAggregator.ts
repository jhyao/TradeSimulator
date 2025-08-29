interface OHLCV {
  startTime: number;
  endTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isComplete: boolean;
}

/**
 * CandleAggregator handles progressive candle aggregation in the frontend.
 * Since base candles arrive chronologically, we only need to track one incomplete display candle.
 */
export class CandleAggregator {
  private displayTimeframe: string;
  private incompleteCandle: OHLCV | null = null; // Only one incomplete candle at a time
  
  constructor(displayTimeframe: string) {
    this.displayTimeframe = displayTimeframe;
  }

  /**
   * Sets the display timeframe and clears incomplete candle state
   */
  setDisplayTimeframe(timeframe: string): void {
    this.displayTimeframe = timeframe;
    this.incompleteCandle = null;
  }

  /**
   * Adds existing incomplete candle to the aggregator's state
   * This is called when loading historical data with incomplete candles
   */
  addIncompleteCandle(candle: OHLCV): void {
    if (!candle.isComplete) {
      this.incompleteCandle = { ...candle };
    }
  }

  /**
   * Processes a base candle from simulation update and returns the updated display candle
   * Returns null if no display candle update is needed
   */
  processBaseCandle(baseCandle: OHLCV): OHLCV | null {
    const displayCandleStart = this.getDisplayCandleStart(baseCandle.startTime);

    // Check if this base candle belongs to the current incomplete display candle
    if (this.incompleteCandle && this.incompleteCandle.startTime === displayCandleStart) {
      // Merge with existing incomplete candle
      const merged = this.mergeCandles(this.incompleteCandle, baseCandle);
      
      if (merged.isComplete) {
        // Display candle is now complete, clear incomplete state
        this.incompleteCandle = null;
      } else {
        // Still incomplete, update it
        this.incompleteCandle = merged;
      }
      
      return merged;
    } else {
      // This base candle starts a new display candle
      // Any previous incomplete candle must now be complete (mark as complete if needed)
      
      const displayCandle = this.createDisplayCandle(baseCandle, displayCandleStart);
      
      if (!displayCandle.isComplete) {
        // Store as new incomplete candle
        this.incompleteCandle = displayCandle;
      } else {
        // Complete candle, no need to store
        this.incompleteCandle = null;
      }
      
      return displayCandle;
    }
  }

  /**
   * Clears all incomplete candle state
   */
  clear(): void {
    this.incompleteCandle = null;
  }

  /**
   * Gets the start time of the display candle that contains the given timestamp
   */
  private getDisplayCandleStart(timestampMs: number): number {
    const intervalDurationMs = this.getIntervalDurationMs(this.displayTimeframe);
    return Math.floor(timestampMs / intervalDurationMs) * intervalDurationMs;
  }

  /**
   * Merges a base candle into an existing display candle
   */
  private mergeCandles(existing: OHLCV, baseCandle: OHLCV): OHLCV {
    const intervalDurationMs = this.getIntervalDurationMs(this.displayTimeframe);
    const expectedEndTime = existing.startTime + intervalDurationMs - 1;
    
    return {
      startTime: existing.startTime, // Keep original display candle start
      endTime: Math.max(existing.endTime, baseCandle.endTime),
      open: existing.open, // Keep first open
      high: Math.max(existing.high, baseCandle.high), // Running maximum
      low: Math.min(existing.low, baseCandle.low), // Running minimum  
      close: baseCandle.close, // Latest close
      volume: existing.volume + baseCandle.volume, // Cumulative sum
      isComplete: baseCandle.endTime >= expectedEndTime, // Complete when base candle reaches expected end
    };
  }

  /**
   * Creates a new display candle from a base candle
   */
  private createDisplayCandle(baseCandle: OHLCV, displayCandleStart: number): OHLCV {
    const intervalDurationMs = this.getIntervalDurationMs(this.displayTimeframe);
    const expectedEndTime = displayCandleStart + intervalDurationMs - 1;
    
    return {
      startTime: displayCandleStart,
      endTime: baseCandle.endTime,
      open: baseCandle.open,
      high: baseCandle.high,
      low: baseCandle.low,
      close: baseCandle.close,
      volume: baseCandle.volume,
      isComplete: baseCandle.endTime >= expectedEndTime,
    };
  }

  /**
   * Gets interval duration in milliseconds
   */
  private getIntervalDurationMs(interval: string): number {
    const intervalMap: { [key: string]: number } = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    
    return intervalMap[interval] || 60 * 60 * 1000; // Default to 1h
  }

  /**
   * Gets current incomplete candle for debugging
   */
  getIncompleteCandle(): OHLCV | null {
    return this.incompleteCandle;
  }
}