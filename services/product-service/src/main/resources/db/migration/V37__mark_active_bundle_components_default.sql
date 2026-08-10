-- PR #1132: 기본 구성품 0건인 활성 BUNDLE의 활성 구성품을 기본 구성품으로 지정한다.
-- 대상 수는 PC별 시드 차이를 고려해 검증 조건으로 사용하지 않는다.
-- 이번 실행에서 조건에 맞은 세트/구성품 수는 RAISE NOTICE로 남긴다.

CREATE TABLE bundle_component_default_backfill_audit (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_key         VARCHAR(64)  NOT NULL,
    bundle_component_id   UUID         NOT NULL,
    bundle_product_id     UUID         NOT NULL,
    component_product_code VARCHAR(64) NOT NULL,
    previous_is_default   BOOLEAN      NOT NULL,
    applied_is_default    BOOLEAN      NOT NULL,
    reason                VARCHAR(500) NOT NULL,
    rolled_back_at        TIMESTAMP,
    rolled_back_by        VARCHAR(100),
    created_at            TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by            VARCHAR(100) NOT NULL,
    modified_at           TIMESTAMP,
    modified_by           VARCHAR(100),
    deleted_at            TIMESTAMP,
    deleted_by            VARCHAR(100),
    is_deleted             BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_bundle_component_default_backfill
        UNIQUE (migration_key, bundle_component_id)
);

CREATE INDEX ix_bundle_component_default_backfill_component
    ON bundle_component_default_backfill_audit (bundle_component_id, rolled_back_at)
    WHERE is_deleted = FALSE;

CREATE TEMP TABLE v37_target_bundle_components ON COMMIT DROP AS
SELECT bc.id,
       bc.bundle_product_id,
       bc.component_product_code,
       bc.is_default
  FROM bundle_component bc
  JOIN products p ON p.id = bc.bundle_product_id
 WHERE p.is_deleted = FALSE
   AND p.status = 'ACTIVE'
   AND p.product_type = 'BUNDLE'
   AND bc.is_deleted = FALSE
   AND NOT EXISTS (
       SELECT 1
         FROM bundle_component existing_default
        WHERE existing_default.bundle_product_id = p.id
          AND existing_default.is_deleted = FALSE
          AND existing_default.is_default = TRUE
   );

INSERT INTO bundle_component_default_backfill_audit (
    migration_key,
    bundle_component_id,
    bundle_product_id,
    component_product_code,
    previous_is_default,
    applied_is_default,
    reason,
    created_by
)
SELECT 'PR1132-V37',
       t.id,
       t.bundle_product_id,
       t.component_product_code,
       t.is_default,
       TRUE,
       '활성 BUNDLE의 기본 구성품 0건을 레거시 전부 전개와 동일하게 복원',
       'V37__PR1132'
  FROM v37_target_bundle_components t
 WHERE t.is_default = FALSE
ON CONFLICT (migration_key, bundle_component_id) DO NOTHING;

UPDATE bundle_component bc
   SET is_default = TRUE,
       modified_at = NOW(),
       modified_by = 'V37__PR1132'
  FROM bundle_component_default_backfill_audit a
 WHERE a.migration_key = 'PR1132-V37'
   AND a.bundle_component_id = bc.id
   AND a.applied_is_default = TRUE
   AND a.rolled_back_at IS NULL
   AND a.is_deleted = FALSE
   AND bc.is_deleted = FALSE
   AND bc.is_default = FALSE;

DO $$
DECLARE
    target_sets       BIGINT;
    target_components BIGINT;
    changed_components BIGINT;
BEGIN
    SELECT COUNT(DISTINCT bundle_product_id), COUNT(*)
      INTO target_sets, target_components
      FROM v37_target_bundle_components;
    SELECT COUNT(*)
      INTO changed_components
      FROM bundle_component_default_backfill_audit
     WHERE migration_key = 'PR1132-V37'
       AND applied_is_default = TRUE
       AND rolled_back_at IS NULL
       AND is_deleted = FALSE;
    RAISE NOTICE '[PR1132 V37] 조건 일치 세트=% 구성품=% 감사 누적 적용=% (건수 하드 실패 없음)',
        target_sets, target_components, changed_components;
END $$;
