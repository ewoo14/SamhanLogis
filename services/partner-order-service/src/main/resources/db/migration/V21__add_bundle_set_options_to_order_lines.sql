ALTER TABLE partner_order_lines
    ADD COLUMN IF NOT EXISTS bundle_set_options JSONB;
