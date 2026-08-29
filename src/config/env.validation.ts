import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  @IsOptional()
  NODE_ENV = 'development';

  @IsInt()
  @IsOptional()
  PORT = 3000;

  @IsString()
  CORS_ORIGIN!: string;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_ACCESS_TTL = '15m';

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_REFRESH_TTL = '7d';

  @IsString()
  SMTP_HOST!: string;

  @IsInt()
  SMTP_PORT = 587;

  @IsBoolean()
  @IsOptional()
  SMTP_SECURE = false;

  @IsString()
  SMTP_USER!: string;

  @IsString()
  SMTP_PASSWORD!: string;

  @IsString()
  MAIL_FROM!: string;

  @IsInt()
  @Min(1)
  DEFAULT_PUBLISH_CUTOFF_HOURS = 48;

  @IsInt()
  @Min(0)
  MIN_REST_HOURS = 10;

  @IsInt()
  @Min(1)
  DAILY_HOURS_WARNING = 8;

  @IsInt()
  @Min(1)
  DAILY_HOURS_HARD_BLOCK = 12;

  @IsInt()
  @Min(1)
  WEEKLY_HOURS_WARNING = 35;

  @IsInt()
  @Min(1)
  WEEKLY_HOURS_OVERTIME = 40;

  @IsInt()
  @Min(1)
  DROP_REQUEST_EXPIRY_HOURS_BEFORE_SHIFT = 24;

  @IsInt()
  @Min(1)
  @Max(20)
  MAX_PENDING_SWAP_REQUESTS_PER_STAFF = 3;
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return validatedConfig;
}
