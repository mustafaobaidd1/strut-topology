import { cividisLut } from './colormap';
import { INK, type DrawMode, type FieldRenderer, type Transform } from './types';

const VERT = `#version 300 es
in vec2 aPos;
in vec2 aDisp;
uniform vec2 uGrid;
uniform vec2 uScale;
uniform vec2 uOffset;
uniform float uDispScale;
out vec2 vUv;
void main() {
  vec2 p = aPos + aDisp * uDispScale;
  vUv = aPos / uGrid;
  gl_Position = vec4(p * uScale + uOffset, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uDensity;
uniform sampler2D uField;
uniform sampler2D uLut;
uniform vec2 uTexSize;
uniform int uMode;
uniform float uCrisp;
uniform vec3 uInk;
out vec4 outColor;

// Cubic B-spline weights; sampled with four bilinear fetches (GPU Gems 2, ch. 20).
vec4 bspline(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  float w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * (1.0 / 6.0);
}

float smoothSample(sampler2D tex, vec2 uv) {
  vec2 inv = 1.0 / uTexSize;
  vec2 tc = uv * uTexSize - 0.5;
  vec2 f = fract(tc);
  tc -= f;
  vec4 xc = bspline(f.x);
  vec4 yc = bspline(f.y);
  vec4 c = tc.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / s) * inv.xxyy;
  float s0 = texture(tex, o.xz).r;
  float s1 = texture(tex, o.yz).r;
  float s2 = texture(tex, o.xw).r;
  float s3 = texture(tex, o.yw).r;
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

void main() {
  float rho = smoothSample(uDensity, vUv);
  float w = max(fwidth(rho) * 0.85, 1e-3);
  float crisp = smoothstep(0.5 - w, 0.5 + w, rho);
  float a = mix(rho, crisp, uCrisp);
  vec3 col = uInk;
  if (uMode == 1) {
    float f = smoothSample(uField, vUv);
    col = texture(uLut, vec2(f * (255.0 / 256.0) + 0.5 / 256.0, 0.5)).rgb;
    a = mix(smoothstep(0.04, 0.5, rho), crisp, uCrisp);
  }
  outColor = vec4(col * a, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) ?? 'shader compile failed');
  }
  return sh;
}

/** WebGL2 field renderer: one textured, optionally displaced grid mesh. */
export class GLRenderer implements FieldRenderer {
  readonly kind = 'webgl2' as const;
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly posBuf: WebGLBuffer;
  private readonly dispBuf: WebGLBuffer;
  private readonly idxBuf: WebGLBuffer;
  private readonly texDensity: WebGLTexture;
  private readonly texField: WebGLTexture;
  private readonly texLut: WebGLTexture;
  private readonly uniforms: Record<string, WebGLUniformLocation | null> = {};
  private nelx = 0;
  private nely = 0;
  private indexCount = 0;
  private bytes = new Uint8Array(0);
  private hasField = false;
  private dispScale = 0;
  private cssW = 1;
  private cssH = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    const prog = gl.createProgram();
    if (!prog) throw new Error('createProgram failed');
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.bindAttribLocation(prog, 1, 'aDisp');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) ?? 'link failed');
    }
    this.prog = prog;
    for (const n of [
      'uGrid',
      'uScale',
      'uOffset',
      'uDispScale',
      'uTexSize',
      'uDensity',
      'uField',
      'uLut',
      'uMode',
      'uCrisp',
      'uInk',
    ]) {
      this.uniforms[n] = gl.getUniformLocation(prog, n);
    }
    const vao = gl.createVertexArray();
    const posBuf = gl.createBuffer();
    const dispBuf = gl.createBuffer();
    const idxBuf = gl.createBuffer();
    const texDensity = gl.createTexture();
    const texField = gl.createTexture();
    const texLut = gl.createTexture();
    if (!vao || !posBuf || !dispBuf || !idxBuf || !texDensity || !texField || !texLut) {
      throw new Error('WebGL resource allocation failed');
    }
    this.vao = vao;
    this.posBuf = posBuf;
    this.dispBuf = dispBuf;
    this.idxBuf = idxBuf;
    this.texDensity = texDensity;
    this.texField = texField;
    this.texLut = texLut;
    for (const t of [texDensity, texField]) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, texLut);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, cividisLut());
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private buildMesh(nelx: number, nely: number): void {
    const gl = this.gl;
    const nnx = nelx + 1;
    const nny = nely + 1;
    const pos = new Float32Array(nnx * nny * 2);
    for (let i = 0; i < nnx; i++) {
      for (let j = 0; j < nny; j++) {
        const n = i * nny + j;
        pos[2 * n] = i;
        pos[2 * n + 1] = nely - j;
      }
    }
    const idx = new Uint32Array(nelx * nely * 6);
    let k = 0;
    for (let i = 0; i < nelx; i++) {
      for (let j = 0; j < nely; j++) {
        const tl = i * nny + j;
        const bl = tl + 1;
        const tr = tl + nny;
        const br = tr + 1;
        idx[k++] = bl;
        idx[k++] = br;
        idx[k++] = tr;
        idx[k++] = bl;
        idx[k++] = tr;
        idx[k++] = tl;
      }
    }
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dispBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nnx * nny * 2), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.indexCount = idx.length;
    this.bytes = new Uint8Array(nelx * nely);
    this.nelx = nelx;
    this.nely = nely;
  }

  /** Element field (column-wise, rows from the top) → bottom-up texture rows. */
  private upload(tex: WebGLTexture, v: Float32Array, scale: number): void {
    const { gl, nelx, nely, bytes } = this;
    for (let ex = 0; ex < nelx; ex++) {
      for (let ey = 0; ey < nely; ey++) {
        const t = v[ex * nely + ey] * scale;
        bytes[(nely - 1 - ey) * nelx + ex] = t <= 0 ? 0 : t >= 1 ? 255 : Math.round(t * 255);
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, nelx, nely, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
  }

  setDensity(nelx: number, nely: number, rho: Float32Array): void {
    if (nelx !== this.nelx || nely !== this.nely) this.buildMesh(nelx, nely);
    this.upload(this.texDensity, rho, 1);
  }

  setField(field: Float32Array | null, max: number): void {
    this.hasField = !!field && field.length === this.nelx * this.nely;
    if (this.hasField && field) this.upload(this.texField, field, max > 0 ? 1 / max : 0);
  }

  setDisplacement(u: Float32Array | null, scale: number): void {
    const gl = this.gl;
    const n = (this.nelx + 1) * (this.nely + 1) * 2;
    if (!u || u.length !== n) {
      this.dispScale = 0;
      return;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dispBuf);
    gl.bufferData(gl.ARRAY_BUFFER, u, gl.DYNAMIC_DRAW);
    this.dispScale = scale;
  }

  draw(t: Transform, mode: DrawMode, crisp: number): void {
    const { gl, uniforms: u } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.indexCount) return;
    gl.useProgram(this.prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const h = 1 / this.nely;
    gl.uniform2f(u.uGrid, this.nelx, this.nely);
    gl.uniform2f(u.uScale, (2 * h * t.s) / this.cssW, (2 * h * t.s) / this.cssH);
    gl.uniform2f(u.uOffset, (2 * t.ox) / this.cssW - 1, 1 - (2 * t.oy) / this.cssH);
    gl.uniform1f(u.uDispScale, mode === 'deformed' ? this.dispScale : 0);
    gl.uniform1i(u.uMode, mode === 'field' && this.hasField ? 1 : 0);
    gl.uniform1f(u.uCrisp, crisp);
    gl.uniform2f(u.uTexSize, this.nelx, this.nely);
    gl.uniform3f(u.uInk, INK[0] / 255, INK[1] / 255, INK[2] / 255);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texDensity);
    gl.uniform1i(u.uDensity, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texField);
    gl.uniform1i(u.uField, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texLut);
    gl.uniform1i(u.uLut, 2);
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.posBuf);
    gl.deleteBuffer(this.dispBuf);
    gl.deleteBuffer(this.idxBuf);
    gl.deleteTexture(this.texDensity);
    gl.deleteTexture(this.texField);
    gl.deleteTexture(this.texLut);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.prog);
  }
}
