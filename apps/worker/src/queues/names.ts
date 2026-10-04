export const QUEUE_SYSTEM = "system";

export const QUEUE_MAINTENANCE = "maintenance";

export const JOB_PING = "ping";
export const JOB_CLEANUP_REFRESH_TOKENS = "cleanup-refresh-tokens";

export interface PingData {
  message?: string;
}

export interface PingResult {
  pong: true;
  message: string;
  at: string;
}
