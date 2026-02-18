export interface GameSession {
  id: string; // Unique identifier for the session
  startTime: number; // Timestamp
  endTime: number | null; // Null if actively playing
  laneId: number; // Default 1
  playerCount: number;
  totalTimeMinutes: number; // Calculated on end
  amountCollected: number; // Calculated based on rate
  status: 'completed' | 'cancelled' | 'active';
}

export interface DailySummary {
  date: string; // ISO Date String (YYYY-MM-DD)
  totalRevenue: number;
  totalTimeMinutes: number;
  totalGames: number;
  sessions: GameSession[];
}

export interface PricingConfig {
  halfHourRate: number; // Cost per 30 mins
  hourRate: number; // Cost per 60 mins
  currency: string; // 'COP', 'USD', etc.
}
