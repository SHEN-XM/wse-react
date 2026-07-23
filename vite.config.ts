import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:9111/";
  const appBase = env.VITE_APP_BASE || "/max/";

  return {
    base: appBase,
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 9890,
      open: false,
      cors: true,
      proxy: {
        "/check": {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    }
  };
});
