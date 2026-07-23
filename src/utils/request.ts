import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { clearAuth, getToken } from "./authState";
import { notify } from "./notify";

export type ApiResponse<T = unknown> = {
  code?: number;
  msg?: string;
  data?: T;
  [key: string]: unknown;
};

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  withCredentials: true
});

function appBasePath() {
  const base = String(import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
  return base === "" ? "" : base;
}

function stripAppBase(pathname: string) {
  const base = appBasePath();
  if (!base) return pathname || "/";
  if (pathname === base) return "/";
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length) || "/";
  return pathname || "/";
}

function loginRedirectUrl() {
  const base = appBasePath();
  const loginPath = `${base}/login`;
  const routePath = `${stripAppBase(window.location.pathname)}${window.location.search || ""}`;
  return `${loginPath}?redirect=${encodeURIComponent(routePath)}`;
}

function isDatabaseDisconnectMessage(message: string) {
  const value = message.toLowerCase();
  return [
    "mysql",
    "database",
    "bad connection",
    "invalid connection",
    "server has gone away",
    "lost connection",
    "connection refused",
    "connection reset",
    "broken pipe",
    "i/o timeout",
    "timeout",
    "econnreset",
    "econnrefused",
    "error 2002",
    "error 2003",
    "error 2006",
    "error 2013"
  ].some((keyword) => value.includes(keyword));
}

function notifyRequestError(title: string, message: string) {
  if (isDatabaseDisconnectMessage(message)) {
    notify({
      type: "warning",
      title: "数据库连接中断",
      message: "MySQL 暂时不可用，任务会等待恢复后继续，请勿重复提交。"
    });
    return;
  }
  notify({ type: "error", title, message });
}

service.interceptors.request.use((config) => {
  const token = getToken();
  config.headers = config.headers || {};
  config.headers["X-Requested-With"] = "XMLHttpRequest";
  if (token) {
    config.headers.authorization = token;
    config.headers.Authorization = token;
  }
  return config;
});

service.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiResponse;
    const requestPath = response.config.url || "";
    const isLoginRequest = requestPath.includes("/check/base/login");
    if (!isLoginRequest && (payload?.code === 115 || payload?.code === 401 || payload?.code === 7)) {
      clearAuth();
      notify({ type: "warning", title: "登录已失效", message: payload.msg || "请重新登录" });
      window.location.replace(loginRedirectUrl());
    } else if (!isLoginRequest && typeof payload?.code === "number" && payload.code !== 0) {
      notifyRequestError("接口返回异常", payload.msg || `错误码 ${payload.code}`);
    }
    return response;
  },
  (error: AxiosError<ApiResponse>) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      clearAuth();
      notify({ type: "warning", title: "无权访问", message: "请重新登录或联系管理员开通权限" });
      window.location.replace(loginRedirectUrl());
    } else {
      const message = error.response?.data?.msg || error.message || "服务器请求失败";
      notifyRequestError("请求失败", message);
    }
    return Promise.reject(error);
  }
);

export function postReq<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) {
  return service.post<ApiResponse<T>>(url, data, config).then((response) => response.data);
}

export function putReq<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) {
  return service.put<ApiResponse<T>>(url, data, config).then((response) => response.data);
}

export function getReq<T = unknown>(url: string, params?: unknown, config?: AxiosRequestConfig) {
  return service.get<ApiResponse<T>>(url, { ...config, params }).then((response) => response.data);
}

export function deleteReq<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) {
  return service.delete<ApiResponse<T>>(url, { ...config, data }).then((response) => response.data);
}
