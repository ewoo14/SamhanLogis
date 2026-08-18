-- 카테고리별 구성품 설정 이전.
--
-- bundle_component는 세트 구성·기본수량·문맥 납품가의 정본으로 남긴다.
-- 이 테이블은 수량동기화(qty_mode), 옵션(component_variant/shape/is_default),
-- 품목구분(component_kind)만 카테고리 축으로 복제한다.
-- product_estimate_exposure는 웹 카탈로그 membership이므로 재사용하지 않는다.
-- 따라서 설정 전용 354쌍은 이 테이블에만 존재하고 웹 노출은 증가하지 않는다.

CREATE TABLE bundle_component_estimate_setting (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_component_id UUID         NOT NULL REFERENCES bundle_component(id),
    estimate_category   VARCHAR(20)  NOT NULL,
    qty_mode            VARCHAR(16)  NOT NULL,
    component_kind      VARCHAR(16)  NOT NULL,
    component_variant   VARCHAR(64),
    component_shape     VARCHAR(16),
    is_default          BOOLEAN      NOT NULL DEFAULT FALSE,
    source_display_order INTEGER,
    configuration_only  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP    NOT NULL,
    created_by          VARCHAR(50)  NOT NULL,
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_bc_es_category CHECK (estimate_category IN ('HOME_MULTI','SINGLE_SET','COMMERCIAL_MULTI','LEGACY','OTHER')),
    CONSTRAINT chk_bc_es_qty_mode CHECK (qty_mode IN ('FIXED','FOLLOW_SET')),
    CONSTRAINT chk_bc_es_kind CHECK (component_kind IN ('INDOOR','OUTDOOR','PANEL','REMOTE','MATERIAL','ACCESSORY','FOOT')),
    CONSTRAINT chk_bc_es_config_only CHECK (configuration_only = TRUE)
);

CREATE UNIQUE INDEX ux_bc_es_component_category_active
    ON bundle_component_estimate_setting (bundle_component_id, estimate_category)
    WHERE is_deleted = FALSE;
CREATE INDEX ix_bc_es_category_active
    ON bundle_component_estimate_setting (estimate_category, bundle_component_id)
    WHERE is_deleted = FALSE;

-- 활성 부모의 활성 노출 카테고리만 정확 복사한다: 1,584행 / 343세트.
-- soft-delete 부모 3개 14행은 카테고리 판정 불가이므로 의도적으로 제외한다.
INSERT INTO bundle_component_estimate_setting (
    id, bundle_component_id, estimate_category, qty_mode, component_kind,
    component_variant, component_shape, is_default, source_display_order,
    configuration_only, created_at, created_by, is_deleted
)
SELECT gen_random_uuid(), bc.id, e.estimate_category, bc.qty_mode, bc.component_kind,
       bc.component_variant, bc.component_shape, bc.is_default, bc.display_order,
       TRUE, now(), 'V47_CATEGORY_SETTINGS_MIGRATION', FALSE
  FROM bundle_component bc
  JOIN products parent ON parent.id = bc.bundle_product_id
  JOIN product_estimate_exposure e
    ON e.product_id = bc.bundle_product_id
   AND e.is_deleted = FALSE
 WHERE bc.is_deleted = FALSE
   AND parent.is_deleted = FALSE;

COMMENT ON TABLE bundle_component_estimate_setting IS
    '견적 카테고리별 구성품 3종 설정. configuration_only=TRUE이며 웹 노출 membership가 아니다.';
