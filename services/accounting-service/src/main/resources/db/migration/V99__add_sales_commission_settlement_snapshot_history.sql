-- D-G7: 확정 취소 시 과거 확정 snapshot을 append-only 감사 이력으로 보관.

CREATE TABLE sales_commission_settlement_snapshot_histories (
    id                    UUID         NOT NULL DEFAULT gen_random_uuid(),
    settlement_id         UUID         NOT NULL,
    document_no           VARCHAR(40)  NOT NULL,
    settlement_date       DATE         NOT NULL,
    rate_contract_id      UUID,
    total_amount          NUMERIC(24,6),
    equipment_amount      NUMERIC(24,6),
    prepaid_amount        NUMERIC(24,6),
    install_input_amount  NUMERIC(24,6),
    safety_input_amount   NUMERIC(24,6),
    payment_method        VARCHAR(20),
    withholding_applied   BOOLEAN,
    manual_expense_rate   NUMERIC(19,8),
    applied_expense_rate  NUMERIC(19,8),
    card_amount           NUMERIC(24,6),
    sales_amount          NUMERIC(24,6),
    expense_amount        NUMERIC(24,6),
    withholding_amount    NUMERIC(24,6),
    install_amount        NUMERIC(24,6),
    safety_amount         NUMERIC(24,6),
    subtotal_amount       NUMERIC(24,6),
    payout_amount         NUMERIC(24,6),
    supply_amount         NUMERIC(24,6),
    vat_amount            NUMERIC(24,6),

    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by            VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at           TIMESTAMP,
    modified_by           VARCHAR(50),
    deleted_at            TIMESTAMP,
    deleted_by            VARCHAR(50),
    is_deleted            BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_sales_commission_settlement_snapshot_histories PRIMARY KEY (id),
    CONSTRAINT fk_sales_commission_snapshot_history_settlement
        FOREIGN KEY (settlement_id) REFERENCES sales_commission_settlements (id),
    CONSTRAINT fk_sales_commission_snapshot_history_rate_contract
        FOREIGN KEY (rate_contract_id) REFERENCES sales_commission_rate_contracts (id)
);

CREATE INDEX idx_sales_commission_snapshot_history_settlement
    ON sales_commission_settlement_snapshot_histories (settlement_id, created_at)
    WHERE is_deleted = FALSE;

ALTER TABLE sales_commission_settlements
    ADD COLUMN recalculation_required BOOLEAN NOT NULL DEFAULT FALSE;
