import {
  IsString,
  IsPhoneNumber,
  IsOptional,
  IsEmail,
  IsArray,
  IsEnum,
} from "class-validator";
import { UserRole } from "../../domain/user.aggregate";

export class RegisterUserDto {
  @IsString()
  @IsPhoneNumber("VN")
  phoneNumber!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  fullName!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsArray()
  @IsEnum(["CONSUMER", "DRIVER", "MERCHANT_OWNER", "MERCHANT_STAFF", "ADMIN"], {
    each: true,
  })
  roles?: UserRole[];

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;
}
