export interface GameSession {
  id: string; // Unique identifier for the session
  startTime: number; // Timestamp
  endTime: number | null; // Null if actively playing
  laneId: number; // Default 1
  playerCount: number;
  initialTimeMinutes?: number;
  addedTimeMinutes?: number;
  totalTimeMinutes: number; // Calculated on end
  status: 'completed' | 'cancelled' | 'active';
}

export interface DailySummary {
  date: string; // ISO Date String (YYYY-MM-DD)
  totalTimeMinutes: number;
  totalGames: number;
  sessions: GameSession[];
}
