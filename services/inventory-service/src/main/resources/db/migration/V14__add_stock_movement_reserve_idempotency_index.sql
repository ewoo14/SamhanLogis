-- Phase 2.6c: reserve 멱등 가드 — (reference_type, reference_id, product_id, movement_type) 부분 유니크 인덱스
-- referenceType/referenceId 가 NOT NULL 인 RESERVE movement 에 대해서만 중복을 방지한다.
-- 기존 movement 행 (referenceType/referenceId = NULL) 에는 영향 없음 (partial 조건: reference_type IS NOT NULL AND reference_id IS NOT NULL).

CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_movement_reserve_idempotency
    ON stock_movements (reference_type, reference_id, product_id, movement_type)
    WHERE reference_type IS NOT NULL
      AND reference_id IS NOT NULL
      AND movement_type = 'RESERVE';
