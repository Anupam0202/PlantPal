import { Fragment } from 'react';

/** A run of text in one line, bold or not. */
export interface Span {
  text: string;
  bold: boolean;
}

/** A paragraph, or a list; a numbered list keeps the number its first item had. */
export type Block =
  | { kind: 'p'; spans: Span[] }
  | { kind: 'list'; ordered: false; items: Span[][] }
  | { kind: 'list'; ordered: true; start: number; items: Span[][] };

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+/;
const HEADING = /^\s{0,3}#{1,6}\s+/;

/**
 * Splits a line on `**` markers into plain and bold runs. A scan, not a regular expression, so a
 * long answer cannot make it slow; an unclosed marker (mid-stream) bolds the rest of the line.
 */
export function spansOf(line: string): Span[] {
  const out: Span[] = [];
  let bold = false;
  let from = 0;
  for (;;) {
    const at = line.indexOf('**', from);
    const text = line.slice(from, at < 0 ? undefined : at);
    if (text) out.push({ text, bold });
    if (at < 0) return out;
    bold = !bold;
    from = at + 2;
  }
}

/**
 * Reads the light Markdown that models write in chat answers (bullet and numbered lists, `**bold**`,
 * headings) into blocks. Everything else stays text: nothing is ever turned into HTML.
 */
export function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const number = NUMBERED.exec(line);
    const ordered = number !== null;
    if (ordered || BULLET.test(line)) {
      const item = spansOf(line.replace(ordered ? NUMBERED : BULLET, ''));
      const last = blocks.at(-1);
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item);
      // A list that picks up after a paragraph ("2. …") goes on from its own number, not from 1.
      else if (number) blocks.push({ kind: 'list', ordered: true, start: Number(number[1]), items: [item] });
      else blocks.push({ kind: 'list', ordered: false, items: [item] });
    } else if (HEADING.test(line)) {
      blocks.push({
        kind: 'p',
        spans: [{ text: line.replace(HEADING, '').replaceAll('**', ''), bold: true }],
      });
    } else {
      blocks.push({ kind: 'p', spans: spansOf(line) });
    }
  }
  return blocks;
}

function Spans({ spans }: { spans: Span[] }) {
  return spans.map((s, i) =>
    s.bold ? (
      <strong key={i} className="font-semibold">
        {s.text}
      </strong>
    ) : (
      <Fragment key={i}>{s.text}</Fragment>
    ),
  );
}

/** A Copilot answer with its lists and bold shown as such, instead of raw asterisks. */
export function AnswerText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 text-body text-ink [overflow-wrap:anywhere]">
      {blocksOf(text).map((b, i) => {
        if (b.kind === 'p')
          return (
            <p key={i}>
              <Spans spans={b.spans} />
            </p>
          );
        const items = b.items.map((item, k) => (
          <li key={k}>
            <Spans spans={item} />
          </li>
        ));
        return b.ordered ? (
          <ol key={i} start={b.start} className="flex list-decimal flex-col gap-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
            {items}
          </ul>
        );
      })}
    </div>
  );
}
