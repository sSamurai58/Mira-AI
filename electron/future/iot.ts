import { requestUserConfirm } from "../confirmBridge";
import { openStore } from "../store";

export type IotDevice = {
  id: string;
  name: string;
  kind: string;
  address: string;
  state: string;
  enabled: number;
  created_at: string;
};

export function looksLikeIotIntent(text: string): boolean {
  return /(умн(ый|ая|ые)|iot|включи свет|выключи свет|реле|замок|ламп)/i.test(
    text,
  );
}

export function listIotDevices(): IotDevice[] {
  const store = openStore();
  let rows = store
    .prepare(
      `SELECT id, name, kind, address, state, enabled, created_at FROM iot_devices ORDER BY name`,
    )
    .all() as IotDevice[];
  if (rows.length) return rows;
  const now = new Date().toISOString();
  for (const d of [
    { name: "Лампа гостиная", kind: "light", address: "wifi://lamp-1" },
    { name: "Лампа кухня", kind: "light", address: "wifi://lamp-2" },
    { name: "Замок входная", kind: "lock", address: "wifi://lock-1" },
    { name: "Реле розетка", kind: "relay", address: "wifi://relay-1" },
  ]) {

    store
      .prepare(
        `INSERT INTO iot_devices (id, name, kind, address, state, enabled, created_at)
         VALUES (?, ?, ?, ?, 'off', 1, ?)`,
      )
      .run(crypto.randomUUID(), d.name, d.kind, d.address, now);
  }
  rows = store
    .prepare(
      `SELECT id, name, kind, address, state, enabled, created_at FROM iot_devices ORDER BY name`,
    )
    .all() as IotDevice[];
  return rows;
}

export async function setIotState(
  deviceId: string,
  state: "on" | "off",
): Promise<{ ok: boolean; detail: string; device: IotDevice | null }> {
  const store = openStore();
  const device = store
    .prepare(
      `SELECT id, name, kind, address, state, enabled, created_at FROM iot_devices WHERE id = ?`,
    )
    .get(deviceId) as IotDevice | undefined;
  if (!device) return { ok: false, detail: "Устройство не найдено", device: null };
  const ok = await requestUserConfirm({
    actionClass: "iot",
    risk: "high",
    title: "Управление устройством",
    body: `«${device.name}» → ${state}\n${device.address}`,
    confirmLabel: "Выполнить",
  });
  if (!ok) return { ok: false, detail: "Отклонено", device };

  let transport = "db";
  if (/^https?:\/\//i.test(device.address)) {
    try {
      const res = await fetch(device.address, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          device: device.name,
          kind: device.kind,
          state,
          id: device.id,
        }),
        signal: AbortSignal.timeout(6000),
      });
      transport = res.ok ? `http:${res.status}` : `http-fail:${res.status}`;
    } catch (err) {
      transport = `http-error:${err instanceof Error ? err.message.slice(0, 60) : "fail"}`;
    }
  }

  store
    .prepare(`UPDATE iot_devices SET state = ? WHERE id = ?`)
    .run(state, deviceId);
  return {
    ok: true,
    detail: `${transport.startsWith("http:") ? "live" : "dry-run"} OK: ${device.name} = ${state} (${transport})`,
    device: { ...device, state },
  };
}

export async function handleIotFromChat(text: string): Promise<{
  used: string;
  block: string;
}> {
  const devices = listIotDevices();
  if (/список|какие устройств/i.test(text)) {
    return {
      used: `iot:list:${devices.length}`,
      block: `[IoT]\n${devices.map((d) => `• ${d.name} (${d.kind}) = ${d.state}`).join("\n")}`,
    };
  }
  const on = /включи|turn on|открой замок/i.test(text);
  const off = /выключи|turn off|закрой замок/i.test(text);
  const target =
    devices.find((d) => text.toLowerCase().includes(d.name.toLowerCase())) ||
    devices.find((d) => /свет|ламп|light/i.test(text) && d.kind === "light") ||
    devices.find((d) => /замок|lock/i.test(text) && d.kind === "lock") ||
    devices[0];
  if (!target || (!on && !off)) {
    return {
      used: "iot:parse-fail",
      block: "[IoT] Уточните устройство и действие (включи/выключи).",
    };
  }
  const res = await setIotState(target.id, on ? "on" : "off");
  return {
    used: `iot:${on ? "on" : "off"}:${res.ok ? "ok" : "deny"}`,
    block: `[IoT] ${res.detail}`,
  };
}
