-- 배차 #3 Round A P1-1
-- Samhan Public 재배차 재수신 멱등성 키. 기존 dispatch_date + dispatch_type active unique 는 유지하되,
-- 같은 DispatchTask 재발송 시 기존 active row 를 soft-delete 후 INSERT 할 수 있도록 연결 UUID 를 저장한다.

ALTER TABLE dispatches
    ADD COLUMN IF NOT EXISTS samhan_dispatch_task_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_dispatches_samhan_task_active
    ON dispatches (samhan_dispatch_task_id)
    WHERE is_deleted = FALSE AND samhan_dispatch_task_id IS NOT NULL;

COMMENT ON COLUMN dispatches.samhan_dispatch_task_id IS
    'Samhan Public dispatch_task UUID. 재배차 재수신 시 active dispatch soft-delete 후 재생성하기 위한 멱등성 키';
