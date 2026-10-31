import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  add,
  addDays,
  addMoney,
  classifyUnit,
  compassToDegrees,
  containerVolumeL,
  convert,
  csvCell,
  CurrencyMismatchError,
  daysBetween,
  degreesToCompass,
  deterministicId,
  DimensionError,
  fitWithin,
  idTime,
  instantForLocalDate,
  isId,
  localDateOf,
  money,
  moneyFromJSON,
  moneyToDecimalString,
  moneyToJSON,
  newId,
  parseLooseDate,
  parseMoney,
  qty,
  startOfLocalDay,
  toCsv,
  totalsByCurrency,
  totalsByDimension,
} from '../src';

describe('ids', () => {
  it('creates valid, time-ordered, unique ULIDs', () => {
    const ids = Array.from({ length: 2000 }, () => newId(1_700_000_000_000));
    expect(ids.every(isId)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
    expect(idTime(ids[0] ?? '')).toBe(1_700_000_000_000);
  });

  it('derives deterministic ids from a seed', () => {
    expect(deterministicId(5, 'a')).toBe(deterministicId(5, 'a'));
    expect(deterministicId(5, 'a')).not.toBe(deterministicId(5, 'b'));
    expect(isId(deterministicId(0, 'x'))).toBe(true);
    expect(idTime(deterministicId(123_456, 'x'))).toBe(123_456);
  });
});

describe('quantities (S1)', () => {
  it('converts only within a dimension', () => {
    expect(convert(qty('mass', 1.5, 'kg'), 'g').value).toBe(1500);
    expect(convert(qty('volume', 2, 'l'), 'ml').value).toBe(2000);
    expect(convert(qty('temperature', 100, 'c'), 'f').value).toBe(212);
    expect(() => convert(qty('count', 3, 'bunch'), 'g')).toThrow(DimensionError);
    expect(() => add(qty('mass', 1, 'g') as never, qty('volume', 1, 'ml') as never)).toThrow(DimensionError);
    expect(() => add(qty('count', 1, 'bunch'), qty('count', 1, 'piece'))).toThrow(DimensionError);
  });

  it('totals each dimension and count label separately', () => {
    const t = totalsByDimension([
      qty('mass', 500, 'g'),
      qty('mass', 1, 'kg'),
      qty('count', 3, 'bunch'),
      qty('count', 2, 'bunch'),
      qty('count', 4, 'piece'),
    ]);
    expect(t.get('mass')?.value).toBe(1500);
    expect(t.get('count:bunch')?.value).toBe(5);
    expect(t.get('count:piece')?.value).toBe(4);
    expect(t.size).toBe(3);
  });

  it('mass totals are independent of input units (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.float({ min: 0, max: 1e6, noNaN: true }), fc.constantFrom('g', 'kg', 'lb', 'oz')),
          { maxLength: 30 },
        ),
        (items) => {
          const total = totalsByDimension(items.map(([v, u]) => qty('mass', v, u))).get('mass')?.value ?? 0;
          const expected = items.reduce((s, [v, u]) => s + convert(qty('mass', v, u), 'g').value, 0);
          expect(total).toBeCloseTo(expected, 3);
        },
      ),
    );
  });

  it('classifies free-text units', () => {
    expect(classifyUnit('Kg')).toEqual({ dim: 'mass', unit: 'kg' });
    expect(classifyUnit('litres')).toEqual({ dim: 'volume', unit: 'l' });
    expect(classifyUnit('bunches')).toEqual({ dim: 'count', label: 'bunches' });
  });
});

