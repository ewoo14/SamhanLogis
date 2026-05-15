/**
 * arologis-mobile theme tokens — D-AX-15 driver dashboard/GPS 이식.
 *
 * `clients/web/design-system/src/tokens/tokens.css` 의 W3+W4+W5+post-W5+W10-1 토큰을 RN StyleSheet
 * 친화적 JS 객체로 1:1 복제. RGB 값 동등 (web/design-system tokens.css 의 :root scope 와 1:1).
 *
 * 사용 위치:
 *   - `src/screens/driver/*` 의 RN native UI 에서 inline style 로 직접 인용.
 *
 * 출처 토큰 (web tokens.css line 번호):
 *   - slate / surface / ink (post-W5 sales-form-polish-slice)
 *   - method GET/POST/PUT/DELETE (W3 dashboard, Google Material 컬러)
 *   - badge ok/warn/info/new (W3 dashboard, status badge)
 *   - channel push/email/sms (W4 notification 3 channel)
 *   - slice accent success/pending/deferred (post-W5 D-W5-2)
 *   - unparsed peach (W10-1 KakaoDispatchParser group label)
 *
 * Designer-2 채택 (2026-05-07) — 사용자 결정 5 "W3+W4+W5+post-W5+W10-1 토큰 1:1 복제 의무".
 */

export const colors = {
  // ---------- post-W5 surface / ink (sales-form-polish-slice) ----------
  surface: {
    app:          '#FAFBFC',
    card:         '#FFFFFF',
    subtle:       '#F4F6F8',
    hover:        '#F4F6F8',
    selected:     '#EFF6FF',
    selectedHover:'#E0EAFB',
  },
  ink: {
    primary:    '#1A1F2E',
    secondary:  '#5C6773',
    tertiary:   '#8A95A4',
    onPrimary:  '#FFFFFF',
  },
  line: {
    default:  '#E1E5EA',
    hover:    '#C9D1D9',
    focus:    '#3B82F6',
    selected: '#3B82F6',
  },
  action: {
    brand:       '#1E40AF',
    brandHover:  '#1D4ED8',
    brandActive: '#1E3A8A',
    brandSubtle: '#DBEAFE',
  },
  state: {
    success:    '#10B981',
    successBg:  '#D1FAE5',
    danger:     '#EF4444',
    dangerBg:   '#FEE2E2',
    warning:    '#F59E0B',
    warningBg:  '#FEF3C7',
    info:       '#3B82F6',
    infoBg:     '#DBEAFE',
  },

  // ---------- W3 dashboard — Google Material method 컬러 ----------
  method: {
    GET:    '#0f9d58',
    POST:   '#1a73e8',
    PUT:    '#f9ab00',
    DELETE: '#d93025',
  },

  // ---------- W3 dashboard — status badge (b-ok / b-warn / b-info / b-new) ----------
  badge: {
    ok:   '#34a853',  // Google Material Green
    warn: '#f9ab00',  // Google Material Yellow
    info: '#1a73e8',  // Google Material Blue
    new:  '#5f6368',  // Google Material Gray
  },

  // ---------- W4 notification — 3 channel badge (PUSH / EMAIL / SMS) ----------
  channel: {
    push:  '#4285f4',  // Google Material Blue
    email: '#ea4335',  // Google Material Red
    sms:   '#34a853',  // Google Material Green
  },

  // ---------- post-W5 — slice accent 3색 (D-W5-2) ----------
  sliceAccent: {
    success:  '#34a853',  // Google Material Green — 완료 / 통과
    pending:  '#f9ab00',  // Google Material Yellow — 진행 / 대기
    deferred: '#5f6368',  // Google Material Gray — 위임 / backlog
  },

  // ---------- W10-1 — KakaoDispatchParser 미해석 group label (b-unparsed peach) ----------
  unparsed: {
    bg: '#f6c89e',
    fg: '#5a3a17',
  },

  // ---------- brand (legacy 호환, web tokens.css :root 동일) ----------
  brand: {
    50:  '#EFF6FB',
    100: '#D7E8F4',
    200: '#AECFE7',
    300: '#7FB1D5',
    400: '#5093C0',
    500: '#2D77A8',
    600: '#235F88',
    700: '#1B4A6B',
    800: '#15394F',
    900: '#0F2939',
  },
} as const;

export const spacing = {
  0:  0,
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
  10: 40,
} as const;

export const radii = {
  none:   0,
  sm:     4,
  md:     8,
  lg:     12,
  xl:     16,
  full:   9999,
  badge:  4,
  card:   8,
  button: 4,
  modal:  8,
} as const;

export const typography = {
  fontFamily: {
    // Pretendard self-host — usePretendardFontGuarded() 의 useFonts 가 등록한 family 이름.
    sans: 'Pretendard',
    mono: 'D2Coding',
  },
  fontSize: {
    xs:    12,
    sm:    13,
    base:  14,
    md:    15,
    lg:    16,
    xl:    18,
    xxl:   22,
    '2xl': 22,
    h1:    24,
  },
  fontWeight: {
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },
  lineHeight: {
    tight:   1.25,
    base:    1.5,
    relaxed: 1.75,
  },
} as const;

/**
 * status badge 헬퍼 — RN UI 에서 b-ok / b-warn / b-info / b-new / slice-accent-* / b-channel-* /
 * b-unparsed CSS class 와 1:1 매핑되는 inline style 객체.
 *
 * 사용 (예):
 *   <Text style={badgeStyle('ok')}>완료</Text>
 *   <Text style={badgeStyle('channelPush')}>PUSH</Text>
 */
export type BadgeKind =
  | 'ok' | 'warn' | 'info' | 'new'
  | 'channelPush' | 'channelEmail' | 'channelSms'
  | 'sliceSuccess' | 'slicePending' | 'sliceDeferred'
  | 'unparsed';

const BADGE_BG_MAP: Record<BadgeKind, string> = {
  ok:            colors.badge.ok,
  warn:          colors.badge.warn,
  info:          colors.badge.info,
  new:           colors.badge.new,
  channelPush:   colors.channel.push,
  channelEmail:  colors.channel.email,
  channelSms:    colors.channel.sms,
  sliceSuccess:  colors.sliceAccent.success,
  slicePending:  colors.sliceAccent.pending,
  sliceDeferred: colors.sliceAccent.deferred,
  unparsed:      colors.unparsed.bg,
};

const BADGE_FG_MAP: Record<BadgeKind, string> = {
  ok:            '#fff',
  warn:          '#fff',
  info:          '#fff',
  new:           '#fff',
  channelPush:   '#fff',
  channelEmail:  '#fff',
  channelSms:    '#fff',
  sliceSuccess:  '#fff',
  slicePending:  '#fff',
  sliceDeferred: '#fff',
  unparsed:      colors.unparsed.fg,
};

export function badgeStyle(kind: BadgeKind) {
  return {
    backgroundColor: BADGE_BG_MAP[kind],
    color: BADGE_FG_MAP[kind],
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radii.badge,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    overflow: 'hidden' as const,
  };
}

/**
 * 정차 상태 (StopStatus) 별 badge 매핑. arologis-service 의 StopStatus enum 5값 1:1.
 */
export const STOP_STATUS_BADGE: Record<string, BadgeKind> = {
  PENDING:   'slicePending',
  ARRIVED:   'info',
  DELIVERED: 'sliceSuccess',
  FAILED:    'sliceDeferred',
  UNPARSED:  'unparsed',
};
