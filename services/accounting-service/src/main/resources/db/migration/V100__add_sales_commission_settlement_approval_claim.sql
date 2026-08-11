-- D-G7: accounting 정산 행을 교차 서비스 결재 참조의 직렬화 지점으로 사용한다.

CREATE TABLE sales_commission_settlement_approval_claims (
    id             UUID         NOT NULL DEFAULT gen_random_uuid(),
    settlement_id  UUID         NOT NULL,
    approval_id    UUID         NOT NULL,
    claim_token    UUID         NOT NULL,
    status         VARCHAR(20)  NOT NULL,
    expires_at     TIMESTAMP    NOT NULL,

    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by     VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at    TIMESTAMP,
    modified_by    VARCHAR(50),
    deleted_at     TIMESTAMP,
    deleted_by     VARCHAR(50),
    is_deleted     BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_sales_commission_settlement_approval_claims PRIMARY KEY (id),
    CONSTRAINT uq_sales_commission_settlement_approval_claim_token UNIQUE (claim_token),
    CONSTRAINT fk_sales_commission_settlement_approval_claim_settlement
        FOREIGN KEY (settlement_id) REFERENCES sales_commission_settlements (id)
);

CREATE INDEX sales_commission_settlement_approval_claims_active_idx
    ON sales_commission_settlement_approval_claims (settlement_id, status, expires_at)
    WHERE is_deleted = FALSE;

CREATE INDEX sales_commission_settlement_approval_claims_owner_idx
    ON sales_commission_settlement_approval_claims (approval_id, status)
    WHERE is_deleted = FALSE;
