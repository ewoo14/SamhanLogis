/**
 * legacyMobile.ts — legacy partner-order index.html 모바일 viewport 분기 RN 변환.
 *
 * 출처 (DECISIONS Phase 6 정정 #16, F1 (a) legacy 100% 보존):
 *   - migration/source/scripts/partner-order/index.html
 *   - line 11   : `:root{ --c-bg:#fff; --c-line:#000; --c-muted:#6b7280; --c-strong:#111827; --c-accent:#2563eb; }`
 *   - line 12   : `.page-gate{ background:#020617; }`
 *   - line 14   : `.biz-box{ background:#0b1120; color:#e5e7eb; border-radius:16px; padding:24px 20px 20px; width:min(420px, calc(100% - 40px)); }`
 *   - line 119  : `.mobile-gate{ display:flex; flex-direction:column; gap:16px; margin:20px 0 12px }`
 *   - line 121  : `.select-big{ width:100%; height:150px; border:1px solid var(--c-line); border-radius:18px; font-weight:800; font-size:36px; }`
 *   - line 122  : `.select-home{background:#eef2ff;border-color:#c7d2fe} .select-single{background:#ecfeff;border-color:#a5f3fc} .select-comm{background:#fff7ed;border-color:#fed7aa} .select-old{background:#f3e8ff;border-color:#d8b4fe}`
 *   - line 175~ : `@media (max-width: 1280px) { ... }` 모바일 viewport 우선 layout
 *   - line 369  : 모바일 `.biz-box { width: calc(100% - 32px); max-width: 420px; padding: 24px 16px 20px; }`
 *   - line 376  : 모바일 `.biz-field-row input { height: 60px; font-size: 24px; }`
 *   - line 382  : 모바일 `.page-gate .btn { height: 60px; font-size: 22px; }`
 *   - line 685~ : `<div class="mobile-gate">` 4 카테고리 큰 진입 버튼 HTML
 *
 * RN 변환 원칙:
 *   - StyleSheet.create 로 1:1 매핑 (color/border/radius/padding/font 그대로)
 *   - @media 분기 대신 RN 의 모바일-only 환경 가정 (Web 의 `(max-width: 1280px)` 동작 그대로 RN 에 항상 적용)
 *   - View/Text/Pressable 만 사용 (외부 icon/svg 라이브러리 의존 X)
 *
 * UUID 미노출 — 본 파일은 스타일만 다루므로 식별자 노출 없음.
 */

import { StyleSheet } from 'react-native';

/**
 * legacy CSS 변수 1:1 매핑 (root :root{--c-*} 11 행).
 * v2 정정 — `tokens.ts` 의 legacy* 와 중복되지만 본 파일 안에서 self-contained 사용을 위해 노출.
 */
export const legacyVars = {
  cBg: '#FFFFFF',
  cLine: '#000000',
  cColSep: '#000000',
  cMuted: '#6B7280',
  cStrong: '#111827',
  cAccent: '#2563EB',
  /** legacy `.page-gate` 배경 (어두운) */
  gateBg: '#020617',
  /** legacy `.biz-box` 배경 (어두운 카드) */
  bizBoxBg: '#0B1120',
  /** legacy `.biz-box` 글자색 */
  bizText: '#E5E7EB',
  /** legacy `.biz-box` 보조 글자색 */
  bizMuted: '#9CA3AF',
  /** legacy `.biz-box` 가장 어두운 분리선 */
  bizDivider: '#1F2937',
  /** legacy biz-buttons .btn (#3b82f6) */
  bizButton: '#3B82F6',
  /** legacy biz-buttons cancel (#4b5563) */
  bizCancel: '#4B5563',
  /** legacy biz-button danger emoji */
  bizDanger: '#EF4444',
  /** legacy biz-title primary highlight (#60a5fa) */
  bizHeadline: '#60A5FA',
} as const;

/**
 * legacy `.select-big` 4 카테고리 큰 진입 버튼 색감.
 * 출처: index.html line 122.
 */
export const legacyCategoryColors = {
  /** select-home : `#eef2ff` 배경 + `#c7d2fe` 테두리 */
  home: { bg: '#EEF2FF', border: '#C7D2FE', text: '#3730A3' },
  /** select-single : `#ecfeff` 배경 + `#a5f3fc` 테두리 */
  single: { bg: '#ECFEFF', border: '#A5F3FC', text: '#0E7490' },
  /** select-comm : `#fff7ed` 배경 + `#fed7aa` 테두리 */
  comm: { bg: '#FFF7ED', border: '#FED7AA', text: '#9A3412' },
  /** select-old : `#f3e8ff` 배경 + `#d8b4fe` 테두리 */
  old: { bg: '#F3E8FF', border: '#D8B4FE', text: '#6B21A8' },
} as const;

