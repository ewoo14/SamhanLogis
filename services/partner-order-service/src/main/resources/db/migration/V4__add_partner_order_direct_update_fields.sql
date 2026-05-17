ALTER TABLE partner_orders
    ADD COLUMN due_date DATE,
    ADD COLUMN memo VARCHAR(1000);
