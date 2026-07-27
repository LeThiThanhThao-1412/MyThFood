import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  Res,
  HttpStatus,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "@nestjs/passport";
import { Response } from "express";
import { UploadService } from "../application/upload.service";

@Controller("upload")
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post("image")
  @UseGuards(AuthGuard("jwt"))
  @UseInterceptors(FileInterceptor("file"))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body("folder") folder: string,
  ) {
    if (!file) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: "File is required",
      };
    }

    const result = await this.uploadService.saveFile(file, folder || "avatars");

    return {
      statusCode: HttpStatus.OK,
      message: "File uploaded successfully",
      data: result,
    };
  }

  @Get(":key")
  async getFile(@Param("key") key: string, @Res() res: Response) {
    try {
      const { stream, mimeType } = this.uploadService.getFileStream(key);
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      stream.pipe(res);
    } catch (error) {
      res.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message: "File not found",
      });
    }
  }
}