import { useEffect, useState } from "react";
import { APP_VERSION } from "../../config";
import {
  MIRA_CHANGELOG,
  normalizeMiraVersion,
} from "../updateChangelog";
import { StubBadge } from "./StubBadge";
import { IntegCard } from "./SettingsFormBits";

const RELEASES_URL = "https://github.com/sSamurai58/Mira-AI/releases";
const CHANGELOG_PREVIEW_COUNT = 5;

const DEMO_STATUS: MiraUpdateStatus = {
  channel: "idle",
  currentVersion: "0.0.2-demo",
  availableVersion: null,
  progress: null,
  detail:
    "Browser-demo: обновления работают в установленном Electron-приложении через GitHub Releases.",
  canCheck: false,
  canDownload: false,
  canInstall: false,
  packaged: false,
  releasesUrl: RELEASES_URL,
};

export function SettingsUpdatesSection() {
  const [status, setStatus] = useState<MiraUpdateStatus>(DEMO_STATUS);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [changelogExpanded, setChangelogExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    async function boot() {
      if (!window.mira?.getUpdateStatus) {
        setStatus(DEMO_STATUS);
        return;
      }
      try {
        const st = await window.mira.getUpdateStatus();
        if (!cancelled) setStatus(st);
      } catch {
        if (!cancelled) {
          setStatus({
            ...DEMO_STATUS,
            detail: "Не удалось получить статус обновлений",
          });
        }
      }
      unsub = window.mira.onUpdateEvent?.((next) => {
        if (!cancelled) setStatus(next);
      });
    }

    void boot();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  async function check() {
    if (!window.mira?.checkForUpdates) return;
    setBusy("check");
    setNote(null);
    try {
      const st = await window.mira.checkForUpdates();
      setStatus(st);
      setNote(st.detail);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!window.mira?.downloadUpdate) return;
    setBusy("download");
    setNote(null);
    try {
      const st = await window.mira.downloadUpdate();
      setStatus(st);
      setNote(st.detail);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function install() {
    if (!window.mira?.quitAndInstall) return;
    setBusy("install");
    setNote(null);
    try {
      const res = await window.mira.quitAndInstall();
      setNote(res.detail);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function openReleases() {
    setBusy("releases");
    setNote(null);
    try {
      if (window.mira?.openReleasesPage) {
        const res = await window.mira.openReleasesPage();
        setNote(res.detail);
        return;
      }
      window.open(status.releasesUrl || RELEASES_URL, "_blank", "noopener");
      setNote("Открыл страницу релизов");
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const channelLabel: Record<string, string> = {
    idle: "ожидание",
    checking: "проверка…",
    available: "есть обновление",
    "not-available": "актуально",
    downloading: "скачивание…",
    downloaded: "готово к установке",
    error: "нет связи / ошибка",
  };

  // Badge must follow product build version (APP_VERSION), not demo updater stub.
  const currentNorm =
    normalizeMiraVersion(APP_VERSION) ||
    normalizeMiraVersion(status.currentVersion);

  const changelogHasMore = MIRA_CHANGELOG.length > CHANGELOG_PREVIEW_COUNT;
  const visibleChangelog = changelogExpanded
    ? MIRA_CHANGELOG
    : MIRA_CHANGELOG.slice(0, CHANGELOG_PREVIEW_COUNT);

  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Обновления</h2>
        <StubBadge label="RELEASE" />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Релизы с GitHub. После скачивания установка проходит тихо при
        перезапуске (без мастера NSIS). Можно нажать «Обновить и перезапустить»
        или просто закрыть Mira — обновление применится само.
      </p>

      <IntegCard
        kicker="electron-updater"
        title="GitHub Releases"
        purpose="Проверка, скачивание и установка новой версии без ручной переустановки."
        howto={
          <ol>
            <li>«Проверить обновления» → «Скачать».</li>
            <li>
              «Обновить и перезапустить» — тихая установка и запуск новой
              версии.
            </li>
            <li>
              Или просто закройте Mira: обновление встанет при выходе, без
              окон установщика.
            </li>
          </ol>
        }
        footer={
          <div className="integ-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null || !status.canCheck}
              onClick={() => void check()}
            >
              {busy === "check" ? "Проверка…" : "Проверить обновления"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy !== null || !status.canDownload}
              onClick={() => void download()}
            >
              {busy === "download" ? "Скачивание…" : "Скачать"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy !== null || !status.canInstall}
              onClick={() => void install()}
            >
              {busy === "install" ? "Перезапуск…" : "Обновить и перезапустить"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => void openReleases()}
            >
              {busy === "releases" ? "Открываю…" : "Открыть релизы"}
            </button>
            {note ? <span className="chip">{note}</span> : null}
          </div>
        }
      >
        <div className="integ-grid-2">
          <div className="settings-field">
            <span className="settings-field-label">Текущая версия</span>
            <p className="mono" style={{ margin: 0 }}>
              {status.currentVersion}
            </p>
          </div>
          <div className="settings-field">
            <span className="settings-field-label">Доступная</span>
            <p className="mono" style={{ margin: 0 }}>
              {status.availableVersion || "—"}
            </p>
          </div>
        </div>
        <div className="settings-field">
          <span className="settings-field-label">Статус</span>
          <p style={{ margin: 0 }}>
            <span
              className={`integ-status ${
                status.channel === "available" ||
                status.channel === "downloaded"
                  ? "on"
                  : ""
              }`}
            >
              {channelLabel[status.channel] || status.channel}
            </span>{" "}
            <span className="muted">{status.detail}</span>
          </p>
        </div>
        {status.progress != null ? (
          <div className="settings-field">
            <span className="settings-field-label">Прогресс</span>
            <div className="update-progress">
              <div
                className="update-progress-bar"
                style={{ width: `${Math.max(0, Math.min(100, status.progress))}%` }}
              />
            </div>
            <span className="settings-field-hint">{status.progress}%</span>
          </div>
        ) : null}
        {!status.packaged ? (
          <p className="integ-banner">
            Сейчас не packaged-сборка. Кнопки активируются после `npm run pack` /
            установки Mira с GitHub Releases.
          </p>
        ) : null}
      </IntegCard>

      <section className="update-history" aria-labelledby="update-history-title">
        <header className="update-history-head">
          <h2 id="update-history-title" className="update-history-title">
            История обновлений
          </h2>
          <p className="update-history-sub">
            Что менялось в Mira от версии к версии.
          </p>
        </header>
        <ol className="update-history-list">
          {visibleChangelog.map((entry) => {
            const isCurrent =
              normalizeMiraVersion(entry.version) === currentNorm;
            return (
              <li key={entry.version} className="update-history-item">
                <div className="update-history-meta">
                  <span className="update-history-version">
                    Версия {entry.version}
                  </span>
                  {isCurrent ? (
                    <span className="update-history-you" title="Текущая версия">
                      текущая
                    </span>
                  ) : null}
                  <span className="update-history-date">{entry.date}</span>
                </div>
                {entry.summary ? (
                  <p className="update-history-summary">{entry.summary}</p>
                ) : null}
                {entry.bullets.length > 0 ? (
                  <ul className="update-history-bullets">
                    {entry.bullets.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
        {changelogHasMore ? (
          <div className="update-history-more">
            <button
              type="button"
              className="btn update-history-more-btn"
              onClick={() => setChangelogExpanded((v) => !v)}
              aria-expanded={changelogExpanded}
            >
              {changelogExpanded ? "Свернуть" : "Показать больше"}
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}
