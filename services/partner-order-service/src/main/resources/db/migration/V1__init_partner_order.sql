-- V1__init_partner_order.sql
-- Phase 6 M4 partner-order-service — initial schema (8 entity + outbox).
-- BaseEntity audit columns mirror inventory-service.V1 정확히.
-- Soft-delete 는 application-side 의 @SQLRestriction("is_deleted = false") 로 강제.
--
-- 컬럼 타입 컨벤션:
--   * 짧은 문자열은 VARCHAR(N) (CHAR/bpchar 금지)
--   * 가격/금액은 NUMERIC(15,2)
--   * 수량은 INT
--   * payload/detail/base64 등 가변 큰 텍스트는 TEXT (Lob → TEXT 매핑)

----------------------------------------------------------------------
-- 1) partner_orders — 확정 주문 헤더 (legacy sendOrderFromUi)
----------------------------------------------------------------------
CREATE TABLE partner_orders (
    id                      UUID         PRIMARY KEY,
    partner_code            VARCHAR(50)  NOT NULL,
    biz_code                VARCHAR(20)  NOT NULL,
    order_no                VARCHAR(30)  NOT NULL,
    slip_no                 VARCHAR(30),
    status                  VARCHAR(20)  NOT NULL,
    slip_publish_status     VARCHAR(20)  NOT NULL,
    total_amount            NUMERIC(15,2) NOT NULL DEFAULT 0,
    confirmed_at            TIMESTAMP,
    slip_published_at       TIMESTAMP,
    idempotency_key         VARCHAR(80)  NOT NULL,

    created_at              TIMESTAMP    NOT NULL,
    created_by              VARCHAR(50)  NOT NULL,
    modified_at             TIMESTAMP,
    modified_by             VARCHAR(50),
    deleted_at              TIMESTAMP,
    deleted_by              VARCHAR(50),
    is_deleted              BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_partner_orders_order_no_active
    ON partner_orders (order_no)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX ux_partner_orders_idempotency_active
    ON partner_orders (idempotency_key)
    WHERE is_deleted = FALSE;

-- slip_no UNIQUE (NULL 다중 허용) — slip 발행 성공 후만 채워지는 partial unique
CREATE UNIQUE INDEX ux_partner_orders_slip_no_active
    ON partner_orders (slip_no)
    WHERE is_deleted = FALSE AND slip_no IS NOT NULL;

CREATE INDEX ix_partner_orders_biz_code_confirmed
    ON partner_orders (biz_code, confirmed_at DESC);

CREATE INDEX ix_partner_orders_partner_code_active
    ON partner_orders (partner_code, is_deleted);

CREATE INDEX ix_partner_orders_slip_publish_status
    ON partner_orders (slip_publish_status, is_deleted);

----------------------------------------------------------------------
-- 2) partner_order_lines — 라인 1:N
----------------------------------------------------------------------
CREATE TABLE partner_order_lines (
    id                  UUID         PRIMARY KEY,
    partner_order_id    UUID         NOT NULL REFERENCES partner_orders(id),
    product_id          UUID         NOT NULL,
    model_name          VARCHAR(100) NOT NULL,
    product_name        VARCHAR(200) NOT NULL,
    category_key        VARCHAR(30)  NOT NULL,
    quantity            INT          NOT NULL CHECK (quantity > 0),
    price_vat           NUMERIC(15,2) NOT NULL,
    subtotal            NUMERIC(15,2) NOT NULL,
    remark              VARCHAR(500),

    created_at          TIMESTAMP    NOT NULL,
    created_by          VARCHAR(50)  NOT NULL,
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX ix_partner_order_lines_order_active
    ON partner_order_lines (partner_order_id, is_deleted);

CREATE INDEX ix_partner_order_lines_product
    ON partner_order_lines (product_id);

----------------------------------------------------------------------
-- 3) partner_order_drafts — 임시저장 (legacy saveOrderSnapshot)
--    30일 TTL (application-side scheduler 가 cleanup)
----------------------------------------------------------------------
CREATE TABLE partner_order_drafts (
    id              UUID         PRIMARY KEY,
    partner_code    VARCHAR(50)  NOT NULL,
    draft_seq       BIGINT       NOT NULL,
    label           VARCHAR(100) NOT NULL,
    payload_json    TEXT         NOT NULL,
    expires_at      TIMESTAMP    NOT NULL,

    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_partner_order_drafts_partner_seq_active
    ON partner_order_drafts (partner_code, draft_seq)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_partner_order_drafts_partner_created
    ON partner_order_drafts (partner_code, created_at DESC);

CREATE INDEX ix_partner_order_drafts_expires_active
    ON partner_order_drafts (expires_at)
    WHERE is_deleted = FALSE;

----------------------------------------------------------------------
-- 4) partner_order_history — 변경 이력 (7 event_type)
----------------------------------------------------------------------
CREATE TABLE partner_order_history (
    id                  UUID         PRIMARY KEY,
    partner_order_id    UUID,
    draft_id            UUID,
    partner_code        VARCHAR(50)  NOT NULL,
    event_type          VARCHAR(30)  NOT NULL,
    occurred_at         TIMESTAMP    NOT NULL,
    actor_user_id       VARCHAR(50)  NOT NULL,
    detail_json         TEXT,

    created_at          TIMESTAMP    NOT NULL,
    created_by          VARCHAR(50)  NOT NULL,
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX ix_partner_order_history_order
    ON partner_order_history (partner_order_id, occurred_at);

CREATE INDEX ix_partner_order_history_draft
    ON partner_order_history (draft_id, occurred_at);

CREATE INDEX ix_partner_order_history_partner_event
    ON partner_order_history (partner_code, event_type, occurred_at);

----------------------------------------------------------------------
-- 5) partner_order_front_event_log — audit (90일 보존, 운영 정책 분리)
----------------------------------------------------------------------
CREATE TABLE partner_order_front_event_log (
    id              UUID         PRIMARY KEY,
    partner_code    VARCHAR(50),
    biz_code        VARCHAR(20),
    action          VARCHAR(100) NOT NULL,
    detail          TEXT,
    client_ip       VARCHAR(45),
    user_agent      VARCHAR(500),
    logged_at       TIMESTAMP    NOT NULL,

    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX ix_partner_order_front_event_log_partner_logged
    ON partner_order_front_event_log (partner_code, logged_at DESC);

CREATE INDEX ix_partner_order_front_event_log_action_logged
    ON partner_order_front_event_log (action, logged_at DESC);

----------------------------------------------------------------------
-- 6) partner_order_gate_images — S3/MinIO + base64 호환
----------------------------------------------------------------------
CREATE TABLE partner_order_gate_images (
    id              UUID         PRIMARY KEY,
    label           VARCHAR(50)  NOT NULL,
    s3_key          VARCHAR(500),
    base64          TEXT,
    display_order   INT          NOT NULL DEFAULT 0,
    mime_type       VARCHAR(30)  NOT NULL,

    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT ck_gate_images_storage_present
        CHECK ((s3_key IS NOT NULL AND length(s3_key) > 0)
            OR (base64 IS NOT NULL AND length(base64) > 0))
);

