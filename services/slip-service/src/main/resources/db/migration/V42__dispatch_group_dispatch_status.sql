-- V42__dispatch_group_dispatch_status.sql
-- 차량 그룹 단위 발송 상태.
-- 선택 전송 후 미선택 그룹이 task.status 때문에 좌초되지 않도록 group 별 미발송/발송완료를 추적한다.

ALTER TABLE dispatch_vehicle_group
    ADD COLUMN dispatch_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';

UPDATE dispatch_vehicle_group g
SET dispatch_status = CASE
        WHEN t.status IN ('DISPATCHING', 'DISPATCHED') THEN 'DISPATCHED'
        ELSE 'PENDING'
    END
FROM dispatch_task t
WHERE g.dispatch_task_id = t.id;

ALTER TABLE dispatch_vehicle_group
    ADD CONSTRAINT chk_dispatch_vehicle_group_dispatch_status
        CHECK (dispatch_status IN ('PENDING', 'DISPATCHED'));
