import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';

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
}

const Chart: React.FC<ChartProps> = ({ symbol, timeframe }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const displayedRangeStart = useRef<number>(0);
  const isLoadingMore = useRef(false);
  const fetchTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
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
      wickDownColor: '#ef5350',
    });

    const fetchChartData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `http://localhost:8080/api/v1/market/historical?symbol=${symbol}&interval=${timeframe}&limit=1000`
        );
        
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

        candlestickSeries.setData(candlestickData);
        if (response_data.data.length > 0) {
          displayedRangeStart.current = Math.floor(response_data.data[0].time / 1000);
          console.log('Displayed range start:', displayedRangeStart.current);
        }
        
        chart.timeScale().fitContent();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchChartData();

    const fetchMoreData = async () => {
      if (isLoadingMore.current) return; // Prevent multiple fetches

      try {
        isLoadingMore.current = true;
        const response = await fetch(
          `http://localhost:8080/api/v1/market/historical?symbol=${symbol}&interval=${timeframe}&limit=1000&endTime=${displayedRangeStart.current * 1000 - 1}`
        );
        
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

        // get existing data and add new loaded data before existing data
        const existingData = candlestickSeries.data();
        const newData = [...candlestickData, ...existingData];
        candlestickSeries.setData(newData);

        if (response_data.data.length > 0) {
          displayedRangeStart.current = Math.floor(response_data.data[0].time / 1000);
          console.log('Displayed range start after fetch:', displayedRangeStart.current);
        }
        
        // chart.timeScale().fitContent();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        isLoadingMore.current = false;
      }

    }

    chart.timeScale().subscribeVisibleLogicalRangeChange((timeRange) => {
      console.log('Visible time range changed:', timeRange);
      if (timeRange && Number(timeRange.from) < -1) {
        setTimeout(() => {
          fetchMoreData();
        }, 100);
      }
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
      if (timeRange && Number(timeRange.from) < -1) {
        fetchTimeout.current = setTimeout(() => {
          fetchMoreData();
        }, 100);
      }
    });

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: 400
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol, timeframe]);

  if (error) {
    return (
      <div style={{ 
        height: '400px', 
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
      <div ref={chartContainerRef} style={{ width: '100%', height: '400px' }} />
    </div>
  );
};

export default Chart;