import base from '@deadline/config/eslint.base.mjs';

export default [
  ...base,
  {
    // The web app is the only package that touches browser/React globals.
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        localStorage: 'readonly',
        HTMLElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLInputElement: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        Event: 'readonly',
        AudioContext: 'readonly',
        AudioBuffer: 'readonly',
        GainNode: 'readonly',
        OscillatorType: 'readonly',
        React: 'readonly',
        process: 'readonly',
      },
    },
  },
];
