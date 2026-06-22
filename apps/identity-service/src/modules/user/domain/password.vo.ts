import { ValueObject, Result, ValidationError } from '@mythfood/shared-kernel';
import * as bcrypt from 'bcrypt';

export interface PasswordProps {
  hash: string;
  [key: string]: unknown;
}

export class Password extends ValueObject<PasswordProps> {
  private static readonly MIN_LENGTH = 8;
  private static readonly SALT_ROUNDS = 12;

  private constructor(props: PasswordProps) {
    super(props);
  }

  /**
   * Create a Password from a plaintext value (hashes it).
   */
  public static async create(plainText: string): Promise<Result<Password, ValidationError>> {
    if (!plainText || plainText.length < Password.MIN_LENGTH) {
      return Result.fail(
        new ValidationError(`Password must be at least ${Password.MIN_LENGTH} characters`),
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