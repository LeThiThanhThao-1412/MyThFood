import { ValueObject } from '@mythfood/shared-kernel';

export interface OperatingHoursProps {
  dayOfWeek: number; // 0-6 (Sun-Sat)
  openTime: string; // HH:mm:ss
  closeTime: string; // HH:mm:ss
  isClosed: boolean;
  specialDate?: string; // YYYY-MM-DD for special dates
  [key: string]: unknown;
}

export class OperatingHours extends ValueObject<OperatingHoursProps> {
  private constructor(value: OperatingHoursProps) {
    super(value);
  }

  public static create(props: OperatingHoursProps): OperatingHours {
    if (props.dayOfWeek < 0 || props.dayOfWeek > 6) {
      throw new Error('Day of week must be between 0 and 6');
    }
    if (!props.isClosed) {
      if (!props.openTime) {
        throw new Error('Open time is required when not closed');
      }
      if (!props.closeTime) {
        throw new Error('Close time is required when not closed');
      }
    }
    return new OperatingHours(props);
  }

  /**
   * Check if a given time falls within operating hours.
   */
  public isWithinOperatingHours(now: Date): boolean {
    if (this.isClosed) return false;

    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [openH, openM] = this.openTime.split(':').map(Number) as [number, number];
    const [closeH, closeM] = this.closeTime.split(':').map(Number) as [number, number];

    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    if (openMinutes <= closeMinutes) {
      // Normal hours (e.g., 08:00 - 22:00)
      return currentTime >= openMinutes && currentTime <= closeMinutes;
    } else {
      // Overnight hours (e.g., 22:00 - 02:00)
      return currentTime >= openMinutes || currentTime <= closeMinutes;
    }
  }

  // Getters
  get dayOfWeek(): number {
    return this.props.dayOfWeek as number;
  }

  get openTime(): string {
    return this.props.openTime as string;
  }

  get closeTime(): string {
    return this.props.closeTime as string;
  }

  get isClosed(): boolean {
    return this.props.isClosed as boolean;
  }

  get specialDate(): string | null {
    return (this.props.specialDate as string) ?? null;
  }

  protected getEqualityComponents(): unknown[] {
    return [this.props.dayOfWeek, this.props.openTime, this.props.closeTime, this.props.isClosed, this.props.specialDate];
  }
}