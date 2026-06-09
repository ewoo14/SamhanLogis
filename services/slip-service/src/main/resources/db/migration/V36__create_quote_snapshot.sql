-- V36__create_quote_snapshot.sql
-- Slip Service — 종합견적서(웹) 견적 저장/불러오기 (Notion 견적 DB → 우리 DB 이식).
--
-- 개발책임자 지시(2026-06-09): "종합견적서에서 해당 견적서 데이터를 그대로 불러올 수 있어야 한다.
--   GAS 코드가 노션에 저장된 견적 데이터를 그대로 복원하는 것처럼." + "레거시가 조회하던
--   노션 페이지 데이터도 모두 시드/DB 이식 + 통신 호환 필요."
--
-- 컨텍스트:
--   * legacy 종합견적서 Code.js saveQuoteSnapshot(payload) (노션 DB 2fca1006... 페이지 생성) /
--     getQuoteHistory(startDate,endDate) (노션 쿼리) 를 우리 DB 로 1:1 대체.
--   * 정규화된 estimates 테이블과 별개 — GAS 는 종합견적서 UI 작업상태 "전체"를 base64 JSON blob
--     (data) + 미리보기 이미지(image) 로 통째 저장/복원했다. 본 테이블은 그 blob 을 그대로 보존하여
--     EXACT 복원(그대로 불러오기)을 보장한다. (구성품/옵션/DC/분기/서브파트 등 헤더+라인보다 풍부)
--   * 웹 estimate-app lib/code.js 계약:
--       POST /api/v1/estimates/snapshots  body {userEmail, createdAt, data, summary:{custName,...}, image?}
--       GET  /api/v1/estimates/snapshots?startDate&endDate&userEmail  → [{id, created, custName, data, image}]
--
-- 컬럼 컨벤션 (V13 estimates 계승): BaseEntity 7 audit + Soft Delete. blob 은 TEXT(대용량 base64).
--   * saved_at = 클라이언트 저장시각(payload.createdAt, GAS '저장일시') — 목록 날짜필터/표시(created) 기준.
--   * created_at/by(audit) 는 서버 영속 시각으로 별도 보존.
--
-- 회귀 영향: 신규 단일 테이블 — 기존 IT/테이블 영향 0.

----------------------------------------------------------------------
-- quote_snapshots — 종합견적서 저장 스냅샷 (UI 작업상태 blob)
----------------------------------------------------------------------
CREATE TABLE quote_snapshots (
    id              UUID         PRIMARY KEY,
    user_email      VARCHAR(255) NOT NULL,
    cust_name       VARCHAR(200),
    snapshot_data   TEXT         NOT NULL,
    preview_image   TEXT,
    saved_at        TIMESTAMP    NOT NULL,

    -- BaseEntity audit (plan §8) — estimates 와 동일 7 필드
    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE quote_snapshots IS
    '종합견적서(웹) 견적 저장/불러오기 — legacy 노션 견적 DB(saveQuoteSnapshot/getQuoteHistory) 대체. UI 작업상태 base64 JSON blob 그대로 보존하여 EXACT 복원';

COMMENT ON COLUMN quote_snapshots.user_email IS
    '저장 담당자 이메일 (legacy 노션 "담당자 계정") — 목록 조회 시 사용자별 필터 기준';

COMMENT ON COLUMN quote_snapshots.snapshot_data IS
    'legacy payload.data — 종합견적서 작업상태 전체를 JSON.stringify 후 base64 인코딩한 blob (그대로 복원용)';

COMMENT ON COLUMN quote_snapshots.preview_image IS
    'legacy payload.image — 견적 미리보기 이미지 base64 (선택)';

COMMENT ON COLUMN quote_snapshots.saved_at IS
    'legacy 노션 "저장일시"(payload.createdAt) — 목록 날짜필터/표시(created) 기준. audit created_at 과 별개';

-- 사용자별 최신순 목록 조회 가속 (getQuoteHistory: userEmail eq + saved_at 범위 + desc)
CREATE INDEX ix_quote_snapshots_user_saved_active
    ON quote_snapshots (user_email, saved_at DESC)
    WHERE is_deleted = FALSE;
