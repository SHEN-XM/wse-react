export type StoredUser = {
  id?: string;
  username?: string;
  realname?: string;
  nickname?: string;
  roleName?: string;
  token?: string;
  menus?: PermissionNode[];
  cmsMenus?: PermissionNode[];
  [key: string]: unknown;
};

type PermissionNode = {
  path?: unknown;
  children?: unknown;
  [key: string]: unknown;
};

const USER_KEY = "user";
const TOKEN_KEY = "accessToken";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function persistUser(user: StoredUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  const token = user.token || user.accessToken || user.authorization;
  if (token) {
    localStorage.setItem(TOKEN_KEY, String(token));
  }
  window.dispatchEvent(new Event("wse-auth-change"));
}

export function clearAuth() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event("wse-auth-change"));
}

export function isLoggedIn() {
  return Boolean(getStoredUser());
}

function normalizePath(path: unknown) {
  if (typeof path !== "string") return "";
  const cleanPath = path.trim().split("?")[0].split("#")[0];
  if (!cleanPath) return "";
  const withSlash = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

function collectPermissionPaths(nodes: unknown, result: Set<string>) {
  if (!Array.isArray(nodes)) return;

  nodes.forEach((node) => {
    if (!node || typeof node !== "object") return;
    const item = node as PermissionNode;
    const path = normalizePath(item.path);
    if (path) result.add(path);
    collectPermissionPaths(item.children, result);
  });
}

export function getPermissionPaths(user: StoredUser | null = getStoredUser()) {
  const paths = new Set<string>();
  if (!user) return paths;

  collectPermissionPaths(user.menus, paths);
  collectPermissionPaths(user.cmsMenus, paths);
  collectPermissionPaths(user.permissions, paths);
  collectPermissionPaths(user.permissionList, paths);
  collectPermissionPaths(user.permissionTree, paths);

  return paths;
}

export function getAllowedPaths(user: StoredUser | null = getStoredUser()) {
  return getPermissionPaths(user);
}

export function hasPathAccess(path: string, user: StoredUser | null = getStoredUser()) {
  if (!user) return false;

  const allowedPaths = getPermissionPaths(user);
  const targetPath = normalizePath(path);
  if (!targetPath) return false;
  if (targetPath === "/") return allowedPaths.has("/");

  return Array.from(allowedPaths).some((allowedPath) => {
    if (allowedPath === "/") return targetPath === "/";
    return targetPath === allowedPath || targetPath.startsWith(`${allowedPath}/`);
  });
}
