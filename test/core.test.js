import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDuration } from '../src/index.js';

const eps = 1e-9;

function approxEqual(a, b, msg) {
  assert.ok(Math.abs(a - b) < eps, `${msg ?? ''} expected ≈${b}, got ${a}`);
}

test('basic date + time duration carries into seconds', () => {
  const r = normalizeDuration('P1Y2M3DT4H5M6S');
  // 1y=365d, 2mo=60d, 3d, 4h, 5m, 6s -> total seconds
  const expected =
    365 * 24 * 3600 +
    60 * 24 * 3600 +
    3 * 24 * 3600 +
    4 * 3600 +
    5 * 60 +
    6;
  approxEqual(r.seconds, expected);
  assert.equal(r.input, 'P1Y2M3DT4H5M6S');
});

test('PT-only duration', () => {
  const r = normalizeDuration('PT1H30M');
  approxEqual(r.seconds, 1 * 3600 + 30 * 60);
});

test('single unit: seconds', () => {
  const r = normalizeDuration('PT42S');
  approxEqual(r.seconds, 42);
});

test('single unit: days', () => {
  const r = normalizeDuration('P7D');
  approxEqual(r.seconds, 7 * 24 * 3600);
});

test('week designator is accepted', () => {
  const r = normalizeDuration('P1W');
  approxEqual(r.seconds, 7 * 24 * 3600);
});

test('fractional seconds carry through', () => {
  const r = normalizeDuration('PT0.5S');
  approxEqual(r.seconds, 0.5);
});

test('fractional minutes carry into seconds', () => {
  // 1.5 minutes = 90 seconds
  const r = normalizeDuration('PT1.5M');
  approxEqual(r.seconds, 90);
});

test('fractional hours carry through', () => {
  // 1.25 hours = 4500 seconds
  const r = normalizeDuration('PT1.25H');
  approxEqual(r.seconds, 4500);
});

test('negative duration flips sign', () => {
  const r = normalizeDuration('-PT60S');
  approxEqual(r.seconds, -60);
});

test('explicit positive sign is accepted', () => {
  const r = normalizeDuration('+PT60S');
  approxEqual(r.seconds, 60);
});

test('date M and time M are distinct and both carry', () => {
  // P1M = 1 month = 30 days ; PT1M = 1 minute
  const r = normalizeDuration('P1MT1M');
  approxEqual(r.seconds, 30 * 24 * 3600 + 60);
});

test('zero values are preserved correctly', () => {
  const r = normalizeDuration('P0DT0H0M0S');
  approxEqual(r.seconds, 0);
});

test('rejects non-string input', () => {
  assert.throws(() => normalizeDuration(42), TypeError);
  assert.throws(() => normalizeDuration(null), TypeError);
  assert.throws(() => normalizeDuration(undefined), TypeError);
});

test('rejects empty string', () => {
  assert.throws(() => normalizeDuration(''), RangeError);
});

test('rejects string missing P', () => {
  assert.throws(() => normalizeDuration('1Y'), RangeError);
});

test('rejects P with no units', () => {
  assert.throws(() => normalizeDuration('P'), RangeError);
});

test('rejects T with no following units', () => {
  assert.throws(() => normalizeDuration('PT'), RangeError);
});

test('rejects out-of-order date units', () => {
  assert.throws(() => normalizeDuration('P1D2Y'), RangeError);
});

test('rejects time units before T', () => {
  assert.throws(() => normalizeDuration('P1H'), RangeError);
});

test('rejects duplicate unit', () => {
  assert.throws(() => normalizeDuration('P1Y2Y'), RangeError);
});

test('rejects duplicate M across date and time sections', () => {
  // P1M (month) then another P-side M is duplicate; but P1MT1M is valid.
  // Here we test a true duplicate on the date side.
  assert.throws(() => normalizeDuration('P1M2M'), RangeError);
});

test('rejects unknown unit letter', () => {
  assert.throws(() => normalizeDuration('P1X'), RangeError);
});

test('rejects number with no following unit', () => {
  assert.throws(() => normalizeDuration('P1'), RangeError);
});

test('rejects unit with no preceding number', () => {
  assert.throws(() => normalizeDuration('PY'), RangeError);
});
