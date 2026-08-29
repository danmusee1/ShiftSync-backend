export interface AppConfig {
  env: string;
  port: number;
  corsOrigin: string;
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  jwt: {
    accessSecret: string;
    accessTtl: string;
    refreshSecret: string;
    refreshTtl: string;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  };
  businessRules: {
    defaultPublishCutoffHours: number;
    minRestHours: number;
    dailyHoursWarning: number;
    dailyHoursHardBlock: number;
    weeklyHoursWarning: number;
    weeklyHoursOvertime: number;
    dropRequestExpiryHoursBeforeShift: number;
    maxPendingSwapRequestsPerStaff: number;
  };
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  database: {
    url: process.env.DATABASE_URL as string,
  },
  redis: {
    url: process.env.REDIS_URL as string,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  smtp: {
    host: process.env.SMTP_HOST as string,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER as string,
    password: process.env.SMTP_PASSWORD as string,
    from: process.env.MAIL_FROM as string,
  },
  businessRules: {
    defaultPublishCutoffHours: parseInt(process.env.DEFAULT_PUBLISH_CUTOFF_HOURS ?? '48', 10),
    minRestHours: parseInt(process.env.MIN_REST_HOURS ?? '10', 10),
    dailyHoursWarning: parseInt(process.env.DAILY_HOURS_WARNING ?? '8', 10),
    dailyHoursHardBlock: parseInt(process.env.DAILY_HOURS_HARD_BLOCK ?? '12', 10),
    weeklyHoursWarning: parseInt(process.env.WEEKLY_HOURS_WARNING ?? '35', 10),
    weeklyHoursOvertime: parseInt(process.env.WEEKLY_HOURS_OVERTIME ?? '40', 10),
    dropRequestExpiryHoursBeforeShift: parseInt(
      process.env.DROP_REQUEST_EXPIRY_HOURS_BEFORE_SHIFT ?? '24',
      10,
    ),
    maxPendingSwapRequestsPerStaff: parseInt(
      process.env.MAX_PENDING_SWAP_REQUESTS_PER_STAFF ?? '3',
      10,
    ),
  },
});
