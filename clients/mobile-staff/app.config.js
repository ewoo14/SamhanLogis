/**
 * app.config.js — mobile-staff 동적 Expo 설정 (P1-4 영업 native 앱 분기 포함).
 *
 * D-AX-19 부터 app.config.js 가 Expo 설정의 단일 source of truth 이다.
 * 정적 app.json 병행 시 expo-doctor 경고가 발생하므로 본 파일만 유지한다.
 *
 * 환경변수 체계:
 *   - EXPO_PUBLIC_*   — Expo Metro 번들 시점 클라이언트 노출 (process.env.EXPO_PUBLIC_*)
 *   - BUILD_ENV       — CI / EAS 빌드 환경 구분 ("development" | "preview" | "production")
 *   - APP_VARIANT     — 앱 분기 ("staff" = 영업 견적 WebView, P1-4 분리 시 "sales" 추가 예정)
 *
 * P1-4 영업 native 앱 로드맵:
 *   Phase 11+1개월 후 APP_VARIANT="sales" 로 영업 전용 번들 분리 예정.
 *   현재는 APP_VARIANT="staff" (default) 로 estimate WebView 단일 운영.
 *
 * EAS Build 프로파일 → eas.json 참조.
 *
 * 버전 채번:
 *   - version       — package.json 과 1:1 (semver, 마켓 메타데이터).
 *   - extra.appVersion — EXPO_PUBLIC_APP_VERSION로 주입하는 정책용 개발 버전.
 *   - buildNumber   — iOS CFBundleVersion (빌드마다 단조 증가, CI 에서 EXPO_BUILD_NUMBER 주입).
 *   - versionCode   — Android versionCode (동일 환경변수 사용).
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('./package.json');
const { resolveBuildAppVersion } = require('../../scripts/app-build-version.cjs');

const BUILD_ENV  = process.env.BUILD_ENV  || 'development';
const APP_DEVELOPMENT_VERSION = resolveBuildAppVersion({ variable: 'EXPO_PUBLIC_APP_VERSION' });
const APP_VARIANT = process.env.APP_VARIANT || 'staff';

/** EAS Build 시 CI 가 EXPO_BUILD_NUMBER=<n> 을 주입한다. 로컬 기본값 = 1. */
const BUILD_NUMBER = process.env.EXPO_BUILD_NUMBER || '1';
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || 'PLACEHOLDER_EAS_PROJECT_ID';
const HAS_EAS_PROJECT_ID = EAS_PROJECT_ID !== 'PLACEHOLDER_EAS_PROJECT_ID';
const EAS_UPDATE_URL =
  process.env.EXPO_PUBLIC_EAS_UPDATE_URL || `https://u.expo.dev/${EAS_PROJECT_ID}`;

/**
 * 빌드 환경별 API base URL 결정.
 *   - EXPO_PUBLIC_API_BASE_URL 명시 시 우선 사용.
 *   - 미지정 시 BUILD_ENV 로 fallback.
 */
function resolveApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) return process.env.EXPO_PUBLIC_API_BASE_URL;
  if (BUILD_ENV === 'production') return 'https://api.samhan-air.com';
  if (BUILD_ENV === 'preview')    return 'https://api-stg.samhan-air.com';   // Phase 11 스테이징 (미구성, 미래 예약)
  return 'http://localhost:8080';
}

/**
 * estimate-app v2 URL 결정.
 *   - EXPO_PUBLIC_ESTIMATE_APP_URL 명시 시 우선.
 *   - 미지정 시 BUILD_ENV 로 fallback.
 */
function resolveEstimateAppUrl() {
  if (process.env.EXPO_PUBLIC_ESTIMATE_APP_URL) return process.env.EXPO_PUBLIC_ESTIMATE_APP_URL;
  if (BUILD_ENV === 'production') return 'https://estimate.samhan-air.com/';
  if (BUILD_ENV === 'preview')    return 'https://estimate-stg.samhan-air.com/';  // 미구성, 미래 예약
  return 'http://localhost:5183/';
}

/**
 * iOS bundleIdentifier / Android package 결정.
 *   - production  = com.samhan.estimate (App Store / Play Store 정식)
 *   - preview     = com.samhan.estimate.preview (TestFlight / 내부 트랙)
 *   - development = com.samhan.estimate.dev (시뮬레이터 / 디버그 기기)
 *
 * APP_VARIANT="sales" 분기 시 com.samhan.sales.* 로 분리 예정 (P1-4 Phase 11+1).
 */
