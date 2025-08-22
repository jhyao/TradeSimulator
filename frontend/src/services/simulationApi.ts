interface StartSimulationRequest {
  symbol: string;
  startTime: number;
  interval: string;
  speed: number;
}

interface SimulationStatus {
  state: string;
  symbol: string;
  interval: string;
  speed: number;
  currentIndex: number;
  totalCandles: number;
  progress: number;
  startTime: string;
  currentTime: string;
  currentPrice: number;
}

interface ApiError {
  error: string;
}

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api/v1';

export class SimulationApiService {
  private static async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`
      }));
      throw new Error(errorData.error);
    }
    return response.json();
  }

  static async startSimulation(
    symbol: string,
    startTime: Date,
    interval: string,
    speed: number = 1
  ): Promise<{ message: string; symbol: string; startTime: string; interval: string; speed: number }> {
    const request: StartSimulationRequest = {
      symbol,
      startTime: startTime.getTime(),
      interval,
      speed
    };

    const response = await fetch(`${API_BASE_URL}/simulation/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return this.handleResponse(response);
  }

  static async pauseSimulation(): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/simulation/pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return this.handleResponse(response);
  }

  static async resumeSimulation(): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/simulation/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return this.handleResponse(response);
  }

  static async stopSimulation(): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/simulation/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return this.handleResponse(response);
  }

  static async setSpeed(speed: number): Promise<{ message: string; speed: number }> {
    const response = await fetch(`${API_BASE_URL}/simulation/speed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ speed }),
    });

    return this.handleResponse(response);
  }

  static async getStatus(): Promise<SimulationStatus> {
    const response = await fetch(`${API_BASE_URL}/simulation/status`);
    return this.handleResponse<SimulationStatus>(response);
  }
}