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
      VITE_ESTIMATE_APP_URL: 'http://localhost:5183',
    },
  },
  'web-design-system': {
    command: ['npx', 'vite', '--host', '127.0.0.1', '--port', '5176'],
    env: {},
  },
  'web-mobile-public': {
    command: ['npm', 'run', 'dev'],
    // VITE_API_BASE_URL 주입 안 함(plan C2.4 갱신 반영).
    // mobile-public 은 same-origin(빈 baseURL → vite proxy /api→8080)으로 POST.
    // commonApi(http://localhost:8080) 절대 주입 시 폰(LAN)이 자기 localhost 로 직타 → 제출 실패.
    // 폰 접근 origin 은 SAMHAN_SIGNATURE_PUBLIC_BASE_URL=http://<PC-LAN-IP>:5185(Task C2.6)로 분리 주입.
    env: {
      VITE_DEV_PROXY_TARGET: commonApi,
    },
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
