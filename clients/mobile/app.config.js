/**
 * app.config.js — Samhan 거래처 주문 Expo 설정.
 *
 * 버전 채번:
 *   - version = package.json version (마켓 메타데이터용 semver).
 *   - extra.appVersion = EXPO_PUBLIC_APP_VERSION로 주입하는 정책용 개발 버전.
 *   - EAS Update publish는 EAS 계정/projectId 연동 후 활성화한다.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('./package.json');
const { resolveBuildAppVersion } = require('../../scripts/app-build-version.cjs');

const BUILD_ENV = process.env.BUILD_ENV || 'development';
const APP_DEVELOPMENT_VERSION = resolveBuildAppVersion({ variable: 'EXPO_PUBLIC_APP_VERSION' });
const BUILD_NUMBER = process.env.EXPO_BUILD_NUMBER || '1';
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || 'PLACEHOLDER_EAS_PROJECT_ID';
const HAS_EAS_PROJECT_ID = EAS_PROJECT_ID !== 'PLACEHOLDER_EAS_PROJECT_ID';
const EAS_UPDATE_URL =
  process.env.EXPO_PUBLIC_EAS_UPDATE_URL || `https://u.expo.dev/${EAS_PROJECT_ID}`;

function resolveApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) return process.env.EXPO_PUBLIC_API_BASE_URL;
  if (BUILD_ENV === 'production') return 'https://api.samhan-air.com';
  if (BUILD_ENV === 'preview') return 'https://api-stg.samhan-air.com';
  return 'http://localhost:8080';
}

function resolveOrderAppUrl() {
  if (process.env.EXPO_PUBLIC_ORDER_APP_URL) return process.env.EXPO_PUBLIC_ORDER_APP_URL;
  if (BUILD_ENV === 'production') return 'https://order.samhan-air.com/';
  if (BUILD_ENV === 'preview') return 'https://order-stg.samhan-air.com/';
  return 'http://localhost:5185/';
}

function resolveAppId() {
  if (BUILD_ENV === 'production') return 'com.samhanair.mobile';
  if (BUILD_ENV === 'preview') return 'com.samhanair.mobile.preview';
  return 'com.samhanair.mobile.dev';
}

function resolveAppName() {
  if (BUILD_ENV === 'production') return 'SamhanLogis 주문';
  if (BUILD_ENV === 'preview') return 'SamhanLogis 주문 (Preview)';
  return 'SamhanLogis 주문 (Dev)';
}

const appId = resolveAppId();

module.exports = {
  expo: {
    name: resolveAppName(),
    slug: 'samhan-mobile',
    version: pkg.version,
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    assetBundlePatterns: ['**/*'],
    extra: {
      buildEnv: BUILD_ENV,
      appVersion: APP_DEVELOPMENT_VERSION,
      apiBaseUrl: resolveApiBaseUrl(),
      orderAppUrl: resolveOrderAppUrl(),
      easUpdateUrl: EAS_UPDATE_URL,
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
    // EAS 계정/projectId 연동 후 preview/production 채널 publish 활성.
    // 현재 placeholder 상태에서는 enabled=false 로 OTA publish를 게이트한다.
    updates: {
      enabled: BUILD_ENV !== 'development' && HAS_EAS_PROJECT_ID,
      url: EAS_UPDATE_URL,
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: appId,
      buildNumber: BUILD_NUMBER,
    },
    android: {
      package: appId,
      versionCode: Number(BUILD_NUMBER),
    },
    web: {
      bundler: 'metro',
    },
    plugins: [],
  },
};
