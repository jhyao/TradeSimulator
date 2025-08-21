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
}

const Chart: React.FC<ChartProps> = ({ symbol, timeframe }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const displayedRangeStart = useRef<number>(0);
  const isLoadingMore = useRef(false);
  const fetchTimeout = useRef<NodeJS.Timeout | null>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);

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

    try {
      const { candlestickData, volumeData, rawData } = await fetchData();

      if (candlestickSeriesRef.current) {
        candlestickSeriesRef.current.setData(candlestickData);
      }
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(volumeData);
      }
      if (rawData.length > 0) {
        displayedRangeStart.current = Math.floor(rawData[0].time / 1000);
        console.log('Displayed range start:', displayedRangeStart.current);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [fetchData]);

  const loadMoreData = useCallback(async () => {
    if (isLoadingMore.current || !candlestickSeriesRef.current || !volumeSeriesRef.current) return;

    try {
      isLoadingMore.current = true;
      const { candlestickData, volumeData, rawData } = await fetchData(displayedRangeStart.current * 1000 - 1, 1000);

      const existingCandlestickData = candlestickSeriesRef.current.data();
      const newCandlestickData = [...candlestickData, ...existingCandlestickData];
      candlestickSeriesRef.current.setData(newCandlestickData);

      const existingVolumeData = volumeSeriesRef.current.data();
      const newVolumeData = [...volumeData, ...existingVolumeData];
      volumeSeriesRef.current.setData(newVolumeData);

      if (rawData.length > 0) {
        displayedRangeStart.current = Math.floor(rawData[0].time / 1000);
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
  }, [fetchData]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

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

    // volumeSeries.priceScale().applyOptions({
    //   scaleMargins: {
    //     top: 0.1,
    //     bottom: 0,
    //   },
    // });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0,
      },
    });

    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    initLoad().then(() => {
      chart.timeScale().fitContent();
    });

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
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol, timeframe, initLoad, loadMoreData]);

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