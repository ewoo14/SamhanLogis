-- V51__slip_outbound_cutoff.sql
-- 출고전표 배송태그별 컷오프(마감) 시각 마스터.
-- OUTBOUND DeliveryTag 별로 당일 출고전표 생성을 차단할 마감 시각을 저장한다.
-- 기본 시드(REGION/STACK/GYEONGDONG_PARCEL/GYEONGDONG_FREIGHT) 4행 포함.

-- gen_random_uuid() 자급성 보장(fresh Postgres probe 시 pgcrypto 미활성 환경 방어). PG13+ 내장이나 명시.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS slip_outbound_cutoff (
    id           UUID         PRIMARY KEY,
    delivery_tag VARCHAR(40)  NOT NULL,
    cutoff_time  TIME         NOT NULL,
    active       BOOLEAN      NOT NULL DEFAULT TRUE,

    -- BaseEntity 7 audit
    created_at   TIMESTAMP    NOT NULL,
    created_by   VARCHAR(50)  NOT NULL,
    modified_at  TIMESTAMP,
    modified_by  VARCHAR(50),
    deleted_at   TIMESTAMP,
    deleted_by   VARCHAR(50),
    is_deleted   BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE slip_outbound_cutoff IS
    '출고전표 배송태그별 마감 시각 마스터 — 당일 마감 초과 시 출고전표 생성 409 차단';

COMMENT ON COLUMN slip_outbound_cutoff.delivery_tag IS
    'DeliveryTag enum name (OUTBOUND 방향 태그만 허용). 사용자 노출 식별자는 한국어 라벨';

COMMENT ON COLUMN slip_outbound_cutoff.cutoff_time IS
    '마감 시각(KST). LocalTime 형식. 이 시각 이후 당일 출고전표 생성 차단';

COMMENT ON COLUMN slip_outbound_cutoff.active IS
    '활성 여부. false 이면 마감 게이트 미적용(opt-in). soft-delete 와 별개';

-- 활성 태그 부분 unique: 삭제되지 않은 행 중 태그 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS ux_slip_outbound_cutoff_tag
    ON slip_outbound_cutoff (delivery_tag)
    WHERE is_deleted = FALSE;

-- 기본 시드 4행 (멱등 INSERT — NOT EXISTS 가드)
INSERT INTO slip_outbound_cutoff
    (id, delivery_tag, cutoff_time, active, created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    seed.delivery_tag,
    seed.cutoff_time::TIME,
    TRUE,
    NOW(),
    'v51-cutoff-seed',
    NOW(),
    'v51-cutoff-seed',
    FALSE
FROM (VALUES
    ('REGION',            '12:00:00'),
    ('STACK',             '14:00:00'),
    ('GYEONGDONG_PARCEL', '15:00:00'),
    ('GYEONGDONG_FREIGHT','15:00:00')
) AS seed(delivery_tag, cutoff_time)
WHERE NOT EXISTS (
    SELECT 1
    FROM slip_outbound_cutoff c
    WHERE c.delivery_tag = seed.delivery_tag
      AND c.is_deleted = FALSE
);
