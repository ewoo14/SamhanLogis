-- V17__arologis_standard_chart_and_departments.sql
-- 2026-06-09 — 개발책임자 지시: 아로로지스 백오피스 실 운영 seed 확정.
--
-- 1) 부서(arologis_department): 대표실 / 행정팀 / 회계팀 3개로 확정.
--    V14 가 적재한 배차(DISPATCH)·운영(OPERATIONS)은 soft-delete, 행정·회계는 "행정팀/회계팀"으로 개명.
-- 2) 간이 계정과목(arologis_simple_account): 일반기업회계기준 표준계정과목 5유형 전체 적재.
--    - type CHECK 를 자본(EQUITY) 포함 5유형으로 확장(기존은 4유형이라 EQUITY INSERT 거부됨).
--    - 운송업 현금출납장에서 자주 쓰는 계정만 active=TRUE, 나머지 표준 계정은 active=FALSE 로 적재
--      (데이터는 모두 보존하되 거래 입력 드롭다운 노출만 제한 — 대표실/회계팀이 화면에서 토글).
--
-- 멱등: 부서는 ON CONFLICT(code) DO UPDATE, 계정은 code PK 기준 upsert.

-- ────────────────────────────────────────────────────────────────────────────
-- 1) 부서 3개 확정
-- ────────────────────────────────────────────────────────────────────────────

-- V14 임시 부서 중 신규 3종에 없는 코드는 soft-delete (FK 보존 — 직원 참조가 있어도 안전).
UPDATE arologis_department
SET is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_by = 'v17-standard-seed',
    modified_at = NOW(),
    modified_by = 'v17-standard-seed'
WHERE is_deleted = FALSE
  AND code NOT IN ('EXEC', 'ADMIN', 'ACCOUNTING');

