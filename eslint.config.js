import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import stylistic from '@stylistic/eslint-plugin'
import { defineConfig } from "eslint/config";


export default defineConfig([
    { ignores: ["dist/**", "package-lock.json", "src/**"] },  // Ignore src since it has TypeScript syntax
    {
        files: ["**/*.{js,cjs,mjs}"],
        plugins: { js, '@stylistic': stylistic },
        languageOptions: { globals: { ...globals.browser, ...globals.node } },
        extends: ["js/recommended"],
        rules: {
            'complexity': ['error', 5],
            '@stylistic/indent': ['error', 4],
            '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
            '@stylistic/comma-dangle': ['error', { arrays: 'always-multiline', objects: 'never', imports: 'always-multiline', exports: 'always-multiline', functions: 'always-multiline' }],
            'one-var': ['error', 'consecutive'],
            'curly': ['error', 'multi-or-nest']
        }
    },
    { files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
    { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm", extends: ["markdown/recommended"] },
]);