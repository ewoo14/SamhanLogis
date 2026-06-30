-- V22__add_price_change_schedule.sql
-- #17 단가변동 S1: order-app categoryKey 4종 기준 카테고리별 단일 변동일.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE price_change_schedule (
    id             UUID         PRIMARY KEY,
    category       VARCHAR(30)  NOT NULL,  -- PartnerOrderLine.category_key VARCHAR(30) 정합
    effective_date DATE         NOT NULL,
    created_at     TIMESTAMP    NOT NULL,
    created_by     VARCHAR(50)  NOT NULL,
    modified_at    TIMESTAMP,
    modified_by    VARCHAR(50),
    deleted_at     TIMESTAMP,
    deleted_by     VARCHAR(50),
    is_deleted     BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_price_change_schedule_category
        CHECK (category IN ('homemulti','singleSets','commercialMulti','oldProducts'))
);

CREATE UNIQUE INDEX ux_price_change_schedule_category_active
    ON price_change_schedule (category)
    WHERE is_deleted = FALSE;

INSERT INTO price_change_schedule (
    id, category, effective_date, created_at, created_by, is_deleted
)
VALUES
    (gen_random_uuid(), 'homemulti', '2026-04-01', now(), 'V22_MIGRATION', FALSE),
    (gen_random_uuid(), 'singleSets', '2026-04-01', now(), 'V22_MIGRATION', FALSE),
    (gen_random_uuid(), 'commercialMulti', '2026-04-01', now(), 'V22_MIGRATION', FALSE),
    (gen_random_uuid(), 'oldProducts', '2026-04-01', now(), 'V22_MIGRATION', FALSE);
