import { describe, expect, it } from 'vitest';
import { blocksOf, spansOf } from '../src/features/copilot/AnswerText';

describe('Copilot answer text', () => {
  it('shows bold and bullet lists instead of raw asterisks', () => {
    const text = [
      'I have suggested logging this watering for your **Tulsi**:',
      '* **Care type:** Watering',
      '* **Amount:** 300 ml',
      '',
      'Please review and confirm it.',
    ].join('\n');
    expect(blocksOf(text)).toEqual([
      {
        kind: 'p',
        spans: [
          { text: 'I have suggested logging this watering for your ', bold: false },
          { text: 'Tulsi', bold: true },
          { text: ':', bold: false },
        ],
      },
      {
        kind: 'list',
        ordered: false,
        items: [
          [
            { text: 'Care type:', bold: true },
            { text: ' Watering', bold: false },
          ],
          [
            { text: 'Amount:', bold: true },
            { text: ' 300 ml', bold: false },
          ],
        ],
      },
      { kind: 'p', spans: [{ text: 'Please review and confirm it.', bold: false }] },
    ]);
  });

  it('keeps numbered lists, headings and plain text; nothing becomes HTML', () => {
    const blocks = blocksOf('## This week\n1. Water the basil\n2. Check for aphids\n<b>not html</b> 2 * 3');
    expect(blocks[0]).toEqual({ kind: 'p', spans: [{ text: 'This week', bold: true }] });
    expect(blocks[1]).toMatchObject({
      kind: 'list',
      ordered: true,
      items: [[{ text: 'Water the basil' }], [{ text: 'Check for aphids' }]],
    });
    expect(blocks[2]).toEqual({ kind: 'p', spans: [{ text: '<b>not html</b> 2 * 3', bold: false }] });
  });

  it('copes with text that is still streaming in', () => {
    expect(spansOf('Water **soon')).toEqual([
      { text: 'Water ', bold: false },
      { text: 'soon', bold: true },
    ]);
    expect(spansOf('')).toEqual([]);
  });

  it('stays fast on very long answers', () => {
    const t0 = Date.now();
    blocksOf(`${'** '.repeat(50_000)}\n${'* '.repeat(50_000)}`);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
