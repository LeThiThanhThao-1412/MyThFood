export class RegisterUserCommand {
  constructor(
    public readonly phoneNumber: string,
    public readonly fullName: string,
    public readonly password: string,
    public readonly email?: string,
    public readonly roles?: string[],
    public readonly deviceId?: string,
    public readonly ipAddress?: string,
  ) {}
}
