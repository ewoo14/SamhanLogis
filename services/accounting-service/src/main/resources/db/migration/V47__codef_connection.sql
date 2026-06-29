-- V47__codef_connection.sql
-- CODEF connectedId 등록 기반 연결/기관 메타.
--
-- 적용 원칙:
--   * BaseEntity 7 audit + Soft Delete.
--   * 실 자격(id/pw/cert/password/credentials)은 절대 저장하지 않는다.
--   * enum 영속 값은 CHECK 제약을 동반한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS codef_connection (
    id             UUID         NOT NULL DEFAULT gen_random_uuid(),
    connected_id   VARCHAR(128),
    status         VARCHAR(20)  NOT NULL
                   CHECK (status IN ('ACTIVE', 'ERROR')),

    -- BaseEntity 7 audit
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by     VARCHAR(50)  NOT NULL DEFAULT 'SYSTEM',
    modified_at    TIMESTAMP,
    modified_by    VARCHAR(50),
    deleted_at     TIMESTAMP,
    deleted_by     VARCHAR(50),
    is_deleted     BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_codef_connection PRIMARY KEY (id),
    CONSTRAINT ck_codef_connection_active_connected_id
        CHECK (status <> 'ACTIVE' OR (connected_id IS NOT NULL AND BTRIM(connected_id) <> ''))
);

CREATE TABLE IF NOT EXISTS codef_registered_institution (
    id                 UUID         NOT NULL DEFAULT gen_random_uuid(),
    connection_id      UUID         NOT NULL,
    business_type      VARCHAR(20)  NOT NULL
                       CHECK (business_type IN ('BANK', 'CARD', 'LOAN')),
    organization_code  VARCHAR(50)  NOT NULL,
    account_identifier VARCHAR(128),
    nickname           VARCHAR(100),
    status             VARCHAR(30)  NOT NULL
                       CHECK (status IN ('ACTIVE', 'ERROR', 'ADDITIONAL_AUTH')),
    registered_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_verified_at   TIMESTAMP,

    -- BaseEntity 7 audit
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by         VARCHAR(50)  NOT NULL DEFAULT 'SYSTEM',
    modified_at        TIMESTAMP,
    modified_by        VARCHAR(50),
    deleted_at         TIMESTAMP,
    deleted_by         VARCHAR(50),
    is_deleted         BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_codef_registered_institution PRIMARY KEY (id),
    CONSTRAINT fk_codef_registered_institution_connection
        FOREIGN KEY (connection_id) REFERENCES codef_connection (id)
);

COMMENT ON TABLE codef_connection IS
    '회사 단위 CODEF connectedId 저장. 평문 금융 자격 없음';
COMMENT ON TABLE codef_registered_institution IS
    'CODEF connectedId에 등록된 기관 메타. 평문 금융 자격 없음';
COMMENT ON COLUMN codef_connection.connected_id IS
    'CODEF 연결 식별자. API/화면 응답에는 직접 노출하지 않는다';
COMMENT ON COLUMN codef_registered_institution.account_identifier IS
    '계좌·카드 표시 식별자. 저장 시 마스킹된 값만 허용';

CREATE UNIQUE INDEX IF NOT EXISTS uq_codef_connection_single_active
    ON codef_connection ((1))
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS ix_codef_registered_institution_connection_active
    ON codef_registered_institution (connection_id)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS ix_codef_registered_institution_org_active
    ON codef_registered_institution (business_type, organization_code)
    WHERE is_deleted = FALSE;
