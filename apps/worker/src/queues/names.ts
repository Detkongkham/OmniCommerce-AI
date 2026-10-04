export const QUEUE_SYSTEM = "system";

export const QUEUE_MAINTENANCE = "maintenance";

export const QUEUE_INVENTORY = "inventory";

export const JOB_PING = "ping";
export const JOB_CLEANUP_REFRESH_TOKENS = "cleanup-refresh-tokens";
export const JOB_EXPIRE_RESERVATIONS = "expire-reservations";

export interface PingData {
  message?: string;
}

export interface PingResult {
  pong: true;
  message: string;
  at: string;
}
