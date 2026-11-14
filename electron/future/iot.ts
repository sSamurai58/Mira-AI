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
  return /(умн(ый|ая|ые)|iot|включи свет|выключи свет|реле|замок|ламп|home.?assistant|ха\b)/i.test(
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

async function pushHomeAssistant(
  entityId: string,
  state: "on" | "off",
): Promise<{ ok: boolean; detail: string }> {
  const base = (process.env.HA_BASE_URL ?? "").trim().replace(/\/$/, "");
  const token = (process.env.HA_TOKEN ?? "").trim();
  if (!base || !token) {
    return { ok: false, detail: "HA: задайте HA_BASE_URL + HA_TOKEN" };
  }
  const domain = entityId.split(".")[0] || "switch";
  const service = state === "on" ? "turn_on" : "turn_off";
  try {
    const res = await fetch(`${base}/api/services/${domain}/${service}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ entity_id: entityId }),
      signal: AbortSignal.timeout(8000),
    });
    return {
      ok: res.ok,
      detail: res.ok
        ? `ha:${domain}.${service}`
        : `ha-fail:${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: `ha-error:${err instanceof Error ? err.message.slice(0, 80) : "fail"}`,
    };
  }
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
  const addr = device.address.trim();

  if (/^ha:\/\//i.test(addr) || /^entity:/i.test(addr)) {
    const entityId = addr.replace(/^(ha:\/\/|entity:)/i, "").trim();
    const ha = await pushHomeAssistant(entityId, state);
    transport = ha.detail;
  } else if (/^https?:\/\//i.test(addr)) {
    try {
      const res = await fetch(addr, {
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
  } else if (/^mqtt:\/\//i.test(addr)) {
    // Publish via optional MQTT HTTP bridge (IOT_MQTT_BRIDGE_URL) — no mqtt lib required.
    const bridge = (process.env.IOT_MQTT_BRIDGE_URL ?? "").trim().replace(/\/$/, "");
    if (bridge) {
      try {
        const topic = addr.replace(/^mqtt:\/\//i, "");
        const res = await fetch(`${bridge}/publish`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topic, payload: state }),
          signal: AbortSignal.timeout(6000),
        });
        transport = res.ok ? `mqtt-bridge:${res.status}` : `mqtt-fail:${res.status}`;
      } catch (err) {
        transport = `mqtt-error:${err instanceof Error ? err.message.slice(0, 60) : "fail"}`;
      }
    } else {
      transport = "mqtt:no-bridge";
    }
  }

  store
    .prepare(`UPDATE iot_devices SET state = ? WHERE id = ?`)
    .run(state, deviceId);

  const live =
    transport.startsWith("http:") ||
    transport.startsWith("ha:") ||
    transport.startsWith("mqtt-bridge:");
  return {
    ok: true,
    detail: `${live ? "live" : "dry-run"} OK: ${device.name} = ${state} (${transport})`,
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
      block: `[IoT]\n${devices.map((d) => `• ${d.name} (${d.kind}) = ${d.state} · ${d.address}`).join("\n")}`,
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
