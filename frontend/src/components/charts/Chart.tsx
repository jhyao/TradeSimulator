import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, CrosshairMode, LineStyle, createSeriesMarkers, IChartApi } from 'lightweight-charts';
import { MarketApiService, CandleData } from '../../services/marketApi';
import { CandleAggregator } from '../../utils/CandleAggregator';
import { formatPrice, formatPercentage } from '../../utils/numberFormat';
import { usePositions } from '../../contexts/PositionsContext';
import TimeframeSelector from './TimeframeSelector';

// OHLCV interface moved to CandleAggregator


interface SimulationState {
  state: 'stopped' | 'playing' | 'paused';
  speed: number;
  simulationTime: number | null; // Current simulation time in milliseconds
  startTime: number | null; // Simulation start time in milliseconds
  progress: number;
  lastCandle: CandleData | null;
}

interface ChartProps {
  symbol: string;
  timeframe: string;
  selectedStartTime?: Date | null;
  simulationState?: SimulationState;
  onTimeframeChange: (timeframe: string) => void;
  onCandleChange?: (lastCandle: CandleData | null) => void;
}

const color_palette = {
  green: '#26a69a',
  red: '#ef5350',
  light_green: '#b2dfdb',
  light_red: '#ffcdd2',
  bright_green: '#30d2c2',
  bright_red: '#fb312e',
  crosshair_color: '#007bff',
}

const price_chart_styles = {
  borderVisible: false,
  upColor: color_palette.green,
  downColor: color_palette.red,
  wickUpColor: color_palette.green,
  wickDownColor: color_palette.red,
};


