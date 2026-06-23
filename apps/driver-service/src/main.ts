import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT") || 3007;
  const corsOrigin = configService.get<string>("CORS_ORIGIN") || "*";

  app.enableCors({ origin: corsOrigin });

  await app.listen(port);
  console.log(`🚗 Driver Service is running on port ${port}`);
}

bootstrap();
