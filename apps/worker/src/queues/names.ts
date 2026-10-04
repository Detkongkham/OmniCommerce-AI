export const QUEUE_SYSTEM = "system";

export const JOB_PING = "ping";

export interface PingData {
  message?: string;
}

export interface PingResult {
  pong: true;
  message: string;
  at: string;
}
