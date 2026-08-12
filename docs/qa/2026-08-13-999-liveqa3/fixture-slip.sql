-- liveQA3 격리 slip_db 전용. 공유 DB 실행 금지.
BEGIN;

UPDATE slips
   SET slip_no = '2026/08/02-17',
       slip_date = DATE '2026-08-02',
       seq_no = 17,
       modified_at = CURRENT_TIMESTAMP,
       modified_by = 'CODEX SOL'
 WHERE id = '72825da2-e0b0-47e1-a1fb-8659f440c8b5'
   AND slip_type = 'INBOUND';

UPDATE slip_lines
   SET product_id = '2d7e785d-e5f5-4abb-b0c8-543188fb829f',
       product_name = '실외기_3HP 다배관',
       model_name = 'AJ030RXH4BC1',
       quantity = 5,
       line_total = unit_price * 5,
       supply_amount = unit_price * 5,
       vat_amount = unit_price * 5 * 0.1,
       modified_at = CURRENT_TIMESTAMP,
       modified_by = 'CODEX SOL'
 WHERE id = '6a4af783-c08f-46c0-aac5-66c13183ca87'
   AND slip_id = '72825da2-e0b0-47e1-a1fb-8659f440c8b5';

COMMIT;
