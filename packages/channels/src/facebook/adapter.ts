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
  /** ອັບໂຫຼດຮູບ (ໄຟລ໌ໃຫຍ່ສຸດ 8 MB) ໃຊ້ເວລາດົນກວ່າ */
  uploadTimeoutMs?: number;
}

/** ຮູບຂອງໂພສ: URL ທີ່ Facebook ດຶງເອງ ຫຼື ໄຟລ໌ (ສົ່ງເປັນ multipart, Facebook ບໍ່ຕ້ອງເຂົ້າເຖິງ server ເຮົາ) */
export type PostPhoto = { url: string } | { data: Uint8Array; mimeType: string; filename: string };

export interface PublishPostInput {
  message: string;
  photos: PostPhoto[];
}

type GraphBody = { json: unknown } | { form: FormData };

export class FacebookAdapter implements ChannelAdapter {
  readonly channel = "FACEBOOK" as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly uploadTimeoutMs: number;

  constructor(private readonly config: FacebookAdapterConfig) {
    this.baseUrl = (config.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = config.fetch ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.uploadTimeoutMs = config.uploadTimeoutMs ?? 60_000;
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

  /**
   * ຄອມເມັ້ນ/Private Reply ເປັນຂອງ Facebook ເທົ່ານັ້ນ ຕັ້ງໃຈບໍ່ໃສ່ໃນ `ChannelAdapter`
   * (channel ອື່ນຍັງບໍ່ມີແນວຄິດນີ້; ເພີ່ມເມື່ອມີ channel ທີສອງ)
   */
  parseComments(payload: unknown): CommentEvent[] {
    return parseFacebookComments(payload);
  }

  async sendText(threadId: string, text: string): Promise<SendResult> {
    return this.postGraph(
      "/me/messages",
      { recipient: { id: threadId }, messaging_type: "RESPONSE", message: { text } },
      pickMessageId,
      "Graph returned 2xx without message_id",
      { idToValidate: threadId, idLabel: "thread" },
    );
  }

  /** Private Reply: ຂໍ້ຄວາມສ່ວນຕົວ 1 ຄັ້ງຕໍ່ຄອມເມັ້ນ (ພາຍໃນ 7 ວັນ) ເພື່ອເລີ່ມແຊັດກັບຜູ້ຄອມເມັ້ນ */
  async sendPrivateReply(commentId: string, text: string): Promise<SendResult> {
    return this.postGraph(
      `/${commentId}/private_replies`,
      { message: text },
      pickMessageIdOrId,
      "Graph returned 2xx without an id",
      { idToValidate: commentId, idLabel: "comment" },
    );
  }

  /** ຕອບຄອມເມັ້ນສາທາລະນະ */
  async replyToComment(commentId: string, text: string): Promise<SendResult> {
    return this.postGraph(
      `/${commentId}/comments`,
      { message: text },
      pickId,
      "Graph returned 2xx without an id",
      { idToValidate: commentId, idLabel: "comment" },
    );
  }

  /**
   * ໂພສລົງເພຈ (token ຂອງເພຈ: /me = ເພຈ). ຮູບແຕ່ລະຮູບອັບໂຫຼດແບບ `published=false` ກ່ອນ ແລ້ວແນບເຂົ້າໂພສດຽວ.
   * ຄືນ id ຂອງໂພສ (`<pageId>_<postId>`, ຮູບດຽວກັບ `post_id` ໃນ webhook). ຮູບທີ່ອັບແລ້ວແຕ່ໂພສລົ້ມ ບໍ່ສະແດງເທິງເພຈ.
   */
  async publishPost(input: PublishPostInput): Promise<SendResult> {
    if (!this.config.pageAccessToken) {
      return { ok: false, code: "CHANNEL_NOT_CONFIGURED", detail: "FACEBOOK_PAGE_ACCESS_TOKEN is not set" };
    }
    const mediaIds: string[] = [];
    for (const [index, photo] of input.photos.entries()) {
      const body: GraphBody = "url" in photo ? { json: { url: photo.url, published: false } } : { form: photoForm(photo) };
      const result = await this.requestGraph("/me/photos", body, pickId, "Graph returned 2xx without a photo id", this.uploadTimeoutMs);
      if (!result.ok) return { ...result, detail: `photo ${index + 1}: ${result.detail}`.slice(0, 300) };
      mediaIds.push(result.externalId);
    }
    const payload =
      mediaIds.length > 0 ? { message: input.message, attached_media: mediaIds.map((id) => ({ media_fbid: id })) } : { message: input.message };
    return this.requestGraph("/me/feed", { json: payload }, pickId, "Graph returned 2xx without a post id", this.timeoutMs);
  }

  private async postGraph(
    path: string,
    payload: unknown,
    pickExternalId: (body: Record<string, unknown>) => string | undefined,
    missingIdDetail: string,
    guard: { idToValidate: string; idLabel: "thread" | "comment" },
  ): Promise<SendResult> {
    const token = this.config.pageAccessToken;
    if (!token) {
      return { ok: false, code: "CHANNEL_NOT_CONFIGURED", detail: "FACEBOOK_PAGE_ACCESS_TOKEN is not set" };
    }
    // ກວດຫຼັງ token (ລຳດັບເດີມ): id ຜິດຮູບແບບຖືກປະຕິເສດກ່ອນເອີ້ນເຄືອຂ່າຍ
    if (!SAFE_THREAD_ID.test(guard.idToValidate)) {
      return { ok: false, code: "SEND_REJECTED", detail: `Invalid ${guard.idLabel} id` };
    }
    return this.requestGraph(path, { json: payload }, pickExternalId, missingIdDetail, this.timeoutMs);
  }

  private async requestGraph(
    path: string,
    body: GraphBody,
    pickExternalId: (body: Record<string, unknown>) => string | undefined,
    missingIdDetail: string,
    timeoutMs: number,
  ): Promise<SendResult> {
    const token = this.config.pageAccessToken;
    if (!token) {
      return { ok: false, code: "CHANNEL_NOT_CONFIGURED", detail: "FACEBOOK_PAGE_ACCESS_TOKEN is not set" };
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        // FormData: fetch ຕັ້ງ content-type + boundary ເອງ
        headers: "json" in body ? { "content-type": "application/json", authorization: `Bearer ${token}` } : { authorization: `Bearer ${token}` },
        body: "json" in body ? JSON.stringify(body.json) : body.form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      return { ok: false, code: "CHANNEL_UNAVAILABLE", detail: errorText(error) };
    }
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (error) {
      // abort/timeout/truncated/non-JSON body: ບໍ່ຮູ້ຜົນ ຈຶ່ງບໍ່ລາຍງານວ່າຖືກປະຕິເສດ
      return { ok: false, code: "CHANNEL_UNAVAILABLE", detail: errorText(error) };
    }
    if (response.ok) {
      const id = isRecord(parsed) ? pickExternalId(parsed) : undefined;
      if (id !== undefined) return { ok: true, externalId: id };
      // 2xx: Meta ອາດສົ່ງແລ້ວ
      return { ok: false, code: "CHANNEL_UNAVAILABLE", detail: missingIdDetail };
    }
    return { ok: false, ...mapGraphFailure(response.status, parsed) };
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

const pickMessageId = (body: Record<string, unknown>) => (typeof body.message_id === "string" ? body.message_id : undefined);
const pickId = (body: Record<string, unknown>) => (typeof body.id === "string" ? body.id : undefined);
const pickMessageIdOrId = (body: Record<string, unknown>) => pickMessageId(body) ?? pickId(body);

function photoForm(photo: { data: Uint8Array; mimeType: string; filename: string }): FormData {
  const form = new FormData();
  form.set("published", "false");
  form.set("source", new Blob([new Uint8Array(photo.data)], { type: photo.mimeType }), photo.filename);
  return form;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}
