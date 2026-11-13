/**
 * Run heavy neural train off the Electron main UI-blocking path via worker_threads.
 * Falls back to in-process train if Worker fails to spawn.
 */

import { Worker } from "node:worker_threads";
import path from "node:path";
import type { LinkedTrainClip, VoiceModelPack } from "../modelPack";
import {
  runNeuralMelTrain,
  type NeuralTrainProgress,
  type NeuralTrainResult,
} from "./train";

export type TrainWorkerRequest = {
  pack: VoiceModelPack;
  packDir: string;
  clips: LinkedTrainClip[];
  epochs?: number;
  writePreviews?: boolean;
};

/**
 * Prefer worker_threads; on failure (tsx/asar edge cases) run inline with progress.
 */
export function runNeuralMelTrainOffThread(
  req: TrainWorkerRequest,
  onProgress?: (ev: NeuralTrainProgress) => void,
): Promise<NeuralTrainResult> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, "trainWorker.js");
    let worker: Worker;
    try {
      worker = new Worker(workerPath, {
        workerData: req,
      });
    } catch {
      try {
        const result = runNeuralMelTrain(req.pack, req.packDir, req.clips, {
          epochs: req.epochs,
          onProgress,
          writePreviews: req.writePreviews,
        });
        resolve(result);
      } catch (err) {
        reject(err);
      }
      return;
    }

    worker.on("message", (msg: {
      type: "progress" | "done" | "error";
      progress?: NeuralTrainProgress;
      result?: NeuralTrainResult;
      error?: string;
    }) => {
      if (msg.type === "progress" && msg.progress) {
        onProgress?.(msg.progress);
        return;
      }
      if (msg.type === "done" && msg.result) {
        resolve(msg.result);
        return;
      }
      if (msg.type === "error") {
        reject(new Error(msg.error || "train worker error"));
      }
    });
    worker.on("error", (err) => {
      // Fallback inline
      try {
        const result = runNeuralMelTrain(req.pack, req.packDir, req.clips, {
          epochs: req.epochs,
          onProgress,
          writePreviews: req.writePreviews,
        });
        resolve(result);
      } catch (e) {
        reject(e instanceof Error ? e : err);
      }
    });
  });
}
