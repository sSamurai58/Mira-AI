import { Capacitor } from "@capacitor/core";

/** True inside a Capacitor native shell (Android / iOS APK/IPA), not Electron or browser. */
export function isCapacitorNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True for Capacitor Android APK (tablet / phone). */
export function isCapacitorAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}
