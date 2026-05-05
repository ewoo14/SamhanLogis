/**
 * SamhanLogis mobile-staff — DS tokens RN 호환 변환.
 *
 * Mobile v4 (`clients/mobile/src/tokens/tokens.ts`) 와 동일 token 재사용.
 * 출처:
 *   - clients/web/design-system/src/tokens/index.ts (TS 객체)
 *   - clients/web/design-system/src/tokens/tokens.css (CSS variables)
 *
 * mobile-staff (영업직원) 와 mobile (거래처) 가 같은 brand identity 공유 — token 분기 없음.
 */

/* eslint-disable @typescript-eslint/no-magic-numbers */

/**
 * 색상 토큰. DS brand/neutral/semantic + legacy partner-order 호환.
 */
export const colors = {
  // ── DS brand ────────────────────────────────────────────────
  brand50: '#EFF6FB',
  brand100: '#D7E8F4',
  brand200: '#AECFE7',
  brand300: '#7FB1D5',
  brand400: '#5093C0',
  brand500: '#2D77A8', // primary
  brand600: '#235F88',
  brand700: '#1B4A6B',
  brand800: '#15394F',
  brand900: '#0F2939',

  // ── DS neutral ─────────────────────────────────────────────
  neutral0: '#FFFFFF',
  neutral50: '#F7F8FA',
  neutral100: '#EDF0F4',
  neutral200: '#D6DCE3',
  neutral300: '#B8C0CB',
  neutral400: '#8E97A4',
  neutral500: '#6B7280',
  neutral600: '#4D5562',
  neutral700: '#363D49',
  neutral800: '#22272F',
  neutral900: '#0F1216',

  // ── semantic ───────────────────────────────────────────────
  success: '#2A9D8F',
  warning: '#E9A53D',
  danger: '#D6504A',
  info: '#3F7DB8',

  // ── 의미 alias (DS surfaces) ───────────────────────────────
  bg: '#FFFFFF',
  bgSubtle: '#F7F8FA',
  bgMuted: '#EDF0F4',
  border: '#D6DCE3',
  borderStrong: '#B8C0CB',
  text: '#0F1216',
  textMuted: '#4D5562',
  textSubtle: '#6B7280',
  textOnBrand: '#FFFFFF',

  // ── 영업직원 전용 (mobile-staff 만 사용) ────────────────────
  /** StaffLogin 게이트 배경 (Mobile v4 BizGate `gateBg` 와 다름 — 밝은 톤) */
  staffGateBg: '#F1F5F9',
  /** Staff card surface */
  staffCardBg: '#FFFFFF',
  /** Staff brand badge */
  staffBadgeBg: '#DBEAFE',
  staffBadgeText: '#1E40AF',
} as const;

/**
 * spacing 토큰. DS 와 동일 4-base scale.
 */
export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

/**
 * fontSize 토큰. DS scale.
 */
export const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 16,
  xl: 18,
  '2xl': 22,
  '3xl': 28,
  '4xl': 34,
} as const;

/**
 * fontWeight 토큰 (RN 호환: string).
 */
export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
} as const;

/**
 * lineHeight 토큰 (배수 — fontSize 와 곱하여 사용).
 */
export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.7,
} as const;

/**
 * radii 토큰. DS 와 동일.
 */
export const radii = {
  none: 0,
  sm: 2,
  md: 4,
  lg: 8,
  xl: 12,
  full: 9999,
} as const;

/**
 * RN shadow 헬퍼 (iOS shadowColor + Android elevation).
 */
export const shadows = {
  sm: {
    shadowColor: '#0F1216',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F1216',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0F1216',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type FontSize = typeof fontSize;
