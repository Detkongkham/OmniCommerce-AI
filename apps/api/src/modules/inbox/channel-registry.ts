import { Inject, Injectable } from "@nestjs/common";
import { type ChannelAdapter, FacebookAdapter } from "@oca/channels";
import { ENV, type Env } from "../../config/env";

/** ສ້າງ adapter ຈາກ env ຄັ້ງດຽວ. Instagram/TikTok/LINE ຈະເພີ່ມທີ່ນີ້ໃນອະນາຄົດ. */
@Injectable()
export class ChannelRegistry {
  readonly facebook: FacebookAdapter;

  constructor(@Inject(ENV) env: Env) {
    this.facebook = new FacebookAdapter({
      appSecret: env.FACEBOOK_APP_SECRET,
      verifyToken: env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
      pageAccessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN,
      graphBaseUrl: env.FACEBOOK_GRAPH_BASE_URL,
    });
  }

  adapterFor(channel: string): ChannelAdapter | null {
    return channel === "FACEBOOK" ? this.facebook : null;
  }
}
