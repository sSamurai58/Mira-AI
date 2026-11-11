type ErrorBannerProps = {
  message: string;
  onRetry?: () => void;
  onDoctor?: () => void;
  onDismiss?: () => void;
};

export function ErrorBanner({
  message,
  onRetry,
  onDoctor,
  onDismiss,
}: ErrorBannerProps) {
  return (
    <div className="banner" role="alert">
      <div>
        <strong>Ошибка</strong>
        <div className="muted">{message}</div>
      </div>
      <div className="row">
        {onRetry ? (
          <button type="button" className="btn" onClick={onRetry}>
            Повторить
          </button>
        ) : null}
        {onDoctor ? (
          <button type="button" className="btn" onClick={onDoctor}>
            Doctor
          </button>
        ) : null}
        {onDismiss ? (
          <button type="button" className="btn" onClick={onDismiss}>
            Скрыть
          </button>
        ) : null}
      </div>
    </div>
  );
}
