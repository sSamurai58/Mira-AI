import { useEffect, useState } from "react";
import { APP_VERSION } from "../../config";
import {
  MIRA_CHANGELOG,
  normalizeMiraVersion,
} from "../updateChangelog";
import {
  checkAndroidUpdates,
  downloadAndroidUpdate,
  getAndroidUpdateStatus,
  installAndroidUpdate,
  isAndroidUpdaterActive,
  openAndroidReleasesPage,
} from "../androidUpdater";
import { StubBadge } from "./StubBadge";
import { IntegCard } from "./SettingsFormBits";

const RELEASES_URL = "https://github.com/sSamurai58/Mira-AI/releases";
const CHANGELOG_PREVIEW_COUNT = 5;

const DEMO_STATUS: MiraUpdateStatus = {
  channel: "idle",
  currentVersion: APP_VERSION,
  availableVersion: null,
  progress: null,
  detail:
    "Browser-demo: обновления работают в установленном Electron-приложении или в Android APK с GitHub Releases.",
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
  const [androidMode, setAndroidMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    async function boot() {
      if (isAndroidUpdaterActive()) {
        setAndroidMode(true);
        try {
          const st = await getAndroidUpdateStatus();
          if (!cancelled) setStatus(st);
        } catch {
          if (!cancelled) {
            setStatus({
              ...DEMO_STATUS,
              currentVersion: APP_VERSION,
              packaged: true,
              canCheck: true,
              detail: "Android: не удалось получить статус обновлений",
            });
          }
        }
        return;
      }

      if (!window.mira?.getUpdateStatus) {
        setStatus({
          ...DEMO_STATUS,
          currentVersion: APP_VERSION,
        });
        return;
      }
      try {
        const st = await window.mira.getUpdateStatus();
        if (!cancelled) setStatus(st);
      } catch {
        if (!cancelled) {
          setStatus({
            ...DEMO_STATUS,
            currentVersion: APP_VERSION,
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
    setBusy("check");
    setNote(null);
    try {
      if (androidMode) {
        const st = await checkAndroidUpdates();
        setStatus(st);
        setNote(st.detail);
        return;
      }
      if (!window.mira?.checkForUpdates) return;
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
    setBusy("download");
    setNote(null);
    try {
      if (androidMode) {
        const st = await downloadAndroidUpdate();
        setStatus(st);
        setNote(st.detail);
        return;
      }
      if (!window.mira?.downloadUpdate) return;
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
    setBusy("install");
    setNote(null);
    try {
      if (androidMode) {
        const res = await installAndroidUpdate();
        setStatus(res.status);
        setNote(res.detail);
        return;
      }
      if (!window.mira?.quitAndInstall) return;
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
      if (androidMode) {
        const res = await openAndroidReleasesPage();
        setNote(res.detail);
        return;
      }
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

  // Badge must follow product build version (APP_VERSION / native versionName).
  const currentNorm =
    normalizeMiraVersion(status.currentVersion) ||
    normalizeMiraVersion(APP_VERSION);

  const changelogHasMore = MIRA_CHANGELOG.length > CHANGELOG_PREVIEW_COUNT;
  const visibleChangelog = changelogExpanded
    ? MIRA_CHANGELOG
    : MIRA_CHANGELOG.slice(0, CHANGELOG_PREVIEW_COUNT);

  const intro = androidMode
    ? "Релизы с GitHub. На планшете/Android Mira проверяет asset Mira-*-android.apk и открывает установку APK."
    : "Релизы с GitHub. После скачивания установка проходит тихо при перезапуске (без мастера NSIS). Можно нажать «Обновить и перезапустить» или просто закрыть Mira — обновление применится само.";

  const kicker = androidMode ? "Capacitor Android" : "electron-updater";
  const cardTitle = androidMode ? "GitHub Releases · APK" : "GitHub Releases";
  const purpose = androidMode
    ? "Проверка новой версии APK и установка поверх текущей сборки."
    : "Проверка, скачивание и установка новой версии без ручной переустановки.";

  const howto = androidMode ? (
    <ol>
      <li>«Проверить обновления» — ищем свежий Mira-*-android.apk.</li>
      <li>«Скачать APK» / «Установить APK» — открываем файл для установки.</li>
      <li>
        Разрешите установку из этого источника, если Android спросит.
      </li>
    </ol>
  ) : (
    <ol>
      <li>«Проверить обновления» → «Скачать».</li>
      <li>
        «Обновить и перезапустить» — тихая установка и запуск новой версии.
      </li>
      <li>
        Или просто закройте Mira: обновление встанет при выходе, без окон
        установщика.
      </li>
    </ol>
  );

  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Обновления</h2>
        <StubBadge label="RELEASE" />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {intro}
      </p>

      <IntegCard
        kicker={kicker}
        title={cardTitle}
        purpose={purpose}
        howto={howto}
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
              {busy === "download"
                ? "Скачивание…"
                : androidMode
                  ? "Скачать APK"
                  : "Скачать"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy !== null || !status.canInstall}
              onClick={() => void install()}
            >
              {busy === "install"
                ? androidMode
                  ? "Открываю…"
                  : "Перезапуск…"
                : androidMode
                  ? "Установить APK"
                  : "Обновить и перезапустить"}
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
                style={{
                  width: `${Math.max(0, Math.min(100, status.progress))}%`,
                }}
              />
            </div>
            <span className="settings-field-hint">{status.progress}%</span>
          </div>
        ) : null}
        {!status.packaged && !androidMode ? (
          <p className="integ-banner">
            Сейчас не packaged-сборка. Кнопки активируются после `npm run pack` /
            установки Mira с GitHub Releases (Desktop) или установки Android APK.
          </p>
        ) : null}
        {androidMode ? (
          <p className="integ-banner">
            Android APK: версия из package / versionName. Обновление — новый
            Mira-*-android.apk из GitHub Releases.
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
