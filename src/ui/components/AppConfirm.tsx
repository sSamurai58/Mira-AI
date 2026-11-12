import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ConfirmModal } from "./ConfirmModal";

export type AppConfirmOptions = {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
};

type Pending = AppConfirmOptions & {
  resolve: (ok: boolean) => void;
};

type ConfirmFn = (opts: AppConfirmOptions) => Promise<boolean>;

const AppConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * In-app confirm dialogs (dark Mira modal) instead of native `window.confirm`.
 * Mount once near the app root; call `useAppConfirm()` from panels.
 */
export function AppConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      if (pendingRef.current) {
        pendingRef.current.resolve(false);
      }
      const next: Pending = { ...opts, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    const cur = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    cur?.resolve(ok);
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <AppConfirmContext.Provider value={value}>
      {children}
      <ConfirmModal
        open={Boolean(pending)}
        title={pending?.title ?? "Подтверждение"}
        body={pending?.body ?? ""}
        confirmLabel={pending?.confirmLabel ?? "OK"}
        cancelLabel={pending?.cancelLabel ?? "Отмена"}
        tone={pending?.tone ?? "danger"}
        bridgeHint={false}
        onCancel={() => close(false)}
        onConfirm={() => close(true)}
      />
    </AppConfirmContext.Provider>
  );
}

export function useAppConfirm(): ConfirmFn {
  const ctx = useContext(AppConfirmContext);
  if (!ctx) {
    throw new Error("useAppConfirm must be used within AppConfirmProvider");
  }
  return ctx;
}
