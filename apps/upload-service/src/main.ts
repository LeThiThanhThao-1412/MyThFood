import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.enableCors();
  const port = process.env.PORT || 3010;
  await app.listen(port);
  console.log(`Upload Service running on port ${port}`);
}
bootstrap();