describe('money', () => {
  it('keeps exact minor units and refuses mixed currencies', () => {
    const a = parseMoney('12.50', 'INR');
    const b = parseMoney('0.05', 'INR');
    expect(a && b && moneyToDecimalString(addMoney(a, b))).toBe('12.55');
    expect(parseMoney('1.234', 'USD')).toBeNull();
    expect(() => addMoney(money(1, 'USD'), money(1, 'EUR'))).toThrow(CurrencyMismatchError);
    expect(totalsByCurrency([money(100, 'USD'), money(250, 'USD'), money(5, 'EUR')]).get('USD')?.minor).toBe(
      350n,
    );
    expect(moneyFromJSON(moneyToJSON(money(-1999, 'EUR')))).toEqual(money(-1999, 'EUR'));
    expect(moneyToDecimalString(money(-5, 'EUR'))).toBe('-0.05');
    expect(moneyToDecimalString(money(1500, 'JPY', 0))).toBe('1500');
  });
});

describe('garden-local dates (S3, S18)', () => {
  it('computes the local calendar date in the garden time zone', () => {
    const t = Date.UTC(2025, 2, 1, 20, 0); // 20:00 UTC
    expect(localDateOf(t, 'Asia/Kolkata')).toBe('2025-03-02');
    expect(localDateOf(t, 'America/Los_Angeles')).toBe('2025-03-01');
  });

  it('handles daylight-saving transitions', () => {
    // Europe/London springs forward on 2025-03-30; that day is 23 hours long.
    const start = startOfLocalDay('2025-03-30', 'Europe/London');
    const next = startOfLocalDay('2025-03-31', 'Europe/London');
    expect(next - start).toBe(23 * 3600 * 1000);
    expect(addDays('2025-03-29', 2)).toBe('2025-03-31');
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    const at = instantForLocalDate('2025-03-30', 'Europe/London', Date.UTC(2025, 5, 1, 9, 15));
    expect(localDateOf(at, 'Europe/London')).toBe('2025-03-30');
  });

  it('parses older date strings without guessing', () => {
    expect(parseLooseDate('2025-03-01T10:00:00.000Z', 'UTC')?.localDate).toBe('2025-03-01');
    expect(parseLooseDate('2025-03-01', 'Asia/Kolkata')).toMatchObject({
      localDate: '2025-03-01',
      dateOnly: true,
    });
    expect(parseLooseDate('2025-03-01T10:00', 'Asia/Kolkata')?.epochMs).toBe(Date.UTC(2025, 2, 1, 4, 30));
    expect(parseLooseDate('yesterday', 'UTC')).toBeNull();
    expect(parseLooseDate('2025-02-30', 'UTC')).toBeNull();
    expect(parseLooseDate(undefined, 'UTC')).toBeNull();
  });
});

describe('csv export safety', () => {
  it('neutralises spreadsheet formulas and quotes properly', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell(-2)).toBe('-2');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell(null)).toBe('');
    const csv = toCsv(
      [{ a: 'x', b: 1 }],
      [
        { header: 'A', value: (r) => r.a },
        { header: 'B', value: (r) => r.b },
      ],
    );
    expect(csv).toBe('﻿A,B\r\nx,1\r\n');
  });

  it('never emits a cell that starts with a formula trigger (property)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const cell = csvCell(s).replace(/^"/, '');
        expect(/^[=+\-@\t\r]/.test(cell)).toBe(false);
      }),
    );
  });
});

describe('geometry', () => {
  it('fits images without upscaling', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(300, 200, 2048)).toEqual({ width: 300, height: 200 });
    expect(fitWithin(1000, 4000, 400)).toEqual({ width: 100, height: 400 });
  });

  it('estimates container volume', () => {
    expect(containerVolumeL('round', { diameterCm: 30, depthCm: 25 })).toBe(17.7);
    expect(containerVolumeL('window-box', { lengthCm: 60, widthCm: 20, depthCm: 15 })).toBe(18);
    expect(containerVolumeL('round', { diameterCm: 30 })).toBeNull();
  });

  it('maps compass directions', () => {
    expect(compassToDegrees('SW')).toBe(225);
    expect(degreesToCompass(350)).toBe('N');
    expect(degreesToCompass(-90)).toBe('W');
  });
});
