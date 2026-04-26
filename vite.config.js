import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages でサブディレクトリ配信しても動くように相対パスで出力する。
  base: "./",
});
