// UNVERIFIED working assumption: DLD's range is the index average plus or minus
// 10 percent, so the average is the midpoint of the range, rounded to the nearest
// dirham (halves round up). It reproduces every DLD range and calculator result
// collected so far (see the cross-check test), but DLD has not published it.
// No imports, so Node scripts can load this file directly.
export function indexAverageAed(range: { range_min_aed: number; range_max_aed: number }): number {
  return Math.round((range.range_min_aed + range.range_max_aed) / 2);
}
