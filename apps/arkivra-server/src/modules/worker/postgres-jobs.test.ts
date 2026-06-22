import { describe, expect, it } from 'vitest';
import { getNextIdlePollIntervalMs, getScopedQueueName } from './postgres-jobs.js';

describe('getScopedQueueName', () => {
  it('keeps queue names unchanged without an app instance', () => {
    expect(getScopedQueueName('process-document')).toBe('process-document');
  });

  it('prefixes queue names with the app instance', () => {
    expect(getScopedQueueName('process-document', 'ui-chat')).toBe('ui-chat:process-document');
  });
});

describe('getNextIdlePollIntervalMs', () => {
  it('backs off to the idle maximum', () => {
    const activePollIntervalMs = 500;
    const maxIdlePollIntervalMs = 5000;

    const first = getNextIdlePollIntervalMs({
      currentIntervalMs: 500,
      activePollIntervalMs,
      maxIdlePollIntervalMs,
    });
    const second = getNextIdlePollIntervalMs({
      currentIntervalMs: first,
      activePollIntervalMs,
      maxIdlePollIntervalMs,
    });
    const third = getNextIdlePollIntervalMs({
      currentIntervalMs: second,
      activePollIntervalMs,
      maxIdlePollIntervalMs,
    });
    const capped = getNextIdlePollIntervalMs({
      currentIntervalMs: third,
      activePollIntervalMs,
      maxIdlePollIntervalMs,
    });

    expect([first, second, third, capped]).toEqual([1000, 2000, 5000, 5000]);
  });

  it('does not back off below the active poll interval', () => {
    expect(getNextIdlePollIntervalMs({
      currentIntervalMs: 100,
      activePollIntervalMs: 500,
      maxIdlePollIntervalMs: 5000,
    })).toBe(500);
  });
});
