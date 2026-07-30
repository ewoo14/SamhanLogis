-- V29__seed_s03_quantity_sync_rule.sql
-- #896 슬4 Slice A: S-03 싱글 실링 세트 → 실링용 드레인펌프 설정.
--
-- source/target은 2026-07-29 실제 partner-orders/bootstrap 응답의
-- AC072BSCPBH2SY(싱글 실링) / ADP-F075SP(실링용 드레인펌프) 행을 사용한다.
-- 새 규칙만 추가하며 기존 Product 수량/행을 backfill하지 않는다.
--
-- 배포 시점에 catalog가 아직 적재되지 않은 환경에서는 규칙을 만들지 않는다.
-- order-app은 규칙 부재를 경고하고 legacy S-03 계산을 유지하므로, 빈 규칙이
-- 수량 0으로 조용히 바뀌는 경로가 없다. catalog 적재 후 이 migration을 재실행하는
-- 것은 Flyway 계약상 허용되지 않으므로 운영 catalog 적재가 먼저라는 배포 순서를 지킨다.

DO $$
DECLARE
    source_product_id UUID;
    target_product_id UUID;
    rule_id UUID;
BEGIN
    IF EXISTS (
        SELECT 1
          FROM quantity_sync_rule
         WHERE rule_key = 'SINGLE_S03_CEILING_DRAIN_PUMP'
           AND is_deleted = FALSE
    ) THEN
        RAISE NOTICE 'S-03 seed skipped: active rule already exists';
        RETURN;
    END IF;

    SELECT id
      INTO source_product_id
      FROM products
     WHERE model_code = 'AC072BSCPBH2SY'
       AND status = 'ACTIVE'
       AND is_deleted = FALSE;

    SELECT id
      INTO target_product_id
      FROM products
     WHERE model_code = 'ADP-F075SP'
       AND status = 'ACTIVE'
       AND is_deleted = FALSE;

    IF source_product_id IS NULL OR target_product_id IS NULL THEN
        RAISE NOTICE 'S-03 seed skipped: source/target catalog row is not active';
        RETURN;
    END IF;

    INSERT INTO quantity_sync_rule (
        rule_key, estimate_category, name, enabled, aggregation, condition_json,
        inactive_behavior, conflict_policy, priority, legacy_ref,
        created_at, created_by, is_deleted
    ) VALUES (
        'SINGLE_S03_CEILING_DRAIN_PUMP', 'SINGLE_SET',
        '싱글 실링 세트 → 실링용 드레인펌프', TRUE, 'SUM', '{}'::jsonb,
        'ZERO', 'REPLACE', 100, 'S-03',
        CURRENT_TIMESTAMP, 'migration-896-s4', FALSE
    )
    RETURNING id INTO rule_id;

    INSERT INTO quantity_sync_source (
        rule_id, source_product_id, factor, created_at, created_by, is_deleted
    ) VALUES (
        rule_id, source_product_id, 1, CURRENT_TIMESTAMP, 'migration-896-s4', FALSE
    );

    INSERT INTO quantity_sync_target (
        rule_id, target_product_id, multiplier, rounding_mode, display_order,
        created_at, created_by, is_deleted
    ) VALUES (
        rule_id, target_product_id, 1, 'NONE', 1,
        CURRENT_TIMESTAMP, 'migration-896-s4', FALSE
    );
END $$;
