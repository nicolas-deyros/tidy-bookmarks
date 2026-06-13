import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { chrome: 'readonly', LanguageModel: 'readonly', document: 'readonly', window: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', console: 'readonly' }
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use textContent/createElement — bookmark data is untrusted.' },
        { property: 'outerHTML', message: 'Use textContent/createElement — bookmark data is untrusted.' },
        { property: 'insertAdjacentHTML', message: 'Use textContent/createElement — bookmark data is untrusted.' }
      ]
    }
  }
];
