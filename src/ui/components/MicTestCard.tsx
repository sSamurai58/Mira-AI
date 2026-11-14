/**
 * Microphone picker + live level / frequency test for Settings → Voice.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ensureMicPermission,
  getMicDeviceId,
  listMicDevices,
  setMicDeviceId,
  type MicDeviceOption,
} from "../voice/micDevices";
import {
  acquireMicMeter,
  resetMicLevelPipeline,
  type MicMeter,
} from "../voice/micLevel";
import { Field } from "./SettingsFormBits";
import { ThemeSelect } from "./ThemeSelect";

const SPECTRUM_BINS = 28;

type Props = {
  /** 0…100 threshold from Hands-free prefs — drawn on the level bar. */
  thresholdPct: number;
};

export function MicTestCard({ thresholdPct }: Props) {
  const [devices, setDevices] = useState<MicDeviceOption[]>([]);
  const [deviceId, setDeviceIdState] = useState(() => getMicDeviceId());
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const [spectrum, setSpectrum] = useState<number[]>(() =>
    Array.from({ length: SPECTRUM_BINS }, () => 0),
  );
  const meterRef = useRef<MicMeter | null>(null);
  const rafRef = useRef(0);

  const refreshDevices = useCallback(async () => {
    await ensureMicPermission();
    const list = await listMicDevices();
    setDevices(list);
    const cur = getMicDeviceId();
    if (cur && !list.some((d) => d.deviceId === cur)) {
      setMicDeviceId("");
      setDeviceIdState("");
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
    const onChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
    };
  }, [refreshDevices]);

  const stopTest = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    meterRef.current?.stop();
    meterRef.current = null;
    setTesting(false);
    setLevel(0);
    setSpectrum(Array.from({ length: SPECTRUM_BINS }, () => 0));
  }, []);

  useEffect(() => () => stopTest(), [stopTest]);

  async function startTest() {
    setError("");
    stopTest();
    setTesting(true);
    try {
      const meter = await acquireMicMeter(deviceId || undefined);
      meterRef.current = meter;
      const tick = () => {
        if (!meterRef.current) return;
        setLevel(meterRef.current.level());
        setSpectrum(meterRef.current.spectrum(SPECTRUM_BINS));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setTesting(false);
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось открыть микрофон",
      );
    }
  }

  function onDeviceChange(id: string) {
    setMicDeviceId(id);
    setDeviceIdState(id);
    resetMicLevelPipeline();
    if (testing) {
      void (async () => {
        stopTest();
        // restart on new device
        setTesting(true);
        setError("");
        try {
          const meter = await acquireMicMeter(id || undefined);
          meterRef.current = meter;
          const tick = () => {
            if (!meterRef.current) return;
            setLevel(meterRef.current.level());
            setSpectrum(meterRef.current.spectrum(SPECTRUM_BINS));
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        } catch (err) {
          setTesting(false);
          setError(
            err instanceof Error
              ? err.message
              : "Не удалось открыть микрофон",
          );
        }
      })();
    }
  }

  const levelPct = Math.round(level * 100);
  const threshold = Math.max(0, Math.min(100, thresholdPct));
  const overThreshold = levelPct >= threshold;

  return (
    <div className="stack mic-test-card">
      <Field
        label="Микрофон"
        hint="Устройство ввода для hands-free и теста"
      >
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <ThemeSelect
            className="mic-device-select"
            aria-label="Микрофон"
            value={deviceId}
            options={[
              { value: "", label: "Системный по умолчанию" },
              ...devices.map((d) => ({
                value: d.deviceId,
                label: d.label,
              })),
            ]}
            onChange={onDeviceChange}
          />
          <button
            type="button"
            className="btn"
            onClick={() => void refreshDevices()}
          >
            Обновить
          </button>
        </div>
      </Field>

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {!testing ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void startTest()}
          >
            ▶ Тест микрофона
          </button>
        ) : (
          <button type="button" className="btn" onClick={stopTest}>
            ■ Стоп теста
          </button>
        )}
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          {testing
            ? `Уровень ${levelPct}% · порог ${threshold}%`
            : "Говорите в микрофон во время теста"}
        </span>
      </div>

      {error ? (
        <p className="muted" style={{ margin: 0, color: "var(--danger, #f88)" }}>
          {error}
        </p>
      ) : null}

      <div
        className={`mic-level-track ${testing ? "is-live" : ""} ${
          overThreshold && testing ? "is-hot" : ""
        }`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={levelPct}
        aria-label="Уровень микрофона"
      >
        <div
          className="mic-level-fill"
          style={{ width: `${testing ? levelPct : 0}%` }}
        />
        <div
          className="mic-level-threshold"
          style={{ left: `${threshold}%` }}
          title={`Порог ${threshold}%`}
        />
      </div>

      <div
        className={`mic-spectrum ${testing ? "is-live" : ""}`}
        aria-hidden={!testing}
      >
        {spectrum.map((v, i) => (
          <span
            key={i}
            className="mic-spectrum-bar"
            style={{
              height: `${Math.max(4, Math.round((testing ? v : 0) * 100))}%`,
            }}
          />
        ))}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
        Полоса уровня — громкость в реальном времени; столбики — частоты записи.
        Вертикальная метка — порог чувствительности.
      </p>
    </div>
  );
}
