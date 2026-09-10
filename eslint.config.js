import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

const nodeGlobals = {
    console: 'readonly',
    process: 'readonly',
    fetch: 'readonly',
    AbortSignal: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    TextDecoder: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    globalThis: 'readonly',
    Headers: 'readonly',
};

export default [
    js.configs.recommended,
    prettier,
    {
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: nodeGlobals,
        },
        rules: {
            'no-console': 'off',
            'prefer-const': 'error',
            'no-var': 'error',
            eqeqeq: ['error', 'always'],
            curly: ['error', 'all'],
            'object-shorthand': 'error',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            globals: { ...nodeGlobals, describe: 'readonly', it: 'readonly', before: 'readonly', after: 'readonly' },
        },
    },
    {
        ignores: ['node_modules/', 'results/', 'sitewalk.config.js'],
    },
];
