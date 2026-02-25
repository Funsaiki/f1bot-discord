import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/deploy-commands.ts"],
  format: ["cjs"],
  target: "node20",
  clean: true,
  sourcemap: true,
});
