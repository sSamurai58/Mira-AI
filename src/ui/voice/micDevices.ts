/** List / persist preferred microphone deviceId. */

const KEY = "mira.micDeviceId";

export type MicDeviceOption = {
  deviceId: string;
  label: string;
  groupId: string;
};

export function getMicDeviceId(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(KEY)?.trim() || "";
}

export function setMicDeviceId(deviceId: string): string {
  const next = deviceId.trim();
  if (typeof localStorage !== "undefined") {
    if (next) localStorage.setItem(KEY, next);
    else localStorage.removeItem(KEY);
  }
  return next;
}

/** Request a short permission prompt so device labels are populated. */
export async function ensureMicPermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

export async function listMicDevices(): Promise<MicDeviceOption[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    const mics = all.filter((d) => d.kind === "audioinput");
    return mics.map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label?.trim() || `Микрофон ${i + 1}`,
      groupId: d.groupId,
    }));
  } catch {
    return [];
  }
}

export function audioConstraintsForDevice(
  deviceId: string,
): MediaTrackConstraints | boolean {
  if (!deviceId) return true;
  return {
    deviceId: { exact: deviceId },
    echoCancellation: true,
    noiseSuppression: true,
  };
}
