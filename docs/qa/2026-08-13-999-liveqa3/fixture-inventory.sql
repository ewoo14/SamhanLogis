-- liveQA3 격리 inventory_db 전용. 공유 DB 실행 금지.
BEGIN;

DELETE FROM stock_movements
 WHERE id IN (
   '999bc001-0000-4000-8000-000000000001',
   '999bc001-0000-4000-8000-000000000002',
   '999bc001-0000-4000-8000-000000000003',
   '999bc001-0000-4000-8000-000000000004'
 );

INSERT INTO stock_movements (
  id, lot_id, product_id, warehouse_id, movement_type, quantity_delta,
  reference_type, reference_id, note, occurred_at, actor_user_id,
  created_at, created_by, modified_at, modified_by, is_deleted
) VALUES
  (
    '999bc001-0000-4000-8000-000000000001',
    'a601727f-89d6-4696-b1c9-c5e9922fff85',
    '2d7e785d-e5f5-4abb-b0c8-543188fb829f',
    '11111111-1111-1111-1111-000000000001',
    'INBOUND', 5, 'INBOUND', '72825da2-e0b0-47e1-a1fb-8659f440c8b5',
    '2026/08/02-17', '2026-08-02 09:00:00', 'sol-liveqa',
    CURRENT_TIMESTAMP, 'CODEX SOL', CURRENT_TIMESTAMP, 'CODEX SOL', false
  ),
  (
    '999bc001-0000-4000-8000-000000000002',
    'a601727f-89d6-4696-b1c9-c5e9922fff85',
    '2d7e785d-e5f5-4abb-b0c8-543188fb829f',
    '11111111-1111-1111-1111-000000000001',
    'INBOUND', 2, 'INBOUND', '788cd2f8-cd71-48ce-ae21-9ae9cee0a270',
    '2026/08/08-8', '2026-08-08 10:00:00', 'sol-liveqa',
    CURRENT_TIMESTAMP, 'CODEX SOL', CURRENT_TIMESTAMP, 'CODEX SOL', false
  ),
  (
    '999bc001-0000-4000-8000-000000000003',
    'a601727f-89d6-4696-b1c9-c5e9922fff85',
    '2d7e785d-e5f5-4abb-b0c8-543188fb829f',
    '11111111-1111-1111-1111-000000000001',
    'DEDUCT', -3, 'DELIVERY', NULL,
    '지방/울산광역시 북구 사청6길 6', '2026-08-09 11:00:00', 'sol-liveqa',
    CURRENT_TIMESTAMP, 'CODEX SOL', CURRENT_TIMESTAMP, 'CODEX SOL', false
  ),
  (
    '999bc001-0000-4000-8000-000000000004',
    'a601727f-89d6-4696-b1c9-c5e9922fff85',
    '2d7e785d-e5f5-4abb-b0c8-543188fb829f',
    '11111111-1111-1111-1111-000000000001',
    'DEDUCT', -4, 'DELIVERY', NULL,
    '야적/경기도 광주시 파발로59번길 30', '2026-08-10 12:00:00', 'sol-liveqa',
    CURRENT_TIMESTAMP, 'CODEX SOL', CURRENT_TIMESTAMP, 'CODEX SOL', false
  );

COMMIT;
