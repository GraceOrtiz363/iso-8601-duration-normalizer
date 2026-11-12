# iso-8601-duration-normalizer

Normalizes mixed-unit ISO 8601 duration strings (e.g. `"P1Y2M3DT4H5M6S"`) into a canonical seconds-only representation, carrying every larger unit down into seconds.

```js
import { normalizeDuration } from 'iso-8601-duration-normalizer';

const { seconds, input } = normalizeDuration('P1Y2M3DT4H5M6S');
// seconds === 39447906  (1y + 2mo + 3d + 4h + 5m + 6s, all carried into seconds)
console.log(`${input} = ${seconds}s`);
```

`normalizeDuration(input: string): { seconds: number, input: string }` is the only export. It throws `TypeError` for non-string input and `RangeError` for malformed, empty, out-of-order, or duplicate-unit strings.

## Why

ISO 8601 durations mix calendar units (years, months, days) with time units (hours, minutes, seconds). Comparing two durations, sorting them, or feeding them into a timer requires a single scalar. This library does exactly that carry propagation, preserving fractional values through every step so no precision is lost.

The trade-off: years and months are calendar-ambiguous in reality. A "month" is 28-31 days depending on which month and whether it contains a leap day. This library uses the conventional fixed conversions — 1 year = 365 days, 1 month = 30 days — identical to those used by Java's `Duration`/`Period` parsing conventions and UTS 35. If you need exact calendar-shift semantics ("add exactly one month to March 31"), use a real date library instead. This library is for comparing, sorting, and totaling durations, not for shifting calendar dates.

## Awkward edge

The `M` designator is overloaded: before the `T` separator it means months, after `T` it means minutes. The parser tracks which side of `T` each `M` appeared on, so `"P1MT1M"` (1 month + 1 minute) is accepted and carries correctly, while `"P1M2M"` (two month-values on the date side) is rejected as a duplicate.

The `W` (week) designator is also accepted despite being less commonly used, because ISO 8601 explicitly permits it.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

