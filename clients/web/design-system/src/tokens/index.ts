/**
 * @samhan/design-system tokens
 *
 * Single source of truth for SamhanLogis brand visual tokens.
 * Mirrors `tokens.css` (CSS custom properties) for runtime theming.
 *
 * Brand palette derived from samhan-air.com (cool blue-grey, suitable for
 * an HVAC + logistics enterprise tool).
 */

export const colors = {
  brand: {
    50:  '#EFF6FB',
    100: '#D7E8F4',
    200: '#AECFE7',
    300: '#7FB1D5',
    400: '#5093C0',
    500: '#2D77A8', // primary
    600: '#235F88',
    700: '#1B4A6B',
    800: '#15394F',
    900: '#0F2939',
  },
  neutral: {
    0:   '#FFFFFF',
    50:  '#F7F8FA',
    100: '#EDF0F4',
    200: '#D6DCE3',
    300: '#B8C0CB',
    400: '#8E97A4',
    500: '#6B7280',
    600: '#4D5562',
    700: '#363D49',
    800: '#22272F',
    900: '#0F1216',
  },
  success: {
    50: '#ecfdf5',
    200: '#a7f3d0',
    500: '#10b981',
    700: '#047857',
    DEFAULT: '#2A9D8F',
  },
  warning: {
    50: '#FEF6E7',
    200: '#F8DA9A',
    300: '#F1C268',
    500: '#E9A53D',
    700: '#B47A1F',
    800: '#8C5C13',
    DEFAULT: '#E9A53D',
  },
  danger: {
    50: '#FFF1F1',
    200: '#FECACA',
    300: '#FCA5A5',
    500: '#D6504A',
    700: '#991B1B',
    800: '#7F1D1D',
    DEFAULT: '#D6504A',
  },
  semantic: {
    success: '#2A9D8F',
    warning: '#E9A53D',
    danger:  '#D6504A',
    info:    '#3F7DB8',
  },
  /** 국세청(NTS) 전자세금계산서 전용 — 일반 success(청록) 와 구분. SP-09-1 */
  nts: {
    primary: '#0F6523',
    bg:      '#F0FDF4',
    border:  '#BBF7D0',
    text:    '#14532D',
  },
  /**
   * Aligo SMS 전용 — teal 계열. SP-09-2
   * NTS(#0F6523) / Clova(#03C75A) / KFTC(#0061A8) 와 4색 시각 구분.
   * WCAG AA: text(#074B47) on 50(#F0FDFC) ≈ 9.1:1 (AAA 충족)
   */
  aligo: {
    primary: '#0F766E',
    50:      '#F0FDFC',
    100:     '#CCFBF1',
    200:     '#99F6E4',
    700:     '#0D6460',
    text:    '#074B47',
  },
  /**
   * Naver Clova OCR 전용 — Naver 공식 녹색 계열. SP-09-3
   * NTS(#0F6523) / Aligo teal(#0F766E) / success(#2A9D8F) 과 시각 구분.
   * WCAG: text(#014A22) on 50(#F0FDF6) ≈ 10.8:1 (AAA)
   */
  clova: {
    primary: '#03C75A',
    50:      '#F0FDF6',
    100:     '#DCFCE8',
    200:     '#BBF7D0',
    700:     '#02A04B',
    text:    '#014A22',
  },
  /**
   * 한국금융결제원(KFTC) 오픈뱅킹 전용. SP-09-4
   * NTS(#0F6523) / Aligo(#0F766E) / Clova(#03C75A) 와 4색 시각 구분.
   * WCAG AA: text(#003662) on 50(#EEF6FF) ≈ 9.4:1 (AAA 충족)
   */
  kftc: {
    primary: '#0061A8',
    50:      '#EEF6FF',
    100:     '#DBEAFE',
    200:     '#BFDBFE',
    700:     '#004D85',
    text:    '#003662',
  },
  /**
   * 인성데이타 퀵프로그램 vendor 전용 — 주황-갈색 계열. SP-10-2
   * NTS(#0F6523) / Aligo(#0F766E) / Clova(#03C75A) / KFTC(#0061A8) 와 5색 시각 구분.
   * 색조: INSUNG(30°) ↔ 최근접 NTS(135°) = 105° 차이. 색맹(deuteranopia) 에서도 명확 구분.
   * WCAG AA: text(#431407) on 50(#FFF7ED) ≈ 10.2:1 (AAA 충족)
   */
  insung: {
    primary: '#B45309',
    50:      '#FFF7ED',
    100:     '#FFEDD5',
    200:     '#FED7AA',
    700:     '#92400E',
    text:    '#431407',
  },
} as const

export const typography = {
  fontFamily: {
    sans: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans KR", sans-serif',
    mono: 'ui-monospace, "SFMono-Regular", "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
  fontSize: {
    xs:    '12px',
    sm:    '13px',
    base:  '14px', // 한국어 본문 기본
    md:    '15px',
    lg:    '16px',
    xl:    '18px',
    '2xl': '22px',
    '3xl': '28px',
    '4xl': '34px',
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const

export const spacing = {
  0:  '0',
  1:  '4px',
  2:  '8px',
  3:  '12px',
  4:  '16px',
  5:  '20px',
  6:  '24px',
  8:  '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
} as const

export const radii = {
  none: '0',
  sm:   '2px',
  md:   '4px',
  lg:   '8px',
  xl:   '12px',
  full: '9999px',
} as const

export const shadows = {
  sm:    '0 1px 2px rgba(15, 18, 22, 0.06)',
  md:    '0 2px 6px rgba(15, 18, 22, 0.08)',
  lg:    '0 8px 20px rgba(15, 18, 22, 0.12)',
  modal: '0 24px 48px rgba(15, 18, 22, 0.20)',
} as const

export const durations = {
  fast: '120ms',
  base: '180ms',
  slow: '280ms',
} as const

export const breakpoints = {
  sm:    '640px',
  md:    '768px',
  lg:    '1024px',
  xl:    '1280px',
  '2xl': '1536px',
} as const

export type Tokens = {
  colors: typeof colors
  typography: typeof typography
  spacing: typeof spacing
  radii: typeof radii
  shadows: typeof shadows
  durations: typeof durations
  breakpoints: typeof breakpoints
}

export const tokens: Tokens = {
  colors,
  typography,
  spacing,
  radii,
  shadows,
  durations,
  breakpoints,
}

export type SpacingKey = keyof typeof spacing
export type RadiusKey = keyof typeof radii
export type ShadowKey = keyof typeof shadows
export type FontSizeKey = keyof typeof typography.fontSize
