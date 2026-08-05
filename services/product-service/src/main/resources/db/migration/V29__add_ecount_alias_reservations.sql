-- MIG-8 resolver 응답과 Google Sheet soft-delete 사이의 TOCTOU 방지용 짧은 reservation.
CREATE TABLE IF NOT EXISTS ecount_alias_reservations (
    reservation_token UUID NOT NULL,
    product_id        UUID NOT NULL,
    expires_at        TIMESTAMP NOT NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (reservation_token, product_id)
);

CREATE INDEX IF NOT EXISTS ix_ecount_alias_reservations_product_expiry
    ON ecount_alias_reservations (product_id, expires_at);
