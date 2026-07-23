import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { PropsWithChildren, useEffect, useState } from "react";
import { CONFIRM_EVENT, type ConfirmRequest } from "../utils/confirm";
import { NOTICE_EVENT, type NoticePayload } from "../utils/notify";

type Toast = NoticePayload & {
  id: number;
};

const iconMap = {
  success: CheckCircle2,
  error: XCircle,
  warning: TriangleAlert,
  info: Info
};

export default function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<Toast[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<NoticePayload>).detail;
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev.slice(-3), { ...detail, id }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, 3800);
    };
    window.addEventListener(NOTICE_EVENT, listener);
    return () => window.removeEventListener(NOTICE_EVENT, listener);
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<ConfirmRequest>).detail;
      setConfirmRequest(detail);
    };
    window.addEventListener(CONFIRM_EVENT, listener);
    return () => window.removeEventListener(CONFIRM_EVENT, listener);
  }, []);

  useEffect(() => {
    if (!confirmRequest) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        confirmRequest.resolve(false);
        setConfirmRequest(null);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [confirmRequest]);

  const closeConfirm = (confirmed: boolean) => {
    if (!confirmRequest) return;
    confirmRequest.resolve(confirmed);
    setConfirmRequest(null);
  };

  return (
    <>
      {children}
      {confirmRequest ? (
        <div className="confirm-mask" role="dialog" aria-modal="true">
          <section className={`confirm-panel system-confirm-panel ${confirmRequest.tone === "danger" ? "is-danger" : ""}`}>
            <h3>{confirmRequest.title}</h3>
            {confirmRequest.message ? <p>{confirmRequest.message}</p> : null}
            <div>
              <button type="button" onClick={() => closeConfirm(false)}>
                {confirmRequest.cancelText || "取消"}
              </button>
              <button className={confirmRequest.tone === "danger" ? "danger-button" : "primary-button"} type="button" onClick={() => closeConfirm(true)}>
                {confirmRequest.confirmText || "确认"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <div className="toast-stack" aria-live="polite">
        {items.map((item) => {
          const Icon = iconMap[item.type];
          return (
            <div className={`toast-item ${item.type}`} key={item.id}>
              <Icon size={18} />
              <div>
                <strong>{item.title}</strong>
                {item.message && <p>{item.message}</p>}
              </div>
              <button type="button" onClick={() => setItems((prev) => prev.filter((toast) => toast.id !== item.id))}>
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
