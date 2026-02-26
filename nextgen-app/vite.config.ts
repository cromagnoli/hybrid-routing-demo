import path from "node:path";
import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";

export default defineConfig({
  publicDir: path.resolve(__dirname, "../public"),
  plugins: [reactRouter()],
});
