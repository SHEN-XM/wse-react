import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { PropsWithChildren, useEffect, useState } from "react";
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

  return (
    <>
      {children}
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
              <button type="button" onClick={() => setItems((prev) => prev.filter((toast) => toast.id !== item.id))} title="关闭">
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
