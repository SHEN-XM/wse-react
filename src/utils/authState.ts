export type StoredUser = {
  id?: string;
  username?: string;
  realname?: string;
  nickname?: string;
  roleName?: string;
  token?: string;
  menus?: Array<{ path?: string; children?: Array<{ path?: string }> }>;
  cmsMenus?: Array<{ path?: string; children?: Array<{ path?: string }> }>;
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

export function hasPathAccess(path: string) {
  if (path === "/") return true;
  const user = getStoredUser();
  if (!user) return false;
  if (String(user.roleName || "").toLowerCase().includes("admin")) return true;

  const menus = [...(user.menus || []), ...(user.cmsMenus || [])];
  if (!menus.length) return true;

  const paths = menus.flatMap((menu) => {
    if (menu.children?.length) {
      return menu.children.map((child) => child.path).filter(Boolean);
    }
    return [menu.path].filter(Boolean);
  });

  return paths.includes(path);
}

export function isAdminUser(user: StoredUser | null = getStoredUser()) {
  return String(user?.roleName || "").toLowerCase().includes("admin");
}

export function getAllowedPaths(user: StoredUser | null = getStoredUser()) {
  if (!user) return new Set<string>();
  if (isAdminUser(user)) return null;

  const menus = [...(user.menus || []), ...(user.cmsMenus || [])];
  if (!menus.length) return null;

  const paths = menus.flatMap((menu) => {
    if (menu.children?.length) {
      return menu.children.map((child) => child.path).filter(Boolean);
    }
    return [menu.path].filter(Boolean);
  });

  return new Set(paths);
}
