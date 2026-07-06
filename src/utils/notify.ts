export type NoticeType = "success" | "error" | "warning" | "info";

export type NoticePayload = {
  type: NoticeType;
  title: string;
  message?: string;
};

export const NOTICE_EVENT = "wse-notice";

export function notify(payload: NoticePayload) {
  window.dispatchEvent(new CustomEvent<NoticePayload>(NOTICE_EVENT, { detail: payload }));
}
