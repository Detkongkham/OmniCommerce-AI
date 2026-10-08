import { Module } from "@nestjs/common";
import { ChannelRegistry } from "../inbox/channel-registry";

/** ຫໍ່ ChannelRegistry ເພື່ອໃຫ້ Inbox ແລະ CF Engine ໃຊ້ຮ່ວມກັນ (ບໍ່ມີ circular import) */
@Module({
  providers: [ChannelRegistry],
  exports: [ChannelRegistry],
})
export class ChannelsModule {}
