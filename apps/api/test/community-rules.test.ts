import { cellToParent, getResolution, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import {
  AREA_RES,
  CELL_RES,
  isCell,
  LISTING_STATES,
  nextState,
  parentCell,
  type ListingEvent,
} from '../src/lib/community-rules';

describe('H3 cells by bit layout (checked against h3-js)', () => {
  const places: Array<[number, number]> = [
    [18.52, 73.86], // Pune
    [-33.87, 151.21], // Sydney
    [51.5, -0.12], // London
    [64.13, -21.9], // Reykjavík
    [-54.8, -68.3], // Ushuaia
    [0.01, 0.01],
    [89.9, 10], // near a pole
  ];

  it('accepts real resolution-7 cells and computes the same parents as h3-js', () => {
    for (const [lat, lng] of places) {
      const cell = latLngToCell(lat, lng, CELL_RES);
      expect(isCell(cell, CELL_RES), cell).toBe(true);
      expect(parentCell(cell, AREA_RES)).toBe(cellToParent(cell, AREA_RES));
      expect(getResolution(parentCell(cell, AREA_RES))).toBe(AREA_RES);
      expect(isCell(parentCell(cell, AREA_RES), AREA_RES)).toBe(true);
    }
  });

  it('refuses finer cells, wrong resolutions and junk (no precise points get in)', () => {
    const fine = latLngToCell(18.52, 73.86, 12);
    expect(isCell(fine, CELL_RES)).toBe(false);
    expect(isCell(latLngToCell(18.52, 73.86, 6), CELL_RES)).toBe(false);
    for (const junk of ['', '18.52,73.86', 'zzzzzzzzzzzzzzz', 'ffffffffffffffff', '0'.repeat(15)])
      expect(isCell(junk, CELL_RES), junk).toBe(false);
  });
});

describe('exchange state machine (§20)', () => {
  const path: Array<[ListingEvent, string]> = [
    ['publish', 'listed'],
    ['reserve', 'reserved'],
    ['both_confirmed', 'handoff_confirmed'],
    ['complete', 'completed'],
  ];
  it('follows draft → listed → reserved → handoff_confirmed → completed', () => {
    let s: (typeof LISTING_STATES)[number] = 'draft';
    for (const [event, to] of path) {
      const next = nextState(s, event);
      expect(next, `${s} --${event}`).toBe(to);
      s = next!;
    }
  });

  it('returns a reservation to listed when released, cancelled or expired', () => {
    for (const e of ['release', 'cancel', 'reservation_expire'] as const)
      expect(nextState('reserved', e)).toBe('listed');
    expect(nextState('listed', 'withdraw')).toBe('withdrawn');
    expect(nextState('listed', 'expire')).toBe('expired');
  });

  it('refuses every other transition', () => {
    const allowed = new Set([
      'draft:publish',
      'draft:withdraw',
      'listed:withdraw',
      'listed:expire',
      'listed:reserve',
      'reserved:release',
      'reserved:cancel',
      'reserved:reservation_expire',
      'reserved:both_confirmed',
      'handoff_confirmed:complete',
    ]);
    const events: ListingEvent[] = [
      'publish',
      'withdraw',
      'expire',
      'reserve',
      'release',
      'cancel',
      'reservation_expire',
      'both_confirmed',
      'complete',
    ];
    for (const s of LISTING_STATES)
      for (const e of events) expect(nextState(s, e) !== null, `${s}:${e}`).toBe(allowed.has(`${s}:${e}`));
  });
});
