import { Module } from "@nestjs/common";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { PostsController } from "./posts.controller";
import { PostsService } from "./posts.service";

/** Social Posting (2a): ອັບໂຫຼດຮູບ, ໂພສ/ຕັ້ງເວລາລົງ Facebook Page, ເຊື່ອມ Post CF */
@Module({
  controllers: [MediaController, PostsController],
  providers: [MediaService, PostsService],
})
export class PostingModule {}