/**
 * legacy `.page-gate` + `.biz-box` 모바일 layout RN StyleSheet.
 * 모바일에서는 `(max-width: 1280px)` 분기 적용된 .biz-title (28px) + input (60px h) 사용.
 */
export const legacyGateStyles = StyleSheet.create({
  /** `.page-gate` — position:fixed; inset:0; background:#020617; z-index:200000 */
  pageGate: {
    flex: 1,
    backgroundColor: legacyVars.gateBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** `.biz-box` 모바일 — width: calc(100% - 32px); max-width: 420px; padding: 24px 16px 20px */
  bizBox: {
    backgroundColor: legacyVars.bizBoxBg,
    borderRadius: 16,
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 20,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    marginHorizontal: 16,
  },
  /** 로고/타이틀 영역 (text-align:center; margin-bottom:12px) */
  logoBox: {
    alignItems: 'center',
    marginBottom: 12,
  },
  /** 로고 placeholder text (`삼한공조시스템 주문서` font-size:26px; font-weight:900; color:#60a5fa) */
  logoText: {
    fontSize: 26,
    fontWeight: '900',
    color: legacyVars.bizHeadline,
    lineHeight: 26 * 1.2,
    textAlign: 'center',
  },
  /** `.biz-title` 모바일 — font-size: 28px; (PC 기본 18px 에서 확대) */
  bizTitle: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '600',
    color: legacyVars.bizText,
    marginBottom: 20,
  },
  /** `.biz-field-row` (display:flex; gap:8px; margin-bottom:12px) */
  bizFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  /** `.biz-field-row input` 모바일 — height: 60px; font-size: 24px; padding: 0 10px; text-align: center; border-radius: 10px */
  bizInput: {
    flex: 1,
    height: 60,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: legacyVars.cLine,
    paddingHorizontal: 10,
    fontSize: 24,
    letterSpacing: -0.5,
    textAlign: 'center',
    backgroundColor: legacyVars.gateBg,
    color: legacyVars.bizText,
  },
  /** `.page-gate .btn` 모바일 — height: 60px; font-size: 22px; min-width:96px */
  bizButton: {
    height: 60,
    minWidth: 96,
    borderRadius: 10,
    backgroundColor: legacyVars.bizButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bizButtonDisabled: {
    backgroundColor: legacyVars.bizCancel,
    opacity: 0.7,
  },
  bizButtonLabel: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  /** 안내문 영역 — `margin-top:24px; padding-top:20px; border-top:1px solid #1f2937; text-align:left; font-size:13px; color:#9ca3af; line-height:1.5` */
  helpBlock: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: legacyVars.bizDivider,
  },
  helpTitle: {
    color: legacyVars.bizText,
    marginBottom: 4,
    fontWeight: '700',
    fontSize: 13,
  },
  helpText: {
    color: legacyVars.bizMuted,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    marginBottom: 12,
  },
  errorText: {
    color: legacyVars.bizDanger,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
    textAlign: 'center',
  },
});

/**
 * legacy `.mobile-gate` 4 카테고리 큰 진입 버튼 layout RN StyleSheet.
 * 출처: index.html line 119, 121, 122, 685~689.
 *
 * `.mobile-gate { display:flex; flex-direction:column; gap:16px; margin:20px 0 12px }`
 * `.select-big { width:100%; height:150px; border:1px solid var(--c-line); border-radius:18px; font-weight:800; font-size:36px; align-items:center; justify-content:center; text-align:center; line-height:1.2 }`
 */
