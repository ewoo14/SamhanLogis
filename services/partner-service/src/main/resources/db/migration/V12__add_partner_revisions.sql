-- V12__add_partner_revisions.sql
-- Partner Service — 권한 재편 Phase 2.3: 거래처(partner) full-snapshot 버전이력 + point-in-time 복원.
--
-- 컨텍스트:
--   * slip-service estimate_revisions(V28) 와 동형 — 거래처 마스터(com.samhanair.logis.partner.*) 대응.
--   * 본 테이블 partner_revisions = 거래처 헤더 + 4탭 자식(단가/배송지/담당자) 전체를 revision 별
--     JSONB 스냅샷으로 보관하고 특정 시점(revision)으로 통째 복원하는 단일 source-of-truth.
--   * estimate 와 차이: 거래처 자식은 @OneToMany 가 아니라 service-layer repository join 으로 수집된다.
--   * 캡처 경로: CREATE(최초 rev 1) / EDIT(헤더·자식 변경) / RESTORE(복원). 편집과 동일 트랜잭션.
--   * partner-service JSONB 선례 0 → slip-service 의 @JdbcTypeCode(SqlTypes.JSON) 패턴 첫 도입.
--
-- 컬럼 컨벤션 (BaseEntity 7 audit + Soft Delete):
--   * id UUID PK
--   * partner_id UUID NOT NULL — FK 미강제 (partner soft-delete 후에도 이력 보존, 회계 감사 일관)
--   * revision_no INT NOT NULL — partner 별 1 부터 단조 증가 (버전 번호)
--   * revision_type VARCHAR(16) NOT NULL — 'CREATE' / 'EDIT' / 'RESTORE'
--   * source_revision_no INT — RESTORE 시 복원 출처 revision (그 외 NULL)
--   * partner_code VARCHAR(40) — 거래처 사용자 노출 식별자 스냅샷 (표시용)
--   * snapshot JSONB NOT NULL — PartnerSnapshot DTO (헤더 전 필드 + 단가/배송지/담당자) Jackson 직렬화
--   * actor_id UUID — 변경 주체 UUID (감사 추적용, 사용자 화면 노출 금지)
--   * actor_name VARCHAR(50) — 변경 주체 표시명 (UUID 비공개 가드)
--   * actor_color VARCHAR(20) — FE userIdToColor 결과 backup (HSL hex, optional)
--   * BaseEntity 7: created_at/created_by/modified_at/modified_by/deleted_at/deleted_by/is_deleted
--     (length/nullable 은 partner-service V1/V6 BaseEntity 매핑과 정합 —
--      created_by VARCHAR(50) NOT NULL, created_at TIMESTAMP NOT NULL (DB DEFAULT 미사용 —
--      JPA @CreatedDate 가 채움))
--
-- 회귀 영향: 신규 테이블 — 기존 partners / partner_price_discounts / partner_shipping_addresses /
--           partner_contacts IT 영향 0.

CREATE TABLE IF NOT EXISTS partner_revisions (
    id                  UUID         PRIMARY KEY,
    partner_id          UUID         NOT NULL,
    revision_no         INTEGER      NOT NULL,
    revision_type       VARCHAR(16)  NOT NULL,
    source_revision_no  INTEGER,
    partner_code        VARCHAR(40),
    snapshot            JSONB        NOT NULL,
    actor_id            UUID,
    actor_name          VARCHAR(50),
    actor_color         VARCHAR(20),

    -- BaseEntity 7 audit (partner-service V1/V6 BaseEntity 매핑 정합)
    created_at          TIMESTAMP    NOT NULL,
    created_by          VARCHAR(50)  NOT NULL,
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE partner_revisions IS '거래처 full-snapshot 버전이력 (Phase 2.3)';

COMMENT ON COLUMN partner_revisions.partner_id IS
    '대상 거래처 UUID. FK 미강제 — partner soft-delete 후에도 버전이력 보존 (회계 감사 일관)';

COMMENT ON COLUMN partner_revisions.revision_no IS
    'partner 별 1 부터 단조 증가하는 버전 번호. max(revision_no)+1 채번';

COMMENT ON COLUMN partner_revisions.revision_type IS
    'CREATE(최초) / EDIT(헤더·자식 변경) / RESTORE(특정 시점 복원)';

COMMENT ON COLUMN partner_revisions.source_revision_no IS
    'RESTORE 시 복원 출처 revision_no. 그 외 NULL';

COMMENT ON COLUMN partner_revisions.partner_code IS
    '거래처 사용자 노출 식별자 스냅샷 (UUID 비공개 가드). 표시용';

COMMENT ON COLUMN partner_revisions.snapshot IS
    'PartnerSnapshot DTO (거래처 헤더 전 필드 + 단가/배송지/담당자) Jackson 직렬화 JSONB';

COMMENT ON COLUMN partner_revisions.actor_name IS
    'UUID 비공개 가드 — 사용자 화면 노출 식별자. actor_id (UUID) 와 분리';

-- partner 별 active revision_no 유일성 (soft-delete row 제외)
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_revisions_active
    ON partner_revisions (partner_id, revision_no)
    WHERE is_deleted = FALSE;

-- partner 별 버전 타임라인 (최신 우선) 조회 인덱스
CREATE INDEX IF NOT EXISTS ix_partner_revisions
    ON partner_revisions (partner_id, revision_no DESC)
    WHERE is_deleted = FALSE;
