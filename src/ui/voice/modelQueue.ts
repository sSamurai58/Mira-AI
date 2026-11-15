/**
 * Serial pipeline phases to avoid fighting for VRAM/CPU:
 * capture/asr → llm → release → tts.
 * Real GPU unload depends on the engine; here we enforce ordering + hooks.
 */

export type PipelinePhase = "idle" | "asr" | "llm" | "tts";

type Listener = (phase: PipelinePhase) => void;

let phase: PipelinePhase = "idle";
const listeners = new Set<Listener>();
let chain: Promise<void> = Promise.resolve();

function notify() {
  for (const l of listeners) l(phase);
}

export function getPipelinePhase(): PipelinePhase {
  return phase;
}

export function subscribePipeline(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setPhase(next: PipelinePhase) {
  phase = next;
  notify();
}

/**
 * Run work exclusively in a phase. Previous phases finish first.
 * `onEnter` / `onLeave` let engines pause/unload.
 */
export function runInPhase<T>(
  target: Exclude<PipelinePhase, "idle">,
  work: () => Promise<T> | T,
  hooks?: { onEnter?: () => void | Promise<void>; onLeave?: () => void | Promise<void> },
): Promise<T> {
  const job = chain.then(async () => {
    await hooks?.onEnter?.();
    setPhase(target);
    try {
      return await work();
    } finally {
      await hooks?.onLeave?.();
      setPhase("idle");
    }
  });
  // Keep chain alive even on failure
  chain = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

/** Convenience: ASR then LLM then TTS as sequential slots. */
export async function runVoiceTurn(steps: {
  asr?: () => Promise<void> | void;
  llm?: () => Promise<void> | void;
  tts?: () => Promise<void> | void;
  /** Called between llm and tts — place to free heavy weights if supported */
  releaseBeforeTts?: () => Promise<void> | void;
}): Promise<void> {
  if (steps.asr) {
    await runInPhase("asr", steps.asr);
  }
  if (steps.llm) {
    await runInPhase("llm", steps.llm);
  }
  await steps.releaseBeforeTts?.();
  if (steps.tts) {
    await runInPhase("tts", steps.tts);
  }
}