export const legacyMobileGateStyles = StyleSheet.create({
  /** `.mobile-gate` 컨테이너 */
  mobileGate: {
    flexDirection: 'column',
    gap: 16,
    marginTop: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  /** `.select-big` 공통 */
  selectBig: {
    width: '100%',
    height: 150,
    borderWidth: 1,
    borderColor: legacyVars.cLine,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBigText: {
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 36 * 1.2,
    textAlign: 'center',
  },
  selectHome: {
    backgroundColor: legacyCategoryColors.home.bg,
    borderColor: legacyCategoryColors.home.border,
  },
  selectSingle: {
    backgroundColor: legacyCategoryColors.single.bg,
    borderColor: legacyCategoryColors.single.border,
  },
  selectComm: {
    backgroundColor: legacyCategoryColors.comm.bg,
    borderColor: legacyCategoryColors.comm.border,
  },
  selectOld: {
    backgroundColor: legacyCategoryColors.old.bg,
    borderColor: legacyCategoryColors.old.border,
  },
});

/**
 * legacy `.est-table` 모바일 (line 222~248) 테이블 셀 layout.
 * 모바일 분기에서 PC 의 colL/colM/colS/unit 숨김 + colD.mobile-only + price 만 노출.
 *
 * legacy 셀 스타일:
 *   `min-height:44px; font-size:14px; line-height:1.3; border-right:1px solid #e5e7eb; vertical-align:middle; padding:4px 3px; white-space:normal; word-break:break-all`
 */
export const legacyMobileTableStyles = StyleSheet.create({
  /** `.table-wrap` 모바일 — margin/padding 0, height 100%, overflow auto */
  tableWrap: {
    flex: 1,
    width: '100%',
  },
  /** `.est-table thead th` — sticky top, background #f9fafb, border-bottom 1px #000 */
  theadRow: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: legacyVars.cLine,
  },
  th: {
    minHeight: 44,
    paddingVertical: 4,
    paddingHorizontal: 3,
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    fontSize: 14,
    fontWeight: '700',
    color: legacyVars.cStrong,
    textAlign: 'center',
  },
  thLast: { borderRightWidth: 0 },
  tr: {
    flexDirection: 'row',
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  td: {
    minHeight: 44,
    paddingVertical: 4,
    paddingHorizontal: 3,
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    fontSize: 14,
    lineHeight: 14 * 1.3,
    color: legacyVars.cStrong,
    textAlign: 'center',
    justifyContent: 'center',
  },
  tdLast: { borderRightWidth: 0 },
  /** `.est-table td.colD.mobile-only` — text-align:left; padding-left:4px; font-weight:700 — 품목명 셀 */
  tdItemName: {
    flex: 4,
    paddingLeft: 4,
    textAlign: 'left',
    fontWeight: '700',
  },
  /** model 컬럼 width:30% */
  tdModel: { flex: 3 },
  /** qty 컬럼 width:10% */
  tdQty: { flex: 1 },
  /** price 컬럼 width:20% */
  tdPrice: { flex: 2, textAlign: 'right', paddingRight: 6 },
  /** `.qty-input` 모바일 — width:100%; height:32px; border:1px solid #ddd; text-align:center; border-radius:4px */
  qtyInput: {
    width: '100%',
    height: 32,
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 4,
    fontSize: 14,
    paddingHorizontal: 0,
    textAlign: 'center',
  },
});

/**
 * legacy `.mobile-handle-bar` + `.mobile-drawer` (상단/하단 메뉴 서랍) layout.
 * RN 에서는 동일한 fixed-position drawer 가 어렵기 때문에, 본 v2 에서는 BottomTab 으로 대체하되
 * legacy 색감/spacing 만 보존.
 */
export const legacyDrawerStyles = StyleSheet.create({
  /** `.mobile-handle-bar` — height:40px; background:#f8fafc; border:1px solid #cbd5e1; color:#475569; font-weight:bold; font-size:13px */
  handleBar: {
    height: 40,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleBarText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  /** `.mobile-drawer` — background:#fff; border:1px solid #cbd5e1; padding:12px */
  drawer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
  },
  /** `.btn-drawer-close` — height:40px; background:#f1f5f9; border:1px solid #e5e7eb; border-radius:8px; font-weight:bold; color:#4b5563 */
  drawerClose: {
    width: '100%',
    height: 40,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerCloseLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
  },
});

/**
 * legacy `.filter-search` (모바일) — width:100%; height:40px; padding-left:36px; background:#f1f5f9; font-size:16px.
 */
export const legacyFilterStyles = StyleSheet.create({
  filterSearch: {
    width: '100%',
    height: 40,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingLeft: 36,
    paddingRight: 10,
    fontSize: 16,
  },
  filterIcon: {
    position: 'absolute',
    left: 10,
    top: 12,
    fontSize: 16,
    color: legacyVars.cMuted,
  },
});
