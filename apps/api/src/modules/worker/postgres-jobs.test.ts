import { describe, expect, it } from 'vitest';
import { getScopedQueueName } from './postgres-jobs.js';

describe('getScopedQueueName', () => {
  it('keeps queue names unchanged without an app instance', () => {
    expect(getScopedQueueName('process-document')).toBe('process-document');
  });

  it('prefixes queue names with the app instance', () => {
    expect(getScopedQueueName('process-document', 'ui-chat')).toBe('ui-chat:process-document');
  });
});
