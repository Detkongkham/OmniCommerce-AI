import { Module } from "@nestjs/common";
import { ChannelsModule } from "../channels/channels.module";
import { LiveCfModule } from "../live-cf/live-cf.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { PostPublisherService } from "./post-publisher.service";
import { PostsController } from "./posts.controller";
import { PostsService } from "./posts.service";

/** Social Posting (2a): ອັບໂຫຼດຮູບ, ໂພສ/ຕັ້ງເວລາລົງ Facebook Page, ເຊື່ອມ Post CF */
@Module({
  imports: [ChannelsModule, LiveCfModule],
  controllers: [MediaController, PostsController],
  providers: [MediaService, PostPublisherService, PostsService],
})
export class PostingModule {}
