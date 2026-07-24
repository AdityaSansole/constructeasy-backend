/**
 * Typed config shape, consumed via ConfigService throughout the app.
 * Values are already validated (validation.schema.ts) by the time this runs.
 */
export default () => ({
  env: process.env.NODE_ENV,
  port: parseInt(process.env.PORT ?? '3000', 10),

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL,
  },

  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    webhookSigningSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  },

  aws: {
    region: process.env.AWS_REGION,
    s3: {
      publicBucket: process.env.S3_PUBLIC_BUCKET_NAME,
      privateBucket: process.env.S3_PRIVATE_BUCKET_NAME,
    },
  },

  sentry: {
    dsn: process.env.SENTRY_DSN,
  },

  rateLimit: {
    authenticatedPerMin: parseInt(
      process.env.RATE_LIMIT_AUTHENTICATED_PER_MIN ?? '100',
      10,
    ),
    unauthenticatedPerMin: parseInt(
      process.env.RATE_LIMIT_UNAUTHENTICATED_PER_MIN ?? '30',
      10,
    ),
  },

  cache: {
    ttlLookupSeconds: parseInt(
      process.env.CACHE_TTL_LOOKUP_SECONDS ?? '3600',
      10,
    ),
    ttlListSeconds: parseInt(process.env.CACHE_TTL_LIST_SECONDS ?? '45', 10),
    ttlDashboardSeconds: parseInt(
      process.env.CACHE_TTL_DASHBOARD_SECONDS ?? '60',
      10,
    ),
  },
});
