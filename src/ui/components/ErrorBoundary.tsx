import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
};

type State = {
  error: Error | null;
};

/** Keeps the atmosphere shell alive if a child tree throws. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[mira] UI crash", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    const title = this.props.fallbackTitle ?? "Интерфейс Mira сбойнул";
    return (
      <div className="ui-crash-panel" role="alert">
        <h2>{title}</h2>
        <p className="muted">
          {this.state.error.message || "Неизвестная ошибка рендера"}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => this.setState({ error: null })}
        >
          Попробовать снова
        </button>
      </div>
    );
  }
}
