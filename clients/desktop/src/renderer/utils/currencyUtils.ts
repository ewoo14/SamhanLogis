/**
 * 통화 포맷 공용 유틸 — 한국 회계 표준 (SP-08-6-5 FE 결함 5).
 *
 * 사용 페이지: DailyClosingPage / GeneralLedgerPage.
 * 음수 표기를 `△ 1,234` (한국 회계 표준) 로 통일.
 *
 * DailyClosingPage 의 기존 fmtKrw 는 음수 처리 없이 `—` 반환하므로
 * 이 공용 버전으로 교체 시 음수 잔액이 올바르게 표시됨.
 */

/**
 * KRW BigDecimal string → 한국 회계 표준 포맷.
 *
 * - `null` / `undefined` / 빈 문자열 → "—"
 * - 0 → "—"
 * - 양수 → "1,234,567"
 * - 음수 → "△ 1,234,567" (한국 회계 표준 삼각형 prefix)
 */
export function fmtKrw(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  if (n === 0) return '—'
  if (n < 0) return `△ ${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`
  return Math.round(n).toLocaleString('ko-KR')
}
