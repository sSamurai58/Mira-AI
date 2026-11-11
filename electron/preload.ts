import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("mira", {
  getHealth: () => ipcRenderer.invoke("mira:get-health"),
  listSessions: () => ipcRenderer.invoke("mira:list-sessions"),
});
