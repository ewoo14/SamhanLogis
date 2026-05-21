#!/usr/bin/env node
const { spawn } = require('node:child_process');

const target = process.argv[2];
const commonApi = 'http://localhost:8080';

const configs = {
  desktop: {
    command: ['npm', 'run', 'dev'],
    env: {
      VITE_API_BASE_URL: commonApi,
      API_BASE_URL: commonApi,
      VITE_WEB_ESTIMATE_URL: 'http://localhost:5183',
      VITE_WEB_ORDER_URL: 'http://localhost:5180',
    },
  },
  'arologis-desktop': {
    command: ['npm', 'run', 'dev'],
    env: {
      VITE_AROLOGIS_API_BASE: 'http://localhost:8097',
    },
  },
  mobile: {
    command: ['npx', 'expo', 'start', '--localhost'],
    env: {
      EXPO_PUBLIC_API_BASE_URL: commonApi,
      EXPO_PUBLIC_ORDER_APP_URL: 'http://localhost:5180',
    },
  },
  'mobile-staff': {
    command: ['npx', 'expo', 'start', '--localhost'],
    env: {
      EXPO_PUBLIC_API_BASE_URL: commonApi,
      EXPO_PUBLIC_ESTIMATE_APP_URL: 'http://localhost:5183',
    },
  },
  'arologis-mobile': {
    command: ['npx', 'expo', 'start', '--localhost'],
    env: {
      EXPO_PUBLIC_AROLOGIS_API_BASE: 'http://localhost:8097',
    },
  },
  'web-estimate-app': {
    command: ['npm', 'run', 'dev'],
    env: {
      PORT: '5183',
      SAMHAN_API_BASE_URL: commonApi,
    },
  },
  'web-order-app': {
    command: ['npm', 'run', 'dev'],
    env: {
      VITE_API_BASE_URL: `${commonApi}/api/v1`,
    },
  },
  'web-design-system': {
    command: ['npx', 'vite', '--host', '127.0.0.1', '--port', '5176'],
    env: {},
  },
};

if (!configs[target]) {
  console.error(`[local-dev] Unknown target: ${target || '(empty)'}`);
  console.error(`[local-dev] Valid targets: ${Object.keys(configs).join(', ')}`);
  process.exit(2);
}

const config = configs[target];
const [cmd, ...args] = config.command;
const child = spawn(cmd, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    ...config.env,
    BROWSER: process.env.BROWSER || 'none',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
