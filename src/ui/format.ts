/** Number formatting for the CAD-style read-outs. */

/** Three significant figures, switching to exponent notation for very large/small values. */
export function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e5 || a < 1e-3) return v.toExponential(digits - 1).replace('e+', 'e');
  return Number(v.toPrecision(digits)).toString();
}

/** Fixed decimals with a minus sign that matches the typeface. */
export function fixed(v: number, d: number): string {
  if (!Number.isFinite(v)) return '–';
  return v.toFixed(d).replace('-', '−');
}

export function percent(v: number, d = 0): string {
  if (!Number.isFinite(v)) return '–';
  return `${(v * 100).toFixed(d)} %`;
}

/** Human file size. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
