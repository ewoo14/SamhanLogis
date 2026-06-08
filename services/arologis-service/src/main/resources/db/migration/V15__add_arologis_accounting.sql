-- V15__add_arologis_accounting.sql
-- 2026-06-08 — arologis-desktop 백오피스 Phase C: 간이 회계(단식부기).
--
-- 설계:
--   - 간이 계정과목(arologis_simple_account): code 가 PK(ChartOfAccount 선례), 4유형(ASSET/LIABILITY/INCOME/EXPENSE).
--   - 현금 거래(arologis_cash_txn): 수입/지출 1건 단식 기록. 분개/차대/마감/세금계산서 없음.
--   - 금액 NUMERIC(15,2), txn_date DATE, soft-delete. account_code 는 simple_account.code 논리 FK.

CREATE TABLE arologis_simple_account (
    code            VARCHAR(8)      PRIMARY KEY,
    name            VARCHAR(100)    NOT NULL,
    type            VARCHAR(20)     NOT NULL
                        CHECK (type IN ('ASSET','LIABILITY','INCOME','EXPENSE')),
    display_order   INT             NOT NULL DEFAULT 0,
    active          BOOLEAN         NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMP       NOT NULL,
    created_by      VARCHAR(50)     NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN         NOT NULL DEFAULT FALSE
);

CREATE INDEX ix_arologis_simple_account_order_active
    ON arologis_simple_account (display_order, code)
    WHERE is_deleted = FALSE;

CREATE TABLE arologis_cash_txn (
    id              UUID            PRIMARY KEY,
    txn_date        DATE            NOT NULL,
    type            VARCHAR(20)     NOT NULL
                        CHECK (type IN ('INCOME','EXPENSE')),
    partner_name    VARCHAR(100),
    amount          NUMERIC(15,2)   NOT NULL CHECK (amount > 0),
    account_code    VARCHAR(8)      NOT NULL REFERENCES arologis_simple_account(code),
    description     VARCHAR(255),

    created_at      TIMESTAMP       NOT NULL,
    created_by      VARCHAR(50)     NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN         NOT NULL DEFAULT FALSE
);

CREATE INDEX ix_arologis_cash_txn_date_active
    ON arologis_cash_txn (txn_date)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_arologis_cash_txn_account_active
    ON arologis_cash_txn (account_code, txn_date)
    WHERE is_deleted = FALSE;

-- 간이 계정과목 seed (실 운영 합리값 ~15코드). 거래 데이터는 seed 하지 않는다(API 로만 생성).
INSERT INTO arologis_simple_account (
    code, name, type, display_order, active,
    created_at, created_by, modified_at, modified_by, is_deleted
)
VALUES
    -- 자산 (ASSET)
    ('1010', '현금',        'ASSET',     10,  TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    ('1020', '보통예금',    'ASSET',     20,  TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    -- 부채 (LIABILITY)
    ('2010', '미지급금',    'LIABILITY', 30,  TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    -- 수입 (INCOME)
    ('4010', '운송수입',    'INCOME',    40,  TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    ('4090', '기타수입',    'INCOME',    50,  TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    -- 지출 (EXPENSE)
    ('8010', '급여',        'EXPENSE',   60,  TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    ('8020', '복리후생비',  'EXPENSE',   70,  TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    ('8030', '임차료',      'EXPENSE',   80,  TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    ('8040', '통신비',      'EXPENSE',   90,  TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    ('8050', '차량유지비',  'EXPENSE',   100, TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    ('8060', '지급수수료',  'EXPENSE',   110, TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    ('8070', '소모품비',    'EXPENSE',   120, TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    ('8080', '세금과공과',  'EXPENSE',   130, TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE),
    ('8090', '잡비',        'EXPENSE',   140, TRUE, NOW(), 'v15-arologis-accounting', NOW(), 'v15-arologis-accounting', FALSE)
ON CONFLICT (code) DO NOTHING;
