import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/**
 * Fail-fast environment validation — Phase 3 Plan, Section 15.
 * The application refuses to boot if required config is missing or malformed,
 * rather than failing on first use in production.
 */
enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  // --- Database (Prisma / RDS PostgreSQL) ---
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  // --- Redis (ElastiCache) ---
  @IsUrl({ protocols: ['redis', 'rediss'], require_tld: false })
  REDIS_URL: string;

  // --- Clerk ---
  @IsString()
  @IsNotEmpty()
  CLERK_SECRET_KEY: string;

  @IsString()
  @IsNotEmpty()
  CLERK_PUBLISHABLE_KEY: string;

  @IsString()
  @IsNotEmpty()
  CLERK_WEBHOOK_SIGNING_SECRET: string;

  // --- AWS / S3 ---
  @IsString()
  @IsNotEmpty()
  AWS_REGION: string;

  @IsString()
  @IsNotEmpty()
  S3_PUBLIC_BUCKET_NAME: string;

  @IsString()
  @IsNotEmpty()
  S3_PRIVATE_BUCKET_NAME: string;

  // AWS credentials are intentionally NOT validated here in staging/production —
  // ECS Fargate tasks receive them via IAM task roles, not env vars (Architecture
  // Blueprint Section 13, least-privilege IAM). Only required for local dev.
  @IsOptional()
  @IsString()
  AWS_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  AWS_SECRET_ACCESS_KEY?: string;

  // --- Sentry ---
  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  // --- Rate limiting (baseline; per-route overrides live in code per Sign-Off Section 11) ---
  @IsInt()
  @Min(1)
  RATE_LIMIT_AUTHENTICATED_PER_MIN: number;

  @IsInt()
  @Min(1)
  RATE_LIMIT_UNAUTHENTICATED_PER_MIN: number;

  // --- Cache TTLs (seconds) ---
  @IsInt()
  @Min(1)
  CACHE_TTL_LOOKUP_SECONDS: number;

  @IsInt()
  @Min(1)
  CACHE_TTL_LIST_SECONDS: number;

  @IsInt()
  @Min(1)
  CACHE_TTL_DASHBOARD_SECONDS: number;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(
      `Environment validation failed — application will not start. Details: ${messages}`,
    );
  }

  return validatedConfig;
}
