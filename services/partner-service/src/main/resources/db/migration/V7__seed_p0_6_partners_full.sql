-- V7__seed_p0_6_partners_full.sql
-- P0-6 거래처 4탭 검증용 결정적 seed 데이터.
-- 스키마(테이블 생성)는 V6__add_partner_4tab.sql 에서 처리됨.
--
-- [DEV-SEED] — 개발/검증 전용. 운영 환경 절대 적용 금지.
-- 결정적 UUID 사용 → 멱등성 보장 (ON CONFLICT DO NOTHING).
--
-- 거래처 5건: CUSTOMER 3 + SUPPLIER 1 + BOTH 1
--   P0-6-C001  (주)한국냉동물류        CUSTOMER / VIP거래처
--   P0-6-C002  (주)서울택배            CUSTOMER / 일반거래처
--   P0-6-C003  대한화물서비스(주)       CUSTOMER / 신규거래처
--   P0-6-S001  (주)신영포장자재         SUPPLIER
--   P0-6-B001  한일물류파트너스(주)     BOTH (매출+매입)
--
-- 각 거래처별:
--   partner_price_discounts    : 1건 (단가/할인 탭)
--   partner_shipping_addresses : 2건 (배송지 탭, 첫 번째 is_default=TRUE)
--   partner_contacts           : 2건 (담당자 탭, 첫 번째 is_primary=TRUE)

----------------------------------------------------------------------
-- 1) [DEV-SEED] partners 5건
----------------------------------------------------------------------

