import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync, mkdirSync, createReadStream, writeFileSync } from "fs";
import { join, extname } from "path";
import { stat } from "fs/promises";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private s3Client: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {
    const storageDriver = this.configService.get<string>(
      "STORAGE_DRIVER",
      "local",
    );
    if (storageDriver === "s3") {
      this.s3Client = new S3Client({
        region: this.configService.get<string>("AWS_REGION", "ap-southeast-1"),
        credentials: {
          accessKeyId: this.configService.get<string>("AWS_ACCESS_KEY_ID", ""),
          secretAccessKey: this.configService.get<string>(
            "AWS_SECRET_ACCESS_KEY",
            "",
          ),
        },
      });
      this.logger.log("S3 client initialized");
    }
  }

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

    if (storageDriver === "s3") {
      return this.saveToS3(file, folder);
    }

    if (storageDriver === "local") {
      return this.saveToLocal(file, folder);
    }

    throw new BadRequestException(
      `Storage driver "${storageDriver}" not supported`,
    );
  }

  private async saveToS3(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{
    url: string;
    key: string;
    size: number;
    mimeType: string;
  }> {
    if (!this.s3Client) {
      throw new BadRequestException("S3 client not initialized");
    }

    const allowedFolders = [
      "avatars",
      "merchants",
      "menu-items",
      "covers",
      "reviews",
    ];
    if (!allowedFolders.includes(folder)) {
      throw new BadRequestException(
        `Invalid folder: ${folder}. Allowed: ${allowedFolders.join(", ")}`,
      );
    }

    const bucket = this.configService.get<string>("AWS_S3_BUCKET", "");
    const ext = extname(file.originalname);
    const safeName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const key = `mythfood/${folder}/${safeName}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);

    // Return proxy URL (goes through upload-service to generate pre-signed URL)
    // Direct S3 URL would return 403 because bucket is private (no public ACL)
    const baseUrl = this.configService.get<string>(
      "UPLOAD_BASE_URL",
      `http://localhost:${this.configService.get("PORT", 3010)}`,
    );
    const url = `${baseUrl}/api/v1/upload/${folder}/${safeName}`;

    return {
      url,
      key,
      size: file.size,
      mimeType: file.mimetype,
    };
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
    const allowedFolders = [
      "avatars",
      "merchants",
      "menu-items",
      "covers",
      "reviews",
    ];
    if (!allowedFolders.includes(folder)) {
      throw new BadRequestException(
        `Invalid folder: ${folder}. Allowed: ${allowedFolders.join(", ")}`,
      );
    }

    const uploadDir = join(process.cwd(), "uploads", folder);
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    // Generate safe filename (avoid Vietnamese chars / special chars in URL)
    const ext = extname(file.originalname);
    const safeName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = join(uploadDir, safeName);

    // Write buffer to disk
    if (!existsSync(filePath)) {
      writeFileSync(filePath, file.buffer);
    }

    const key = `${folder}/${safeName}`;
    const baseUrl = this.configService.get<string>(
      "UPLOAD_BASE_URL",
      `http://localhost:${this.configService.get("PORT", 3010)}`,
    );

    const url = `${baseUrl}/api/v1/upload/${key}`;
    const stats = await stat(filePath);
    const size = file.size || stats.size;

    return {
      url,
      key,
      size,
      mimeType: file.mimetype,
    };
  }

  async getSignedUrl(key: string): Promise<string> {
    if (!this.s3Client) {
      throw new Error("S3 client not initialized");
    }
    const bucket = this.configService.get<string>("AWS_S3_BUCKET", "");
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: `mythfood/${key}`,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }

  getFileStream(key: string): {
    stream: ReturnType<typeof createReadStream>;
    mimeType: string;
  } | null {
    const storageDriver = this.configService.get<string>(
      "STORAGE_DRIVER",
      "local",
    );

    if (storageDriver === "s3") {
      // For S3, return null to signal redirect
      return null;
    }

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
