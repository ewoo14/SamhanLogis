-- V27__add_slip_revisions.sql
-- Slip Service — 권한 재편 Phase 2.1: 전표(slip) full-snapshot 버전이력 + point-in-time 복원.
--
-- 컨텍스트 (spec docs/superpowers/specs/2026-05-29-slip-restore-version-history-design.md):
--   * 기존 slip_audit_logs(V18) = 필드 diff(old/new) 실시간 협업 overlay/SSE 채널 — 그대로 공존.
--   * 본 테이블 slip_revisions = 전표 헤더+라인 전체를 revision 별 JSONB 스냅샷으로 보관하고
--     특정 시점(revision)으로 통째 복원하는 단일 source-of-truth.
--   * 캡처 경로: CREATE(최초 rev 1) / EDIT(헤더·라인 변경) / RESTORE(복원). 편집과 동일 트랜잭션.
--
-- 컬럼 컨벤션 (BaseEntity 7 audit + Soft Delete):
--   * id UUID PK
--   * slip_id UUID NOT NULL — FK 미강제 (slip soft-delete 후에도 이력 보존, 회계 감사 일관)
--   * revision_no INT NOT NULL — slip 별 1 부터 단조 증가 (버전 번호)
--   * revision_type VARCHAR(16) NOT NULL — 'CREATE' / 'EDIT' / 'RESTORE'
--   * source_revision_no INT — RESTORE 시 복원 출처 revision (그 외 NULL)
--   * slip_no VARCHAR(40) — YYYY/MM/DD-{seqNo} 식별자 스냅샷 (표시용)
--   * slip_date DATE — 전표 날짜 스냅샷
--   * snapshot JSONB NOT NULL — SlipSnapshot DTO (헤더 전 필드 + 라인 배열) Jackson 직렬화
--   * actor_id UUID — 변경 주체 UUID (감사 추적용, 사용자 화면 노출 금지)
--   * actor_name VARCHAR(50) — 변경 주체 표시명 (UUID 비공개 가드)
--   * actor_color VARCHAR(20) — FE userIdToColor 결과 backup (HSL hex, optional)
--   * BaseEntity 7: created_at/created_by/modified_at/modified_by/deleted_at/deleted_by/is_deleted
--     (length/nullable 은 shared BaseEntity 매핑과 정합 — created_by VARCHAR(50) NOT NULL,
--      created_at TIMESTAMP NOT NULL (DB DEFAULT 미사용 — JPA @CreatedDate 가 채움))
--
-- 회귀 영향: 신규 테이블 — 기존 slips / slip_lines / slip_audit_logs IT 영향 0.

CREATE TABLE IF NOT EXISTS slip_revisions (
    id                  UUID         PRIMARY KEY,
    slip_id             UUID         NOT NULL,
    revision_no         INTEGER      NOT NULL,
    revision_type       VARCHAR(16)  NOT NULL,
    source_revision_no  INTEGER,
    slip_no             VARCHAR(40),
    slip_date           DATE,
    snapshot            JSONB        NOT NULL,
    actor_id            UUID,
    actor_name          VARCHAR(50),
    actor_color         VARCHAR(20),

    -- BaseEntity 7 audit (shared BaseEntity 매핑 정합)
    created_at          TIMESTAMP    NOT NULL,
    created_by          VARCHAR(50)  NOT NULL,
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE slip_revisions IS '전표 full-snapshot 버전이력 (Phase 2.1)';

COMMENT ON COLUMN slip_revisions.slip_id IS
    '대상 전표 UUID. FK 미강제 — slip soft-delete 후에도 버전이력 보존 (회계 감사 일관)';

COMMENT ON COLUMN slip_revisions.revision_no IS
    'slip 별 1 부터 단조 증가하는 버전 번호. max(revision_no)+1 채번';

COMMENT ON COLUMN slip_revisions.revision_type IS
    'CREATE(최초) / EDIT(헤더·라인 변경) / RESTORE(특정 시점 복원)';

COMMENT ON COLUMN slip_revisions.source_revision_no IS
    'RESTORE 시 복원 출처 revision_no. 그 외 NULL';

COMMENT ON COLUMN slip_revisions.snapshot IS
    'SlipSnapshot DTO (전표 헤더 전 필드 + 라인 배열) Jackson 직렬화 JSONB';

COMMENT ON COLUMN slip_revisions.actor_name IS
    'UUID 비공개 가드 — 사용자 화면 노출 식별자. actor_id (UUID) 와 분리';

-- slip 별 active revision_no 유일성 (soft-delete row 제외)
CREATE UNIQUE INDEX IF NOT EXISTS uq_slip_revisions_active
    ON slip_revisions (slip_id, revision_no)
    WHERE is_deleted = FALSE;

-- slip 별 버전 타임라인 (최신 우선) 조회 인덱스
CREATE INDEX IF NOT EXISTS ix_slip_revisions_slip
    ON slip_revisions (slip_id, revision_no DESC)
    WHERE is_deleted = FALSE;
