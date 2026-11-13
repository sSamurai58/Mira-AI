/**
 * worker_threads entry for neural mel train (compiled next to trainWorkerHost.js).
 */

import { parentPort, workerData } from "node:worker_threads";
import {
  runNeuralMelTrain,
  type NeuralTrainProgress,
} from "./train";
import type { TrainWorkerRequest } from "./trainWorkerHost";

const req = workerData as TrainWorkerRequest;

try {
  const result = runNeuralMelTrain(req.pack, req.packDir, req.clips, {
    epochs: req.epochs,
    writePreviews: req.writePreviews,
    onProgress: (ev: NeuralTrainProgress) => {
      parentPort?.postMessage({ type: "progress", progress: ev });
    },
  });
  parentPort?.postMessage({ type: "done", result });
} catch (err) {
  parentPort?.postMessage({
    type: "error",
    error: err instanceof Error ? err.message : String(err),
  });
}
