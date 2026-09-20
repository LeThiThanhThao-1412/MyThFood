import { Global, Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { IntegrationService } from "./integration.service";

@Global()
@Module({
  imports: [HttpModule],
  providers: [IntegrationService],
  exports: [IntegrationService],
})
export class IntegrationModule {}