CREATE UNIQUE INDEX ux_partner_order_gate_images_label_active
    ON partner_order_gate_images (label)
    WHERE is_deleted = FALSE;

----------------------------------------------------------------------
-- 7) partner_tutorial_state — M2 mirror (cross-device 동기화)
----------------------------------------------------------------------
CREATE TABLE partner_tutorial_state (
    id              UUID         PRIMARY KEY,
    partner_code    VARCHAR(50)  NOT NULL,
    completed       BOOLEAN      NOT NULL DEFAULT FALSE,
    completed_at    TIMESTAMP,

    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_partner_tutorial_state_partner_active
    ON partner_tutorial_state (partner_code)
    WHERE is_deleted = FALSE;

----------------------------------------------------------------------
-- 8) partner_order_bootstrap_cache — 16종 정적 캐시
--    config 행은 DC 9키 제거 후만 보관 (M3 가드 일관)
----------------------------------------------------------------------
CREATE TABLE partner_order_bootstrap_cache (
    id              UUID         PRIMARY KEY,
    cache_key       VARCHAR(50)  NOT NULL,
    payload_json    TEXT         NOT NULL,
    version         BIGINT       NOT NULL DEFAULT 1,

    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_partner_order_bootstrap_cache_key_active
    ON partner_order_bootstrap_cache (cache_key)
    WHERE is_deleted = FALSE;

----------------------------------------------------------------------
-- 9) slip_publish_outbox — slip-service 5xx fallback 큐
--    설계서 §6 — at-least-once + Idempotency-Key 재사용으로 중복 차단
----------------------------------------------------------------------
CREATE TABLE slip_publish_outbox (
    id                      UUID         PRIMARY KEY,
    partner_order_id        UUID         NOT NULL REFERENCES partner_orders(id),
    idempotency_key         VARCHAR(80)  NOT NULL,
    request_payload         TEXT         NOT NULL,
    status                  VARCHAR(20)  NOT NULL,
    attempt_count           INT          NOT NULL DEFAULT 1,
    first_attempted_at      TIMESTAMP    NOT NULL,
    last_attempted_at       TIMESTAMP    NOT NULL,
    next_attempt_at         TIMESTAMP    NOT NULL,
    last_error              TEXT,

    created_at              TIMESTAMP    NOT NULL,
    created_by              VARCHAR(50)  NOT NULL,
    modified_at             TIMESTAMP,
    modified_by             VARCHAR(50),
    deleted_at              TIMESTAMP,
    deleted_by              VARCHAR(50),
    is_deleted              BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_slip_publish_outbox_order_active
    ON slip_publish_outbox (partner_order_id)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX ux_slip_publish_outbox_idem_active
    ON slip_publish_outbox (idempotency_key)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_slip_publish_outbox_status_next
    ON slip_publish_outbox (status, next_attempt_at)
    WHERE is_deleted = FALSE;
