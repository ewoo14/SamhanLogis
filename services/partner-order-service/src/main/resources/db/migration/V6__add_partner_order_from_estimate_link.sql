ALTER TABLE partner_orders
    ADD COLUMN source_estimate_id UUID;

CREATE UNIQUE INDEX ux_partner_orders_source_estimate_active
    ON partner_orders (source_estimate_id)
    WHERE is_deleted = FALSE AND source_estimate_id IS NOT NULL;
