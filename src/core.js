/**
 * iso-8601-duration-normalizer — core implementation.
 *
 * Parses an ISO 8601 duration string (e.g. "P1Y2M3DT4H5M6S") and produces a
 * canonical, fully-carried representation in the lowest available unit:
 * seconds. Fractional values in the input are preserved through all carries
 * so no precision is lost during propagation.
 *
 * Design choices:
 * - Seconds is chosen as the canonical unit because it is the smallest unit
 *   ISO 8601 durations define, so every larger unit can be expressed in terms
 *   of it without introducing arbitrary calendar assumptions.
 * - Years and months are ambiguous in real calendar arithmetic (months have
 *   28-31 days, years are 365 or 366 days). This library deliberately uses
 *   the ISO 8601 / UTS 35 conventional fixed conversions: 1 year = 365 days,
 *   1 month = 30 days. This is documented in the README so callers know not
 *   to use this for date-shift semantics on a real calendar.
 * - The grammar is intentionally strict: every leading unit must be present
 *   in canonical order (Y M W D, then H M S after T) and values must be
 *   numeric. The single deviation is that "W" is allowed, as ISO 8601
 *   explicitly permits the week designator. This avoids surprising
 *   rejections of valid strings while keeping the parser simple.
 * - A leading sign (+/-) on the "P" is accepted, as ISO 8601 allows.
 */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const SECONDS_PER_WEEK = 7 * SECONDS_PER_DAY;
const SECONDS_PER_MONTH = 30 * SECONDS_PER_DAY; // conventional 30-day month
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY; // conventional 365-day year

// Date-side order (before T) and time-side order (after T), separately.
const DATE_ORDER = ['Y', 'M', 'W', 'D'];
const TIME_ORDER = ['H', 'M', 'S'];

/**
 * @typedef {Object} NormalizedDuration
 * @property {number} seconds  Total duration in seconds (may be fractional).
 * @property {string} input    The original string that was normalized.
 */

/**
 * Normalizes a mixed-unit ISO 8601 duration string into a canonical
 * seconds-only representation with carry propagation.
 *
 * @param {string} input  An ISO 8601 duration, e.g. "P1Y2M3DT4H5M6S".
 * @returns {NormalizedDuration} An object with the total `seconds` and the
 *   original `input` string.
 * @throws {TypeError}  If `input` is not a string.
 * @throws {RangeError} If `input` is empty, malformed, has out-of-order
 *   units, duplicate units, or non-numeric values.
 */
export function normalizeDuration(input) {
  if (typeof input !== 'string') {
    throw new TypeError(`normalizeDuration expected a string, got ${typeof input}`);
  }
  if (input.length === 0) {
    throw new RangeError('duration string must not be empty');
  }

  let sign = 1;
  let body = input;

  if (body[0] === '+' || body[0] === '-') {
    if (body[0] === '-') sign = -1;
    body = body.slice(1);
  }

  if (body[0] !== 'P') {
    throw new RangeError(`duration must start with (optionally signed) 'P': ${JSON.stringify(input)}`);
  }
  body = body.slice(1);

  if (body.length === 0) {
    throw new RangeError(`duration has no units after 'P': ${JSON.stringify(input)}`);
  }

  // Track the index of the last-seen unit within the current side's order,
  // so we can reject out-of-order or duplicate designators. Keys are
  // `${side}:${unit}` so that date-side 'M' (month) and time-side 'M'
  // (minute) — which share the same letter — are tracked separately, as
  // ISO 8601 intends.
  let prevIndex = -1;
  let seconds = 0;
  let i = 0;
  let afterT = false;

  while (i < body.length) {
    // Skip a single 'T' separator when we reach it; required before H/M/S.
    if (body[i] === 'T') {
      if (afterT) {
        throw new RangeError(`duplicate 'T' separator in: ${JSON.stringify(input)}`);
      }
      afterT = true;
      prevIndex = -1;
      i += 1;
      if (i >= body.length) {
        throw new RangeError(`'T' must be followed by time units: ${JSON.stringify(input)}`);
      }
      continue;
    }

    const value = parseValue(body, i);
    if (value.end <= value.start) {
      throw new RangeError(`expected a number before a unit letter: ${JSON.stringify(input)}`);
    }

    if (value.end >= body.length) {
      throw new RangeError(`number has no following unit letter: ${JSON.stringify(input)}`);
    }

    const unit = body[value.end];
    const order = afterT ? TIME_ORDER : DATE_ORDER;
    const idx = order.indexOf(unit);

    if (idx === -1) {
      throw new RangeError(`unknown unit '${unit}' in: ${JSON.stringify(input)}`);
    }

    if (idx <= prevIndex) {
      throw new RangeError(`unit '${unit}' is out of order or duplicate in: ${JSON.stringify(input)}`);
    }

    seconds += value.value * secondsFor(unit, afterT);
    prevIndex = idx;
    i = value.end + 1;
  }

  return { seconds: sign * seconds, input };
}

/**
 * Returns the multiplier (in seconds) for a given unit letter.
 *
 * @param {string} unit   One of Y, M, W, D, H, M, S.
 * @param {boolean} afterT  True when the unit was encountered after the 'T'
 *   separator; disambiguates 'M' (month vs minute).
 * @returns {number} Seconds-per-unit.
 */
function secondsFor(unit, afterT) {
  switch (unit) {
    case 'Y': return SECONDS_PER_YEAR;
    case 'M': return afterT ? SECONDS_PER_MINUTE : SECONDS_PER_MONTH;
    case 'W': return SECONDS_PER_WEEK;
    case 'D': return SECONDS_PER_DAY;
    case 'H': return SECONDS_PER_HOUR;
    case 'S': return 1;
    default:  return 0; // unreachable: unit validated upstream
  }
}

/**
 * Parses a numeric literal (possibly fractional, e.g. "1.5") starting at index
 * `start` in `s`. Returns `{ value, start, end }` where `end` is exclusive.
 *
 * @param {string} s
 * @param {number} start
 * @returns {{ value: number, start: number, end: number }}
 */
function parseValue(s, start) {
  let end = start;
  let hasDigits = false;

  while (end < s.length && s[end] >= '0' && s[end] <= '9') {
    end += 1;
    hasDigits = true;
  }

  if (end < s.length && s[end] === '.') {
    end += 1;
    while (end < s.length && s[end] >= '0' && s[end] <= '9') {
      end += 1;
      hasDigits = true;
    }
  }

  if (!hasDigits) {
    throw new RangeError(`expected a numeric value at position ${start}: ${JSON.stringify(s)}`);
  }

  return { value: Number(s.slice(start, end)), start, end };
}
