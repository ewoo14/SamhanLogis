/**
 * app.config.js — 아로로지스 기사 Expo 설정.
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
  if (process.env.EXPO_PUBLIC_AROLOGIS_API_BASE) return process.env.EXPO_PUBLIC_AROLOGIS_API_BASE;
  if (BUILD_ENV === 'production') return 'https://api.arologis.samhan-air.com';
  if (BUILD_ENV === 'preview') return 'https://api-stg.arologis.samhan-air.com';
  return 'http://localhost:8097';
}

function resolveAppId() {
  if (BUILD_ENV === 'production') return 'com.samhanair.arologis.driver';
  if (BUILD_ENV === 'preview') return 'com.samhanair.arologis.driver.preview';
  return 'com.samhanair.arologis.driver.dev';
}

function resolveAppName() {
  if (BUILD_ENV === 'production') return '아로로지스 기사';
  if (BUILD_ENV === 'preview') return '아로로지스 기사 (Preview)';
  return '아로로지스 기사 (Dev)';
}

const appId = resolveAppId();

module.exports = {
  expo: {
    name: resolveAppName(),
    slug: 'arologis-driver',
    version: pkg.version,
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    assetBundlePatterns: ['**/*'],
    extra: {
      buildEnv: BUILD_ENV,
      appVersion: APP_DEVELOPMENT_VERSION,
      apiBaseUrl: resolveApiBaseUrl(),
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
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          '배송 도중 위치를 아로로지스 서버에 보고합니다 (foreground = 의무, 거부 시 어플 사용 불가).',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'background 위치 추적은 운영 시점 결정 — 본 PR (Phase 10.5) 시점은 선택입니다.',
        UIBackgroundModes: ['location'],
      },
    },
    android: {
      package: appId,
      versionCode: Number(BUILD_NUMBER),
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'READ_PHONE_NUMBERS',
        'READ_PHONE_STATE',
      ],
    },
    web: {
      bundler: 'metro',
    },
    plugins: [
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            '배송 도중 위치를 아로로지스 서버에 보고합니다 (foreground = 의무, background = 선택).',
        },
      ],
      'expo-font',
      'expo-secure-store',
    ],
  },
};
