-- 배차 #3 Round C P1-1 — arologis silent 파괴 차단 (insert-only receive 전환 동반)
--
-- V2 의 ux_dispatches_date_type_active 는 (dispatch_date, dispatch_type) 전역 unique 라서
-- Samhan dispatch 와 kakao-native dispatch 가 같은 날 공존할 수 없었고, 과거 receive() 가
-- 이를 우회하려고 같은 (date, type) 의 기존 active row(=kakao-native 포함) 를 soft-delete
-- 하면서 silent 파괴가 발생했다.
--
-- 본 마이그레이션은 unique 범위를 kakao-native(samhan_dispatch_task_id IS NULL) 한정으로
-- 좁힌다:
--   - kakao-native 끼리는 기존처럼 (date, type) 당 active 1건.
--   - samhan dispatch 는 ux_dispatches_samhan_task_active (V21, task 당 active 1건) 가
--     거버넌스를 담당 → 같은 날 2회차 task·kakao 공존 가능, receive() 는 insert-only.
--
-- DDL 멱등: DROP IF EXISTS → CREATE IF NOT EXISTS (fresh / 기적용 모두 안전).
-- partial unique 범위 축소는 커버 row 가 줄어드는 방향이라 기존 데이터로 실패하지 않는다.

DROP INDEX IF EXISTS ux_dispatches_date_type_active;

CREATE UNIQUE INDEX IF NOT EXISTS ux_dispatches_date_type_active
    ON dispatches (dispatch_date, dispatch_type)
    WHERE is_deleted = FALSE AND samhan_dispatch_task_id IS NULL;

COMMENT ON INDEX ux_dispatches_date_type_active IS
    'kakao-native(samhan_dispatch_task_id IS NULL) 한정 (dispatch_date, dispatch_type) active unique. samhan dispatch 는 ux_dispatches_samhan_task_active 가 task 당 1건을 보장한다 (V22)';
