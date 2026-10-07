import { cividis } from './colormap';
import { INK, type DrawMode, type FieldRenderer, type Transform } from './types';

/**
 * Canvas 2D fallback when WebGL2 is unavailable: the element field is painted into a small
 * bitmap and scaled up with bilinear smoothing; the deformed view draws one polygon per
 * element. No crisp iso-line mode here.
 */
export class CpuRenderer implements FieldRenderer {
  readonly kind = 'canvas2d' as const;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bitmap: HTMLCanvasElement;
  private readonly bctx: CanvasRenderingContext2D;
  private nelx = 0;
  private nely = 0;
  private rho: Float32Array = new Float32Array(0);
  private field: Float32Array | null = null;
  private fieldMax = 1;
  private u: Float32Array | null = null;
  private dispScale = 0;
  private dpr = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.bitmap = document.createElement('canvas');
    const bctx = this.bitmap.getContext('2d');
    if (!bctx) throw new Error('Canvas 2D is not available');
    this.bctx = bctx;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  setDensity(nelx: number, nely: number, rho: Float32Array): void {
    this.nelx = nelx;
    this.nely = nely;
    this.rho = rho;
  }

  setField(field: Float32Array | null, max: number): void {
    this.field = field;
    this.fieldMax = max > 0 ? max : 1;
  }

  setDisplacement(u: Float32Array | null, scale: number): void {
    this.u = u;
    this.dispScale = scale;
  }

  draw(t: Transform, mode: DrawMode): void {
    const { ctx, nelx, nely, rho } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!nelx || rho.length !== nelx * nely) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const h = 1 / nely;
    if (mode === 'deformed' && this.u) {
      const u = this.u;
      const k = this.dispScale;
      const nny = nely + 1;
      const px = (i: number, j: number): [number, number] => {
        const n = i * nny + j;
        const x = i + u[2 * n] * k;
        const y = nely - j + u[2 * n + 1] * k;
        return [t.ox + x * h * t.s, t.oy - y * h * t.s];
      };
      ctx.fillStyle = `rgb(${INK.join(' ')})`;
      for (let ex = 0; ex < nelx; ex++) {
        for (let ey = 0; ey < nely; ey++) {
          const a = rho[ex * nely + ey];
          if (a < 0.03) continue;
          ctx.globalAlpha = Math.min(1, a);
          const p = [px(ex, ey + 1), px(ex + 1, ey + 1), px(ex + 1, ey), px(ex, ey)];
          ctx.beginPath();
          ctx.moveTo(p[0][0], p[0][1]);
          for (let q = 1; q < 4; q++) ctx.lineTo(p[q][0], p[q][1]);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      return;
    }
    if (this.bitmap.width !== nelx || this.bitmap.height !== nely) {
      this.bitmap.width = nelx;
      this.bitmap.height = nely;
    }
    const img = this.bctx.createImageData(nelx, nely);
    const d = img.data;
    const useField = mode === 'field' && this.field && this.field.length === rho.length;
    for (let ex = 0; ex < nelx; ex++) {
      for (let ey = 0; ey < nely; ey++) {
        const e = ex * nely + ey;
        const o = (ey * nelx + ex) * 4;
        const a = Math.min(1, Math.max(0, rho[e]));
        let c = INK;
        let alpha = a;
        if (useField && this.field) {
          c = cividis(this.field[e] / this.fieldMax);
          alpha = Math.min(1, Math.max(0, (a - 0.04) / 0.46));
        }
        d[o] = c[0];
        d[o + 1] = c[1];
        d[o + 2] = c[2];
        d[o + 3] = Math.round(alpha * 255);
      }
    }
    this.bctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.bitmap, t.ox, t.oy - t.s, nelx * h * t.s, t.s);
  }

  dispose(): void {
    this.bitmap.width = 0;
  }
}
