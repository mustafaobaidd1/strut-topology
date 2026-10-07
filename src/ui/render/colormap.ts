/**
 * cividis (Nuñez, Anderton & Renslow 2018, PLOS ONE 13(7): e0199239), a colour map that is
 * perceptually uniform and readable with red-green colour-vision deficiency. Control points
 * are 17 evenly spaced samples of Matplotlib's 256-entry table, interpolated linearly.
 */
const CIVIDIS: readonly (readonly [number, number, number])[] = [
  [0, 0.1351, 0.3048],
  [0, 0.1788, 0.4148],
  [0.1034, 0.2204, 0.4358],
  [0.1951, 0.2644, 0.4259],
  [0.2637, 0.3078, 0.4228],
  [0.3242, 0.3513, 0.4263],
  [0.3808, 0.3952, 0.4357],
  [0.4352, 0.4398, 0.4511],
  [0.4887, 0.4853, 0.471],
  [0.5441, 0.5289, 0.4719],
  [0.6052, 0.5768, 0.4644],
  [0.668, 0.6262, 0.4493],
  [0.7324, 0.6774, 0.4257],
  [0.7985, 0.7306, 0.3926],
  [0.8664, 0.786, 0.3466],
  [0.9367, 0.8438, 0.2809],
  [0.9957, 0.9093, 0.2178],
];

/** cividis(t) as 0–255 RGB for t in [0, 1]. */
export function cividis(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (CIVIDIS.length - 1);
  const i = Math.min(CIVIDIS.length - 2, Math.floor(x));
  const f = x - i;
  const a = CIVIDIS[i];
  const b = CIVIDIS[i + 1];
  return [
    Math.round(255 * (a[0] + (b[0] - a[0]) * f)),
    Math.round(255 * (a[1] + (b[1] - a[1]) * f)),
    Math.round(255 * (a[2] + (b[2] - a[2]) * f)),
  ];
}

/** 256 x 1 RGBA lookup table. */
export function cividisLut(): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = cividis(i / 255);
    lut[4 * i] = r;
    lut[4 * i + 1] = g;
    lut[4 * i + 2] = b;
    lut[4 * i + 3] = 255;
  }
  return lut;
}

/** CSS linear-gradient for legends. */
export function cividisGradient(direction = 'to right'): string {
  const stops = CIVIDIS.map((c, i) => {
    const [r, g, b] = c.map((v) => Math.round(v * 255));
    return `rgb(${r} ${g} ${b}) ${((100 * i) / (CIVIDIS.length - 1)).toFixed(1)}%`;
  });
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}
