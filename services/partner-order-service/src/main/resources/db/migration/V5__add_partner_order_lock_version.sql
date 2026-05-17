ALTER TABLE partner_orders
    ADD COLUMN lock_version BIGINT NOT NULL DEFAULT 0;
