-- #850 D-850-01 audit: CHECK 적용 전 raw table 전체 행(soft-delete 포함) 위반 조회.
-- 아래 두 조회가 0건인지 확인하고, 위반 행이 있으면 migration이 실패하도록 수정/삭제 없이 진행한다.
-- SELECT id, allocated_amount, allocated_qty, is_deleted
-- FROM sales_accounting_slip_allocations
-- WHERE allocated_amount <= 0 OR allocated_qty <= 0;
-- SELECT id, allocated_amount, allocated_qty, is_deleted
-- FROM purchase_accounting_slip_allocations
-- WHERE allocated_amount <= 0 OR allocated_qty <= 0;

ALTER TABLE sales_accounting_slip_allocations
    ADD CONSTRAINT chk_sas_allocation_positive
    CHECK (allocated_amount > 0 AND allocated_qty > 0);

ALTER TABLE purchase_accounting_slip_allocations
    ADD CONSTRAINT chk_pas_allocation_positive
    CHECK (allocated_amount > 0 AND allocated_qty > 0);
