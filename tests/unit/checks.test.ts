import { describe, expect, it } from 'vitest';
import { buildChecks } from '@/features/planner/checks';
import { sample } from './helpers';

describe('buildChecks', () => {
  it('labels a sample as hand-written', () => {
    const checks = buildChecks(sample(), null, []);
    expect(checks[0]).toMatchObject({ label: 'Hand-written sample', status: 'ok' });
  });

  it('reports a clean first attempt', () => {
    const checks = buildChecks(sample(), { model: 'org/model-x', attempts: 1, durationMs: 4200, repairedFrom: null }, []);
    expect(checks.map((c) => c.label)).toEqual(['Parsed as JSON', 'Matches the schema', 'Model']);
    expect(checks.at(-1)?.detail).toBe('model-x · 4.2s');
  });

  it('flags repairs and salvage warnings', () => {
    const checks = buildChecks(sample(), { model: 'm', attempts: 2, durationMs: 1000, repairedFrom: 'MALFORMED_JSON' }, ['Removed 1 stop the model returned without a name.']);
    expect(checks[0]).toMatchObject({ label: 'Corrected after a retry', status: 'warn', detail: 'The first draft had a formatting issue.' });
    expect(checks.filter((c) => c.status === 'warn')).toHaveLength(2);
  });
});
