ALTER TABLE partner_orders
    ADD COLUMN audit_address VARCHAR(500),
    ADD COLUMN contact_phone VARCHAR(50),
    ADD COLUMN payment_due_date DATE;

