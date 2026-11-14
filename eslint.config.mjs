import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Migrations are plain CommonJS run by node-pg-migrate.
    files: ['migrations/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { exports: 'writable' } },
  },
);
