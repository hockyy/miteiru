const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
const typescriptPlugin = require("@typescript-eslint/eslint-plugin");
const typescriptParser = require("@typescript-eslint/parser");

module.exports = [
  {
    ignores: [
      "app/**",
      "dist/**",
      "node_modules/**",
      "renderer/.next/**",
      "native/**/bin/**",
      "native/**/obj/**"
    ]
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2018,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "@typescript-eslint": typescriptPlugin
    },
    rules: {
      ...typescriptPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    files: ["**/*.{jsx,tsx}"],
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react-hooks/exhaustive-deps": "warn"
    }
  },
  {
    files: ["eslint.config.js"],
    languageOptions: {
      sourceType: "commonjs"
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  }
];
