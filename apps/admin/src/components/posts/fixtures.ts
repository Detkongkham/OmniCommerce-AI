import type { SocialPostDto } from "@/lib/posts";

export const POST: SocialPostDto = {
  id: "p1",
  message: "New arrivals this week",
  status: "DRAFT",
  scheduledAt: null,
  publishedAt: null,
  externalPostId: null,
  permalinkUrl: null,
  errorCode: null,
  errorMessage: null,
  cfLinkError: null,
  liveSession: null,
  media: [{ id: "pm1", position: 0, mediaFileId: "m1", url: "/media/files/aaa.png" }],
  createdBy: { id: "u1", name: "Noy" },
  createdAt: "2026-10-08T03:00:00.000Z",
  updatedAt: "2026-10-08T03:00:00.000Z",
};
