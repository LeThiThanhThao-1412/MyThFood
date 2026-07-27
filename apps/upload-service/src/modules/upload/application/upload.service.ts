import { Injectable, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync, mkdirSync, createReadStream } from "fs";
import { join, extname } from "path";
import { stat } from "fs/promises";

@Injectable()
export class UploadService {
  constructor(private readonly configService: ConfigService) {}

  async saveFile(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{
    url: string;
    key: string;
    size: number;
    mimeType: string;
  }> {
    const storageDriver = this.configService.get<string>(
      "STORAGE_DRIVER",
      "local",
    );

    if (storageDriver === "local") {
      return this.saveToLocal(file, folder);
    }

    // Future: S3 support
    throw new BadRequestException(
      `Storage driver "${storageDriver}" not supported`,
    );
  }

  private async saveToLocal(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{
    url: string;
    key: string;
    size: number;
    mimeType: string;
  }> {
    const allowedFolders = ["avatars", "merchants", "menu-items"];
    if (!allowedFolders.includes(folder)) {
      throw new BadRequestException(
        `Invalid folder: ${folder}. Allowed: ${allowedFolders.join(", ")}`,
      );
    }

    const uploadDir = join(process.cwd(), "uploads", folder);
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    const key = `${folder}/${file.filename}`;
    const baseUrl = this.configService.get<string>(
      "UPLOAD_BASE_URL",
      `http://localhost:${this.configService.get("PORT", 3010)}`,
    );

    const url = `${baseUrl}/api/v1/upload/${key}`;
    const size = (await stat(file.path)).size;

    return {
      url,
      key,
      size,
      mimeType: file.mimetype,
    };
  }

  getFileStream(key: string): {
    stream: ReturnType<typeof createReadStream>;
    mimeType: string;
  } {
    const filePath = join(process.cwd(), "uploads", key);

    if (!existsSync(filePath)) {
      throw new BadRequestException("File not found");
    }

    const ext = extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };

    const mimeType = mimeMap[ext] || "application/octet-stream";

    return {
      stream: createReadStream(filePath),
      mimeType,
    };
  }
}