-- D-G1 S1: 영업수수료 정산서 문서 골격과 정산 기준일별 문서번호 시퀀스.
-- 계산·요율·그룹웨어 참조는 후속 슬라이스에서 추가한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE sales_commission_settlements (
    id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    document_no     VARCHAR(40),
    settlement_date DATE         NOT NULL,
    status          VARCHAR(20)  NOT NULL
                    CHECK (status IN ('DRAFT', 'CONFIRMED')),
    version         BIGINT       NOT NULL DEFAULT 0,

    -- BaseEntity 7 audit
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_sales_commission_settlements PRIMARY KEY (id)
);

COMMENT ON TABLE sales_commission_settlements IS
    '영업수수료 정산서 S1 문서 골격. 기존 견적·전표 수수료 품목과 별도 축';
COMMENT ON COLUMN sales_commission_settlements.document_no IS
    '확정 시 발급하는 yyyy/MM/dd-N 문서번호. DRAFT에서는 NULL';
COMMENT ON COLUMN sales_commission_settlements.settlement_date IS
    '문서번호 채번과 정산 귀속에 사용하는 정산 기준일';

CREATE UNIQUE INDEX uq_sales_commission_settlements_document_no_active
    ON sales_commission_settlements (document_no)
    WHERE is_deleted = FALSE AND document_no IS NOT NULL;

CREATE INDEX idx_sales_commission_settlements_date_active
    ON sales_commission_settlements (settlement_date)
    WHERE is_deleted = FALSE;

CREATE TABLE sales_commission_settlement_number_sequences (
    id              UUID         NOT NULL,
    settlement_date DATE         NOT NULL,
    last_seq        INTEGER      NOT NULL DEFAULT 0,
    version         BIGINT       NOT NULL DEFAULT 0,

    -- BaseEntity 7 audit
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_sales_commission_settlement_number_sequences PRIMARY KEY (id),
    CONSTRAINT ux_sales_commission_settlement_number_sequences_date UNIQUE (settlement_date),
    CONSTRAINT ck_sales_commission_seq_last_nonnegative
        CHECK (last_seq >= 0)
);

COMMENT ON TABLE sales_commission_settlement_number_sequences IS
    '영업수수료 정산서 yyyy/MM/dd-N 일자별 row-lock 채번 시퀀스';
