import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReviewEntity } from "./review.entity";
import { ReviewRepository } from "./review.repository";
import { ReviewService } from "./review.service";
import { ReviewController } from "./review.controller";

@Module({
  imports: [TypeOrmModule.forFeature([ReviewEntity]), HttpModule],
  controllers: [ReviewController],
  providers: [ReviewRepository, ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
