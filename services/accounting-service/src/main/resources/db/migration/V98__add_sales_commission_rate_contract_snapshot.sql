-- D-G1 S2: versioned 요율 계약과 영업수수료 계산 snapshot.

CREATE TABLE sales_commission_rate_contracts (
    id                UUID         NOT NULL DEFAULT gen_random_uuid(),
    version_no        INTEGER      NOT NULL,
    card_rate         NUMERIC(19,8) NOT NULL,
    expense_rate      NUMERIC(19,8) NOT NULL,
    withholding_rate  NUMERIC(19,8) NOT NULL,
    install_rate      NUMERIC(19,8) NOT NULL,

    -- BaseEntity 7 audit
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by        VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at       TIMESTAMP,
    modified_by       VARCHAR(50),
    deleted_at        TIMESTAMP,
    deleted_by        VARCHAR(50),
    is_deleted        BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_sales_commission_rate_contracts PRIMARY KEY (id),
    CONSTRAINT ux_sales_commission_rate_contracts_version UNIQUE (version_no)
);

COMMENT ON TABLE sales_commission_rate_contracts IS
    '영업수수료 정산 versioned 요율 계약. 요율 변경은 기존 행 수정이 아닌 새 버전 행으로 저장';

-- S2 기본 계약: 수기 제경비율이 없을 때 calculator가 사용하는 계약 버전 1.
INSERT INTO sales_commission_rate_contracts (
    version_no, card_rate, expense_rate, withholding_rate, install_rate, created_by
) VALUES (1, 0.03, 0.08, 0.033, 0.08, 'd-g1-s2')
ON CONFLICT (version_no) DO NOTHING;

ALTER TABLE sales_commission_settlements
    ADD COLUMN rate_contract_id       UUID,
    ADD COLUMN total_amount           NUMERIC(24,6),
    ADD COLUMN equipment_amount       NUMERIC(24,6),
    ADD COLUMN prepaid_amount         NUMERIC(24,6),
    ADD COLUMN install_input_amount   NUMERIC(24,6),
    ADD COLUMN safety_input_amount    NUMERIC(24,6),
    ADD COLUMN payment_method         VARCHAR(20),
    ADD COLUMN withholding_applied    BOOLEAN,
    ADD COLUMN manual_expense_rate   NUMERIC(19,8),
    ADD COLUMN applied_expense_rate  NUMERIC(19,8),
    ADD COLUMN card_amount            NUMERIC(24,6),
    ADD COLUMN sales_amount           NUMERIC(24,6),
    ADD COLUMN expense_amount         NUMERIC(24,6),
    ADD COLUMN withholding_amount     NUMERIC(24,6),
    ADD COLUMN install_amount         NUMERIC(24,6),
    ADD COLUMN safety_amount          NUMERIC(24,6),
    ADD COLUMN subtotal_amount        NUMERIC(24,6),
    ADD COLUMN payout_amount          NUMERIC(24,6),
    ADD COLUMN supply_amount          NUMERIC(24,6),
    ADD COLUMN vat_amount             NUMERIC(24,6),
    ADD CONSTRAINT fk_sales_commission_settlement_rate_contract
        FOREIGN KEY (rate_contract_id) REFERENCES sales_commission_rate_contracts (id);

CREATE INDEX idx_sales_commission_settlements_rate_contract_active
    ON sales_commission_settlements (rate_contract_id)
    WHERE is_deleted = FALSE;