INSERT INTO arologis_department (
    id, code, name, display_order,
    created_at, created_by, modified_at, modified_by, is_deleted
)
VALUES
    (gen_random_uuid(), 'EXEC',       '대표실', 10, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    (gen_random_uuid(), 'ADMIN',      '행정팀', 20, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    (gen_random_uuid(), 'ACCOUNTING', '회계팀', 30, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE)
ON CONFLICT (code) WHERE is_deleted = FALSE DO UPDATE
SET name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    modified_at = NOW(),
    modified_by = 'v17-standard-seed';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) 계정과목 type CHECK 확장 (4유형 → 5유형, 자본 추가)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE arologis_simple_account
    DROP CONSTRAINT IF EXISTS arologis_simple_account_type_check;

ALTER TABLE arologis_simple_account
    ADD CONSTRAINT arologis_simple_account_type_check
    CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'));

-- ────────────────────────────────────────────────────────────────────────────
-- 3) 표준계정과목 전체 적재
--    코드 체계(4자리): 1xxx 자산 · 2xxx 부채 · 3xxx 자본 · 4xxx 수익 · 8xxx 비용.
--    active=TRUE = 운송업 현금출납장 상용 계정.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO arologis_simple_account (
    code, name, type, display_order, active,
    created_at, created_by, modified_at, modified_by, is_deleted
)
VALUES
    -- ── 자산 (ASSET) ──────────────────────────────────────────────
    -- 당좌자산
    ('1010', '현금',            'ASSET',     1010, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1020', '보통예금',        'ASSET',     1020, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1030', '정기예금',        'ASSET',     1030, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1040', '현금성자산',      'ASSET',     1040, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1050', '단기금융상품',    'ASSET',     1050, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1060', '단기매매증권',    'ASSET',     1060, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1110', '외상매출금',      'ASSET',     1110, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1120', '받을어음',        'ASSET',     1120, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1130', '미수금',          'ASSET',     1130, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1140', '미수수익',        'ASSET',     1140, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1150', '선급금',          'ASSET',     1150, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1160', '선급비용',        'ASSET',     1160, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1170', '부가세대급금',    'ASSET',     1170, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1180', '단기대여금',      'ASSET',     1180, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1190', '가지급금',        'ASSET',     1190, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    -- 재고자산
    ('1210', '상품',            'ASSET',     1210, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1220', '제품',            'ASSET',     1220, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1230', '원재료',          'ASSET',     1230, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1240', '저장품',          'ASSET',     1240, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    -- 유형자산
    ('1310', '토지',            'ASSET',     1310, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1320', '건물',            'ASSET',     1320, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1330', '차량운반구',      'ASSET',     1330, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1340', '기계장치',        'ASSET',     1340, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1350', '비품',            'ASSET',     1350, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1360', '공구와기구',      'ASSET',     1360, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1370', '감가상각누계액',  'ASSET',     1370, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1380', '건설중인자산',    'ASSET',     1380, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    -- 투자자산
    ('1410', '장기금융상품',    'ASSET',     1410, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1420', '장기대여금',      'ASSET',     1420, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1430', '투자부동산',      'ASSET',     1430, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    -- 무형자산
    ('1510', '영업권',          'ASSET',     1510, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1520', '산업재산권',      'ASSET',     1520, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1530', '소프트웨어',      'ASSET',     1530, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('1540', '개발비',          'ASSET',     1540, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    -- 기타비유동자산
    ('1610', '임차보증금',      'ASSET',     1610, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),

    -- ── 부채 (LIABILITY) ──────────────────────────────────────────
    -- 유동부채
    ('2010', '미지급금',        'LIABILITY', 2010, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2020', '외상매입금',      'LIABILITY', 2020, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2030', '지급어음',        'LIABILITY', 2030, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2040', '예수금',          'LIABILITY', 2040, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2050', '부가세예수금',    'LIABILITY', 2050, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2060', '선수금',          'LIABILITY', 2060, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2070', '선수수익',        'LIABILITY', 2070, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2080', '단기차입금',      'LIABILITY', 2080, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2090', '미지급비용',      'LIABILITY', 2090, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2100', '미지급세금',      'LIABILITY', 2100, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2110', '유동성장기부채',  'LIABILITY', 2110, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    -- 비유동부채
    ('2210', '장기차입금',      'LIABILITY', 2210, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2220', '임대보증금',      'LIABILITY', 2220, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2230', '퇴직급여충당부채','LIABILITY', 2230, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('2240', '사채',            'LIABILITY', 2240, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),

    -- ── 자본 (EQUITY) ─────────────────────────────────────────────
    ('3010', '자본금',          'EQUITY',    3010, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('3020', '자본잉여금',      'EQUITY',    3020, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('3030', '주식발행초과금',  'EQUITY',    3030, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('3040', '이익잉여금',      'EQUITY',    3040, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('3050', '이익준비금',      'EQUITY',    3050, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('3060', '미처분이익잉여금','EQUITY',    3060, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('3070', '자본조정',        'EQUITY',    3070, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('3080', '인출금',          'EQUITY',    3080, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),

    -- ── 수익 (INCOME) ─────────────────────────────────────────────
    -- 매출
    ('4010', '운송수입',        'INCOME',    4010, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('4020', '용역매출',        'INCOME',    4020, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('4030', '상품매출',        'INCOME',    4030, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('4040', '제품매출',        'INCOME',    4040, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    -- 영업외수익
    ('4110', '이자수익',        'INCOME',    4110, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('4120', '배당금수익',      'INCOME',    4120, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('4130', '임대료수입',      'INCOME',    4130, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('4140', '유형자산처분이익','INCOME',    4140, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('4150', '외환차익',        'INCOME',    4150, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('4160', '보험차익',        'INCOME',    4160, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('4090', '기타수입',        'INCOME',    4090, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),

    -- ── 비용 (EXPENSE) ────────────────────────────────────────────
    -- 매출원가
    ('8210', '외주운송비',      'EXPENSE',   8210, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8220', '상품매출원가',    'EXPENSE',   8220, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    -- 판매비와관리비
    ('8010', '급여',            'EXPENSE',   8010, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8011', '상여금',          'EXPENSE',   8011, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8012', '잡급',            'EXPENSE',   8012, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8013', '퇴직급여',        'EXPENSE',   8013, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8020', '복리후생비',      'EXPENSE',   8020, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8025', '여비교통비',      'EXPENSE',   8025, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8030', '임차료',          'EXPENSE',   8030, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8035', '접대비',          'EXPENSE',   8035, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8040', '통신비',          'EXPENSE',   8040, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8045', '수도광열비',      'EXPENSE',   8045, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8050', '차량유지비',      'EXPENSE',   8050, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8055', '유류비',          'EXPENSE',   8055, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8060', '지급수수료',      'EXPENSE',   8060, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8065', '보험료',          'EXPENSE',   8065, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8070', '소모품비',        'EXPENSE',   8070, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8072', '도서인쇄비',      'EXPENSE',   8072, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8074', '교육훈련비',      'EXPENSE',   8074, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8076', '광고선전비',      'EXPENSE',   8076, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8078', '수선비',          'EXPENSE',   8078, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8080', '세금과공과',      'EXPENSE',   8080, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8082', '감가상각비',      'EXPENSE',   8082, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8084', '대손상각비',      'EXPENSE',   8084, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8086', '운반비',          'EXPENSE',   8086, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8088', '통행료',          'EXPENSE',   8088, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8090', '잡비',            'EXPENSE',   8090, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    -- 영업외비용
    ('8310', '이자비용',        'EXPENSE',   8310, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8320', '외환차손',        'EXPENSE',   8320, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8330', '기부금',          'EXPENSE',   8330, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8340', '유형자산처분손실','EXPENSE',   8340, FALSE, NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE),
    ('8350', '잡손실',          'EXPENSE',   8350, TRUE,  NOW(), 'v17-standard-seed', NOW(), 'v17-standard-seed', FALSE)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    type = EXCLUDED.type,
    display_order = EXCLUDED.display_order,
    active = EXCLUDED.active,
    modified_at = NOW(),
    modified_by = 'v17-standard-seed',
    is_deleted = FALSE;