function resolveAppId() {
  const base = APP_VARIANT === 'sales' ? 'com.samhan.sales' : 'com.samhan.estimate';
  if (BUILD_ENV === 'production') return base;
  if (BUILD_ENV === 'preview')    return `${base}.preview`;
  return `${base}.dev`;
}

/**
 * 앱 표시 이름 결정.
 *   - production  : 삼한공조 견적
 *   - preview     : 삼한공조 견적 (Preview)
 *   - development : 삼한공조 견적 (Dev)
 */
function resolveAppName() {
  const base = APP_VARIANT === 'sales' ? '삼한공조 영업' : '삼한공조 견적';
  if (BUILD_ENV === 'production') return base;
  if (BUILD_ENV === 'preview')    return `${base} (Preview)`;
  return `${base} (Dev)`;
}

const appId = resolveAppId();

module.exports = {
  expo: {
    name:    resolveAppName(),
    slug:    'samhan-estimate',          // EAS slug 는 변경 금지 (projectId 연결)
    version: pkg.version,
    owner:   'samhanlogis',              // EAS 조직 계정 (Phase 11 EAS 계정 등록 시 활성)

    orientation:         'portrait',
    userInterfaceStyle:  'light',
    newArchEnabled:      true,
    assetBundlePatterns: ['**/*'],

    // ------------------------------------------------------------------ //
    //  extra — Expo Constants.expoConfig.extra 로 런타임 노출               //
    //  (EXPO_PUBLIC_* 와 중복이지만, 동적 계산값 / 비공개 config 분리용)       //
    // ------------------------------------------------------------------ //
    extra: {
      buildEnv:        BUILD_ENV,
      appVersion:      APP_DEVELOPMENT_VERSION,
      appVariant:      APP_VARIANT,
      apiBaseUrl:      resolveApiBaseUrl(),
      estimateAppUrl:  resolveEstimateAppUrl(),
      easUpdateUrl:    EAS_UPDATE_URL,

      // EAS 프로젝트 ID — Phase 11 EAS 계정 등록 후 실제 ID 로 교체.
      // `npx eas init` 실행 시 자동 기록 또는 eas.json 의 projectId 와 일치시킬 것.
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },

    // ------------------------------------------------------------------ //
    //  업데이트 (EAS Update) — EAS 계정/projectId 연동 후 활성.               //
    //  현재는 placeholder URL 을 유지하되 enabled=false 로 publish 를 게이트.  //
    // ------------------------------------------------------------------ //
    updates: {
      enabled:        BUILD_ENV !== 'development' && HAS_EAS_PROJECT_ID,
      url:            EAS_UPDATE_URL,
      fallbackToCacheTimeout: 0,
    },

    runtimeVersion: {
      policy: 'appVersion',
    },

    ios: {
      supportsTablet:     false,
      bundleIdentifier:   appId,
      buildNumber:        BUILD_NUMBER,
      infoPlist: {
        NSCameraUsageDescription:
          '견적 현장 사진 촬영을 위해 카메라를 사용합니다 (거부 시 갤러리 / 파일 첨부만 사용 가능).',
        NSPhotoLibraryUsageDescription:
          '갤러리에서 견적 현장 사진을 선택해 첨부합니다.',
        NSPhotoLibraryAddUsageDescription:
          '촬영한 견적 현장 사진을 선택적으로 갤러리에 저장합니다.',
      },
    },

    android: {
      package:     appId,
      versionCode: Number(BUILD_NUMBER),
      permissions: [
        'CAMERA',
        'READ_EXTERNAL_STORAGE',
        'READ_MEDIA_IMAGES',
      ],
    },

    web: {
      bundler: 'metro',
    },

    plugins: [
      [
        'expo-font',
        {
          fonts: [
            './assets/fonts/Pretendard-Regular.otf',
            './assets/fonts/Pretendard-Medium.otf',
            './assets/fonts/Pretendard-SemiBold.otf',
            './assets/fonts/Pretendard-Bold.otf',
          ],
        },
      ],
      [
        'expo-image-picker',
        {
          cameraPermission:
            '견적 현장 사진 촬영을 위해 카메라를 사용합니다 (거부 시 갤러리 / 파일 첨부만 사용 가능).',
          photosPermission:
            '갤러리에서 견적 현장 사진을 선택해 첨부합니다.',
          microphonePermission: false,
        },
      ],
    ],
  },
};
