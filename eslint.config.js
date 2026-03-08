import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import stylistic from '@stylistic/eslint-plugin'
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";


export default defineConfig([
    { ignores: ["dist/**", "package-lock.json"] },
    {
        files: ["**/*.{js,cjs,mjs}"],
        plugins: { js, '@stylistic': stylistic },
        languageOptions: { globals: { ...globals.browser, ...globals.node } },
        extends: ["js/recommended"],
        rules: {
            'complexity': ['error', 5],
            '@stylistic/indent': ['error', 4],
            '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
            '@stylistic/comma-dangle': ['error', 'never'],
            'one-var': ['error', 'consecutive'],
            'curly': ['error', 'multi-or-nest']
        }
    },
    ...tseslint.configs.recommended.map(config => ({
        ...config,
        files: ["**/*.mts", "**/*.ts"]
    })),
    {
        files: ["**/*.mts", "**/*.ts"],
        plugins: { '@stylistic': stylistic },
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
            parserOptions: {
                project: ['./tsconfig.json', './tsconfig.test.json'],
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            '@stylistic/indent': ['error', 4, {
                SwitchCase: 1,
                ignoredNodes: [
                    // computed destructuring keys ([expr]: value) inside multi-declarator
                    // const statements cause oscillation between the rule fixer and checker
                    'ObjectPattern > Property[computed=true]',
                    'ObjectPattern > RestElement'
                ]
            }],
            '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
            '@stylistic/comma-dangle': ['error', 'never'],
            'one-var': 'off',
            'curly': ['error', 'multi-or-nest'],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { 'varsIgnorePattern': '^_', 'argsIgnorePattern': '^_', 'caughtErrorsIgnorePattern': '^_' }],
            '@typescript-eslint/no-this-alias': 'off'
        }
    },
    {
        files: ["src/tests/**/*.mts", "examples/**/*.mts"],
        rules: {
            // Test and example files use dynamic ADT patterns that naturally
            // exceed complexity thresholds and require explicit any in some spots.
            // Method bodies in ADT definitions intentionally name parameters for
            // documentation purposes (e.g. Self, T) even when unused by the body.
            'complexity': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
            '@typescript-eslint/no-unused-vars': 'off'
        }
    },
    { files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
    { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm", extends: ["markdown/recommended"] }
]);