const Chart: React.FC<ChartProps> = ({
  symbol,
  timeframe,
  selectedStartTime,
  simulationState,
  onTimeframeChange,
  onCandleChange
}) => {
  const { trades, pendingOrders } = usePositions();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const displayedRangeStart = useRef<number>(0);
  const isLoadingMore = useRef(false);
  const fetchTimeout = useRef<NodeJS.Timeout | null>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const chartRef = useRef<IChartApi>(null);
  const seriesMarkersRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const isInitialLoadComplete = useRef(false);
  const hasReachedEarliestData = useRef(false);
  const [earliestAvailableTime, setEarliestAvailableTime] = useState<number | null>(null);
  const isComponentMounted = useRef(true);
  const candleAggregator = useRef<CandleAggregator>(new CandleAggregator(timeframe));
  const [crosshairData, setCrosshairData] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    time: number;
    change: number;
    changePercent: number;
    amplitude: number;
    amplitudePercent: number;
  } | null>(null);
  const [isCrosshairActive, setIsCrosshairActive] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const getCandleStartTime = useCallback((executedTime: number, timeframeStr: string) => {
    const timeframes: { [key: string]: number } = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };

    const intervalMs = timeframes[timeframeStr] || timeframes['1m'];
    return Math.floor(executedTime / intervalMs) * intervalMs;
  }, []);

  const fetchEarliestTime = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/market/earliest-time/${symbol}`);
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

  const processTradesIntoMarkers = useCallback((tradesData: any[]) => {
    if (!tradesData || tradesData.length === 0) {
      return [];
    }

    try {
      // Filter trades for current symbol
      const symbolTrades = tradesData.filter((trade: any) => trade.symbol === symbol);

      // Helper function to get trade side color and position
      const getTradeVisuals = (side: string) => {
        const sideNormalized = side.toLowerCase();
        const isGreenSide = ['buy', 'open_long', 'close_short'].includes(sideNormalized);
        return {
          color: isGreenSide ? '#2f5becff' : '#ff00eaff',
          position: isGreenSide ? 'belowBar' as const : 'aboveBar' as const,
          shape: isGreenSide ? 'arrowUp' as const : 'arrowDown' as const
        };
      };

      // Create markers for all trades
      const markers = symbolTrades.map((trade: any) => {
        const visuals = getTradeVisuals(trade.side);
        const candleStartTime = getCandleStartTime(trade.executed_at, timeframe);
        return {
          time: Math.floor(candleStartTime / 1000) as any,
          position: visuals.position,
          color: visuals.color,
          shape: visuals.shape,
          // text: `${trade.side.toUpperCase()} @ ${formatPrice(trade.price)}`
        };
      });

      // Sort markers by time to ensure correct display order
      markers.sort((a, b) => a.time - b.time);

      return markers;
    } catch (err) {
      console.warn('Failed to process trades:', err);
    }
    return [];
  }, [symbol, timeframe, getCandleStartTime]);

  const updatePendingOrderLines = useCallback(() => {
    if (!candlestickSeriesRef.current) {
      return;
    }

    // Remove existing price lines
    priceLinesRef.current.forEach(priceLine => {
      try {
        candlestickSeriesRef.current.removePriceLine(priceLine);
      } catch (err) {
        console.warn('Failed to remove price line:', err);
      }
    });
    priceLinesRef.current = [];

    // Filter pending orders for current symbol
    const symbolPendingOrders = pendingOrders.filter(order => order.symbol === symbol);

    // Create price lines for pending orders
    symbolPendingOrders.forEach(order => {
      if (!order.order_params) return;

      const getOrderColor = (side: string) => {
        const sideNormalized = side.toLowerCase();
        return ['buy', 'open_long', 'close_short'].includes(sideNormalized) ? '#28a745' : '#dc3545';
      };

      const orderColor = getOrderColor(order.side);

      // Create price line for limit orders
      if (order.type === 'limit' && order.order_params.limit_price) {
        const priceLine = candlestickSeriesRef.current.createPriceLine({
          price: order.order_params.limit_price,
          color: orderColor,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `${order.side.toUpperCase()} ${order.quantity}`,
        });
        priceLinesRef.current.push(priceLine);
      }

    });
  }, [pendingOrders, symbol]);

  const handleCrosshairMove = useCallback((param: any, candlestickSeries: any, tradesData?: any[]) => {
    // Handle trade tooltip only if trades data is provided
    if (tradesData && tooltipRef.current && chartContainerRef.current && param.point && param.time) {
      // Check if there are any trades at this time
      const symbolTrades = tradesData.filter((trade: any) => trade.symbol === symbol);
      const tradesAtTime = symbolTrades.filter((trade: any) => {
        const tradeCandleStartTime = getCandleStartTime(trade.executed_at, timeframe);
        return Math.floor(tradeCandleStartTime / 1000) === (param.time as number);
      });

      if (tradesAtTime.length > 0 && param.point.x >= 0 && param.point.x <= chartContainerRef.current.clientWidth &&
          param.point.y >= 0 && param.point.y <= chartContainerRef.current.clientHeight) {
        // Show tooltip for trades
        const tooltipWidth = 180;
        const tooltipHeight = Math.min(120, 60 + tradesAtTime.length * 20);
        const tooltipMargin = 15;

        let left = param.point.x + tooltipMargin;
        if (left > chartContainerRef.current.clientWidth - tooltipWidth) {
          left = param.point.x - tooltipMargin - tooltipWidth;
        }

        let top = param.point.y + tooltipMargin;
        if (top > chartContainerRef.current.clientHeight - tooltipHeight) {
          top = param.point.y - tooltipHeight - tooltipMargin;
        }

        tooltipRef.current.style.display = 'block';
        tooltipRef.current.style.left = left + 'px';
        tooltipRef.current.style.top = top + 'px';

        // Create content for multiple trades
        const tradesContent = tradesAtTime.map((trade: any) => {
          const sideColor = ['buy', 'open_long', 'close_short'].includes(trade.side.toLowerCase()) ? '#2f5becff' : '#ff00eaff';
          return `
            <div style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: ${tradesAtTime.length > 1 ? '1px solid #eee' : 'none'};">
              <div style="color: ${sideColor}; font-weight: bold; font-size: 11px;">${trade.side.toUpperCase()}</div>
              <div style="font-size: 14px; margin: 2px 0px; color: black;">
                ${trade.quantity} @ ${formatPrice(trade.price)}
              </div>
              <div style="color: #666; font-size: 10px;">
                ${new Date(trade.executed_at).toUTCString()}
              </div>
            </div>`;
        }).join('');

        tooltipRef.current.innerHTML = `
          <div style="font-size: 11px; font-weight: bold; margin-bottom: 4px; color: #333;">
            ${tradesAtTime.length > 1 ? `${tradesAtTime.length} Trades` : 'Trade'}
          </div>
          ${tradesContent}`;
      } else if (tooltipRef.current) {
        tooltipRef.current.style.display = 'none';
      }
    } else if (tooltipRef.current) {
      tooltipRef.current.style.display = 'none';
    }

    // Handle crosshair data display
    if (param.time !== undefined && param.seriesData) {
      setIsCrosshairActive(true);
      const candleData = param.seriesData.get(candlestickSeries);
      if (candleData && 'open' in candleData && 'high' in candleData && 'low' in candleData && 'close' in candleData) {
        const change = candleData.close - candleData.open;
        const changePercent = (change / candleData.open) * 100;
        const amplitude = candleData.high - candleData.low;
        const amplitudePercent = (amplitude / candleData.low) * 100;

        setCrosshairData({
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          time: param.time as number,
          change,
          changePercent,
          amplitude,
          amplitudePercent
        });
      }
    } else {
      setIsCrosshairActive(false);
      // Show latest candle data when no crosshair
      const latestData = candlestickSeries.data();
      if (latestData.length > 0) {
        const latest = latestData[latestData.length - 1];
        if ('open' in latest && 'high' in latest && 'low' in latest && 'close' in latest) {
          const change = latest.close - latest.open;
          const changePercent = (change / latest.open) * 100;
          const amplitude = latest.high - latest.low;
          const amplitudePercent = (amplitude / latest.low) * 100;

          setCrosshairData({
            open: latest.open,
            high: latest.high,
            low: latest.low,
            close: latest.close,
            time: latest.time as number,
            change,
            changePercent,
            amplitude,
            amplitudePercent
          });
        }
      }
    }
  }, [symbol, timeframe, getCandleStartTime]);

  const fetchData = useCallback(async (endTime?: number, limit: number = 100, enableIncomplete: boolean = false) => {
    const response_data = await MarketApiService.getHistoricalData(
      symbol,
      timeframe,
      limit,
      undefined, // startTime
      endTime,
      enableIncomplete
    );
    
    const candlestickData = response_data.data.map(item => {
      // Add incomplete candles to aggregator for potential future updates
      if (!item.isComplete) {
        candleAggregator.current.addIncompleteCandle(item);
      }
      
      return {
        time: Math.floor(item.startTime / 1000) as any,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      };
    });

    const volumeData = response_data.data.map(item => ({
      time: Math.floor(item.startTime / 1000) as any,
      value: item.volume,
      color: item.isComplete ? 
      (item.close >= item.open ? '#26a69a' : '#ef5350') :
      (item.close >= item.open ? '#b2dfdb' : '#ffcdd2'), // Lighter green/red for incomplete
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
      // Use current simulation time instead of selected start time when changing timeframes during simulation
      let endTime: number | undefined;
      if (simulationState?.simulationTime && simulationState.simulationTime > 0) {
        endTime = simulationState.simulationTime;
        console.log('Loading data for timeframe change using current simulation time:', new Date(endTime).toLocaleString());
      } else {
        endTime = selectedStartTime ? selectedStartTime.getTime() : undefined;
      }
      
      const { candlestickData, volumeData, rawData } = await fetchData(endTime, limit, true); // Enable incomplete for first load

      if (candlestickSeriesRef.current) {
        candlestickSeriesRef.current.setData(candlestickData);
      }
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(volumeData);
      }

      // Call onCandleChange callback after data is loaded
      if (onCandleChange && rawData.length > 0) {
        const lastCandle = rawData[rawData.length - 1];
        onCandleChange(lastCandle);
      }

      // Load and set trade markers
      // const markers = processTradesIntoMarkers(trades);
      // if (seriesMarkersRef.current && markers.length > 0) {
      //   seriesMarkersRef.current.setMarkers(markers);
      // }
      if (rawData.length > 0) {
        displayedRangeStart.current = Math.floor(rawData[0].startTime / 1000);
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
      const { candlestickData, volumeData, rawData } = await fetchData(displayedRangeStart.current * 1000 - 1, 1000, false); // Disable incomplete for load more

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
        const newRangeStart = Math.floor(rawData[0].startTime / 1000);
        
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
    
    // Update aggregator with new timeframe and clear state
    candleAggregator.current.setDisplayTimeframe(timeframe);

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
      height: Math.min(Math.max(chartContainerRef.current.clientWidth * 0.6, 600), 800), // 60% of width for height, cap floor to 600 to 800
      grid: {
        vertLines: {
          color: '#e1e1e1',
        },
        horzLines: {
          color: '#e1e1e1',
        },
      },
      crosshair: {
        // Change mode from default 'magnet' to 'normal'.
        // Allows the crosshair to move freely without snapping to datapoints
        mode: CrosshairMode.Normal,

        // Vertical crosshair line (showing Date in Label)
        vertLine: {
            width: 2,
            color: color_palette.crosshair_color,
            style: LineStyle.Solid,
            labelBackgroundColor: color_palette.crosshair_color,
        },

        // Horizontal crosshair line (showing Price in Label)
        horzLine: {
            color: color_palette.crosshair_color,
            labelBackgroundColor: color_palette.crosshair_color,
        },
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
      ...price_chart_styles
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

    // Create series markers plugin
    seriesMarkersRef.current = createSeriesMarkers(candlestickSeries);

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
        clearTimeout(fetchTimeout.current);
        fetchTimeout.current = null;
      }

      if (timeRange && Number(timeRange.from) < -1) {
        fetchTimeout.current = setTimeout(() => {
          loadMoreData();
        }, 200);
      }
    });

    chart.subscribeCrosshairMove(param => handleCrosshairMove(param, candlestickSeries));

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: Math.min(Math.max(chartContainerRef.current.clientWidth * 0.6, 600), 800), // 60% of width for height, cap floor to 600 to 800
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
      seriesMarkersRef.current = null;
      priceLinesRef.current = [];
      
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol, timeframe, selectedStartTime, initLoad, loadMoreData, handleCrosshairMove]);

  // Handle simulation real-time updates with frontend aggregation
  useEffect(() => {
    if (simulationState?.state === 'playing' || simulationState?.state === 'paused') {
      if (simulationState.lastCandle && chartRef.current && candlestickSeriesRef.current && volumeSeriesRef.current) {
        try {
          // Process base candle through aggregator
          const aggregatedCandle = candleAggregator.current.processBaseCandle(simulationState.lastCandle);
          
          if (aggregatedCandle) {
            // Update chart with aggregated display candle
            const candleUpdate = {
              time: Math.floor(aggregatedCandle.startTime / 1000) as any,
              open: aggregatedCandle.open,
              high: aggregatedCandle.high,
              low: aggregatedCandle.low,
              close: aggregatedCandle.close,
              // Visual indicators for incomplete candles
              color: aggregatedCandle.isComplete ? undefined : (aggregatedCandle.close >= aggregatedCandle.open ? color_palette.bright_green : color_palette.bright_red),
              wickColor: aggregatedCandle.isComplete ? undefined : (aggregatedCandle.close >= aggregatedCandle.open ? color_palette.bright_green : color_palette.bright_red),
            };

            const volumeUpdate = {
              time: Math.floor(aggregatedCandle.startTime / 1000) as any,
              value: aggregatedCandle.volume,
              color: aggregatedCandle.isComplete ?
                (aggregatedCandle.close >= aggregatedCandle.open ? color_palette.green : color_palette.red) :
                (aggregatedCandle.close >= aggregatedCandle.open ? color_palette.light_green : color_palette.light_red),
            };

            // Update the chart with aggregated candle data
            candlestickSeriesRef.current.update(candleUpdate);
            volumeSeriesRef.current.update(volumeUpdate);

            // Call onCandleChange callback when simulation candle updates
            if (onCandleChange) {
              onCandleChange(aggregatedCandle);
            }

            // Update crosshair info panel with latest simulation data if no active crosshair
            if (!isCrosshairActive) {
              const change = aggregatedCandle.close - aggregatedCandle.open;
              const changePercent = (change / aggregatedCandle.open) * 100;
              const amplitude = aggregatedCandle.high - aggregatedCandle.low;
              const amplitudePercent = (amplitude / aggregatedCandle.low) * 100;
              
              setCrosshairData({
                open: aggregatedCandle.open,
                high: aggregatedCandle.high,
                low: aggregatedCandle.low,
                close: aggregatedCandle.close,
                time: Math.floor(aggregatedCandle.startTime / 1000),
                change,
                changePercent,
                amplitude,
                amplitudePercent
              });
            }

            // Log the update for debugging
            console.log(`Frontend aggregated candle update:`, {
              baseCandle: {
                time: new Date(simulationState.lastCandle.startTime).toLocaleString(),
                ohlcv: simulationState.lastCandle
              },
              aggregatedCandle: {
                time: new Date(aggregatedCandle.startTime).toLocaleString(),
                endTime: new Date(aggregatedCandle.endTime).toLocaleString(),
                ohlcv: aggregatedCandle,
                isComplete: aggregatedCandle.isComplete
              }
            });
          }
        } catch (error) {
          console.warn('Could not update simulation candle:', error);
        }
      }
    }
  }, [simulationState?.lastCandle, simulationState?.state]); // Only trigger when lastCandle changes

  // Handle simulation state changes (separate from candle processing)
  useEffect(() => {
    if (simulationState?.state === 'stopped') {
      // Clear aggregator state when simulation stops
      candleAggregator.current.clear();
    }
  }, [simulationState?.state]); // Only trigger when state changes

  // Initialize crosshair display with latest candle data
  useEffect(() => {
    if (candlestickSeriesRef.current && !isLoading) {
      const latestData = candlestickSeriesRef.current.data();
      if (latestData.length > 0) {
        const latest = latestData[latestData.length - 1];
        if ('open' in latest && 'high' in latest && 'low' in latest && 'close' in latest) {
          const change = latest.close - latest.open;
          const changePercent = (change / latest.open) * 100;
          const amplitude = latest.high - latest.low;
          const amplitudePercent = (amplitude / latest.low) * 100;
          
          setCrosshairData({
            open: latest.open,
            high: latest.high,
            low: latest.low,
            close: latest.close,
            time: latest.time as number,
            change,
            changePercent,
            amplitude,
            amplitudePercent
          });
        }
      }
    }
  }, [isLoading]);

  // Refresh markers when trades from context change
  // And also when symbol or timeframe changes to ensure correct markers
  useEffect(() => {
    if (chartRef.current && candlestickSeriesRef.current && seriesMarkersRef.current) {
      console.log('Chart: Trades changed, refreshing trade markers');
      const markers = processTradesIntoMarkers(trades);
      seriesMarkersRef.current.setMarkers(markers);
      chartRef.current.subscribeCrosshairMove(param => handleCrosshairMove(param, candlestickSeriesRef.current, trades));
    }
  }, [symbol, timeframe, trades, processTradesIntoMarkers]);

  // Update pending order price lines when orders change
  useEffect(() => {
    if (candlestickSeriesRef.current) {
      console.log('Chart: Pending orders changed, updating price lines');
      updatePendingOrderLines();
    }
  }, [symbol, timeframe, pendingOrders, updatePendingOrderLines]);

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
      {/* Chart Header */}
      <div style={{
        padding: '10px 15px',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #dee2e6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>
          Price Chart - {symbol}
        </h3>
        <TimeframeSelector
          timeframe={timeframe}
          onTimeframeChange={onTimeframeChange}
          compact={false}
          currentSpeed={simulationState?.speed}
        />
      </div>
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
      {crosshairData && (
        <div style={{
          position: 'absolute',
          top: '55px',
          left: '10px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          border: '1px solid #ddd',
          borderRadius: '4px',
          padding: '8px 12px',
          fontSize: '12px',
          fontFamily: 'monospace',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          zIndex: 20,
          minWidth: '160px'
        }}>
          <div style={{ marginBottom: '4px', fontWeight: 'bold', color: '#333' }}>
            {new Date(crosshairData.time * 1000).toLocaleString()}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span style={{ color: '#666' }}>OPEN:</span>
            <span style={{ fontWeight: 'bold' }}>{formatPrice(crosshairData.open)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span style={{ color: '#666' }}>HIGH:</span>
            <span style={{ fontWeight: 'bold', color: color_palette.green }}>{formatPrice(crosshairData.high)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span style={{ color: '#666' }}>LOW:</span>
            <span style={{ fontWeight: 'bold', color: color_palette.red }}>{formatPrice(crosshairData.low)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#666' }}>CLOSE:</span>
            <span style={{ fontWeight: 'bold' }}>{formatPrice(crosshairData.close)}</span>
          </div>
          <div style={{ borderTop: '1px solid #eee', paddingTop: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{ color: '#666' }}>CHANGE:</span>
              <span style={{ 
                fontWeight: 'bold', 
                color: crosshairData.change >= 0 ? color_palette.green : color_palette.red 
              }}>
                {crosshairData.change >= 0 ? '+' : ''}{formatPrice(crosshairData.change)} ({crosshairData.changePercent >= 0 ? '+' : ''}{formatPercentage(crosshairData.changePercent)})
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#666' }}>AMPLITUDE:</span>
              <span style={{ fontWeight: 'bold', color: '#333' }}>
                {formatPrice(crosshairData.amplitude)} ({formatPercentage(crosshairData.amplitudePercent)})
              </span>
            </div>
          </div>
        </div>
      )}
      {/* Trade tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute',
          display: 'none',
          padding: '8px',
          boxSizing: 'border-box',
          fontSize: '12px',
          textAlign: 'left',
          zIndex: 1000,
          pointerEvents: 'none',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
          background: 'white',
          color: 'black',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          minWidth: '120px'
        }}
      />
      <div ref={chartContainerRef} style={{ }} />
    </div>
  );
};

export default Chart;