import { timingSafeEqual } from "node:crypto";
import type { ChannelAdapter, ChannelProfile, CommentEvent, InboundEvent, SendResult } from "../types";
import { isRecord } from "../util";
import { mapGraphFailure } from "./graph-errors";
import { parseFacebookComments, parseFacebookWebhook } from "./parse";
import { isValidSignature } from "./signature";

export const DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com/v21.0";

const SAFE_THREAD_ID = /^[\w-]{1,128}$/;

export interface FacebookAdapterConfig {
  appSecret?: string;
  verifyToken?: string;
  pageAccessToken?: string;
  /** ຊີ້ໄປ simulator ໃນ dev/test */
  graphBaseUrl?: string;
  /** ສຳລັບ test */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class FacebookAdapter implements ChannelAdapter {
  readonly channel = "FACEBOOK" as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly config: FacebookAdapterConfig) {
    this.baseUrl = (config.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = config.fetch ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  /** ຮັບ webhook ໄດ້ເມື່ອມີທັງ app secret (ກວດລາຍເຊັນ) ແລະ verify token (handshake) */
  get canReceive(): boolean {
    return Boolean(this.config.appSecret && this.config.verifyToken);
  }

  verifyHandshake(mode: string | undefined, token: string | undefined): boolean {
    const expected = this.config.verifyToken;
    if (typeof mode !== "string" || typeof token !== "string") return false;
    if (mode !== "subscribe" || !token || !expected) return false;
    const actual = Buffer.from(token);
    const wanted = Buffer.from(expected);
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  }

  verifySignature(rawBody: Buffer, header: string | undefined): boolean {
    return isValidSignature(this.config.appSecret, rawBody, header);
  }

  parseWebhook(payload: unknown): InboundEvent[] {
    return parseFacebookWebhook(payload);
  }

  parseComments(payload: unknown): CommentEvent[] {
    return parseFacebookComments(payload);
  }

  async sendText(threadId: string, text: string): Promise<SendResult> {
    if (this.config.pageAccessToken && !SAFE_THREAD_ID.test(threadId)) {
      return { ok: false, code: "SEND_REJECTED", detail: "Invalid thread id" };
    }
    return this.postGraph(
      "/me/messages",
      { recipient: { id: threadId }, messaging_type: "RESPONSE", message: { text } },
      (body) => (typeof body.message_id === "string" ? body.message_id : undefined),
      "Graph returned 2xx without message_id",
    );
  }

  /** Private Reply: ຂໍ້ຄວາມສ່ວນຕົວ 1 ຄັ້ງຕໍ່ຄອມເມັ້ນ (ພາຍໃນ 7 ວັນ) ເພື່ອເລີ່ມແຊັດກັບຜູ້ຄອມເມັ້ນ */
  async sendPrivateReply(commentId: string, text: string): Promise<SendResult> {
    if (this.config.pageAccessToken && !SAFE_THREAD_ID.test(commentId)) {
      return { ok: false, code: "SEND_REJECTED", detail: "Invalid comment id" };
    }
    return this.postGraph(
      `/${commentId}/private_replies`,
      { message: text },
      (body) => (typeof body.message_id === "string" ? body.message_id : typeof body.id === "string" ? body.id : undefined),
      "Graph returned 2xx without an id",
    );
  }

  /** ຕອບຄອມເມັ້ນສາທາລະນະ */
  async replyToComment(commentId: string, text: string): Promise<SendResult> {
    if (this.config.pageAccessToken && !SAFE_THREAD_ID.test(commentId)) {
      return { ok: false, code: "SEND_REJECTED", detail: "Invalid comment id" };
    }
    return this.postGraph(
      `/${commentId}/comments`,
      { message: text },
      (body) => (typeof body.id === "string" ? body.id : undefined),
      "Graph returned 2xx without an id",
    );
  }

  private async postGraph(
    path: string,
    payload: unknown,
    pickId: (body: Record<string, unknown>) => string | undefined,
    missingIdDetail: string,
  ): Promise<SendResult> {
    const token = this.config.pageAccessToken;
    if (!token) {
      return { ok: false, code: "CHANNEL_NOT_CONFIGURED", detail: "FACEBOOK_PAGE_ACCESS_TOKEN is not set" };
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return { ok: false, code: "CHANNEL_UNAVAILABLE", detail: errorText(error) };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      // abort/timeout/truncated/non-JSON body: ບໍ່ຮູ້ຜົນ ຈຶ່ງບໍ່ລາຍງານວ່າຖືກປະຕິເສດ
      return { ok: false, code: "CHANNEL_UNAVAILABLE", detail: errorText(error) };
    }
    if (response.ok) {
      const id = isRecord(body) ? pickId(body) : undefined;
      if (id !== undefined) return { ok: true, externalId: id };
      // 2xx: Meta ອາດສົ່ງແລ້ວ
      return { ok: false, code: "CHANNEL_UNAVAILABLE", detail: missingIdDetail };
    }
    return { ok: false, ...mapGraphFailure(response.status, body) };
  }

  async fetchProfile(threadId: string): Promise<ChannelProfile | null> {
    const token = this.config.pageAccessToken;
    if (!token || !SAFE_THREAD_ID.test(threadId)) return null;
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl}/${encodeURIComponent(threadId)}?fields=first_name%2Clast_name`,
        { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(this.timeoutMs) },
      );
      if (!response.ok) return null;
      const body: unknown = await response.json();
      if (!isRecord(body)) return null;
      const name = [body.first_name, body.last_name]
        .filter((part): part is string => typeof part === "string" && part.length > 0)
        .join(" ");
      return name ? { name } : null;
    } catch {
      return null;
    }
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}