-- P0-6-C001 : (주)한국냉동물류 — CUSTOMER
INSERT INTO partners (
    id, partner_code, biz_no, name, address, phone,
    credit_limit, outstanding_balance, status,
    representative, business_type, industry,
    email, mobile, fax,
    zip_code1, address1, zip_code2, address2,
    partner_group1, partner_group2,
    currency, shipment_target, sales_type, purchase_type,
    receivable_no_mgmt, payable_no_mgmt,
    outbound_adjustment_rate, inbound_adjustment_rate,
    sales_price_group, purchase_price_group,
    credit_period_days, payment_due_days,
    registration_date,
    search_keyword,
    created_at, created_by, is_deleted
) VALUES (
    'a1b2c3d4-0001-0001-0001-000000000001',
    'P0-6-C001',
    '101-81-00001',
    '(주)한국냉동물류',
    '서울 중구 을지로 100',
    '02-2000-0001',
    50000000,
    0,
    'ACTIVE',
    '김냉동',
    '운수창고업',
    '냉동물류',
    'krf@krf.co.kr',
    '010-2000-0001',
    '02-2000-0011',
    '04551',
    '서울 중구 을지로 100',
    '13210',
    '경기 성남 분당 판교로 100',
    'VIP거래처',
    '수도권',
    'KRW',
    TRUE,
    '기본설정',
    '기본설정',
    '기본설정',
    '기본설정',
    0.0000,
    0.0000,
    'VIP단가',
    '기본구매단가',
    60,
    30,
    '2024-01-02',
    '(주)한국냉동물류 101-81-00001 02-2000-0001',
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

-- P0-6-C002 : (주)서울택배 — CUSTOMER
INSERT INTO partners (
    id, partner_code, biz_no, name, address, phone,
    credit_limit, outstanding_balance, status,
    representative, business_type, industry,
    email, mobile, fax,
    zip_code1, address1, zip_code2, address2,
    partner_group1, partner_group2,
    currency, shipment_target, sales_type, purchase_type,
    receivable_no_mgmt, payable_no_mgmt,
    outbound_adjustment_rate, inbound_adjustment_rate,
    sales_price_group, purchase_price_group,
    credit_period_days, payment_due_days,
    registration_date,
    search_keyword,
    created_at, created_by, is_deleted
) VALUES (
    'a1b2c3d4-0002-0002-0002-000000000002',
    'P0-6-C002',
    '201-81-00002',
    '(주)서울택배',
    '서울 강남구 테헤란로 200',
    '02-3000-0002',
    30000000,
    0,
    'ACTIVE',
    '이택배',
    '운수업',
    '택배서비스',
    'seoul@seouldelivery.co.kr',
    '010-3000-0002',
    '02-3000-0012',
    '06134',
    '서울 강남구 테헤란로 200',
    '13493',
    '경기 성남 분당 백현동 48',
    '일반거래처',
    '수도권',
    'KRW',
    TRUE,
    '기본설정',
    '기본설정',
    '기본설정',
    '기본설정',
    0.0000,
    0.0000,
    '일반단가',
    '기본구매단가',
    30,
    30,
    '2024-03-01',
    '(주)서울택배 201-81-00002 02-3000-0002',
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

-- P0-6-C003 : 대한화물서비스(주) — CUSTOMER
INSERT INTO partners (
    id, partner_code, biz_no, name, address, phone,
    credit_limit, outstanding_balance, status,
    representative, business_type, industry,
    email, mobile, fax,
    zip_code1, address1, zip_code2, address2,
    partner_group1, partner_group2,
    currency, shipment_target, sales_type, purchase_type,
    receivable_no_mgmt, payable_no_mgmt,
    outbound_adjustment_rate, inbound_adjustment_rate,
    sales_price_group, purchase_price_group,
    credit_period_days, payment_due_days,
    registration_date,
    search_keyword,
    created_at, created_by, is_deleted
) VALUES (
    'a1b2c3d4-0003-0003-0003-000000000003',
    'P0-6-C003',
    '301-81-00003',
    '대한화물서비스(주)',
    '부산 해운대구 해운대해변로 300',
    '051-4000-0003',
    20000000,
    500000,
    'ACTIVE',
    '박화물',
    '운수업',
    '화물운송',
    'info@daehan.co.kr',
    '010-4000-0003',
    '051-4000-0013',
    '48093',
    '부산 해운대구 해운대해변로 300',
    '48093',
    '부산 해운대구 센텀중앙로 55',
    '신규거래처',
    '영남권',
    'KRW',
    TRUE,
    '기본설정',
    '기본설정',
    '기본설정',
    '기본설정',
    0.0000,
    0.0000,
    '신규단가',
    '기본구매단가',
    30,
    45,
    '2025-01-10',
    '대한화물서비스(주) 301-81-00003 051-4000-0003',
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

-- P0-6-S001 : (주)신영포장자재 — SUPPLIER
INSERT INTO partners (
    id, partner_code, biz_no, name, address, phone,
    credit_limit, outstanding_balance, status,
    representative, business_type, industry,
    email, mobile, fax,
    zip_code1, address1, zip_code2, address2,
    partner_group1, partner_group2,
    currency, shipment_target, sales_type, purchase_type,
    receivable_no_mgmt, payable_no_mgmt,
    outbound_adjustment_rate, inbound_adjustment_rate,
    sales_price_group, purchase_price_group,
    credit_period_days, payment_due_days,
    registration_date,
    search_keyword,
    created_at, created_by, is_deleted
) VALUES (
    'a1b2c3d4-0004-0004-0004-000000000004',
    'P0-6-S001',
    '401-81-00004',
    '(주)신영포장자재',
    '인천 남동구 앵고개로 400',
    '032-5000-0004',
    0,
    0,
    'ACTIVE',
    '최포장',
    '제조업',
    '포장자재',
    'supply@sinyoung.co.kr',
    '010-5000-0004',
    '032-5000-0014',
    '21629',
    '인천 남동구 앵고개로 400',
    NULL,
    NULL,
    '일반거래처',
    '수도권',
    'KRW',
    FALSE,
    '기본설정',
    '기본설정',
    '기본설정',
    '기본설정',
    0.0000,
    0.0200,
    '기본단가',
    '기본구매단가',
    NULL,
    60,
    '2023-06-01',
    '(주)신영포장자재 401-81-00004 032-5000-0004',
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

-- P0-6-B001 : 한일물류파트너스(주) — BOTH
INSERT INTO partners (
    id, partner_code, biz_no, name, address, phone,
    credit_limit, outstanding_balance, status,
    representative, business_type, industry,
    email, mobile, fax,
    zip_code1, address1, zip_code2, address2,
    partner_group1, partner_group2,
    currency, shipment_target, sales_type, purchase_type,
    receivable_no_mgmt, payable_no_mgmt,
    outbound_adjustment_rate, inbound_adjustment_rate,
    sales_price_group, purchase_price_group,
    credit_period_days, payment_due_days,
    registration_date,
    search_keyword,
    created_at, created_by, is_deleted
) VALUES (
    'a1b2c3d4-0005-0005-0005-000000000005',
    'P0-6-B001',
    '501-81-00005',
    '한일물류파트너스(주)',
    '대구 달서구 달구벌대로 500',
    '053-6000-0005',
    15000000,
    200000,
    'ACTIVE',
    '정물류',
    '운수업',
    '물류대행',
    'hanil@hanil-logis.co.kr',
    '010-6000-0005',
    '053-6000-0015',
    '42601',
    '대구 달서구 달구벌대로 500',
    '42601',
    '대구 달서구 달구벌대로 510',
    '일반거래처',
    '영남권',
    'KRW',
    TRUE,
    '기본설정',
    '기본설정',
    '기본설정',
    '기본설정',
    0.0100,
    0.0100,
    '일반단가',
    '기본구매단가',
    45,
    45,
    '2023-11-01',
    '한일물류파트너스(주) 501-81-00005 053-6000-0005',
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

----------------------------------------------------------------------
-- 2) [DEV-SEED] partner_price_discounts — 각 5건 1행씩
----------------------------------------------------------------------

INSERT INTO partner_price_discounts (
    id, partner_id, basic_discount_rate, payment_term_days, discount_memo, version,
    created_at, created_by, is_deleted
) VALUES (
    'b1000001-0001-0001-0001-000000000001',
    'a1b2c3d4-0001-0001-0001-000000000001',
    5.00, 30, 'VIP 계약 5% 할인', 0,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_price_discounts (
    id, partner_id, basic_discount_rate, payment_term_days, discount_memo, version,
    created_at, created_by, is_deleted
) VALUES (
    'b1000002-0002-0002-0002-000000000002',
    'a1b2c3d4-0002-0002-0002-000000000002',
    2.00, 30, '일반 거래처 2% 할인', 0,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_price_discounts (
    id, partner_id, basic_discount_rate, payment_term_days, discount_memo, version,
    created_at, created_by, is_deleted
) VALUES (
    'b1000003-0003-0003-0003-000000000003',
    'a1b2c3d4-0003-0003-0003-000000000003',
    0.00, 45, NULL, 0,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_price_discounts (
    id, partner_id, basic_discount_rate, payment_term_days, discount_memo, version,
    created_at, created_by, is_deleted
) VALUES (
    'b1000004-0004-0004-0004-000000000004',
    'a1b2c3d4-0004-0004-0004-000000000004',
    3.00, 60, '공급사 3% 구매 할인', 0,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_price_discounts (
    id, partner_id, basic_discount_rate, payment_term_days, discount_memo, version,
    created_at, created_by, is_deleted
) VALUES (
    'b1000005-0005-0005-0005-000000000005',
    'a1b2c3d4-0005-0005-0005-000000000005',
    1.50, 45, '매출/매입 혼합 1.5% 조정', 0,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

----------------------------------------------------------------------
-- 3) [DEV-SEED] partner_shipping_addresses — 각 2건씩 (총 10건)
----------------------------------------------------------------------

-- P0-6-C001 배송지 2건
INSERT INTO partner_shipping_addresses (
    id, partner_id, alias, zip_code, address, phone, receiver_name, is_default, memo,
    created_at, created_by, is_deleted
) VALUES (
    'c1000001-0001-0001-0001-000000000001',
    'a1b2c3d4-0001-0001-0001-000000000001',
    '본사 창고', '13210', '경기 성남 분당 판교로 100 냉동창고동 1층',
    '010-2001-0001', '물류팀', TRUE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_shipping_addresses (
    id, partner_id, alias, zip_code, address, phone, receiver_name, is_default, memo,
    created_at, created_by, is_deleted
) VALUES (
    'c1000001-0001-0001-0001-000000000002',
    'a1b2c3d4-0001-0001-0001-000000000001',
    '인천 물류센터', '22300', '인천 중구 항동7가 100 B동 2층',
    '010-2001-0002', '센터장', FALSE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

-- P0-6-C002 배송지 2건
INSERT INTO partner_shipping_addresses (
    id, partner_id, alias, zip_code, address, phone, receiver_name, is_default, memo,
    created_at, created_by, is_deleted
) VALUES (
    'c1000002-0002-0002-0002-000000000001',
    'a1b2c3d4-0002-0002-0002-000000000002',
    '강남 집화장', '06134', '서울 강남구 테헤란로 200 지하1층',
    '010-3001-0001', '집화담당', TRUE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_shipping_addresses (
    id, partner_id, alias, zip_code, address, phone, receiver_name, is_default, memo,
    created_at, created_by, is_deleted
) VALUES (
    'c1000002-0002-0002-0002-000000000002',
    'a1b2c3d4-0002-0002-0002-000000000002',
    '판교 집화장', '13493', '경기 성남 분당 백현동 48',
    '010-3001-0002', '판교담당', FALSE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

-- P0-6-C003 배송지 2건
INSERT INTO partner_shipping_addresses (
    id, partner_id, alias, zip_code, address, phone, receiver_name, is_default, memo,
    created_at, created_by, is_deleted
) VALUES (
    'c1000003-0003-0003-0003-000000000001',
    'a1b2c3d4-0003-0003-0003-000000000003',
    '부산 본점', '48093', '부산 해운대구 해운대해변로 300',
    '010-4001-0001', '물류팀', TRUE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_shipping_addresses (
    id, partner_id, alias, zip_code, address, phone, receiver_name, is_default, memo,
    created_at, created_by, is_deleted
) VALUES (
    'c1000003-0003-0003-0003-000000000002',
    'a1b2c3d4-0003-0003-0003-000000000003',
    '창원 지점', '51140', '경남 창원 성산구 창이대로 50',
    '010-4001-0002', '창원담당', FALSE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

-- P0-6-S001 배송지 2건
INSERT INTO partner_shipping_addresses (
    id, partner_id, alias, zip_code, address, phone, receiver_name, is_default, memo,
    created_at, created_by, is_deleted
) VALUES (
    'c1000004-0004-0004-0004-000000000001',
    'a1b2c3d4-0004-0004-0004-000000000004',
    '인천 공장', '21629', '인천 남동구 앵고개로 400 공장동',
    '010-5001-0001', '출하담당', TRUE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_shipping_addresses (
    id, partner_id, alias, zip_code, address, phone, receiver_name, is_default, memo,
    created_at, created_by, is_deleted
) VALUES (
    'c1000004-0004-0004-0004-000000000002',
    'a1b2c3d4-0004-0004-0004-000000000004',
    '부평 창고', '21300', '인천 부평구 경인로 500',
    '010-5001-0002', '창고관리', FALSE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

-- P0-6-B001 배송지 2건
INSERT INTO partner_shipping_addresses (
    id, partner_id, alias, zip_code, address, phone, receiver_name, is_default, memo,
    created_at, created_by, is_deleted
) VALUES (
    'c1000005-0005-0005-0005-000000000001',
    'a1b2c3d4-0005-0005-0005-000000000005',
    '대구 본사', '42601', '대구 달서구 달구벌대로 500',
    '010-6001-0001', '총괄팀', TRUE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_shipping_addresses (
    id, partner_id, alias, zip_code, address, phone, receiver_name, is_default, memo,
    created_at, created_by, is_deleted
) VALUES (
    'c1000005-0005-0005-0005-000000000002',
    'a1b2c3d4-0005-0005-0005-000000000005',
    '구미 센터', '39371', '경북 구미시 산동면 산동대로 200',
    '010-6001-0002', '구미담당', FALSE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

----------------------------------------------------------------------
-- 4) [DEV-SEED] partner_contacts — 각 2건씩 (총 10건)
----------------------------------------------------------------------

-- P0-6-C001 담당자 2건
INSERT INTO partner_contacts (
    id, partner_id, contact_name, position, phone, email, is_primary, memo,
    created_at, created_by, is_deleted
) VALUES (
    'd1000001-0001-0001-0001-000000000001',
    'a1b2c3d4-0001-0001-0001-000000000001',
    '김영업', '팀장', '02-2000-0101', 'kim.yeong@krf.co.kr',
    TRUE, 'VIP 계약 전담',
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_contacts (
    id, partner_id, contact_name, position, phone, email, is_primary, memo,
    created_at, created_by, is_deleted
) VALUES (
    'd1000001-0001-0001-0001-000000000002',
    'a1b2c3d4-0001-0001-0001-000000000001',
    '이정산', '대리', '02-2000-0201', 'lee.jungsun@krf.co.kr',
    FALSE, '세금계산서 수신',
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

-- P0-6-C002 담당자 2건
INSERT INTO partner_contacts (
    id, partner_id, contact_name, position, phone, email, is_primary, memo,
    created_at, created_by, is_deleted
) VALUES (
    'd1000002-0002-0002-0002-000000000001',
    'a1b2c3d4-0002-0002-0002-000000000002',
    '박계약', '과장', '02-3000-0101', 'park.gy@seouldelivery.co.kr',
    TRUE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_contacts (
    id, partner_id, contact_name, position, phone, email, is_primary, memo,
    created_at, created_by, is_deleted
) VALUES (
    'd1000002-0002-0002-0002-000000000002',
    'a1b2c3d4-0002-0002-0002-000000000002',
    '최물류', '사원', '02-3000-0201', 'choi.ml@seouldelivery.co.kr',
    FALSE, '배송 실무 담당',
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

-- P0-6-C003 담당자 2건
INSERT INTO partner_contacts (
    id, partner_id, contact_name, position, phone, email, is_primary, memo,
    created_at, created_by, is_deleted
) VALUES (
    'd1000003-0003-0003-0003-000000000001',
    'a1b2c3d4-0003-0003-0003-000000000003',
    '정부산', '차장', '051-4000-0101', 'jung.bs@daehan.co.kr',
    TRUE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_contacts (
    id, partner_id, contact_name, position, phone, email, is_primary, memo,
    created_at, created_by, is_deleted
) VALUES (
    'd1000003-0003-0003-0003-000000000002',
    'a1b2c3d4-0003-0003-0003-000000000003',
    '강회계', '대리', '051-4000-0201', 'kang.hk@daehan.co.kr',
    FALSE, '정산/청구서 담당',
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

-- P0-6-S001 담당자 2건
INSERT INTO partner_contacts (
    id, partner_id, contact_name, position, phone, email, is_primary, memo,
    created_at, created_by, is_deleted
) VALUES (
    'd1000004-0004-0004-0004-000000000001',
    'a1b2c3d4-0004-0004-0004-000000000004',
    '손공급', '부장', '032-5000-0101', 'son.supply@sinyoung.co.kr',
    TRUE, NULL,
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_contacts (
    id, partner_id, contact_name, position, phone, email, is_primary, memo,
    created_at, created_by, is_deleted
) VALUES (
    'd1000004-0004-0004-0004-000000000002',
    'a1b2c3d4-0004-0004-0004-000000000004',
    '윤출하', '사원', '032-5000-0201', 'yoon.ship@sinyoung.co.kr',
    FALSE, '출하/납기 담당',
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

-- P0-6-B001 담당자 2건
INSERT INTO partner_contacts (
    id, partner_id, contact_name, position, phone, email, is_primary, memo,
    created_at, created_by, is_deleted
) VALUES (
    'd1000005-0005-0005-0005-000000000001',
    'a1b2c3d4-0005-0005-0005-000000000005',
    '임대구', '이사', '053-6000-0101', 'lim.dg@hanil-logis.co.kr',
    TRUE, '매출/매입 혼합 담당',
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;

INSERT INTO partner_contacts (
    id, partner_id, contact_name, position, phone, email, is_primary, memo,
    created_at, created_by, is_deleted
) VALUES (
    'd1000005-0005-0005-0005-000000000002',
    'a1b2c3d4-0005-0005-0005-000000000005',
    '한정산', '차장', '053-6000-0201', 'han.acc@hanil-logis.co.kr',
    FALSE, '정산 및 세금계산서',
    NOW(), 'DEV-SEED', FALSE
) ON CONFLICT DO NOTHING;
