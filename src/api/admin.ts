import { getReq, postReq, deleteReq, type ApiResponse } from "../utils/request";

export type PagePayload = {
  pageNum: number;
  pageSize: number;
  [key: string]: unknown;
};

export type PageData = {
  list?: Record<string, unknown>[];
  records?: Record<string, unknown>[];
  total?: number;
  size?: number;
  [key: string]: unknown;
};

export function fetchPage(endpoint: string, payload: PagePayload) {
  return postReq<PageData | Record<string, unknown>[] | string[]>(endpoint, payload);
}

export function runAction(endpoint: string, payload: Record<string, unknown> = {}, method: "get" | "post" = "post") {
  return method === "get" ? getReq(endpoint, payload) : postReq(endpoint, payload);
}

export function createRecord(endpoint: string, payload: Record<string, unknown>) {
  return postReq(endpoint, payload);
}

export function updateRecord(endpoint: string, payload: Record<string, unknown>) {
  return postReq(endpoint, payload);
}

export function removeRecord(endpoint: string, row: Record<string, unknown>) {
  if (endpoint.includes("/:id") && row.id) {
    return deleteReq(endpoint.replace("/:id", `/${row.id}`));
  }
  return postReq(endpoint, { id: row.id });
}

export function uploadRecord(endpoint: string, formData: FormData) {
  return postReq(endpoint, formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    },
    timeout: 120000
  });
}

export function normalizeRows(resp: ApiResponse<PageData | Record<string, unknown>[] | string[]>) {
  const data = resp.data;
  if (Array.isArray(data)) {
    return { rows: data.map((item, index) => (typeof item === "object" ? item : { id: index, name: item })), total: data.length, size: data.length };
  }
  if (data && typeof data === "object") {
    const page = data as PageData;
    const rows = page.list || page.records || [];
    return { rows, total: Number(page.total || rows.length || 0), size: Number(page.size || rows.length || 0) };
  }
  return { rows: [], total: 0, size: 0 };
}

export async function getDictionaryTree() {
  return getReq("/check/dic/tree");
}
