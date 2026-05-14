/**
 * arologis-mobile theme tokens — Phase 10.5 신규.
 *
 * `clients/mobile-staff/src/theme/tokens.ts` 의 W3+W4+W5+post-W5+W10-1 토큰을 복제.
 * Designer-2 채택 (2026-05-07) 정책 일치 — 양 모바일 어플이 동일 디자인 시스템 공유.
 *
 * 본 어플 (driver 단일) 에서 실제 사용되는 토큰만 우선 채택 — 후속 슬라이스 (Designer D2~D3)
 * 에서 디자인 mock 검증 후 미사용 토큰 정리.
 */

export const colors = {
  surface: {
    app: '#FAFBFC',
    card: '#FFFFFF',
    subtle: '#F4F6F8',
  },
  ink: {
    primary: '#1A1F2E',
    secondary: '#5C6773',
    tertiary: '#8A95A4',
    onPrimary: '#FFFFFF',
  },
  line: {
    default: '#E1E5EA',
    focus: '#3B82F6',
  },
  action: {
    brand: '#1E40AF',
    brandHover: '#1D4ED8',
    brandActive: '#1E3A8A',
    brandSubtle: '#DBEAFE',
  },
  state: {
    success: '#10B981',
    successBg: '#D1FAE5',
    danger: '#EF4444',
    dangerBg: '#FEE2E2',
    warning: '#F59E0B',
    warningBg: '#FEF3C7',
    info: '#3B82F6',
    infoBg: '#DBEAFE',
  },
  brand: {
    500: '#2D77A8',
    600: '#235F88',
    700: '#1B4A6B',
    800: '#15394F',
    900: '#0F2939',
  },
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radii = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
} as const;

export const typography = {
  fontFamily: {
    sans: 'Pretendard',
  },
  fontSize: {
    xs: 12,
    sm: 13,
    base: 14,
    lg: 16,
    xl: 18,
    '2xl': 22,
  },
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;
