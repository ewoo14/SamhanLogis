-- V7__add_partner_order_revisions.sql
-- Phase 2.4 — partner-order full-snapshot 버전이력 테이블 신설.
-- slip(2.1)/estimate(2.2)/partner(2.3) revisions 패턴 미러.
-- BaseEntity 7 audit 컬럼 컨벤션: V1__init_partner_order.sql 과 동일 타입/네이밍/기본값.
-- snapshot JSONB: 헤더+라인 전체 full-snapshot (Jackson 직렬화, @JdbcTypeCode(SqlTypes.JSON)).
-- revision_type: CREATE / EDIT / STATUS / RESTORE / DELETE
-- revision_no: partner_order 별 독립 단조증가 채번 (partner_orders.revision_count 와 별개).

CREATE TABLE partner_order_revisions (
    id                  UUID         PRIMARY KEY,
    partner_order_id    UUID         NOT NULL,        -- FK 미강제: soft-delete 후에도 버전이력 보존
    revision_no         INT          NOT NULL,        -- order 별 단조증가 (1, 2, 3, ...)
    revision_type       VARCHAR(16)  NOT NULL,        -- CREATE / EDIT / STATUS / RESTORE / DELETE
    source_revision_no  INT,                          -- RESTORE 시 출처 revision_no (그 외 NULL)
    order_no            VARCHAR(30),                  -- 표시 식별자 스냅샷
    snapshot            JSONB        NOT NULL,        -- 헤더 + 라인 full-snapshot
    actor_id            UUID,                         -- 변경 주체 UUID (audit용, 화면 노출 금지)
    actor_name          VARCHAR(50),                  -- 변경 주체 표시명 (UUID 비공개 가드)
    actor_color         VARCHAR(20),                  -- FE userIdToColor 결과 backup

    -- BaseEntity 7 audit (V1__init_partner_order.sql 컨벤션 동일)
    created_at          TIMESTAMP    NOT NULL,
    created_by          VARCHAR(50)  NOT NULL,
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

-- Partial UNIQUE index: 활성(is_deleted=false) row 내에서만 (partner_order_id, revision_no) 유니크 강제.
-- soft-delete 된 row 는 제외하여 재채번 가능성 허용.
-- saveAndFlush + DataIntegrityViolationException 1회 재시도 → 409 race 가드와 연계.
CREATE UNIQUE INDEX uq_partner_order_revisions_no_active
    ON partner_order_revisions (partner_order_id, revision_no)
    WHERE is_deleted = FALSE;

-- 타임라인 조회용 복합 인덱스 (최신 revision 우선 DESC)
CREATE INDEX ix_partner_order_revisions_order_rev
    ON partner_order_revisions (partner_order_id, revision_no DESC);
