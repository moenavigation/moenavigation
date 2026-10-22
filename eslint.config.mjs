import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([...nextVitals, ...nextTs, globalIgnores([".next/**", ".next-qa/**", ".next-ci/**", ".next-e2e/**", "playwright-report/**", "test-results/**", ".local/**", "artifacts/**", "node_modules/**", "next-env.d.ts"])]);
