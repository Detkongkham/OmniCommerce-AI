import { Module } from "@nestjs/common";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";

/** Social Posting (2a): ອັບໂຫຼດຮູບ, ໂພສ/ຕັ້ງເວລາລົງ Facebook Page, ເຊື່ອມ Post CF */
@Module({
  controllers: [MediaController],
  providers: [MediaService],
})
export class PostingModule {}
