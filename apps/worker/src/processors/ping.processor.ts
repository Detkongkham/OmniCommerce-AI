import type { PingData, PingResult } from "../queues/names";

export function handlePing(data: PingData, now: () => Date = () => new Date()): PingResult {
  return { pong: true, message: data.message ?? "ping", at: now().toISOString() };
}
