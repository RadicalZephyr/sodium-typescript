/**
 * ESLint configuration.
 *
 * Linting is not type aware (no `parserOptions.project`) so that it runs over
 * the whole of src/ - including the test sources - without needing a second
 * TypeScript project.
 */
module.exports = {
    root: true,
    env: {
        es6: true,
        node: true,
    },
    parserOptions: {
        ecmaVersion: 2018,
        sourceType: "module",
    },
    extends: [
        "eslint:recommended",
    ],
    ignorePatterns: [
        "dist/",
        "node_modules/",
        "coverage/",
        // Has its own package.json, tsconfig and toolchain.
        "src/tests/integration/",
    ],
    rules: {
        // `while (true)` is the idiom used by the transaction and priority queue loops.
        "no-constant-condition": ["error", { checkLoops: false }],
    },
    overrides: [
        {
            files: ["**/*.ts"],
            parser: "@typescript-eslint/parser",
            plugins: ["@typescript-eslint"],
            extends: [
                "plugin:@typescript-eslint/recommended",
            ],
            rules: {
                // The Lambda dependency lists hold streams and cells of mixed types.
                "@typescript-eslint/no-explicit-any": "off",
                // Used where the surrounding code has already established the invariant.
                "@typescript-eslint/no-non-null-assertion": "off",
                // Empty arrow functions are used as no-op listeners and cleanup handlers.
                "@typescript-eslint/no-empty-function": ["error", { allow: ["arrowFunctions"] }],
                // `const me = this` is the established idiom for capturing the receiver.
                "@typescript-eslint/no-this-alias": ["error", {
                    allowDestructuring: true,
                    allowedNames: ["me"],
                }],
                "@typescript-eslint/no-unused-vars": ["error", {
                    args: "after-used",
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                }],
            },
        },
        {
            files: ["src/tests/**/*.ts"],
            env: {
                jest: true,
            },
        },
    ],
};
