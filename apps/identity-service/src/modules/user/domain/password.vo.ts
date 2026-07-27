import { ValueObject, Result, ValidationError } from "@mythfood/shared-kernel";
import * as bcrypt from "bcrypt";

export interface PasswordProps {
  hash: string;
  [key: string]: unknown;
}

export class Password extends ValueObject<PasswordProps> {
  private static readonly MIN_LENGTH = 8;
  private static readonly SALT_ROUNDS = 12;

  // FIX #13: Enhanced password complexity requirements
  private static readonly PASSWORD_REGEX =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

  private constructor(props: PasswordProps) {
    super(props);
  }

  /**
   * Create a Password from a plaintext value (hashes it).
   * Enforces complexity: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char.
   */
  public static async create(
    plainText: string,
  ): Promise<Result<Password, ValidationError>> {
    if (!plainText || plainText.length < Password.MIN_LENGTH) {
      return Result.fail(
        new ValidationError(
          `Password must be at least ${Password.MIN_LENGTH} characters`,
        ),
      );
    }

    if (!Password.PASSWORD_REGEX.test(plainText)) {
      return Result.fail(
        new ValidationError(
          "Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character",
        ),
      );
    }

    const hash = await bcrypt.hash(plainText, Password.SALT_ROUNDS);
    return Result.ok(new Password({ hash }));
  }

  /**
   * Rehydrate a Password from an existing hash (e.g., from database).
   */
  public static fromHash(hash: string): Password {
    return new Password({ hash });
  }

  /**
   * Verify a plaintext password against this hash.
   */
  public async verify(plainText: string): Promise<boolean> {
    return bcrypt.compare(plainText, this.getProps().hash);
  }

  get hash(): string {
    return this.getProps().hash;
  }
}
