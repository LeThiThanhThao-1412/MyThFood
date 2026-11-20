import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1");

  // GPS batch gửi kèm mảng điểm → cần validate/transform DTO lồng nhau.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT") || 3007;
  const corsOrigin = configService.get<string>("CORS_ORIGIN") || "*";

  app.enableCors({ origin: corsOrigin });

  await app.listen(port);
  console.log(`🚗 Driver Service is running on port ${port}`);
}

bootstrap();
