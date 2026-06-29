import path from "path"
import process from "node:process"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

function readPort(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") {
    return fallback
  }

  const port = Number.parseInt(value, 10)
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : fallback
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    'import.meta.env.VITE_BASENAME': JSON.stringify(process.env.VITE_BASENAME || ''),
  },
  server: {
    port: readPort(process.env.ARKIVRA_WEB_NEW_PORT, 5174),
    strictPort: true,
  },
  preview: {
    port: readPort(process.env.ARKIVRA_WEB_NEW_PREVIEW_PORT, 4174),
    strictPort: true,
  },
})
