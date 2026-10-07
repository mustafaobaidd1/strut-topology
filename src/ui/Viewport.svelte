<script lang="ts">
  import { onMount } from 'svelte';
  import {
    loadMagnitude,
    newId,
    type Point,
    type Problem,
    type RegionKind,
  } from '../lib/problem/model';
  import { meshFor } from '../lib/problem/resolve';
  import { app } from '../state/app.svelte';
  import { viewportApi } from './viewportApi';
  import Legend from './Legend.svelte';
  import { CpuRenderer } from './render/cpuRenderer';
  import { GLRenderer } from './render/glRenderer';
  import {
    drawOverlay,
    lineLoadEnds,
    loadAnchor,
    loadHead,
    toDomain,
    toScreen,
  } from './render/overlay';
  import type { DrawMode, FieldRenderer, Transform } from './render/types';
  import {
    aimLoad,
    describeDirection,
    dragLineEnd,
    fitTransform,
    hitTest,
    moveLoad,
    nudgeLoadAim,
    regionCentre,
    snapSegment,
    snapToNode,
    supportCentre,
    translateRegion,
    translateSupport,
    updateEntity,
  } from './viewportLogic';

  let { compact = false }: { compact?: boolean } = $props();

  let container: HTMLDivElement | undefined = $state();
  let fieldCanvas: HTMLCanvasElement | undefined = $state();
  let overlayCanvas: HTMLCanvasElement | undefined = $state();
  let cw = $state(0);
  let ch = $state(0);
  let renderer: FieldRenderer | null = null;
  let octx: CanvasRenderingContext2D | null = null;
  let raf = 0;
  let hasFrame = $state(false);
  /** Density centroid "x,y" in element units: a cheap fingerprint of the design (for tests). */
  let centroid = $state('');
  let centroidOf: Float32Array | null = null;

  const margins = $derived(
    compact
      ? { left: 20, right: 20, top: 30, bottom: 30 }
      : { left: 72, right: 60, top: 56, bottom: 74 },
  );
  const t: Transform = $derived(fitTransform(cw, ch, app.problem.width, margins));
  const mesh = $derived(meshFor(app.problem.width, app.params.nely));
  /**
   * Crisp edges fade in as the design becomes black and white (grey level from 18 % down to
   * 4 %), so the early grey block still shows honest intermediate densities.
   */
  const crispAmount = $derived.by(() => {
    if (!app.crisp) return 0;
    const g = app.stats?.grayness ?? 100;
    return Math.min(1, Math.max(0, (18 - g) / 14));
  });

  const drawMode: DrawMode = $derived(
    app.view === 'deformed' ? 'deformed' : app.view === 'density' ? 'density' : 'field',
  );

  // ----------------------------------------------------------------- interaction state
  type Drag =
    | { kind: 'load-anchor' | 'load-head'; id: string; start: Problem }
    | { kind: 'load-end'; id: string; end: 0 | 1; start: Problem }
    | { kind: 'support-move' | 'region-move'; id: string; start: Problem; origin: Point }
    | { kind: 'disk-rim'; id: string; start: Problem }
    | { kind: 'new-load'; a: Point; b: Point }
    | { kind: 'new-support'; a: Point; b: Point }
    | { kind: 'stroke'; id: string; start: Problem }
    | { kind: 'box'; a: Point; b: Point };

  let drag: Drag | null = null;
  let pointer = $state<Point | null>(null);
  let preview = $state<{ kind: 'new-load' | 'new-support' | 'box'; a: Point; b: Point } | null>(
    null,
  );
  let draggingLoad = $state(false);

  const regionKind = $derived(
    app.tool === 'void'
      ? 'void'
      : app.tool === 'solid'
        ? 'solid'
        : app.tool === 'erase'
          ? 'clear'
          : null,
  );

  // ----------------------------------------------------------------- handles (DOM, a11y)
  interface Handle {
    key: string;
    id: string;
    part: 'anchor' | 'head' | 'end0' | 'end1' | 'move' | 'rim';
    entity: 'load' | 'support' | 'region';
    x: number;
    y: number;
    label: string;
  }

  const handles: Handle[] = $derived.by(() => {
    const out: Handle[] = [];
    const p = app.problem;
    const tt = t;
    if (!cw) return out;
    p.loads.forEach((l, i) => {
      const a = toScreen(tt, loadAnchor(mesh, l));
      const head = loadHead(tt, mesh, l);
      const mag = loadMagnitude(l).toFixed(2);
      const dir = describeDirection(l.fx, l.fy);
      const what = l.length > 0 ? `Line load ${i + 1}` : `Load ${i + 1}`;
      out.push({
        key: `${l.id}:a`,
        id: l.id,
        part: 'anchor',
        entity: 'load',
        x: a[0],
        y: a[1],
        label: `${what} at x ${l.at.x.toFixed(2)}, y ${l.at.y.toFixed(2)}, pushing ${dir} with magnitude ${mag}. Drag or use the arrow keys to move it; Delete removes it.`,
      });
      out.push({
        key: `${l.id}:h`,
        id: l.id,
        part: 'head',
        entity: 'load',
        x: head[0],
        y: head[1],
        label: `Arrow head of ${what.toLowerCase()}: drag to aim and size it, or use left and right arrows to rotate and up and down to change the magnitude (now ${mag}).`,
      });
      const ends = lineLoadEnds(mesh, l);
      if (ends) {
        ends.forEach((e, k) => {
          const s = toScreen(tt, e);
          out.push({
            key: `${l.id}:e${k}`,
            id: l.id,
            part: k === 0 ? 'end0' : 'end1',
            entity: 'load',
            x: s[0],
            y: s[1],
            label: `${k === 0 ? 'Left' : 'Right'} end of ${what.toLowerCase()}: drag or use left and right arrows to change its length.`,
          });
        });
      }
    });
    p.supports.forEach((s, i) => {
      const c = toScreen(tt, s.shape === 'disk' ? s.centre : snapToNode(mesh, supportCentre(s)));
      const kind =
        s.kind === 'fixed'
          ? 'Fixed support'
          : s.kind === 'rollerX'
            ? 'Roller sliding in x'
            : 'Roller sliding in y';
      out.push({
        key: `${s.id}:m`,
        id: s.id,
        part: 'move',
        entity: 'support',
        x: c[0],
        y: c[1],
        label: `${kind} ${i + 1}${s.shape === 'disk' ? ' (round pin)' : ''}. Drag or use the arrow keys to move it; Delete removes it.`,
      });
      if (s.shape === 'disk') {
        const r = toScreen(tt, { x: s.centre.x + s.radius, y: s.centre.y });
        out.push({
          key: `${s.id}:r`,
          id: s.id,
          part: 'rim',
          entity: 'support',
          x: r[0],
          y: r[1],
          label: `Rim of round pin ${i + 1}: drag or use up and down arrows to change its radius.`,
        });
      }
    });
    p.regions.forEach((r, i) => {
      if (r.kind === 'clear') return;
      const c = toScreen(tt, regionCentre(r));
      out.push({
        key: `${r.id}:m`,
        id: r.id,
        part: 'move',
        entity: 'region',
        x: c[0],
        y: c[1],
        label: `${r.kind === 'void' ? 'Void' : 'Solid'} region ${i + 1}. Drag or use the arrow keys to move it; Delete removes it.`,
      });
    });
    return out;
  });

  const hintHandle = $derived(
    app.hintDragLoad && app.editable
      ? handles.find((h) => h.entity === 'load' && h.part === 'anchor')
      : undefined,
  );

  // ----------------------------------------------------------------- rendering
  function schedule() {
    if (!raf) raf = requestAnimationFrame(renderNow);
  }

  function renderNow() {
    raf = 0;
    if (!renderer || !octx || !cw || !ch) return;
    const now = performance.now();
    const f = app.frames;
    const rho = f.displayed(now);
    if (rho) {
      hasFrame = true;
      if (f.current && f.current !== centroidOf) {
        centroidOf = f.current;
        let m = 0;
        let mx = 0;
        let my = 0;
        for (let e = 0; e < f.current.length; e++) {
          const d = f.current[e];
          m += d;
          mx += d * Math.floor(e / f.nely);
          my += d * (e % f.nely);
        }
        centroid = m > 0 ? `${(mx / m).toFixed(3)},${(my / m).toFixed(3)}` : '';
      }
      renderer.setDensity(f.nelx, f.nely, rho);
      const fieldOk = f.field && f.fieldView === app.view;
      if (drawMode === 'field') renderer.setField(fieldOk ? f.field : null, f.fieldMax);
      if (drawMode === 'deformed' && fieldOk && f.field) {
        renderer.setDisplacement(f.field, (0.06 * Math.max(f.nelx, f.nely)) / (f.fieldMax || 1));
      } else renderer.setDisplacement(null, 0);
      renderer.draw(t, drawMode, crispAmount);
    }
    const dpr = window.devicePixelRatio || 1;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlayCanvas!.width, overlayCanvas!.height);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const brushOn = regionKind && app.regionShape === 'brush' && pointer && app.editable;
    drawOverlay(octx, t, {
      problem: app.problem,
      nely: app.params.nely,
      selection: app.selection,
      hover: null,
      brush:
        brushOn && pointer ? { at: pointer, radius: app.brushRadius, kind: regionKind! } : null,
      rectPreview:
        preview?.kind === 'box' && regionKind
          ? { a: preview.a, b: preview.b, kind: regionKind }
          : null,
      segmentPreview: preview?.kind === 'new-support' ? { a: preview.a, b: preview.b } : null,
      showSymmetry: app.problem.symmetric,
      showDimensions: !compact,
    });
    if (preview?.kind === 'new-load') {
      const a = toScreen(t, preview.a);
      const b = toScreen(t, preview.b);
      octx.save();
      octx.strokeStyle = '#ff5b14';
      octx.setLineDash([6, 4]);
      octx.lineWidth = 2.4;
      octx.beginPath();
      octx.moveTo(a[0], a[1]);
      octx.lineTo(b[0], a[1]);
      octx.stroke();
      octx.restore();
    }
    if (f.progress(now) < 1) schedule();
  }

  function resize() {
    if (!renderer || !overlayCanvas || !cw || !ch) return;
    const dpr = window.devicePixelRatio || 1;
    renderer.resize(cw, ch, dpr);
    overlayCanvas.width = Math.round(cw * dpr);
    overlayCanvas.height = Math.round(ch * dpr);
    schedule();
  }

  $effect(() => {
    // Re-render whenever anything the drawing depends on changes.
    void [t, app.problem, app.selection, app.view, crispAmount, app.params.nely, pointer, preview];
    void [app.tool, app.brushRadius, app.regionShape];
    schedule();
  });

  $effect(() => {
    void [cw, ch];
    resize();
  });

  /** WebGL2 first; if it fails, a fresh canvas (keyed below) gets the Canvas 2D renderer. */
  let rendererKind = $state<'gl' | 'cpu'>('gl');

  $effect(() => {
    const canvas = fieldCanvas;
    if (!canvas) return;
    let r: FieldRenderer;
    if (rendererKind === 'gl') {
      try {
        r = new GLRenderer(canvas);
      } catch {
        // A canvas that failed to give WebGL2 may refuse a 2D context, so it is recreated.
        app.rendererNotice =
          'WebGL2 is unavailable, so the design is drawn with Canvas 2D (no crisp-edge mode).';
        rendererKind = 'cpu';
        return;
      }
    } else {
      r = new CpuRenderer(canvas);
    }
    renderer = r;
    resize();
    return () => {
      r.dispose();
      if (renderer === r) renderer = null;
    };
  });

  onMount(() => {
    if (!overlayCanvas) return;
    octx = overlayCanvas.getContext('2d');
    const unsub = app.frames.subscribe(schedule);
    viewportApi.snapshot = snapshot;
    resize();
    return () => {
      unsub();
      cancelAnimationFrame(raf);
      viewportApi.snapshot = null;
    };
  });

  /** Composites field and overlay into one canvas (for PNG export). */
  function snapshot(): HTMLCanvasElement | null {
    if (!renderer || !overlayCanvas) return null;
    renderNow();
    const out = document.createElement('canvas');
    out.width = overlayCanvas.width;
    out.height = overlayCanvas.height;
    const g = out.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#f2f1ed';
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(renderer.canvas, 0, 0);
    g.drawImage(overlayCanvas, 0, 0);
    return out;
  }

  // ----------------------------------------------------------------- pointer input
  function local(e: PointerEvent): [number, number] {
    const r = container!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function domainAt(e: PointerEvent): Point {
    const [x, y] = local(e);
    const p = toDomain(t, x, y);
    return { x: Math.min(app.problem.width, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) };
  }

  function startHandleDrag(e: PointerEvent, h: Handle) {
    if (!app.editable) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (app.tool === 'erase') {
      app.deleteEntity(h.id);
      return;
    }
    app.selection = h.id;
    const start = app.problem;
    if (h.entity === 'load') {
      if (h.part === 'head') drag = { kind: 'load-head', id: h.id, start };
      else if (h.part === 'end0' || h.part === 'end1')
        drag = { kind: 'load-end', id: h.id, end: h.part === 'end0' ? 0 : 1, start };
      else drag = { kind: 'load-anchor', id: h.id, start };
      draggingLoad = true;
    } else if (h.entity === 'support') {
      drag =
        h.part === 'rim'
          ? { kind: 'disk-rim', id: h.id, start }
          : { kind: 'support-move', id: h.id, start, origin: domainAt(e) };
    } else {
      drag = { kind: 'region-move', id: h.id, start, origin: domainAt(e) };
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (!app.editable || e.button > 0) return;
    // Only presses on the drawing itself: overlay buttons (banner, call to action) keep their
    // clicks, which pointer capture would otherwise retarget to the container.
    if (e.target !== container && !(e.target instanceof HTMLCanvasElement)) return;
    const [x, y] = local(e);
    const p = domainAt(e);
    container!.setPointerCapture(e.pointerId);
    const hit = hitTest(app.problem, mesh, t, x, y);
    switch (app.tool) {
      case 'select': {
        app.selection = hit;
        if (hit) {
          const isSupport = app.problem.supports.some((s) => s.id === hit);
          drag = {
            kind: isSupport ? 'support-move' : 'region-move',
            id: hit,
            start: app.problem,
            origin: p,
          };
        }
        break;
      }
      case 'load':
        drag = { kind: 'new-load', a: snapToNode(mesh, p), b: snapToNode(mesh, p) };
        preview = { kind: 'new-load', a: drag.a, b: drag.b };
        break;
      case 'support':
        drag = { kind: 'new-support', a: snapToNode(mesh, p), b: snapToNode(mesh, p) };
        preview = { kind: 'new-support', a: drag.a, b: drag.a };
        break;
      case 'erase':
      case 'void':
      case 'solid': {
        if (app.tool === 'erase' && hit) {
          app.deleteEntity(hit);
          break;
        }
        // Erasing without hitting an item brushes passive regions away ('clear').
        const kind: RegionKind =
          app.tool === 'void' ? 'void' : app.tool === 'solid' ? 'solid' : 'clear';
        if (app.regionShape === 'box' && app.tool !== 'erase') {
          drag = { kind: 'box', a: p, b: p };
          preview = { kind: 'box', a: p, b: p };
        } else {
          const id = newId('r');
          const start = app.problem;
          const next = {
            ...start,
            regions: [
              ...start.regions,
              { id, shape: 'stroke' as const, kind, points: [p], radius: app.brushRadius },
            ],
          };
          app.liveEdit(next);
          drag = { kind: 'stroke', id, start };
        }
        break;
      }
    }
  }

  function onPointerMove(e: PointerEvent) {
    const p = domainAt(e);
    pointer = p;
    if (!drag) return;
    const W = app.problem.width;
    switch (drag.kind) {
      case 'load-anchor': {
        const id = drag.id;
        app.liveEdit(updateEntity(app.problem, id, { load: (l) => moveLoad(l, p, mesh, W) }));
        break;
      }
      case 'load-head': {
        const id = drag.id;
        const [x, y] = local(e);
        const l = app.problem.loads.find((q) => q.id === id);
        if (!l) break;
        const anchor = toScreen(t, loadAnchor(mesh, l));
        app.liveEdit(
          updateEntity(app.problem, id, { load: (q) => aimLoad(q, anchor, [x, y], t, e.shiftKey) }),
        );
        break;
      }
      case 'load-end': {
        const { id, end } = drag;
        app.liveEdit(
          updateEntity(app.problem, id, { load: (l) => dragLineEnd(l, end, p, mesh, W) }),
        );
        break;
      }
      case 'support-move': {
        const d = { x: p.x - drag.origin.x, y: p.y - drag.origin.y };
        const orig = drag.start.supports.find((s) => s.id === (drag as { id: string }).id);
        if (!orig) break;
        app.liveEdit(
          updateEntity(app.problem, drag.id, { support: () => translateSupport(orig, d, mesh, W) }),
        );
        break;
      }
      case 'region-move': {
        const d = { x: p.x - drag.origin.x, y: p.y - drag.origin.y };
        const orig = drag.start.regions.find((r) => r.id === (drag as { id: string }).id);
        if (!orig) break;
        app.liveEdit(
          updateEntity(app.problem, drag.id, { region: () => translateRegion(orig, d) }),
        );
        break;
      }
      case 'disk-rim': {
        app.liveEdit(
          updateEntity(app.problem, drag.id, {
            support: (s) =>
              s.shape === 'disk'
                ? {
                    ...s,
                    radius: Math.max(
                      mesh.h,
                      Math.min(0.45, Math.hypot(p.x - s.centre.x, p.y - s.centre.y)),
                    ),
                  }
                : s,
          }),
        );
        break;
      }
      case 'new-load':
        drag.b = snapToNode(mesh, p);
        preview = { kind: 'new-load', a: drag.a, b: drag.b };
        break;
      case 'new-support': {
        const [a, b] = snapSegment(mesh, W, drag.a, p);
        drag.b = b;
        preview = { kind: 'new-support', a, b };
        break;
      }
      case 'stroke': {
        const id = drag.id;
        const r = app.problem.regions.find((q) => q.id === id);
        if (!r || r.shape !== 'stroke') break;
        const last = r.points[r.points.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < r.radius / 3) break;
        app.liveEdit(
          updateEntity(app.problem, id, {
            region: (q) => (q.shape === 'stroke' ? { ...q, points: [...q.points, p] } : q),
          }),
        );
        break;
      }
      case 'box':
        drag.b = p;
        preview = { kind: 'box', a: drag.a, b: drag.b };
        break;
    }
  }

  function onPointerUp() {
    const d = drag;
    drag = null;
    preview = null;
    draggingLoad = false;
    if (!d) return;
    switch (d.kind) {
      case 'load-anchor':
      case 'load-head':
      case 'load-end':
        app.endEdit(d.start);
        app.dismissDragHint();
        break;
      case 'support-move':
      case 'region-move':
      case 'disk-rim':
      case 'stroke':
        app.endEdit(d.start);
        break;
      case 'new-load': {
        const len = Math.abs(d.b.x - d.a.x);
        if (len >= 3 * mesh.h) app.addLoad({ x: (d.a.x + d.b.x) / 2, y: d.a.y }, len);
        else app.addLoad(d.a);
        break;
      }
      case 'new-support': {
        const [a, b] = snapSegment(mesh, app.problem.width, d.a, d.b);
        app.addSupport(a, b);
        break;
      }
      case 'box': {
        const kind: RegionKind =
          app.tool === 'void' ? 'void' : app.tool === 'solid' ? 'solid' : 'clear';
        if (Math.abs(d.b.x - d.a.x) > mesh.h && Math.abs(d.b.y - d.a.y) > mesh.h) {
          app.addRegion({ id: newId('r'), shape: 'rect', kind, a: d.a, b: d.b });
        }
        break;
      }
    }
  }

  // ----------------------------------------------------------------- keyboard on handles
  function onHandleKey(e: KeyboardEvent, h: Handle) {
    if (!app.editable) return;
    const step = (e.shiftKey ? 8 : 1) * mesh.h;
    const W = app.problem.width;
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      app.deleteEntity(h.id);
      return;
    }
    if (e.key === 'Escape') {
      app.selection = null;
      (e.currentTarget as HTMLElement).blur();
      return;
    }
    const k = keys[e.key];
    if (!k) return;
    e.preventDefault();
    app.selection = h.id;
    let next: Problem;
    if (h.entity === 'load') {
      if (h.part === 'head') {
        const deg = k[0] !== 0 ? -k[0] * (e.shiftKey ? 5 : 15) : 0;
        const dm = k[1] * 0.1;
        next = updateEntity(app.problem, h.id, { load: (l) => nudgeLoadAim(l, deg, dm) });
      } else if (h.part === 'end0' || h.part === 'end1') {
        const end = h.part === 'end0' ? 0 : 1;
        next = updateEntity(app.problem, h.id, {
          load: (l) => {
            const x = end === 0 ? l.at.x - l.length / 2 : l.at.x + l.length / 2;
            return dragLineEnd(l, end, { x: x + k[0] * step, y: l.at.y }, mesh, W);
          },
        });
      } else {
        next = updateEntity(app.problem, h.id, {
          load: (l) => moveLoad(l, { x: l.at.x + k[0] * step, y: l.at.y + k[1] * step }, mesh, W),
        });
      }
      app.dismissDragHint();
    } else if (h.entity === 'support') {
      if (h.part === 'rim') {
        next = updateEntity(app.problem, h.id, {
          support: (s) =>
            s.shape === 'disk'
              ? { ...s, radius: Math.max(mesh.h, Math.min(0.45, s.radius + k[1] * mesh.h)) }
              : s,
        });
      } else {
        next = updateEntity(app.problem, h.id, {
          support: (s) => translateSupport(s, { x: k[0] * step, y: k[1] * step }, mesh, W),
        });
      }
    } else {
      next = updateEntity(app.problem, h.id, {
        region: (r) => translateRegion(r, { x: k[0] * step, y: k[1] * step }),
      });
    }
    app.commit(next);
  }

  const statusText = $derived.by(() => {
    const s = app.stats;
    const it = s ? s.runIteration : 0;
    switch (app.engine) {
      case 'starting':
        return 'Starting solver';
      case 'running':
        return `Solving · it ${it}`;
      case 'paused':
        return app.issue ? 'Waiting for a valid setup' : `Paused · it ${it}`;
      case 'converged':
        return `Converged · it ${it}`;
      case 'limit':
        return `Stopped at ${it} iterations`;
      default:
        return 'Ready';
    }
  });

  const showReducedCta = $derived(
    app.reducedMotion &&
      app.engine === 'idle' &&
      app.series.length === 0 &&
      !app.issue &&
      app.editable,
  );
</script>

<div class="frame" class:compact>
  <div
    class="viewport"
    class:compact
    class:drawing={app.tool !== 'select'}
    class:dragging-load={draggingLoad}
    bind:this={container}
    bind:clientWidth={cw}
    bind:clientHeight={ch}
    role="application"
    tabindex="-1"
    aria-label="Design canvas"
    aria-describedby="canvas-help"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onpointerleave={() => (pointer = null)}
    data-testid="viewport"
    data-domain={`${t.ox},${t.oy},${t.s}`}
    data-iteration={app.stats?.iteration ?? 0}
    data-centroid={centroid}
  >
    {#key rendererKind}
      <canvas class="layer" bind:this={fieldCanvas} aria-hidden="true"></canvas>
    {/key}
    <canvas class="layer" bind:this={overlayCanvas} aria-hidden="true"></canvas>

    {#if !hasFrame}
      <div
        class="skeleton"
        style:left="{t.ox}px"
        style:top="{t.oy - t.s}px"
        style:width="{app.problem.width * t.s}px"
        style:height="{t.s}px"
        aria-hidden="true"
      ></div>
    {/if}

    {#each handles as h (h.key)}
      <button
        type="button"
        class="handle {h.entity} part-{h.part}"
        class:selected={app.selection === h.id}
        style:left="{h.x}px"
        style:top="{h.y}px"
        aria-label={h.label}
        disabled={!app.editable}
        onpointerdown={(e) => startHandleDrag(e, h)}
        onkeydown={(e) => onHandleKey(e, h)}
        onfocus={() => (app.selection = h.id)}
        data-testid="handle-{h.entity}-{h.part}"
      ></button>
    {/each}

    {#if hintHandle && !app.issue}
      <div
        class="hint"
        class:flip-x={hintHandle.x > cw - 200}
        class:flip-y={hintHandle.y < 70}
        style:left="{hintHandle.x}px"
        style:top="{hintHandle.y}px"
        aria-hidden="true"
      >
        <span class="hint-line"></span>
        <span class="hint-label">Drag the load</span>
      </div>
    {/if}

    {#if app.issue}
      <div class="issue" role="alert" data-testid="issue">
        <p class="issue-title">{app.issue.title}</p>
        <p class="issue-detail">{app.issue.detail}</p>
        <div class="issue-actions">
          {#if app.issue.code === 'no-supports' || app.issue.code === 'mechanism'}
            <button type="button" class="btn primary" onclick={() => (app.tool = 'support')}
              >Place a support</button
            >
          {:else if app.issue.code === 'no-loads' || app.issue.code === 'loads-on-supports'}
            <button type="button" class="btn primary" onclick={() => (app.tool = 'load')}
              >Place a load</button
            >
          {:else if app.issue.code === 'too-much-solid'}
            <button
              type="button"
              class="btn primary"
              onclick={() => app.setParam('volfrac', Math.min(0.9, app.params.volfrac + 0.1))}
              >Raise the volume fraction</button
            >
          {/if}
          {#if app.canUndo}
            <button type="button" class="btn" onclick={() => app.undo()}>Undo last edit</button>
          {/if}
        </div>
      </div>
    {/if}

    {#if showReducedCta}
      <div class="reduced">
        <button type="button" class="btn primary big" onclick={() => app.run()}
          >Optimise this design</button
        >
        <p>
          Animation is off because your system asks for reduced motion. The result appears when the
          run finishes.
        </p>
      </div>
    {:else if app.reducedMotion && app.engine === 'running'}
      <div class="reduced quiet" aria-hidden="true">
        <p class="mono">Optimising · iteration {app.stats?.runIteration ?? 0}</p>
      </div>
    {/if}
  </div>
  <div class="foot">
    <div class="status caps" class:running={app.engine === 'running'} data-testid="canvas-status">
      <span class="dot" aria-hidden="true"></span>{statusText}
    </div>
    <Legend {compact} />
  </div>
</div>
<p id="canvas-help" class="visually-hidden">
  Loads, supports and regions on the canvas are buttons: tab to one, then use the arrow keys to move
  it (hold Shift for bigger steps) and Delete to remove it. The arrow head of a load rotates with
  left and right and changes magnitude with up and down. With a placing tool selected, click or drag
  on the canvas to add.
</p>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 40px;
    padding: 5px 12px;
    border-top: 1px solid var(--hair);
    background: var(--paper);
    overflow: hidden;
  }
  .frame.compact .foot {
    min-height: 36px;
    padding: 4px 10px;
    gap: 8px;
  }
  .viewport {
    position: relative;
    flex: 1;
    width: 100%;
    min-height: 200px;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    background-color: var(--paper);
    background-image:
      linear-gradient(var(--grid-major) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-major) 1px, transparent 1px),
      linear-gradient(var(--grid-minor) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-minor) 1px, transparent 1px);
    background-size:
      48px 48px,
      48px 48px,
      12px 12px,
      12px 12px;
    background-position: -1px -1px;
    outline: none;
  }
  .viewport.drawing {
    cursor: crosshair;
  }
  .layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .skeleton {
    position: absolute;
    background: linear-gradient(
      90deg,
      rgba(21, 21, 21, 0.2),
      rgba(21, 21, 21, 0.28),
      rgba(21, 21, 21, 0.2)
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s linear infinite;
  }
  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }
  .handle {
    position: absolute;
    width: 30px;
    height: 30px;
    margin: -15px 0 0 -15px;
    border-radius: 50%;
    border: none;
    background: transparent;
    padding: 0;
    cursor: grab;
    touch-action: none;
  }
  .viewport.compact .handle {
    width: 40px;
    height: 40px;
    margin: -20px 0 0 -20px;
  }
  .handle:hover {
    background: rgba(255, 91, 20, 0.12);
  }
  .handle.support:hover,
  .handle.region:hover {
    background: rgba(39, 71, 255, 0.1);
  }
  .handle:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
    background: rgba(39, 71, 255, 0.08);
  }
  .handle:active,
  .dragging-load .handle.load {
    cursor: grabbing;
  }
  .handle:disabled {
    cursor: default;
    background: transparent;
  }
  .handle.part-move.region {
    width: 22px;
    height: 22px;
    margin: -11px 0 0 -11px;
    border: 1.5px dashed rgba(21, 21, 21, 0.45);
    background: rgba(242, 241, 237, 0.7);
    opacity: 0;
  }
  .handle.part-move.region:hover,
  .handle.part-move.region:focus-visible,
  .handle.part-move.region.selected,
  .viewport:not(.drawing) .handle.part-move.region:active {
    opacity: 1;
  }
  .status {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 3px 10px 4px;
    border: 1px solid var(--hair);
    border-radius: 999px;
    background: rgba(247, 246, 242, 0.92);
    color: var(--ink-2);
    font-size: 13px;
    pointer-events: none;
  }
  .status .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ink-3);
  }
  .status.running .dot {
    background: var(--load);
    animation: blink 1s ease-in-out infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.35;
    }
  }
  .hint {
    position: absolute;
    pointer-events: none;
    transform: translate(0, 0);
  }
  .hint-line {
    position: absolute;
    left: 10px;
    top: -10px;
    width: 34px;
    height: 1px;
    background: var(--ink-2);
    transform-origin: 0 0;
    transform: rotate(-35deg);
  }
  .hint-label {
    position: absolute;
    left: 38px;
    top: -42px;
    white-space: nowrap;
    padding: 4px 10px 5px;
    background: var(--ink);
    color: var(--paper);
    border-radius: 3px;
    font-size: 13px;
    font-weight: 600;
    font-stretch: 85%;
    letter-spacing: 0.02em;
    animation: nudge 2.4s ease-in-out infinite;
  }
  .hint.flip-x .hint-line {
    left: -10px;
    transform: rotate(-145deg);
  }
  .hint.flip-x .hint-label {
    left: auto;
    right: 38px;
  }
  .hint.flip-y .hint-line {
    top: 10px;
    transform: rotate(35deg);
  }
  .hint.flip-x.flip-y .hint-line {
    transform: rotate(145deg);
  }
  .hint.flip-y .hint-label {
    top: 18px;
  }
  @keyframes nudge {
    0%,
    70%,
    100% {
      transform: translateX(0);
    }
    80% {
      transform: translateX(4px);
    }
    90% {
      transform: translateX(-2px);
    }
  }
  .issue {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(440px, calc(100% - 32px));
    padding: 16px 18px 14px;
    background: var(--paper-raised);
    border: 1px solid var(--hair-strong);
    border-left: 4px solid var(--load);
    border-radius: var(--r-md);
    box-shadow: var(--shadow-2);
  }
  .issue-title {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 700;
    font-stretch: 90%;
  }
  .issue-detail {
    margin: 0 0 12px;
    color: var(--ink-2);
    font-size: 14px;
  }
  .issue-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .reduced {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    max-width: min(420px, calc(100% - 32px));
    text-align: center;
    padding: 14px 16px;
    background: rgba(247, 246, 242, 0.94);
    border: 1px solid var(--hair);
    border-radius: var(--r-md);
  }
  .reduced p {
    margin: 0;
    font-size: 13px;
    color: var(--ink-2);
  }
  .reduced.quiet {
    padding: 8px 14px;
  }
  .btn {
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    background: var(--paper-raised);
    font-weight: 600;
    font-stretch: 90%;
  }
  .btn:hover {
    background: #fff;
  }
  .btn.primary {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
  .btn.primary:hover {
    background: #2b2b2a;
  }
  .btn.big {
    min-height: 48px;
    padding: 0 22px;
    font-size: 16px;
  }
</style>
