/**
 * SamhanLogis Mobile — DS tokens RN 호환 변환.
 *
 * 출처:
 *   - clients/web/design-system/src/tokens/index.ts (TS 객체)
 *   - clients/web/design-system/src/tokens/tokens.css (CSS variables)
 *
 * 변환 원칙:
 *   - 색상값은 hard-coding (RN 환경은 CSS load 불가)
 *   - spacing/fontSize 는 number 로 변환 (RN StyleSheet 는 unit-less number = dp/px)
 *   - F1 (a) legacy partner-order 100% 보존 — `--c-bg`, `--c-line`, `--c-accent`,
 *     `#020617` (gate 배경), `#0b1120` (biz-box) 도 함께 노출
 *
 * 사용:
 *   import { colors, spacing, fontSize } from '@/tokens/tokens';
 *   const styles = StyleSheet.create({ box: { backgroundColor: colors.bg, padding: spacing.md } });
 */

/* eslint-disable @typescript-eslint/no-magic-numbers */

/**
 * 색상 토큰. DS brand/neutral/semantic + legacy partner-order 호환.
 * legacy 원본: migration/source/scripts/partner-order/index.html `:root{--c-*}` 11~12행.
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

  // ── legacy partner-order 보존 (F1 a) ───────────────────────
  /** legacy `--c-bg` */
  legacyBg: '#FFFFFF',
  /** legacy `--c-line` (테두리) */
  legacyLine: '#000000',
  /** legacy `--c-accent` (focus / 버튼) */
  legacyAccent: '#2563EB',
  /** legacy `--c-muted` */
  legacyMuted: '#6B7280',
  /** legacy `--c-strong` */
  legacyStrong: '#111827',
  /** legacy `.page-gate` 배경 (어두운 BizGate) */
  gateBg: '#020617',
  /** legacy `.biz-box` 배경 */
  bizBoxBg: '#0B1120',
  /** legacy `.biz-buttons .btn` (3b82f6 — partner-order 전용) */
  bizButton: '#3B82F6',
  /** legacy biz-box text */
  bizText: '#E5E7EB',
} as const;

/**
 * spacing 토큰. DS 와 동일 4-base scale.
 * RN StyleSheet 는 unit-less number 이므로 px 단위 string 대신 number.
 */
export const spacing = {
  none: 0,
  xs: 4, // DS --space-1
  sm: 8, // DS --space-2
  md: 12, // DS --space-3
  base: 16, // DS --space-4
  lg: 20, // DS --space-5
  xl: 24, // DS --space-6
  '2xl': 32, // DS --space-8
  '3xl': 40, // DS --space-10
  '4xl': 48, // DS --space-12
} as const;

/**
 * fontSize 토큰. DS scale.
 * RN 의 fontSize 는 dp 기반 number.
 */
export const fontSize = {
  xs: 12,
  sm: 13,
  base: 14, // 한국어 본문 기본
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

/**
 * 카테고리 색상 (legacy partner-order 의 4 카테고리).
 * 출처: legacy index.html `.opts` 의 4 카테고리 chip color.
 */
export const categoryColors = {
  HW: '#3B82F6', // 원자재
  ACC: '#10B981', // 부속품
  ETC: '#F59E0B', // 기타
  CTRL: '#8B5CF6', // 컨트롤러
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type FontSize = typeof fontSize;
