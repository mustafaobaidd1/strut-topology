/// <reference lib="webworker" />
import { EngineHost } from '../lib/engine/host';
import type { ToEngine } from '../lib/engine/protocol';

declare const self: DedicatedWorkerGlobalScope;

const host = new EngineHost(
  (msg, transfer) => self.postMessage(msg, transfer),
  (fn, ms) => setTimeout(fn, ms),
);

self.onmessage = (e: MessageEvent<ToEngine>) => host.receive(e.data);
self.postMessage({ type: 'ready' });
