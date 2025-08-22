import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HistoricalDataResponse {
  symbol: string;
  data: OHLCV[];
}

interface ChartProps {
  symbol: string;
  timeframe: string;
  selectedStartTime?: Date | null;
  simulationState?: 'stopped' | 'playing' | 'paused';
  simulationData?: {
    price: number;
    timestamp: number;
    ohlcv: {
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    };
    simulationTime: string;
  } | null;
}

const Chart: React.FC<ChartProps> = ({ 
  symbol, 
  timeframe, 
  selectedStartTime, 
  simulationState, 
  simulationData 
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const displayedRangeStart = useRef<number>(0);
  const isLoadingMore = useRef(false);
  const fetchTimeout = useRef<NodeJS.Timeout | null>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const chartRef = useRef<any>(null);
  const isInitialLoadComplete = useRef(false);
  const hasReachedEarliestData = useRef(false);
  const [earliestAvailableTime, setEarliestAvailableTime] = useState<number | null>(null);
  const isComponentMounted = useRef(true);
  const simulationPriceLine = useRef<any>(null);

  const fetchEarliestTime = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:8080/api/v1/market/earliest-time/${symbol}`);
      if (response.ok) {
        const data = await response.json();
        const earliestTimeInSeconds = Math.floor(data.earliestTime / 1000);
        setEarliestAvailableTime(earliestTimeInSeconds);
        return earliestTimeInSeconds;
      }
    } catch (err) {
      console.warn('Failed to fetch earliest time:', err);
    }
    return null;
  }, [symbol]);

  const fetchData = useCallback(async (endTime?: number, limit: number = 100) => {
    let url = `http://localhost:8080/api/v1/market/historical?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
    
    if (endTime) {
      url += `&endTime=${endTime}`;
    }

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Failed to fetch chart data');
    }

    const response_data: HistoricalDataResponse = await response.json();
    
    const candlestickData = response_data.data.map(item => ({
      time: Math.floor(item.time / 1000) as any,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    }));

    const volumeData = response_data.data.map(item => ({
      time: Math.floor(item.time / 1000) as any,
      value: item.volume,
      color: item.close >= item.open ? '#26a69a' : '#ef5350',
    }));

    return { candlestickData, volumeData, rawData: response_data.data };
  }, [symbol, timeframe]);

  const initLoad = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    isInitialLoadComplete.current = false;
    hasReachedEarliestData.current = false;

    try {
      // Fetch earliest available time first
      const earliestTime = await fetchEarliestTime();
      
      const limit = 100;
      const endTime = selectedStartTime ? selectedStartTime.getTime() : undefined;
      const { candlestickData, volumeData, rawData } = await fetchData(endTime, limit);

      if (candlestickSeriesRef.current) {
        candlestickSeriesRef.current.setData(candlestickData);
      }
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(volumeData);
      }
      if (rawData.length > 0) {
        displayedRangeStart.current = Math.floor(rawData[0].time / 1000);
        console.log('Displayed range start:', displayedRangeStart.current);
        
        // Check if we're already at or near the earliest data
        if (earliestTime && displayedRangeStart.current <= earliestTime + 86400) { // within 1 day
          hasReachedEarliestData.current = true;
          console.log('Already at earliest data');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
      isInitialLoadComplete.current = true;
    }
  }, [fetchData, selectedStartTime, fetchEarliestTime]);

  const loadMoreData = useCallback(async () => {
    // Prevent loading if:
    // 1. Component is unmounted
    // 2. Already loading more data
    // 3. Chart series not ready
    // 4. Initial load not complete
    // 5. Already reached earliest available data
    if (!isComponentMounted.current ||
        isLoadingMore.current || 
        !candlestickSeriesRef.current || 
        !volumeSeriesRef.current ||
        !chartRef.current ||
        !isInitialLoadComplete.current ||
        hasReachedEarliestData.current) {
      console.log('loadMoreData blocked:', {
        componentMounted: isComponentMounted.current,
        isLoadingMore: isLoadingMore.current,
        seriesReady: !!(candlestickSeriesRef.current && volumeSeriesRef.current),
        chartReady: !!chartRef.current,
        initialLoadComplete: isInitialLoadComplete.current,
        reachedEarliest: hasReachedEarliestData.current
      });
      return;
    }

    try {
      isLoadingMore.current = true;
      console.log('Loading more data from:', displayedRangeStart.current);
      
      // Don't use selectedStartTime for loading more data, use the actual range start
      const { candlestickData, volumeData, rawData } = await fetchData(displayedRangeStart.current * 1000 - 1, 1000);

      // If no new data received, we've reached the earliest available data
      if (rawData.length === 0) {
        hasReachedEarliestData.current = true;
        console.log('No more data available, reached earliest data');
        return;
      }

      // Double-check that chart is still available before updating
      if (!isComponentMounted.current || !candlestickSeriesRef.current || !volumeSeriesRef.current) {
        console.log('Chart disposed during loadMoreData, aborting update');
        return;
      }

      const existingCandlestickData = candlestickSeriesRef.current.data();
      const newCandlestickData = [...candlestickData, ...existingCandlestickData];
      candlestickSeriesRef.current.setData(newCandlestickData);

      const existingVolumeData = volumeSeriesRef.current.data();
      const newVolumeData = [...volumeData, ...existingVolumeData];
      volumeSeriesRef.current.setData(newVolumeData);

      if (rawData.length > 0) {
        const newRangeStart = Math.floor(rawData[0].time / 1000);
        
        // Check if we've reached the earliest available data
        if (earliestAvailableTime && newRangeStart <= earliestAvailableTime + 86400) { // within 1 day
          hasReachedEarliestData.current = true;
          console.log('Reached earliest available data');
        }
        
        displayedRangeStart.current = newRangeStart;
        console.log('Displayed range start after fetch:', displayedRangeStart.current);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      isLoadingMore.current = false;
      if (fetchTimeout.current) {
        clearTimeout(fetchTimeout.current);
        fetchTimeout.current = null;
      }
    }
  }, [fetchData, earliestAvailableTime]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    // Reset flags when symbol or timeframe changes
    isInitialLoadComplete.current = false;
    hasReachedEarliestData.current = false;
    isComponentMounted.current = true;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
        panes: {
          separatorColor: '#000000ff',
          separatorHoverColor: 'rgba(58, 58, 58, 0.1)',
          enableResize: true, // resize hight of panes
        },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientWidth * 0.6, // 60% of width for height
      grid: {
        vertLines: {
          color: '#e1e1e1',
        },
        horzLines: {
          color: '#e1e1e1',
        },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#cccccc',
      },
      timeScale: {
        borderColor: '#cccccc',
        timeVisible: true,
        secondsVisible: false,
      },

    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350'
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      }
    }, 1);

    chart.panes()[1].setHeight(150);

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0,
      },
    });

    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;
    chartRef.current = chart;

    // Use async IIFE for proper error handling
    (async () => {
      try {
        await initLoad();
        // Only fit content if chart still exists and component is mounted
        if (isComponentMounted.current && chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      } catch (error) {
        console.error('Error during chart initialization:', error);
      }
    })();

    chart.timeScale().subscribeVisibleLogicalRangeChange((timeRange) => {
      console.log('Visible time range changed:', timeRange);

      if (fetchTimeout.current) {
        return;
      }

      if (timeRange && Number(timeRange.from) < -1) {
        fetchTimeout.current = setTimeout(() => {
          loadMoreData();
        }, 100);
      }
    });

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientWidth * 0.6, // 60% of width for height
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      // Mark component as unmounted to prevent further operations
      isComponentMounted.current = false;
      
      // Clear any pending timeouts
      if (fetchTimeout.current) {
        clearTimeout(fetchTimeout.current);
        fetchTimeout.current = null;
      }
      
      // Clear refs to prevent access to disposed objects
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      chartRef.current = null;
      
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol, timeframe, initLoad, loadMoreData]);

  // Handle simulation real-time updates
  useEffect(() => {
    if (simulationState === 'playing' || simulationState === 'paused') {
      if (simulationData && chartRef.current && candlestickSeriesRef.current && volumeSeriesRef.current) {
        try {
          // Update candle data with real-time OHLCV
          const candleUpdate = {
            time: Math.floor(simulationData.ohlcv.time / 1000) as any,
            open: simulationData.ohlcv.open,
            high: simulationData.ohlcv.high,
            low: simulationData.ohlcv.low,
            close: simulationData.ohlcv.close,
          };

          const volumeUpdate = {
            time: Math.floor(simulationData.ohlcv.time / 1000) as any,
            value: simulationData.ohlcv.volume,
            color: simulationData.ohlcv.close >= simulationData.ohlcv.open ? '#26a69a' : '#ef5350',
          };

          // Update the chart with new candle data
          candlestickSeriesRef.current.update(candleUpdate);
          volumeSeriesRef.current.update(volumeUpdate);

          // Add or update simulation price line for current price
          const priceLineOptions = {
            price: simulationData.price,
            color: '#ff6b6b',
            lineWidth: 2,
            lineStyle: 2, // dashed line
            axisLabelVisible: true,
            title: `Sim: $${simulationData.price.toFixed(2)}`,
          };

          if (simulationPriceLine.current) {
            // Update existing price line
            simulationPriceLine.current.applyOptions(priceLineOptions);
          } else {
            // Create new price line
            simulationPriceLine.current = candlestickSeriesRef.current.createPriceLine(priceLineOptions);
          }

          // Log the update for debugging
          console.log(`Simulation candle update:`, {
            time: new Date(simulationData.ohlcv.time).toLocaleString(),
            ohlcv: simulationData.ohlcv,
            price: simulationData.price
          });
        } catch (error) {
          console.warn('Could not update simulation candle:', error);
        }
      }
    } else if (simulationState === 'stopped') {
      // Clear simulation markers when stopped
      if (simulationPriceLine.current && candlestickSeriesRef.current) {
        try {
          candlestickSeriesRef.current.removePriceLine(simulationPriceLine.current);
          simulationPriceLine.current = null;
        } catch (error) {
          console.warn('Could not remove simulation price line:', error);
        }
      }
    }
  }, [simulationState, simulationData]);

  if (error) {
    return (
      <div style={{ 
        height: '600px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        border: '1px solid #ddd',
        borderRadius: '4px'
      }}>
        <div style={{ color: '#d32f2f', fontSize: '16px' }}>
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          zIndex: 10,
        }}>
          <div style={{ fontSize: '16px', color: '#666' }}>Loading chart data...</div>
        </div>
      )}
      <div ref={chartContainerRef} style={{ }} />
    </div>
  );
};

export default Chart;