import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ai.mira.app",
  appName: "Mira",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#0e0e12",
  },
  plugins: {
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0e0e12",
    },
  },
};

export default config;
