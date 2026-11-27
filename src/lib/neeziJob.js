// Neezi store-setup job: lives outside React so it keeps running when the merchant closes the setup window or moves
// to another page. The setup window and the floating progress pill both read it with useNeeziJob().
// Small on purpose: App.jsx imports it for the pill, so it must not pull in the theme engine.
import { useSyncExternalStore } from "react";

let job = null; // { id, storeId, storeName, phase, percent, timeline: [{ id, text, status, at }], open, ... }
const subs = new Set();
const emit = () => { for (const fn of subs) fn(); };

export function getNeeziJob() { return job; }
export function subscribeNeeziJob(fn) { subs.add(fn); return () => subs.delete(fn); }
export function useNeeziJob() { return useSyncExternalStore(subscribeNeeziJob, getNeeziJob, getNeeziJob); }

export function startNeeziJob(init) {
  job = { id: Date.now(), phase: "choose", percent: 0, timeline: [], open: true, error: "", ...init };
  emit();
  return job;
}
export function patchNeeziJob(patch) {
  if (!job) return;
  job = { ...job, ...(typeof patch === "function" ? patch(job) : patch) };
  emit();
}
export function clearNeeziJob() { job = null; emit(); }
export function setNeeziOpen(open) { patchNeeziJob({ open }); }

/** add a timeline row (status running) and return its id; finish it with stepDone / stepFailed */
export function stepStart(text, percent) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  patchNeeziJob((j) => ({
    timeline: [...j.timeline, { id, text, status: "running", at: Date.now() }],
    percent: percent ?? j.percent,
  }));
  return id;
}
export function stepDone(id, text, percent) {
  patchNeeziJob((j) => ({
    timeline: j.timeline.map((s) => (s.id === id ? { ...s, status: "done", text: text || s.text, ms: Date.now() - s.at } : s)),
    percent: percent ?? j.percent,
  }));
}
export function stepFailed(id, text) {
  patchNeeziJob((j) => ({ timeline: j.timeline.map((s) => (s.id === id ? { ...s, status: "error", text: text || s.text } : s)) }));
}
export function stepNote(text, status = "info") {
  patchNeeziJob((j) => ({ timeline: [...j.timeline, { id: `${Date.now()}n`, text, status, at: Date.now() }] }));
}

/** creep the percentage forward while a slow call runs, never past `cap`; returns a stop function */
export function creep(cap, perSecond = 1.2) {
  const t = setInterval(() => {
    patchNeeziJob((j) => ({ percent: Math.min(cap, +(j.percent + perSecond * (1 - j.percent / Math.max(cap, 1)) + 0.15).toFixed(1)) }));
  }, 1000);
  return () => clearInterval(t);
}

export const isNeeziBusy = (j) => !!j && ["thinking", "banners", "applying"].includes(j.phase);
