interface EarliestTimeResponse {
  symbol: string;
  earliestTime: number;
  earliestTimeISO: string;
}

interface HistoricalDataResponse {
  symbol: string;
  data: Array<{
    startTime: number;
    endTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    isComplete: boolean;
  }>;
}

interface ApiError {
  error: string;
}

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

export class MarketApiService {
  private static async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`
      }));
      throw new Error(errorData.error);
    }
    return response.json();
  }

  static async getEarliestTime(symbol: string): Promise<EarliestTimeResponse> {
    const response = await fetch(`${API_BASE_URL}/market/earliest-time/${symbol}`);
    return this.handleResponse<EarliestTimeResponse>(response);
  }

  static async getHistoricalData(
    symbol: string,
    interval: string = '1h',
    limit: number = 1000,
    startTime?: number,
    endTime?: number,
    enableIncomplete: boolean = false
  ): Promise<HistoricalDataResponse> {
    const params = new URLSearchParams({
      symbol,
      interval,
      limit: limit.toString(),
    });

    if (startTime) {
      params.append('startTime', startTime.toString());
    }
    if (endTime) {
      params.append('endTime', endTime.toString());
    }
    if (enableIncomplete) {
      params.append('enableIncomplete', 'true');
    }

    const response = await fetch(`${API_BASE_URL}/market/historical?${params}`);
    return this.handleResponse<HistoricalDataResponse>(response);
  }

  static async getSupportedSymbols(): Promise<{ symbols: string[] }> {
    const response = await fetch(`${API_BASE_URL}/market/symbols`);
    return this.handleResponse<{ symbols: string[] }>(response);
  }
}