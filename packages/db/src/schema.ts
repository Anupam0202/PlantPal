import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Health and kill switch per environmental data provider (master prompt §15.1). Times are epoch ms. */
export const providerStatus = sqliteTable('provider_status', {
  provider: text('provider').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastSuccessAt: integer('last_success_at'),
  lastErrorAt: integer('last_error_at'),
  lastErrorCode: text('last_error_code'),
  lastLatencyMs: integer('last_latency_ms'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});
export type ProviderStatusRow = typeof providerStatus.$inferSelect;
