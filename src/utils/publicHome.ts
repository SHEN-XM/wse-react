import { clearAuth } from "./authState";

export const PUBLIC_HOME_URL = "https://shenxm.com/";

export function redirectToPublicHome() {
  clearAuth();
  window.location.replace(PUBLIC_HOME_URL);
}
