import { extractShapes } from '../lib/geometry/contours';
import { extrudeShapes, fileStem, meshToStl, shapesToSvg } from '../lib/geometry/exporters';
import { app } from '../state/app.svelte';
import { fileSize } from './format';
import { viewportApi } from './viewportApi';

/** Saves a blob under `name` through a temporary object URL. */
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function stem(): string {
  const f = app.frames;
  return fileStem(app.presetName, f.nelx, f.nely, app.params.volfrac, app.stats?.iteration ?? 0);
}

function shapes() {
  const f = app.frames;
  if (!f.current) return null;
  const s = extractShapes(f.current, f.nelx, f.nely);
  return s.length ? s : null;
}

export interface ExportOptions {
  widthMm: number;
  thicknessMm: number;
}

export function exportSvg(o: ExportOptions): boolean {
  const s = shapes();
  if (!s) {
    app.toast('error', 'Nothing to export yet: no material reaches density 0.5.');
    return false;
  }
  const f = app.frames;
  const svg = shapesToSvg(
    s,
    { widthMm: o.widthMm, nelx: f.nelx, nely: f.nely },
    {
      title: `Strut — ${app.presetName}`,
      description: `Topology-optimised outline, density threshold 0.5, ${f.nelx} x ${f.nely} elements, volume fraction ${app.params.volfrac}. Cut lines in millimetres.`,
    },
  );
  const name = `${stem()}.svg`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  download(blob, name);
  app.toast('success', `Saved ${name} (${fileSize(blob.size)})`);
  return true;
}

export function exportStl(o: ExportOptions): boolean {
  const s = shapes();
  if (!s) {
    app.toast('error', 'Nothing to export yet: no material reaches density 0.5.');
    return false;
  }
  const f = app.frames;
  const mesh = extrudeShapes(s, { widthMm: o.widthMm, nelx: f.nelx, nely: f.nely }, o.thicknessMm);
  const buf = meshToStl(mesh, `Strut topology optimisation, ${app.presetName}, mm`);
  const name = `${stem()}.stl`;
  const blob = new Blob([buf], { type: 'model/stl' });
  download(blob, name);
  app.toast(
    'success',
    `Saved ${name} (${mesh.count.toLocaleString('en')} triangles, ${fileSize(blob.size)})`,
  );
  return true;
}

export function exportPng(): boolean {
  const canvas = viewportApi.snapshot?.();
  if (!canvas) {
    app.toast('error', 'The view is not ready to save yet.');
    return false;
  }
  // Title block along the bottom, like a drawing sheet.
  const pad = Math.round(44 * (canvas.width / Math.max(1, canvas.clientWidth || canvas.width)));
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height + pad;
  const g = out.getContext('2d');
  if (!g) return false;
  g.fillStyle = '#f2f1ed';
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(canvas, 0, 0);
  const s = pad / 44;
  g.fillStyle = '#151515';
  g.fillRect(0, canvas.height, out.width, 1 * s);
  g.font = `600 ${13 * s}px Archivo, sans-serif`;
  g.textBaseline = 'middle';
  const st = app.stats;
  const parts = [
    `STRUT · ${app.presetName.toUpperCase()}`,
    `${app.frames.nelx} × ${app.frames.nely} EL`,
    `V = ${(app.params.volfrac * 100).toFixed(0)} %`,
    `p = ${app.params.penal}`,
    `r = ${app.params.rmin}`,
    st && Number.isFinite(st.compliance) ? `c = ${st.compliance.toPrecision(5)}` : '',
    `IT ${st?.iteration ?? 0}`,
    app.view.toUpperCase(),
  ].filter(Boolean);
  g.fillText(parts.join('   ·   '), 16 * s, canvas.height + pad / 2);
  out.toBlob((blob) => {
    if (!blob) {
      app.toast('error', 'The browser could not encode the image.');
      return;
    }
    const name = `${stem()}-${app.view}.png`;
    download(blob, name);
    app.toast('success', `Saved ${name} (${fileSize(blob.size)})`);
  }, 'image/png');
  return true;
}
