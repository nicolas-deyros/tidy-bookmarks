import { describe, it, expect } from 'vitest';
import { buildHealthReport } from '../src/health.js';

const tree = [{ id: '0', children: [
  { id: 'bar', title: 'Bookmarks bar', children: [
    { id: 'd1', title: 'Dup', url: 'https://x.com/p' },
    { id: 'd2', title: 'Dup', url: 'https://x.com/p' },
    { id: 'loose', title: 'Loose', url: 'https://y.com', parentId: 'bar' },
    { id: 'empty', title: 'Empty', children: [] }
  ] }
] }];

describe('buildHealthReport', () => {
  const report = buildHealthReport({ tree, now: Date.UTC(2026, 0, 1) });
  it('returns cleanup categories with counts and ai categories with null count', () => {
    const byId = Object.fromEntries(report.map(c => [c.id, c]));
    expect(byId.duplicates.count).toBe(1);     // 1 removable extra
    expect(byId.empty.count).toBe(1);
    expect(byId.loose.count).toBe(1);
    expect(byId.fileLoose.kind).toBe('ai');
    expect(byId.fileLoose.count).toBe(null);
  });
  it('orders cleanup before ai and high priority first', () => {
    const cleanup = report.filter(c => c.group === 'cleanup');
    const ai = report.filter(c => c.group === 'ai');
    expect(report.indexOf(cleanup.at(-1))).toBeLessThan(report.indexOf(ai[0]));
  });
});
