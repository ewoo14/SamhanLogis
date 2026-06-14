-- V48__strip_slip_no_zeros_revisions.sql
-- Slip Service — 전표번호 0제거 전역(PR #482 Phase 2)의 버전이력 누락분 보정.
--
-- 컨텍스트:
--   * V47__strip_slip_no_zeros.sql 이 slips.slip_no (+ serial_compensation_failures.slip_no) 의
--     순번부 선행 0 (2026/01/30-001 -> 2026/01/30-1) 을 제거했으나, 전표 버전이력 테이블
--     slip_revisions (V27) 는 미보정으로 남아 두 가지 결함을 유발했다.
--   * 결함 ① (표시): 버전이력 화면(SlipRevisionService.listWithSummary -> revision.getSlipNo())이
--     slip_revisions.slip_no 컬럼을 그대로 노출 -> 0-pad(...-001) 잔존.
--   * 결함 ② (데이터 손상): 복원(SlipRevisionService.restore -> Slip.restoreFromSnapshot)이
--     snapshot JSONB 의 slipNo 키를 slips.slip_no 로 역적용(Slip.java this.slipNo = snapshot.slipNo()).
--     V27 이전 캡처된 revision 의 snapshot 에 0-pad 가 남아 있으면, 복원 시 slips.slip_no 가
--     다시 0-pad 로 재오염(V47 효과 무효화)된다.
--
-- 보정 대상 (이 둘만 — 회계 allocation source_slip_no / 그룹웨어 attachment ref_slip_no /
--   회계전표 매출·매입 생성기 %04d 는 별도 확인 큐, 본 마이그레이션 범위 밖):
--   * slip_revisions.slip_no       (역정규화 사본 컬럼 — 화면 표시)
--   * slip_revisions.snapshot->>'slipNo' (JSONB 키 — 복원 source-of-truth)
--
-- 키 경로 확인:
--   * snapshot = SlipSnapshot record Jackson 직렬화. 필드명 slipNo + @JsonProperty 미사용
--     -> JSONB 최상위 키 = 'slipNo' (카멜케이스). 실 데이터 SELECT 로 키 경로 확인 완료.
--
-- 변환 규칙 (V47 과 동일 — 순번부만, 날짜부 0 보존):
--   * regexp '-0+([0-9])' -> '-\1'  (예: 2026/01/30-001 -> 2026/01/30-1)
--   * 날짜부(2026/01/30)의 0 은 '-' 직후가 아니므로 미변환 (dry-run 검증: 01/30 보존).
--
-- 적용 전 운영 데이터(slip_db) 실측: 전체 1919 revision 중 컬럼 6건 / snapshot 6건 오염
--   (동일 row, col_only=0·snap_only=0). unique 제약 없는 역정규화 사본이므로 충돌 불가.

-- ① 컬럼 보정 — 역정규화 사본 (버전이력 화면 표시용).
UPDATE slip_revisions
SET slip_no = regexp_replace(slip_no, '-0+([0-9])', '-\1')
WHERE slip_no ~ '-0[0-9]';

-- ② snapshot JSONB 보정 — 복원 source-of-truth.
--    snapshot->>'slipNo' 텍스트를 regexp 변환 후 to_jsonb(text) 로 다시 문자열 JSON 값으로 set.
--    (복원 시 Slip.restoreFromSnapshot 이 이 값을 slips.slip_no 로 역적용하므로 재오염 차단.)
UPDATE slip_revisions
SET snapshot = jsonb_set(
        snapshot,
        '{slipNo}',
        to_jsonb(regexp_replace(snapshot->>'slipNo', '-0+([0-9])', '-\1'))
    )
WHERE snapshot->>'slipNo' ~ '-0[0-9]';
