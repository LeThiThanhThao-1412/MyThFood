import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard, Roles } from "../../auth/guards/roles.guard";
import { UserAdminService } from "../application/user-admin.service";
import {
  QueryUsersDto,
  UpdateUserStatusDto,
  UserAdminResponseDto,
  PaginatedUsersResponseDto,
} from "../application/dtos/user-admin.dto";

@Controller("auth/users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class UserAdminController {
  constructor(private readonly userAdminService: UserAdminService) {}

  @Get()
  async listUsers(
    @Query() query: QueryUsersDto,
  ): Promise<PaginatedUsersResponseDto> {
    return this.userAdminService.listUsers(query);
  }

  // Thông tin liên hệ cơ bản (tên + SĐT) cho tài xế khi cần gọi khách hàng.
  @Get(":id/contact")
  @Roles("DRIVER", "ADMIN")
  async getUserContact(@Param("id") id: string) {
    const user = await this.userAdminService.getUserById(id);
    return {
      statusCode: HttpStatus.OK,
      data: { id: user.id, fullName: user.fullName, phone: user.phone },
    };
  }

  @Get(":id")
  async getUserById(@Param("id") id: string): Promise<UserAdminResponseDto> {
    return this.userAdminService.getUserById(id);
  }

  @Patch(":id/status")
  @HttpCode(HttpStatus.OK)
  async updateUserStatus(
    @Param("id") id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserAdminResponseDto> {
    return this.userAdminService.updateUserStatus(id, dto.status);
  }
}
