import { Controller, Post, Body, Get, UseGuards, Req } from "@nestjs/common";
import { AuthService, AuthTokens } from "./auth.service";
import { RegisterUserDto } from "../user/application/dtos/register-user.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(@Body() dto: RegisterUserDto) {
    const user = await this.authService.register(dto);
    return {
      statusCode: 201,
      message: "User registered successfully",
      data: {
        id: user.id.toString(),
        phone: user.phone,
        fullName: user.displayName,
        roles: user.userRoles,
        status: user.currentStatus,
      },
    };
  }

  @Post("login")
  async login(
    @Body() body: { phoneNumber: string; password: string },
  ): Promise<{ statusCode: number; data: AuthTokens }> {
    const tokens = await this.authService.login(
      body.phoneNumber,
      body.password,
    );
    return {
      statusCode: 200,
      data: tokens,
    };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getProfile(
    @Req() req: { user: { userId: string; phone: string; roles: string[] } },
  ) {
    const user = await this.authService.validateUser(req.user.userId);
    if (!user) {
      return { statusCode: 404, message: "User not found" };
    }
    return {
      statusCode: 200,
      data: {
        id: user.id.toString(),
        phone: user.phone,
        fullName: user.displayName,
        roles: user.userRoles,
        status: user.currentStatus,
      },
    };
  }
}
