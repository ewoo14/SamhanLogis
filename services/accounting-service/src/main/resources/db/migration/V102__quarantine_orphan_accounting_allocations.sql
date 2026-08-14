-- V102: 삭제된 회계전표 아래 allocation 격리 및 재발 방지
-- 행은 삭제하지 않고 soft-delete 하며, 원상복구에 필요한 원본 키와 금액을 감사한다.
CREATE TABLE accounting_slip_integrity_quarantine (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), allocation_type VARCHAR(20) NOT NULL,
    allocation_id UUID NOT NULL, accounting_slip_id UUID NOT NULL, accounting_slip_no VARCHAR(50) NOT NULL,
    source_slip_id UUID NOT NULL, source_slip_no VARCHAR(50) NOT NULL, source_line_id UUID NOT NULL,
    source_line_no INT NOT NULL, allocated_qty NUMERIC(12,3) NOT NULL, allocated_amount NUMERIC(15,2) NOT NULL,
    reason VARCHAR(100) NOT NULL, quarantined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    quarantined_by VARCHAR(100) NOT NULL, restored_at TIMESTAMP, restored_by VARCHAR(100)
);
CREATE UNIQUE INDEX ux_accounting_slip_integrity_quarantine_active
    ON accounting_slip_integrity_quarantine (allocation_type, allocation_id) WHERE restored_at IS NULL;

INSERT INTO accounting_slip_integrity_quarantine
    (allocation_type, allocation_id, accounting_slip_id, accounting_slip_no, source_slip_id, source_slip_no,
     source_line_id, source_line_no, allocated_qty, allocated_amount, reason, quarantined_by)
SELECT 'SALES', a.id, h.id, h.slip_no, a.source_slip_id, a.source_slip_no, a.source_line_id, a.source_line_no,
       a.allocated_qty, a.allocated_amount, '삭제된 회계 매출전표의 allocation', 'migration:V102'
  FROM sales_accounting_slip_allocations a
  JOIN sales_accounting_slip_lines l ON l.id = a.sales_slip_line_id
  JOIN sales_accounting_slips h ON h.id = l.slip_id
 WHERE a.is_deleted = FALSE AND h.is_deleted = TRUE ON CONFLICT DO NOTHING;
INSERT INTO accounting_slip_integrity_quarantine
    (allocation_type, allocation_id, accounting_slip_id, accounting_slip_no, source_slip_id, source_slip_no,
     source_line_id, source_line_no, allocated_qty, allocated_amount, reason, quarantined_by)
SELECT 'PURCHASE', a.id, h.id, h.slip_no, a.source_slip_id, a.source_slip_no, a.source_line_id, a.source_line_no,
       a.allocated_qty, a.allocated_amount, '삭제된 회계 매입전표의 allocation', 'migration:V102'
  FROM purchase_accounting_slip_allocations a
  JOIN purchase_accounting_slip_lines l ON l.id = a.purchase_slip_line_id
  JOIN purchase_accounting_slips h ON h.id = l.slip_id
 WHERE a.is_deleted = FALSE AND h.is_deleted = TRUE ON CONFLICT DO NOTHING;

UPDATE sales_accounting_slip_allocations a SET is_deleted=TRUE, deleted_at=NOW(), deleted_by='migration:V102'
 WHERE a.is_deleted=FALSE AND EXISTS (SELECT 1 FROM sales_accounting_slip_lines l JOIN sales_accounting_slips h ON h.id=l.slip_id WHERE l.id=a.sales_slip_line_id AND h.is_deleted=TRUE);
UPDATE purchase_accounting_slip_allocations a SET is_deleted=TRUE, deleted_at=NOW(), deleted_by='migration:V102'
 WHERE a.is_deleted=FALSE AND EXISTS (SELECT 1 FROM purchase_accounting_slip_lines l JOIN purchase_accounting_slips h ON h.id=l.slip_id WHERE l.id=a.purchase_slip_line_id AND h.is_deleted=TRUE);

CREATE OR REPLACE FUNCTION quarantine_sales_allocations_on_slip_delete() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.is_deleted=FALSE AND NEW.is_deleted=TRUE THEN
  INSERT INTO accounting_slip_integrity_quarantine
    (allocation_type, allocation_id, accounting_slip_id, accounting_slip_no, source_slip_id, source_slip_no, source_line_id, source_line_no, allocated_qty, allocated_amount, reason, quarantined_by)
  SELECT 'SALES',a.id,NEW.id,NEW.slip_no,a.source_slip_id,a.source_slip_no,a.source_line_id,a.source_line_no,a.allocated_qty,a.allocated_amount,'삭제된 회계 매출전표의 allocation',COALESCE(NEW.deleted_by,'system')
    FROM sales_accounting_slip_allocations a JOIN sales_accounting_slip_lines l ON l.id=a.sales_slip_line_id WHERE l.slip_id=NEW.id AND a.is_deleted=FALSE ON CONFLICT DO NOTHING;
  UPDATE sales_accounting_slip_allocations a SET is_deleted=TRUE,deleted_at=COALESCE(NEW.deleted_at,NOW()),deleted_by=COALESCE(NEW.deleted_by,'system')
   WHERE a.is_deleted=FALSE AND EXISTS (SELECT 1 FROM sales_accounting_slip_lines l WHERE l.id=a.sales_slip_line_id AND l.slip_id=NEW.id);
 END IF; RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION quarantine_purchase_allocations_on_slip_delete() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.is_deleted=FALSE AND NEW.is_deleted=TRUE THEN
  INSERT INTO accounting_slip_integrity_quarantine
    (allocation_type, allocation_id, accounting_slip_id, accounting_slip_no, source_slip_id, source_slip_no, source_line_id, source_line_no, allocated_qty, allocated_amount, reason, quarantined_by)
  SELECT 'PURCHASE',a.id,NEW.id,NEW.slip_no,a.source_slip_id,a.source_slip_no,a.source_line_id,a.source_line_no,a.allocated_qty,a.allocated_amount,'삭제된 회계 매입전표의 allocation',COALESCE(NEW.deleted_by,'system')
    FROM purchase_accounting_slip_allocations a JOIN purchase_accounting_slip_lines l ON l.id=a.purchase_slip_line_id WHERE l.slip_id=NEW.id AND a.is_deleted=FALSE ON CONFLICT DO NOTHING;
  UPDATE purchase_accounting_slip_allocations a SET is_deleted=TRUE,deleted_at=COALESCE(NEW.deleted_at,NOW()),deleted_by=COALESCE(NEW.deleted_by,'system')
   WHERE a.is_deleted=FALSE AND EXISTS (SELECT 1 FROM purchase_accounting_slip_lines l WHERE l.id=a.purchase_slip_line_id AND l.slip_id=NEW.id);
 END IF; RETURN NEW;
END; $$;
CREATE TRIGGER trg_quarantine_sales_allocations_on_slip_delete AFTER UPDATE OF is_deleted ON sales_accounting_slips FOR EACH ROW EXECUTE FUNCTION quarantine_sales_allocations_on_slip_delete();
CREATE TRIGGER trg_quarantine_purchase_allocations_on_slip_delete AFTER UPDATE OF is_deleted ON purchase_accounting_slips FOR EACH ROW EXECUTE FUNCTION quarantine_purchase_allocations_on_slip_delete();
