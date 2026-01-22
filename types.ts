
export enum TestStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED'
}

export interface StudentInfo {
  admissionNumber: string;
  studentName: string;
  className: string;
}

export interface TypingStats {
  wpm: number;
  accuracy: number;
  errors: number;
  totalChars: number;
  timeElapsed: number;
  currentMarks: number;
}

export interface TestSettings {
  duration: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  topic: string;
  maxMarks: number;
}

export interface LeaderboardEntry extends TypingStats, StudentInfo {
  id: string;
  timestamp: number;
  topic: string;
}
