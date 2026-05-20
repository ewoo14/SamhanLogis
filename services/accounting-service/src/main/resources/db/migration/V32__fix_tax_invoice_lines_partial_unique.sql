-- MIG-12 follow-up: tax_invoice_lines (tax_invoice_id, line_no) UNIQUE -> partial
DROP INDEX IF EXISTS ux_tax_invoice_lines_invoice_line;
CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_invoice_lines_invoice_line_active
    ON tax_invoice_lines (tax_invoice_id, line_no)
    WHERE is_deleted = FALSE;
