export type ConfirmTone = "default" | "danger";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
};

export type ConfirmRequest = ConfirmOptions & {
  id: number;
  resolve: (confirmed: boolean) => void;
};

export const CONFIRM_EVENT = "wse-confirm";

export function confirmAction(options: ConfirmOptions) {
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(
      new CustomEvent<ConfirmRequest>(CONFIRM_EVENT, {
        detail: {
          id: Date.now() + Math.random(),
          cancelText: "取消",
          confirmText: "确认",
          tone: "default",
          ...options,
          resolve
        }
      })
    );
  });
}
