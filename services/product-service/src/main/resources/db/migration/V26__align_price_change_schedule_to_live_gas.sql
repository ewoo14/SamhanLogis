-- V26__align_price_change_schedule_to_live_gas.sql
-- #896 슬3: 라이브 GAS 기준일(2026-07-01)을 V22 초기 seed 행에만 반영한다.
-- 관리 화면에서 생성/관리된 행은 created_by 조건으로 보존한다.

UPDATE price_change_schedule
   SET effective_date = DATE '2026-07-01',
       modified_at = now(),
       modified_by = 'V26_MIGRATION'
 WHERE category IN ('commercialMulti', 'homemulti', 'oldProducts', 'singleSets')
   AND created_by = 'V22_MIGRATION'
   AND is_deleted = FALSE
   AND effective_date IS DISTINCT FROM DATE '2026-07-01';
