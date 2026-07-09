import path from "path"
import process from "node:process"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

function readPort(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") {
    return fallback
  }

  const port = Number.parseInt(value, 10)
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : fallback
}

const repoRoot = path.resolve(__dirname, "../..")
const browserMcpShim = path.resolve(__dirname, "./src/lib/ai-sdk-mcp-browser-shim.ts")

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, repoRoot, ""),
    ...loadEnv(mode, __dirname, ""),
    ...process.env,
  }
  const apiPort = readPort(env.ARKIVRA_CLIENT_NEW_API_PORT ?? env.ARKIVRA_PORT, 1321)
  const apiTarget =
    env.VITE_ARKIVRA_API_BASE_URL ?? env.ARKIVRA_SERVER_BASE_URL ?? `http://127.0.0.1:${apiPort}`
  const webPort = readPort(env.ARKIVRA_WEB_NEW_PORT ?? env.ARKIVRA_WEB_PORT, 5174)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@ai-sdk/mcp/mcp-stdio": browserMcpShim,
        "@ai-sdk/mcp": browserMcpShim,
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      "import.meta.env.VITE_BASENAME": JSON.stringify(env.VITE_BASENAME || ""),
      "process.env.DRAGGABLE_DEBUG": "false",
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          "process.env.DRAGGABLE_DEBUG": "false",
        },
      },
    },
    server: {
      port: webPort,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: readPort(env.ARKIVRA_WEB_NEW_PREVIEW_PORT, 4174),
      strictPort: true,
    },
  }
})
