import { afterEach, describe, expect, test } from 'vitest';
import { getNextCronRun } from './postgres-cron.js';

describe('getNextCronRun', () => {
  const originalTimezone = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTimezone;
  });

  test('evaluates cron expressions in UTC rather than the host timezone', () => {
    process.env.TZ = 'Europe/Berlin';
    const next = getNextCronRun('30 1 * * *', new Date('2026-03-29T00:45:00.000Z'));

    expect(next.toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  test('keeps daily schedules stable across DST transition dates', () => {
    process.env.TZ = 'Europe/Berlin';
    const springForward = getNextCronRun('0 2 * * *', new Date('2026-03-29T01:59:00.000Z'));
    const fallBack = getNextCronRun('0 2 * * *', new Date('2026-10-25T01:59:00.000Z'));

    expect(springForward.toISOString()).toBe('2026-03-29T02:00:00.000Z');
    expect(fallBack.toISOString()).toBe('2026-10-25T02:00:00.000Z');
  });
});
