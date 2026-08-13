-- V101__unify_legacy_account_codes.sql
-- 계정과목 코드 통일: 자체 3자리 코드 -> 결정 문서의 이카운트 4자리 코드
-- 정본: docs/decisions/2026-08-13-account-code-unification.md
--
-- 이 마이그레이션은 PostgreSQL/Flyway의 단일 트랜잭션 안에서 실행된다.
-- 4자리 이상인 기존 journal_lines 행은 UPDATE 대상에 포함하지 않는다.

----------------------------------------------------------------------
-- 0-A) PM 정본 이카운트 계정과목 seed
--    ecount-chart-dump.tsv의 4자리 275개와 00010을 결정적 데이터로 고정한다.
--    dump에는 is_leaf가 없으므로 TRUE를 넣고, 트리거 설치 후 자식 유무로 재계산한다.
--    chart_of_accounts에는 parent_code FK가 없으므로 dump의 행 순서에 의존하지 않는다.
--    이미 런타임 import된 행은 정본으로 갱신하고, soft-delete된 행은 복구한다.
----------------------------------------------------------------------
INSERT INTO chart_of_accounts AS coa (
    code, name, category, parent_code, is_leaf, display_order,
    created_at, created_by, is_deleted
) VALUES
('00010', '출자금', 'ASSET', '2470', TRUE, 10, CURRENT_TIMESTAMP, 'V101', FALSE),
('1010', '자산', 'ASSET', NULL, TRUE, 1010, CURRENT_TIMESTAMP, 'V101', FALSE),
('1011', '유동자산', 'ASSET', '1010', TRUE, 1011, CURRENT_TIMESTAMP, 'V101', FALSE),
('1012', '당좌자산', 'ASSET', '1011', TRUE, 1012, CURRENT_TIMESTAMP, 'V101', FALSE),
('1018', '현금및현금성자산', 'ASSET', '1012', TRUE, 1018, CURRENT_TIMESTAMP, 'V101', FALSE),
('1019', '현금', 'ASSET', '1018', TRUE, 1019, CURRENT_TIMESTAMP, 'V101', FALSE),
('1029', '당좌예금', 'ASSET', '1018', TRUE, 1029, CURRENT_TIMESTAMP, 'V101', FALSE),
('1039', '보통예금', 'ASSET', '1018', TRUE, 1039, CURRENT_TIMESTAMP, 'V101', FALSE),
('1049', '단기투자자산', 'ASSET', '1012', TRUE, 1049, CURRENT_TIMESTAMP, 'V101', FALSE),
('1059', '정기예.적금', 'ASSET', '1049', TRUE, 1059, CURRENT_TIMESTAMP, 'V101', FALSE),
('1063', '기타단기금융상품', 'ASSET', '1049', TRUE, 1063, CURRENT_TIMESTAMP, 'V101', FALSE),
('1066', '단기예금', 'ASSET', '1049', TRUE, 1066, CURRENT_TIMESTAMP, 'V101', FALSE),
('1069', '단기매매증권', 'ASSET', '1049', TRUE, 1069, CURRENT_TIMESTAMP, 'V101', FALSE),
('1072', '매도가능증권', 'ASSET', '1049', TRUE, 1072, CURRENT_TIMESTAMP, 'V101', FALSE),
('1075', '만기보유증권', 'ASSET', '1049', TRUE, 1075, CURRENT_TIMESTAMP, 'V101', FALSE),
('1082', '단기대여금', 'ASSET', '1049', TRUE, 1082, CURRENT_TIMESTAMP, 'V101', FALSE),
('1087', '매출채권', 'ASSET', '1012', TRUE, 1087, CURRENT_TIMESTAMP, 'V101', FALSE),
('1088', '대손충당금', 'ASSET', '1012', TRUE, 1088, CURRENT_TIMESTAMP, 'V101', FALSE),
('1089', '외상매출금', 'ASSET', '1087', TRUE, 1089, CURRENT_TIMESTAMP, 'V101', FALSE),
('1099', '외상매출금대손충당금', 'ASSET', '1088', TRUE, 1099, CURRENT_TIMESTAMP, 'V101', FALSE),
('1109', '받을어음', 'ASSET', '1087', TRUE, 1109, CURRENT_TIMESTAMP, 'V101', FALSE),
('1119', '받을어음대손충당금', 'ASSET', '1088', TRUE, 1119, CURRENT_TIMESTAMP, 'V101', FALSE),
('1139', '선급비용', 'ASSET', '1012', TRUE, 1139, CURRENT_TIMESTAMP, 'V101', FALSE),
('1149', '이연법인세자산', 'ASSET', '1012', TRUE, 1149, CURRENT_TIMESTAMP, 'V101', FALSE),
('1168', '기타', 'ASSET', '1012', TRUE, 1168, CURRENT_TIMESTAMP, 'V101', FALSE),
('1169', '미수수익', 'ASSET', '1168', TRUE, 1169, CURRENT_TIMESTAMP, 'V101', FALSE),
('1209', '미수금', 'ASSET', '1168', TRUE, 1209, CURRENT_TIMESTAMP, 'V101', FALSE),
('1319', '선급금', 'ASSET', '1168', TRUE, 1319, CURRENT_TIMESTAMP, 'V101', FALSE),
('1349', '가지급금', 'ASSET', '1168', TRUE, 1349, CURRENT_TIMESTAMP, 'V101', FALSE),
('1359', '부가세대급금', 'ASSET', '1168', TRUE, 1359, CURRENT_TIMESTAMP, 'V101', FALSE),
('1369', '선납세금', 'ASSET', '1168', TRUE, 1369, CURRENT_TIMESTAMP, 'V101', FALSE),
('1379', '주임종단기채권', 'ASSET', '1168', TRUE, 1379, CURRENT_TIMESTAMP, 'V101', FALSE),
('1389', '전도금', 'ASSET', '1168', TRUE, 1389, CURRENT_TIMESTAMP, 'V101', FALSE),
('1462', '재고자산', 'ASSET', '1011', TRUE, 1462, CURRENT_TIMESTAMP, 'V101', FALSE),
('1469', '상품', 'ASSET', '1462', TRUE, 1469, CURRENT_TIMESTAMP, 'V101', FALSE),
('1499', '상품관세환급금', 'ASSET', '1462', TRUE, 1499, CURRENT_TIMESTAMP, 'V101', FALSE),
('1509', '제품', 'ASSET', '1462', TRUE, 1509, CURRENT_TIMESTAMP, 'V101', FALSE),
('1519', '제품관세환급금', 'ASSET', '1462', TRUE, 1519, CURRENT_TIMESTAMP, 'V101', FALSE),
('1539', '원재료', 'ASSET', '1462', TRUE, 1539, CURRENT_TIMESTAMP, 'V101', FALSE),
('1629', '부재료', 'ASSET', '1462', TRUE, 1629, CURRENT_TIMESTAMP, 'V101', FALSE),
('1679', '저장품', 'ASSET', '1462', TRUE, 1679, CURRENT_TIMESTAMP, 'V101', FALSE),
('1689', '미착품', 'ASSET', '1462', TRUE, 1689, CURRENT_TIMESTAMP, 'V101', FALSE),
('1699', '재공품', 'ASSET', '1462', TRUE, 1699, CURRENT_TIMESTAMP, 'V101', FALSE),
('1761', '비유동자산', 'ASSET', '1010', TRUE, 1761, CURRENT_TIMESTAMP, 'V101', FALSE),
('1762', '투자자산', 'ASSET', '1761', TRUE, 1762, CURRENT_TIMESTAMP, 'V101', FALSE),
('1769', '투자부동산', 'ASSET', '1762', TRUE, 1769, CURRENT_TIMESTAMP, 'V101', FALSE),
('1774', '장기금융상품', 'ASSET', '1762', TRUE, 1774, CURRENT_TIMESTAMP, 'V101', FALSE),
('1779', '특정현금과예금', 'ASSET', '1762', TRUE, 1779, CURRENT_TIMESTAMP, 'V101', FALSE),
('1784', '장기투자증권', 'ASSET', '1762', TRUE, 1784, CURRENT_TIMESTAMP, 'V101', FALSE),
('1799', '지분법적용투자주식', 'ASSET', '1762', TRUE, 1799, CURRENT_TIMESTAMP, 'V101', FALSE),
('1814', '장기대여금', 'ASSET', '1762', TRUE, 1814, CURRENT_TIMESTAMP, 'V101', FALSE),
('1819', '장기대여금대손충당금', 'ASSET', '1762', TRUE, 1819, CURRENT_TIMESTAMP, 'V101', FALSE),
('1824', '장기성매출채권', 'ASSET', '1762', TRUE, 1824, CURRENT_TIMESTAMP, 'V101', FALSE),
('1827', '현재가치할인차금', 'ASSET', '1762', TRUE, 1827, CURRENT_TIMESTAMP, 'V101', FALSE),
('1829', '장기성매출채권대손충당금', 'ASSET', '1762', TRUE, 1829, CURRENT_TIMESTAMP, 'V101', FALSE),
('1934', '부도어음과수표', 'ASSET', '1762', TRUE, 1934, CURRENT_TIMESTAMP, 'V101', FALSE),
('1939', '부도어음과수표대손충당금', 'ASSET', '1762', TRUE, 1939, CURRENT_TIMESTAMP, 'V101', FALSE),
('2012', '유형자산', 'ASSET', '1761', TRUE, 2012, CURRENT_TIMESTAMP, 'V101', FALSE),
('2019', '토지', 'ASSET', '2012', TRUE, 2019, CURRENT_TIMESTAMP, 'V101', FALSE),
('2024', '건물', 'ASSET', '2012', TRUE, 2024, CURRENT_TIMESTAMP, 'V101', FALSE),
('2029', '건물감가상각누계액', 'ASSET', '2012', TRUE, 2029, CURRENT_TIMESTAMP, 'V101', FALSE),
('2034', '구축물', 'ASSET', '2012', TRUE, 2034, CURRENT_TIMESTAMP, 'V101', FALSE),
('2039', '구축물감가상각누계액', 'ASSET', '2012', TRUE, 2039, CURRENT_TIMESTAMP, 'V101', FALSE),
('2044', '기계장치', 'ASSET', '2012', TRUE, 2044, CURRENT_TIMESTAMP, 'V101', FALSE),
('2049', '기계장치감가상각누계액', 'ASSET', '2012', TRUE, 2049, CURRENT_TIMESTAMP, 'V101', FALSE),
('2054', '차량운반구', 'ASSET', '2012', TRUE, 2054, CURRENT_TIMESTAMP, 'V101', FALSE),
('2059', '차량운반구감가상각누계액', 'ASSET', '2012', TRUE, 2059, CURRENT_TIMESTAMP, 'V101', FALSE),
('2064', '공구와기구', 'ASSET', '2012', TRUE, 2064, CURRENT_TIMESTAMP, 'V101', FALSE),
('2069', '공구와기구감가상각누계액', 'ASSET', '2012', TRUE, 2069, CURRENT_TIMESTAMP, 'V101', FALSE),
('2074', '비품', 'ASSET', '2012', TRUE, 2074, CURRENT_TIMESTAMP, 'V101', FALSE),
('2079', '비품감가상각누계액', 'ASSET', '2012', TRUE, 2079, CURRENT_TIMESTAMP, 'V101', FALSE),
('2084', '시설장치', 'ASSET', '2012', TRUE, 2084, CURRENT_TIMESTAMP, 'V101', FALSE),
('2089', '시설장치감가상각누계액', 'ASSET', '2012', TRUE, 2089, CURRENT_TIMESTAMP, 'V101', FALSE),
('2124', '설비자산', 'ASSET', '2012', TRUE, 2124, CURRENT_TIMESTAMP, 'V101', FALSE),
('2129', '설비자산감가상각누계액', 'ASSET', '2012', TRUE, 2129, CURRENT_TIMESTAMP, 'V101', FALSE),
('2224', '건설중인자산', 'ASSET', '2012', TRUE, 2224, CURRENT_TIMESTAMP, 'V101', FALSE),
('2234', '기타자산', 'ASSET', '2012', TRUE, 2234, CURRENT_TIMESTAMP, 'V101', FALSE),
('2239', '기타자산감가상각누계액', 'ASSET', '2012', TRUE, 2239, CURRENT_TIMESTAMP, 'V101', FALSE),
('2312', '무형자산', 'ASSET', '1761', TRUE, 2312, CURRENT_TIMESTAMP, 'V101', FALSE),
('2319', '영업권', 'ASSET', '2312', TRUE, 2319, CURRENT_TIMESTAMP, 'V101', FALSE),
('2325', '산업재산권', 'ASSET', '2312', TRUE, 2325, CURRENT_TIMESTAMP, 'V101', FALSE),
('2329', '특허권', 'ASSET', '2325', TRUE, 2329, CURRENT_TIMESTAMP, 'V101', FALSE),
('2355', '개발비', 'ASSET', '2312', TRUE, 2355, CURRENT_TIMESTAMP, 'V101', FALSE),
('2365', '기타', 'ASSET', '2312', TRUE, 2365, CURRENT_TIMESTAMP, 'V101', FALSE),
('2368', '라이선스', 'ASSET', '2365', TRUE, 2368, CURRENT_TIMESTAMP, 'V101', FALSE),
('2371', '저작권', 'ASSET', '2365', TRUE, 2371, CURRENT_TIMESTAMP, 'V101', FALSE),
('2374', '컴퓨터소프트웨어', 'ASSET', '2365', TRUE, 2374, CURRENT_TIMESTAMP, 'V101', FALSE),
('2377', '임차권리금', 'ASSET', '2365', TRUE, 2377, CURRENT_TIMESTAMP, 'V101', FALSE),
('2380', '광업권', 'ASSET', '2365', TRUE, 2380, CURRENT_TIMESTAMP, 'V101', FALSE),
('2383', '어업권', 'ASSET', '2365', TRUE, 2383, CURRENT_TIMESTAMP, 'V101', FALSE),
('2450', '기타비유동자산', 'ASSET', '1761', TRUE, 2450, CURRENT_TIMESTAMP, 'V101', FALSE),
('2460', '이연법인세자산', 'ASSET', '2450', TRUE, 2460, CURRENT_TIMESTAMP, 'V101', FALSE),
('2470', '기타', 'ASSET', '2450', TRUE, 2470, CURRENT_TIMESTAMP, 'V101', FALSE),
('2473', '장기매출채권', 'ASSET', '2470', TRUE, 2473, CURRENT_TIMESTAMP, 'V101', FALSE),
('2476', '장기선급비용', 'ASSET', '2470', TRUE, 2476, CURRENT_TIMESTAMP, 'V101', FALSE),
('2479', '장기선급금', 'ASSET', '2470', TRUE, 2479, CURRENT_TIMESTAMP, 'V101', FALSE),
('2482', '장기미수금', 'ASSET', '2470', TRUE, 2482, CURRENT_TIMESTAMP, 'V101', FALSE),
('2485', '임차보증금', 'ASSET', '2470', TRUE, 2485, CURRENT_TIMESTAMP, 'V101', FALSE),
('2487', '전신전화가입권', 'ASSET', '2470', TRUE, 2487, CURRENT_TIMESTAMP, 'V101', FALSE),
('2488', '기타보증금', 'ASSET', '2470', TRUE, 2488, CURRENT_TIMESTAMP, 'V101', FALSE),
('2510', '부채', 'LIABILITY', NULL, TRUE, 2510, CURRENT_TIMESTAMP, 'V101', FALSE),
('2511', '유동부채', 'LIABILITY', '2510', TRUE, 2511, CURRENT_TIMESTAMP, 'V101', FALSE),
('2515', '단기차입금', 'LIABILITY', '2511', TRUE, 2515, CURRENT_TIMESTAMP, 'V101', FALSE),
('2518', '매입채무', 'LIABILITY', '2511', TRUE, 2518, CURRENT_TIMESTAMP, 'V101', FALSE),
('2519', '외상매입금', 'LIABILITY', '2518', TRUE, 2519, CURRENT_TIMESTAMP, 'V101', FALSE),
('2529', '지급어음', 'LIABILITY', '2518', TRUE, 2529, CURRENT_TIMESTAMP, 'V101', FALSE),
('2539', '미지급금', 'LIABILITY', '2511', TRUE, 2539, CURRENT_TIMESTAMP, 'V101', FALSE),
('2549', '예수금', 'LIABILITY', '2511', TRUE, 2549, CURRENT_TIMESTAMP, 'V101', FALSE),
('2559', '부가세예수금', 'LIABILITY', '2511', TRUE, 2559, CURRENT_TIMESTAMP, 'V101', FALSE),
('2569', '당좌차월', 'LIABILITY', '2511', TRUE, 2569, CURRENT_TIMESTAMP, 'V101', FALSE),
('2579', '가수금', 'LIABILITY', '2511', TRUE, 2579, CURRENT_TIMESTAMP, 'V101', FALSE),
('2589', '예수보증금', 'LIABILITY', '2511', TRUE, 2589, CURRENT_TIMESTAMP, 'V101', FALSE),
('2599', '선수금', 'LIABILITY', '2511', TRUE, 2599, CURRENT_TIMESTAMP, 'V101', FALSE),
('2619', '당기법인세부채', 'LIABILITY', '2511', TRUE, 2619, CURRENT_TIMESTAMP, 'V101', FALSE),
('2629', '미지급비용', 'LIABILITY', '2511', TRUE, 2629, CURRENT_TIMESTAMP, 'V101', FALSE),
('2639', '선수수익', 'LIABILITY', '2511', TRUE, 2639, CURRENT_TIMESTAMP, 'V101', FALSE),
('2911', '비유동부채', 'LIABILITY', '2510', TRUE, 2911, CURRENT_TIMESTAMP, 'V101', FALSE),
('2929', '사채', 'LIABILITY', '2911', TRUE, 2929, CURRENT_TIMESTAMP, 'V101', FALSE),
('2939', '신주인수권부사채', 'LIABILITY', '2911', TRUE, 2939, CURRENT_TIMESTAMP, 'V101', FALSE),
('2949', '전환사채', 'LIABILITY', '2911', TRUE, 2949, CURRENT_TIMESTAMP, 'V101', FALSE),
('2954', '장기차입금', 'LIABILITY', '2911', TRUE, 2954, CURRENT_TIMESTAMP, 'V101', FALSE),
('2959', '임대보증금', 'LIABILITY', '2911', TRUE, 2959, CURRENT_TIMESTAMP, 'V101', FALSE),
('2964', '퇴직급여충당부채', 'LIABILITY', '2911', TRUE, 2964, CURRENT_TIMESTAMP, 'V101', FALSE),
('2969', '단체퇴직보험예치금', 'LIABILITY', '2911', TRUE, 2969, CURRENT_TIMESTAMP, 'V101', FALSE),
('2974', '단체퇴직급여충당금', 'LIABILITY', '2911', TRUE, 2974, CURRENT_TIMESTAMP, 'V101', FALSE),
('3310', '자본금', 'EQUITY', NULL, TRUE, 3310, CURRENT_TIMESTAMP, 'V101', FALSE),
('3319', '자본금', 'EQUITY', '3310', TRUE, 3319, CURRENT_TIMESTAMP, 'V101', FALSE),
('3329', '보통주자본금', 'EQUITY', '3319', TRUE, 3329, CURRENT_TIMESTAMP, 'V101', FALSE),
('3333', '우선주자본금', 'EQUITY', '3319', TRUE, 3333, CURRENT_TIMESTAMP, 'V101', FALSE),
('3349', '자본잉여금', 'EQUITY', '3310', TRUE, 3349, CURRENT_TIMESTAMP, 'V101', FALSE),
('3353', '주식발행초과금', 'EQUITY', '3349', TRUE, 3353, CURRENT_TIMESTAMP, 'V101', FALSE),
('3354', '자기주식처분이익', 'EQUITY', '3349', TRUE, 3354, CURRENT_TIMESTAMP, 'V101', FALSE),
('3356', '감자차익', 'EQUITY', '3349', TRUE, 3356, CURRENT_TIMESTAMP, 'V101', FALSE),
('3379', '자본조정', 'EQUITY', '3310', TRUE, 3379, CURRENT_TIMESTAMP, 'V101', FALSE),
('3383', '자기주식', 'EQUITY', '3379', TRUE, 3383, CURRENT_TIMESTAMP, 'V101', FALSE),
('3385', '주식할인발행차금', 'EQUITY', '3379', TRUE, 3385, CURRENT_TIMESTAMP, 'V101', FALSE),
('3387', '주식매입선택권', 'EQUITY', '3379', TRUE, 3387, CURRENT_TIMESTAMP, 'V101', FALSE),
('3389', '출자전환채무', 'EQUITY', '3379', TRUE, 3389, CURRENT_TIMESTAMP, 'V101', FALSE),
('3391', '감자차손', 'EQUITY', '3379', TRUE, 3391, CURRENT_TIMESTAMP, 'V101', FALSE),
('3419', '기타포괄손익누계액', 'EQUITY', '3310', TRUE, 3419, CURRENT_TIMESTAMP, 'V101', FALSE),
('3424', '매도가능증권평가손익', 'EQUITY', '3419', TRUE, 3424, CURRENT_TIMESTAMP, 'V101', FALSE),
('3427', '해외사업환산손익', 'EQUITY', '3419', TRUE, 3427, CURRENT_TIMESTAMP, 'V101', FALSE),
('3430', '현금흐름위험회피파생상품평가손익', 'EQUITY', '3419', TRUE, 3430, CURRENT_TIMESTAMP, 'V101', FALSE),
('3511', '이익잉여금', 'EQUITY', '3310', TRUE, 3511, CURRENT_TIMESTAMP, 'V101', FALSE),
('3515', '법정적립금', 'EQUITY', '3511', TRUE, 3515, CURRENT_TIMESTAMP, 'V101', FALSE),
('3531', '기타법정적립금', 'EQUITY', '3515', TRUE, 3531, CURRENT_TIMESTAMP, 'V101', FALSE),
('3532', '배당금', 'EQUITY', '3511', TRUE, 3532, CURRENT_TIMESTAMP, 'V101', FALSE),
('3565', '임의적립금', 'EQUITY', '3511', TRUE, 3565, CURRENT_TIMESTAMP, 'V101', FALSE),
('3569', '기타임의적립금', 'EQUITY', '3565', TRUE, 3569, CURRENT_TIMESTAMP, 'V101', FALSE),
('3759', '미처분이익잉여금', 'EQUITY', '3511', TRUE, 3759, CURRENT_TIMESTAMP, 'V101', FALSE),
('3779', '전기이월미처분이익잉여금', 'EQUITY', '3759', TRUE, 3779, CURRENT_TIMESTAMP, 'V101', FALSE),
('3799', '당기순이익', 'EQUITY', '3759', TRUE, 3799, CURRENT_TIMESTAMP, 'V101', FALSE),
('4001', '손익', 'REVENUE', NULL, TRUE, 4001, CURRENT_TIMESTAMP, 'V101', FALSE),
('4011', '매출', 'REVENUE', '8011', TRUE, 4011, CURRENT_TIMESTAMP, 'V101', FALSE),
('4019', '상품매출', 'REVENUE', '4011', TRUE, 4019, CURRENT_TIMESTAMP, 'V101', FALSE),
('4029', '상품매출환입및에누리', 'REVENUE', '4011', TRUE, 4029, CURRENT_TIMESTAMP, 'V101', FALSE),
('4039', '상품매출할인', 'REVENUE', '4011', TRUE, 4039, CURRENT_TIMESTAMP, 'V101', FALSE),
('4049', '제품매출', 'REVENUE', '4011', TRUE, 4049, CURRENT_TIMESTAMP, 'V101', FALSE),
('4059', '제품매출환입및에누리', 'REVENUE', '4011', TRUE, 4059, CURRENT_TIMESTAMP, 'V101', FALSE),
('4069', '제품매출할인', 'REVENUE', '4011', TRUE, 4069, CURRENT_TIMESTAMP, 'V101', FALSE),
('4099', '공사수입금', 'REVENUE', '4011', TRUE, 4099, CURRENT_TIMESTAMP, 'V101', FALSE),
('4119', '용역매출', 'REVENUE', '4011', TRUE, 4119, CURRENT_TIMESTAMP, 'V101', FALSE),
('4511', '매출원가', 'REVENUE', '8011', TRUE, 4511, CURRENT_TIMESTAMP, 'V101', FALSE),
('5018', '제품제조', 'COST_OF_SALES', NULL, TRUE, 5018, CURRENT_TIMESTAMP, 'V101', FALSE),
('5019', '재료비', 'COST_OF_SALES', '5018', TRUE, 5019, CURRENT_TIMESTAMP, 'V101', FALSE),
('5038', '노무비(제품)', 'COST_OF_SALES', '5018', TRUE, 5038, CURRENT_TIMESTAMP, 'V101', FALSE),
('5108', '경비(제품)', 'COST_OF_SALES', '5018', TRUE, 5108, CURRENT_TIMESTAMP, 'V101', FALSE),
('6018', '용역', 'NON_OPERATING', NULL, TRUE, 6018, CURRENT_TIMESTAMP, 'V101', FALSE),
('6022', '재료비', 'NON_OPERATING', '6018', TRUE, 6022, CURRENT_TIMESTAMP, 'V101', FALSE),
('6038', '노무비(용역)', 'NON_OPERATING', '6018', TRUE, 6038, CURRENT_TIMESTAMP, 'V101', FALSE),
('6108', '경비(용역)', 'NON_OPERATING', '6018', TRUE, 6108, CURRENT_TIMESTAMP, 'V101', FALSE),
('7018', '기타', 'NON_OPERATING', NULL, TRUE, 7018, CURRENT_TIMESTAMP, 'V101', FALSE),
('7022', '재료비', 'NON_OPERATING', '7018', TRUE, 7022, CURRENT_TIMESTAMP, 'V101', FALSE),
('7038', '노무비(기타)', 'NON_OPERATING', '7018', TRUE, 7038, CURRENT_TIMESTAMP, 'V101', FALSE),
('7108', '경비(기타)', 'NON_OPERATING', '7018', TRUE, 7108, CURRENT_TIMESTAMP, 'V101', FALSE),
('8011', '매출총이익', 'SGA', '9011', TRUE, 8011, CURRENT_TIMESTAMP, 'V101', FALSE),
('8018', '판매비및일반관리비', 'SGA', '9011', TRUE, 8018, CURRENT_TIMESTAMP, 'V101', FALSE),
('8019', '임원급여(판)', 'SGA', '8018', TRUE, 8019, CURRENT_TIMESTAMP, 'V101', FALSE),
('8029', '직원급여(판)', 'SGA', '8018', TRUE, 8029, CURRENT_TIMESTAMP, 'V101', FALSE),
('8039', '상여금(판)', 'SGA', '8018', TRUE, 8039, CURRENT_TIMESTAMP, 'V101', FALSE),
('8049', '제수당(판)', 'SGA', '8018', TRUE, 8049, CURRENT_TIMESTAMP, 'V101', FALSE),
('8059', '잡급(판)', 'SGA', '8018', TRUE, 8059, CURRENT_TIMESTAMP, 'V101', FALSE),
('8089', '퇴직급여(판)', 'SGA', '8018', TRUE, 8089, CURRENT_TIMESTAMP, 'V101', FALSE),
('8109', '복리후생비(판)', 'SGA', '8018', TRUE, 8109, CURRENT_TIMESTAMP, 'V101', FALSE),
('8119', '여비교통비(판)', 'SGA', '8018', TRUE, 8119, CURRENT_TIMESTAMP, 'V101', FALSE),
('8127', '접대비(판)', 'SGA', '8018', TRUE, 8127, CURRENT_TIMESTAMP, 'V101', FALSE),
('8128', '접대비-카드(판)', 'SGA', '8127', TRUE, 8128, CURRENT_TIMESTAMP, 'V101', FALSE),
('8129', '접대비-일반(판)', 'SGA', '8127', TRUE, 8129, CURRENT_TIMESTAMP, 'V101', FALSE),
('8139', '통신비(판)', 'SGA', '8018', TRUE, 8139, CURRENT_TIMESTAMP, 'V101', FALSE),
('8140', '전력비', 'SGA', '8018', TRUE, 8140, CURRENT_TIMESTAMP, 'V101', FALSE),
('8149', '경상연구개발비(판)', 'SGA', '8018', TRUE, 8149, CURRENT_TIMESTAMP, 'V101', FALSE),
('8159', '소모품비(판)', 'SGA', '8018', TRUE, 8159, CURRENT_TIMESTAMP, 'V101', FALSE),
('8229', '세금과공과금(판)', 'SGA', '8018', TRUE, 8229, CURRENT_TIMESTAMP, 'V101', FALSE),
('8239', '감가상각비(판)', 'SGA', '8018', TRUE, 8239, CURRENT_TIMESTAMP, 'V101', FALSE),
('8249', '지급임차료(판)', 'SGA', '8018', TRUE, 8249, CURRENT_TIMESTAMP, 'V101', FALSE),
('8259', '수선비(판)', 'SGA', '8018', TRUE, 8259, CURRENT_TIMESTAMP, 'V101', FALSE),
('8269', '보험료(판)', 'SGA', '8018', TRUE, 8269, CURRENT_TIMESTAMP, 'V101', FALSE),
('8279', '차량유지비(판)', 'SGA', '8018', TRUE, 8279, CURRENT_TIMESTAMP, 'V101', FALSE),
('8289', '교육훈련비(판)', 'SGA', '8018', TRUE, 8289, CURRENT_TIMESTAMP, 'V101', FALSE),
('8299', '사무용품비(판)', 'SGA', '8018', TRUE, 8299, CURRENT_TIMESTAMP, 'V101', FALSE),
('8309', '수도광열비(판)', 'SGA', '8018', TRUE, 8309, CURRENT_TIMESTAMP, 'V101', FALSE),
('8319', '지급수수료(판)', 'SGA', '8018', TRUE, 8319, CURRENT_TIMESTAMP, 'V101', FALSE),
('8329', '도서인쇄비(판)', 'SGA', '8018', TRUE, 8329, CURRENT_TIMESTAMP, 'V101', FALSE),
('8338', '광고선전비(판)', 'SGA', '8018', TRUE, 8338, CURRENT_TIMESTAMP, 'V101', FALSE),
('8339', '외주용역비(판)', 'SGA', '8018', TRUE, 8339, CURRENT_TIMESTAMP, 'V101', FALSE),
('8349', '판매촉진비(판)', 'SGA', '8018', TRUE, 8349, CURRENT_TIMESTAMP, 'V101', FALSE),
('8359', '대손상각비(판)', 'SGA', '8018', TRUE, 8359, CURRENT_TIMESTAMP, 'V101', FALSE),
('8369', '건물관리비(판)', 'SGA', '8018', TRUE, 8369, CURRENT_TIMESTAMP, 'V101', FALSE),
('8379', '운반비(판)', 'SGA', '8018', TRUE, 8379, CURRENT_TIMESTAMP, 'V101', FALSE),
('8389', '수출제비용(판)', 'SGA', '8018', TRUE, 8389, CURRENT_TIMESTAMP, 'V101', FALSE),
('8399', '판매수수료(판)', 'SGA', '8018', TRUE, 8399, CURRENT_TIMESTAMP, 'V101', FALSE),
('8409', '무형자산상각(판)', 'SGA', '8018', TRUE, 8409, CURRENT_TIMESTAMP, 'V101', FALSE),
('8419', '리스료', 'SGA', '8018', TRUE, 8419, CURRENT_TIMESTAMP, 'V101', FALSE),
('8429', '견본비(판)', 'SGA', '8018', TRUE, 8429, CURRENT_TIMESTAMP, 'V101', FALSE),
('8489', '잡비(판)', 'SGA', '8018', TRUE, 8489, CURRENT_TIMESTAMP, 'V101', FALSE),
('8490', '도급비', 'SGA', '8127', TRUE, 8490, CURRENT_TIMESTAMP, 'V101', FALSE),
('9011', '영업이익', 'NON_OPERATING', '9611', TRUE, 9011, CURRENT_TIMESTAMP, 'V101', FALSE),
('9018', '영업외수익', 'NON_OPERATING', '9611', TRUE, 9018, CURRENT_TIMESTAMP, 'V101', FALSE),
('9019', '이자수익', 'NON_OPERATING', '9018', TRUE, 9019, CURRENT_TIMESTAMP, 'V101', FALSE),
('9029', '유가증권이자', 'NON_OPERATING', '9018', TRUE, 9029, CURRENT_TIMESTAMP, 'V101', FALSE),
('9039', '배당금수익', 'NON_OPERATING', '9018', TRUE, 9039, CURRENT_TIMESTAMP, 'V101', FALSE),
('9049', '수입임대료', 'NON_OPERATING', '9018', TRUE, 9049, CURRENT_TIMESTAMP, 'V101', FALSE),
('9059', '전기오류수정이익', 'NON_OPERATING', '9018', TRUE, 9059, CURRENT_TIMESTAMP, 'V101', FALSE),
('9069', '유가증권처분이익', 'NON_OPERATING', '9018', TRUE, 9069, CURRENT_TIMESTAMP, 'V101', FALSE),
('9072', '유가증권평가이익', 'NON_OPERATING', '9018', TRUE, 9072, CURRENT_TIMESTAMP, 'V101', FALSE),
('9079', '외환차익', 'NON_OPERATING', '9018', TRUE, 9079, CURRENT_TIMESTAMP, 'V101', FALSE),
('9089', '외화환산이익', 'NON_OPERATING', '9018', TRUE, 9089, CURRENT_TIMESTAMP, 'V101', FALSE),
('9095', '지분법평가이익', 'NON_OPERATING', '9018', TRUE, 9095, CURRENT_TIMESTAMP, 'V101', FALSE),
('9099', '수입수수료', 'NON_OPERATING', '9018', TRUE, 9099, CURRENT_TIMESTAMP, 'V101', FALSE),
('9109', '대손충당금환입', 'NON_OPERATING', '9018', TRUE, 9109, CURRENT_TIMESTAMP, 'V101', FALSE),
('9120', '미지급세금', 'NON_OPERATING', '9717', TRUE, 9120, CURRENT_TIMESTAMP, 'V101', FALSE),
('9149', '유형자산처분이익', 'NON_OPERATING', '9018', TRUE, 9149, CURRENT_TIMESTAMP, 'V101', FALSE),
('9155', '투자유가증권감액손실환입', 'NON_OPERATING', '9018', TRUE, 9155, CURRENT_TIMESTAMP, 'V101', FALSE),
('9159', '투자자산처분이익', 'NON_OPERATING', '9018', TRUE, 9159, CURRENT_TIMESTAMP, 'V101', FALSE),
('9169', '상각채권추심이익', 'NON_OPERATING', '9018', TRUE, 9169, CURRENT_TIMESTAMP, 'V101', FALSE),
('9179', '사채상환이익', 'NON_OPERATING', '9018', TRUE, 9179, CURRENT_TIMESTAMP, 'V101', FALSE),
('9189', '법인세환급액', 'NON_OPERATING', '9018', TRUE, 9189, CURRENT_TIMESTAMP, 'V101', FALSE),
('9199', '잡이익', 'NON_OPERATING', '9018', TRUE, 9199, CURRENT_TIMESTAMP, 'V101', FALSE),
('9209', '자산수증이익', 'NON_OPERATING', '9018', TRUE, 9209, CURRENT_TIMESTAMP, 'V101', FALSE),
('9219', '채무면제이익', 'NON_OPERATING', '9018', TRUE, 9219, CURRENT_TIMESTAMP, 'V101', FALSE),
('9229', '보험차익', 'NON_OPERATING', '9018', TRUE, 9229, CURRENT_TIMESTAMP, 'V101', FALSE),
('9239', '중소투자준비금환입', 'NON_OPERATING', '9018', TRUE, 9239, CURRENT_TIMESTAMP, 'V101', FALSE),
('9249', '기술개발준비금환입', 'NON_OPERATING', '9018', TRUE, 9249, CURRENT_TIMESTAMP, 'V101', FALSE),
('9259', '해외개척준비금환입', 'NON_OPERATING', '9018', TRUE, 9259, CURRENT_TIMESTAMP, 'V101', FALSE),
('9269', '지방이전준비금환입', 'NON_OPERATING', '9018', TRUE, 9269, CURRENT_TIMESTAMP, 'V101', FALSE),
('9279', '수출손실준비금환입', 'NON_OPERATING', '9018', TRUE, 9279, CURRENT_TIMESTAMP, 'V101', FALSE),
('9289', '국고보조금', 'NON_OPERATING', '9018', TRUE, 9289, CURRENT_TIMESTAMP, 'V101', FALSE),
('9318', '영업외비용', 'NON_OPERATING', '9611', TRUE, 9318, CURRENT_TIMESTAMP, 'V101', FALSE),
('9319', '이자비용', 'NON_OPERATING', '9318', TRUE, 9319, CURRENT_TIMESTAMP, 'V101', FALSE),
('9329', '외환차손', 'NON_OPERATING', '9318', TRUE, 9329, CURRENT_TIMESTAMP, 'V101', FALSE),
('9339', '외화환산손실', 'NON_OPERATING', '9318', TRUE, 9339, CURRENT_TIMESTAMP, 'V101', FALSE),
('9349', '기타의대손상각비', 'NON_OPERATING', '9318', TRUE, 9349, CURRENT_TIMESTAMP, 'V101', FALSE),
('9359', '전기오류수정손실', 'NON_OPERATING', '9318', TRUE, 9359, CURRENT_TIMESTAMP, 'V101', FALSE),
('9369', '기부금', 'NON_OPERATING', '9318', TRUE, 9369, CURRENT_TIMESTAMP, 'V101', FALSE),
('9379', '지분법평가손실', 'NON_OPERATING', '9318', TRUE, 9379, CURRENT_TIMESTAMP, 'V101', FALSE),
('9389', '유가증권처분손실', 'NON_OPERATING', '9318', TRUE, 9389, CURRENT_TIMESTAMP, 'V101', FALSE),
('9395', '유가증권평가손실', 'NON_OPERATING', '9318', TRUE, 9395, CURRENT_TIMESTAMP, 'V101', FALSE),
('9399', '재고자산감모손실', 'NON_OPERATING', '9318', TRUE, 9399, CURRENT_TIMESTAMP, 'V101', FALSE),
('9409', '재고자산평가손실', 'NON_OPERATING', '9318', TRUE, 9409, CURRENT_TIMESTAMP, 'V101', FALSE),
('9499', '보상비', 'NON_OPERATING', '9318', TRUE, 9499, CURRENT_TIMESTAMP, 'V101', FALSE),
('9509', '유형자산처분손실', 'NON_OPERATING', '9318', TRUE, 9509, CURRENT_TIMESTAMP, 'V101', FALSE),
('9519', '투자자산처분손실', 'NON_OPERATING', '9318', TRUE, 9519, CURRENT_TIMESTAMP, 'V101', FALSE),
('9529', '사채상환손실', 'NON_OPERATING', '9318', TRUE, 9529, CURRENT_TIMESTAMP, 'V101', FALSE),
('9539', '법인세추납액', 'NON_OPERATING', '9318', TRUE, 9539, CURRENT_TIMESTAMP, 'V101', FALSE),
('9549', '잡손실', 'NON_OPERATING', '9318', TRUE, 9549, CURRENT_TIMESTAMP, 'V101', FALSE),
('9559', '재해손실', 'NON_OPERATING', '9318', TRUE, 9559, CURRENT_TIMESTAMP, 'V101', FALSE),
('9569', '중소투자준비금전입', 'NON_OPERATING', '9318', TRUE, 9569, CURRENT_TIMESTAMP, 'V101', FALSE),
('9579', '기술개발준비금전입', 'NON_OPERATING', '9318', TRUE, 9579, CURRENT_TIMESTAMP, 'V101', FALSE),
('9589', '해외개척준비금전입', 'NON_OPERATING', '9318', TRUE, 9589, CURRENT_TIMESTAMP, 'V101', FALSE),
('9599', '지방이전준비금전입', 'NON_OPERATING', '9318', TRUE, 9599, CURRENT_TIMESTAMP, 'V101', FALSE),
('9603', '수출손실준비금전입', 'NON_OPERATING', '9318', TRUE, 9603, CURRENT_TIMESTAMP, 'V101', FALSE),
('9606', '특별상각', 'NON_OPERATING', '9318', TRUE, 9606, CURRENT_TIMESTAMP, 'V101', FALSE),
('9611', '법인세비용차감전순손익', 'NON_OPERATING', '9999', TRUE, 9611, CURRENT_TIMESTAMP, 'V101', FALSE),
('9717', '법인세비용', 'NON_OPERATING', '9999', TRUE, 9717, CURRENT_TIMESTAMP, 'V101', FALSE),
('9719', '법인세등', 'NON_OPERATING', '9717', TRUE, 9719, CURRENT_TIMESTAMP, 'V101', FALSE),
('9999', '당기순이익', 'INCOME_TAX', '4001', TRUE, 9999, CURRENT_TIMESTAMP, 'V101', FALSE)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    parent_code = EXCLUDED.parent_code,
    display_order = EXCLUDED.display_order,
    is_deleted = FALSE,
    deleted_at = NULL,
    deleted_by = NULL,
    modified_at = CURRENT_TIMESTAMP,
    modified_by = 'V101'
WHERE coa.name IS DISTINCT FROM EXCLUDED.name
   OR coa.category IS DISTINCT FROM EXCLUDED.category
   OR coa.parent_code IS DISTINCT FROM EXCLUDED.parent_code
   OR coa.display_order IS DISTINCT FROM EXCLUDED.display_order
   OR coa.is_deleted IS DISTINCT FROM FALSE
   OR coa.deleted_at IS NOT NULL
   OR coa.deleted_by IS NOT NULL;

----------------------------------------------------------------------
-- 0-B) 결정표를 SQL 데이터로 고정한다.
--    22개 journal_lines 매핑 + journal_lines 미사용 계정의 후속 결정 6개.
----------------------------------------------------------------------
DROP TABLE IF EXISTS v101_account_code_map;
CREATE TEMP TABLE v101_account_code_map (
    legacy_code     VARCHAR(6) PRIMARY KEY,
    target_code     VARCHAR(6),
    action          VARCHAR(30) NOT NULL
) ON COMMIT DROP;

INSERT INTO v101_account_code_map (legacy_code, target_code, action) VALUES
    -- journal_lines 3자리 22개: 결정 문서의 이관 매핑 그대로
    ('102', '1039', 'MAPPED'),
    ('110', '1089', 'MAPPED'),
    ('220', '2559', 'MAPPED'),
    ('401', '4019', 'MAPPED'),
    ('831', '8319', 'MAPPED'),
    ('101', '1019', 'MAPPED'),
    ('142', '2024', 'MAPPED'),
    ('818', '8239', 'MAPPED'),
    ('404', '4049', 'MAPPED'),
    ('201', '2519', 'MAPPED'),
    ('814', '8139', 'MAPPED'),
    ('819', '8249', 'MAPPED'),
    ('146', '2054', 'MAPPED'),
    ('210', '2539', 'MAPPED'),
    ('221', '2549', 'MAPPED'),
    ('260', '2954', 'MAPPED'),
    ('343', '3779', 'MAPPED'),
    ('501', '4511', 'MAPPED'),
    ('901', '9019', 'MAPPED'),
    ('991', '9719', 'MAPPED'),
    ('801', '8029', 'MAPPED'),
    ('301', '3329', 'MAPPED'),

    -- journal_lines 사용 7건: 결정 3에 따라 220과 동일하게 2559로 통합
    ('103', '1029', 'MAPPED_UNUSED'),
    ('104', '1059', 'MERGED_UNUSED'),
    ('105', '1059', 'MERGED_UNUSED'),
    ('255', '2559', 'MAPPED'),
    ('900', NULL,   'RETIRED_SPLIT_UNUSED'),
    ('919', '9399', 'MAPPED_UNUSED');

-- 900은 journal_lines 사용 0건이므로 데이터 UPDATE는 하지 않는다.
-- 새 분류 대상은 9018(영업외수익), 9318(영업외비용)이며, 255는 2559(부가세예수금)로 통합한다.
DROP TABLE IF EXISTS v101_account_code_targets;
CREATE TEMP TABLE v101_account_code_targets (
    target_code VARCHAR(6) PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO v101_account_code_targets (target_code) VALUES
    ('1019'), ('1029'), ('1039'), ('1059'), ('1089'),
    ('2024'), ('2054'), ('2519'), ('2539'), ('2549'), ('2559'),
    ('2954'), ('3329'), ('3779'), ('4019'), ('4049'), ('4511'),
    ('8029'), ('8139'), ('8239'), ('8249'), ('8319'),
    ('9018'), ('9019'), ('9318'), ('9399'), ('9719');

----------------------------------------------------------------------
-- 1) 이관 전 검증
--    결정표에 없거나 실행 가능한 target이 없는 3자리 코드는 즉시 실패한다.
----------------------------------------------------------------------
DO $$
DECLARE
    offending_codes TEXT;
BEGIN
    SELECT string_agg(offending_code, ', ' ORDER BY offending_code)
      INTO offending_codes
      FROM (
            SELECT format(
                       'journal_lines.account_code=%s (%s행)',
                       jl.account_code,
                       COUNT(*)
                   ) AS offending_code
              FROM journal_lines jl
              LEFT JOIN v101_account_code_map m
                ON m.legacy_code = jl.account_code
             WHERE length(jl.account_code) = 3
               AND m.target_code IS NULL
             GROUP BY jl.account_code

            UNION ALL

            SELECT format(
                       'cash_receipts.debit_account_code=%s (%s행)',
                       cr.debit_account_code,
                       COUNT(*)
                   ) AS offending_code
              FROM cash_receipts cr
              LEFT JOIN v101_account_code_map m
                ON m.legacy_code = cr.debit_account_code
             WHERE length(cr.debit_account_code) = 3
               AND m.target_code IS NULL
             GROUP BY cr.debit_account_code

            UNION ALL

            SELECT format(
                       'cash_receipts.credit_account_code=%s (%s행)',
                       cr.credit_account_code,
                       COUNT(*)
                   ) AS offending_code
              FROM cash_receipts cr
              LEFT JOIN v101_account_code_map m
                ON m.legacy_code = cr.credit_account_code
             WHERE length(cr.credit_account_code) = 3
               AND m.target_code IS NULL
             GROUP BY cr.credit_account_code

            UNION ALL

            SELECT format(
                       'bank_accounts.chart_account_code=%s (%s행)',
                       ba.chart_account_code,
                       COUNT(*)
                   ) AS offending_code
              FROM bank_accounts ba
              LEFT JOIN v101_account_code_map m
                ON m.legacy_code = ba.chart_account_code
             WHERE length(ba.chart_account_code) = 3
               AND m.target_code IS NULL
             GROUP BY ba.chart_account_code

            UNION ALL

            SELECT format(
                       'card_master.linked_account_code=%s (%s행)',
                       cm.linked_account_code,
                       COUNT(*)
                   ) AS offending_code
              FROM card_master cm
              LEFT JOIN v101_account_code_map m
                ON m.legacy_code = cm.linked_account_code
             WHERE length(cm.linked_account_code) = 3
               AND m.target_code IS NULL
             GROUP BY cm.linked_account_code
      ) offending;

    IF offending_codes IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            MESSAGE = 'V101 이관 중단: 결정표에 없거나 실행 가능한 target이 없는 3자리 코드: '
                      || offending_codes;
    END IF;
END $$;

----------------------------------------------------------------------
-- 2) is_leaf 파생값 유지
--    애플리케이션은 기존 is_leaf 컬럼을 읽으므로 컬럼을 제거하지 않는다.
--    대신 저장된 입력값은 무시하고, 활성 자식 유무로만 재계산한다.
--    BEFORE 트리거는 해당 행을, AFTER 트리거는 부모를 갱신한다.
--    is_deleted 는 soft-delete 행을 트리에서 제외하므로 복원/삭제에도 일관된다.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION v101_derive_chart_of_accounts_leaf()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP <> 'DELETE' THEN
        NEW.is_leaf := NOT EXISTS (
            SELECT 1
              FROM chart_of_accounts child
             WHERE child.parent_code = NEW.code
               AND child.code <> NEW.code
               AND child.is_deleted = FALSE
        );
        RETURN NEW;
    END IF;

    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION v101_sync_chart_of_accounts_parent_leaf()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    affected_codes VARCHAR(6)[];
BEGIN
    IF TG_OP = 'DELETE' THEN
        affected_codes := ARRAY[OLD.parent_code];
    ELSIF TG_OP = 'UPDATE' THEN
        affected_codes := ARRAY[NEW.code, OLD.parent_code, NEW.parent_code];
    ELSE
        affected_codes := ARRAY[NEW.code, NEW.parent_code];
    END IF;

    UPDATE chart_of_accounts account
       SET is_leaf = NOT EXISTS (
           SELECT 1
             FROM chart_of_accounts child
            WHERE child.parent_code = account.code
              AND child.code <> account.code
              AND child.is_deleted = FALSE
       )
     WHERE account.code = ANY (affected_codes)
       AND account.is_deleted = FALSE
       AND account.is_leaf IS DISTINCT FROM (
           NOT EXISTS (
               SELECT 1
                 FROM chart_of_accounts child
                WHERE child.parent_code = account.code
                  AND child.code <> account.code
                  AND child.is_deleted = FALSE
           )
       );

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_v101_derive_chart_of_accounts_leaf ON chart_of_accounts;
CREATE TRIGGER trg_v101_derive_chart_of_accounts_leaf
BEFORE INSERT OR UPDATE OF parent_code, is_deleted, is_leaf
ON chart_of_accounts
FOR EACH ROW
EXECUTE FUNCTION v101_derive_chart_of_accounts_leaf();

DROP TRIGGER IF EXISTS trg_v101_sync_chart_of_accounts_parent_leaf ON chart_of_accounts;
CREATE TRIGGER trg_v101_sync_chart_of_accounts_parent_leaf
AFTER INSERT OR DELETE OR UPDATE OF parent_code, is_deleted
ON chart_of_accounts
FOR EACH ROW
EXECUTE FUNCTION v101_sync_chart_of_accounts_parent_leaf();

-- 기존 4자리/5자리 계정까지 포함해 현재 저장값을 한 번 정합화한다.
UPDATE chart_of_accounts account
   SET is_leaf = NOT EXISTS (
       SELECT 1
         FROM chart_of_accounts child
        WHERE child.parent_code = account.code
          AND child.code <> account.code
          AND child.is_deleted = FALSE
   );

COMMENT ON COLUMN chart_of_accounts.is_leaf IS
    '활성 자식 계정이 없으면 TRUE. V101 트리거가 자식 유무로 자동 파생하며 입력값은 신뢰하지 않는다.';

-- 이관 대상 4자리 계정은 물리적으로 존재하고 활성 상태여야 한다.
DO $$
DECLARE
    missing_targets TEXT;
BEGIN
    SELECT string_agg(t.target_code, ', ' ORDER BY t.target_code)
      INTO missing_targets
      FROM v101_account_code_targets t
      LEFT JOIN chart_of_accounts coa ON coa.code = t.target_code
     WHERE coa.code IS NULL OR coa.is_deleted = TRUE;

    IF missing_targets IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'foreign_key_violation',
            MESSAGE = 'V101 이관 중단: chart_of_accounts에 없거나 삭제된 target code: '
                      || missing_targets;
    END IF;
END $$;

----------------------------------------------------------------------
-- 3) 원본 보존
--    별도 이력 테이블 대신 원본 코드 컬럼을 둔다.
--    이유: 각 원장/입금보고서 행과 원본 3자리 코드를 직접 연결하여
--    행 단위 rollback 및 감사 추적을 가능하게 하고, 4자리 기존 행은 NULL로
--    남겨 변경하지 않았음을 구분하기 쉽기 때문이다.
----------------------------------------------------------------------
ALTER TABLE journal_lines
    ADD COLUMN IF NOT EXISTS legacy_account_code VARCHAR(6);

ALTER TABLE cash_receipts
    ADD COLUMN IF NOT EXISTS legacy_debit_account_code VARCHAR(20);

ALTER TABLE cash_receipts
    ADD COLUMN IF NOT EXISTS legacy_credit_account_code VARCHAR(20);

ALTER TABLE bank_accounts
    ADD COLUMN IF NOT EXISTS legacy_chart_account_code VARCHAR(10);

ALTER TABLE card_master
    ADD COLUMN IF NOT EXISTS legacy_linked_account_code VARCHAR(10);

COMMENT ON COLUMN journal_lines.legacy_account_code IS
    'V101 이관 전 자체 3자리 계정 코드. NULL이면 V101에서 이관하지 않은 행.';

COMMENT ON COLUMN cash_receipts.legacy_debit_account_code IS
    'V101 이관 전 debit_account_code. NULL이면 V101에서 이관하지 않은 값.';

COMMENT ON COLUMN cash_receipts.legacy_credit_account_code IS
    'V101 이관 전 credit_account_code. NULL이면 V101에서 이관하지 않은 값.';

COMMENT ON COLUMN bank_accounts.legacy_chart_account_code IS
    'V101 이관 전 chart_account_code. NULL이면 V101에서 이관하지 않은 값.';

COMMENT ON COLUMN card_master.legacy_linked_account_code IS
    'V101 이관 전 linked_account_code. NULL이면 V101에서 이관하지 않은 값.';

----------------------------------------------------------------------
-- 4) 이관 전 차변·대변 합계 snapshot
--    category는 이관 전 chart_of_accounts의 category를 기준으로 고정한다.
--    코드 통일이 금액과 원래 계정 카테고리별 합계를 바꾸지 않았는지 대조한다.
----------------------------------------------------------------------
DROP TABLE IF EXISTS v101_journal_category_totals_before;
CREATE TEMP TABLE v101_journal_category_totals_before ON COMMIT DROP AS
SELECT COALESCE(coa.category, '__MISSING_CATEGORY__') AS category,
       SUM(jl.debit_amount) AS debit_total,
       SUM(jl.credit_amount) AS credit_total,
       COUNT(*) AS line_count
  FROM journal_lines jl
  LEFT JOIN chart_of_accounts coa ON coa.code = jl.account_code
 WHERE length(jl.account_code) = 3
 GROUP BY COALESCE(coa.category, '__MISSING_CATEGORY__');

DROP TABLE IF EXISTS v101_cash_category_totals_before;
CREATE TEMP TABLE v101_cash_category_totals_before ON COMMIT DROP AS
SELECT 'DEBIT' AS side,
       COALESCE(coa.category, '__MISSING_CATEGORY__') AS category,
       SUM(cr.amount) AS amount_total,
       COUNT(*) AS row_count
  FROM cash_receipts cr
  LEFT JOIN chart_of_accounts coa ON coa.code = cr.debit_account_code
 WHERE length(cr.debit_account_code) = 3
 GROUP BY COALESCE(coa.category, '__MISSING_CATEGORY__')
UNION ALL
SELECT 'CREDIT' AS side,
       COALESCE(coa.category, '__MISSING_CATEGORY__') AS category,
       SUM(cr.amount) AS amount_total,
       COUNT(*) AS row_count
  FROM cash_receipts cr
  LEFT JOIN chart_of_accounts coa ON coa.code = cr.credit_account_code
 WHERE length(cr.credit_account_code) = 3
 GROUP BY COALESCE(coa.category, '__MISSING_CATEGORY__');

----------------------------------------------------------------------
-- 5) 결정표대로 UPDATE
--    WHERE length(code) = 3으로 4자리·5자리 기존 행을 건드리지 않는다.
----------------------------------------------------------------------
UPDATE journal_lines jl
   SET legacy_account_code = jl.account_code,
       account_code = m.target_code
  FROM v101_account_code_map m
 WHERE m.legacy_code = jl.account_code
   AND m.target_code IS NOT NULL
   AND length(jl.account_code) = 3;

UPDATE cash_receipts cr
   SET legacy_debit_account_code = cr.debit_account_code,
       debit_account_code = m.target_code
  FROM v101_account_code_map m
 WHERE m.legacy_code = cr.debit_account_code
   AND m.target_code IS NOT NULL
   AND length(cr.debit_account_code) = 3;

UPDATE cash_receipts cr
   SET legacy_credit_account_code = cr.credit_account_code,
       credit_account_code = m.target_code
  FROM v101_account_code_map m
 WHERE m.legacy_code = cr.credit_account_code
   AND m.target_code IS NOT NULL
   AND length(cr.credit_account_code) = 3;

UPDATE bank_accounts ba
   SET legacy_chart_account_code = ba.chart_account_code,
       chart_account_code = m.target_code
  FROM v101_account_code_map m
 WHERE m.legacy_code = ba.chart_account_code
   AND m.target_code IS NOT NULL
   AND length(ba.chart_account_code) = 3;

UPDATE card_master cm
   SET legacy_linked_account_code = cm.linked_account_code,
       linked_account_code = m.target_code
  FROM v101_account_code_map m
 WHERE m.legacy_code = cm.linked_account_code
   AND m.target_code IS NOT NULL
   AND length(cm.linked_account_code) = 3;

DROP TABLE IF EXISTS v101_migrated_target_codes;
CREATE TEMP TABLE v101_migrated_target_codes (
    target_code VARCHAR(6) PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO v101_migrated_target_codes (target_code)
SELECT DISTINCT m.target_code
  FROM v101_account_code_map m
 WHERE m.target_code IS NOT NULL
   AND (
       EXISTS (
           SELECT 1 FROM journal_lines jl
            WHERE jl.legacy_account_code = m.legacy_code
       )
       OR EXISTS (
           SELECT 1 FROM cash_receipts cr
            WHERE cr.legacy_debit_account_code = m.legacy_code
       )
       OR EXISTS (
           SELECT 1 FROM cash_receipts cr
            WHERE cr.legacy_credit_account_code = m.legacy_code
       )
       OR EXISTS (
           SELECT 1 FROM bank_accounts ba
            WHERE ba.legacy_chart_account_code = m.legacy_code
       )
       OR EXISTS (
           SELECT 1 FROM card_master cm
            WHERE cm.legacy_linked_account_code = m.legacy_code
       )
   );

----------------------------------------------------------------------
-- 6) 이관 후 검증
----------------------------------------------------------------------
DO $$
DECLARE
    remaining_codes TEXT;
BEGIN
    SELECT string_agg(offending_code, ', ' ORDER BY offending_code)
      INTO remaining_codes
      FROM (
            SELECT format('journal_lines.account_code=%s (%s행)', account_code, COUNT(*))
                   AS offending_code
              FROM journal_lines
             WHERE length(account_code) = 3
             GROUP BY account_code

            UNION ALL

            SELECT format(
                       'cash_receipts.debit_account_code=%s (%s행)',
                       debit_account_code,
                       COUNT(*)
                   ) AS offending_code
              FROM cash_receipts
             WHERE length(debit_account_code) = 3
             GROUP BY debit_account_code

            UNION ALL

            SELECT format(
                       'cash_receipts.credit_account_code=%s (%s행)',
                       credit_account_code,
                       COUNT(*)
                   ) AS offending_code
              FROM cash_receipts
             WHERE length(credit_account_code) = 3
             GROUP BY credit_account_code

            UNION ALL

            SELECT format(
                       'bank_accounts.chart_account_code=%s (%s행)',
                       chart_account_code,
                       COUNT(*)
                   ) AS offending_code
              FROM bank_accounts
             WHERE length(chart_account_code) = 3
             GROUP BY chart_account_code

            UNION ALL

            SELECT format(
                       'card_master.linked_account_code=%s (%s행)',
                       linked_account_code,
                       COUNT(*)
                   ) AS offending_code
              FROM card_master
             WHERE length(linked_account_code) = 3
             GROUP BY linked_account_code
      ) remaining;

    IF remaining_codes IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            MESSAGE = 'V101 이관 후 검증 실패: 남은 3자리 코드: ' || remaining_codes;
    END IF;
END $$;

DROP TABLE IF EXISTS v101_journal_category_totals_after;
CREATE TEMP TABLE v101_journal_category_totals_after ON COMMIT DROP AS
SELECT COALESCE(coa.category, '__MISSING_CATEGORY__') AS category,
       SUM(jl.debit_amount) AS debit_total,
       SUM(jl.credit_amount) AS credit_total,
       COUNT(*) AS line_count
  FROM journal_lines jl
  LEFT JOIN chart_of_accounts coa ON coa.code = jl.legacy_account_code
 WHERE jl.legacy_account_code IS NOT NULL
 GROUP BY COALESCE(coa.category, '__MISSING_CATEGORY__');

DROP TABLE IF EXISTS v101_cash_category_totals_after;
CREATE TEMP TABLE v101_cash_category_totals_after ON COMMIT DROP AS
SELECT 'DEBIT' AS side,
       COALESCE(coa.category, '__MISSING_CATEGORY__') AS category,
       SUM(cr.amount) AS amount_total,
       COUNT(*) AS row_count
  FROM cash_receipts cr
  LEFT JOIN chart_of_accounts coa ON coa.code = cr.legacy_debit_account_code
 WHERE cr.legacy_debit_account_code IS NOT NULL
 GROUP BY COALESCE(coa.category, '__MISSING_CATEGORY__')
UNION ALL
SELECT 'CREDIT' AS side,
       COALESCE(coa.category, '__MISSING_CATEGORY__') AS category,
       SUM(cr.amount) AS amount_total,
       COUNT(*) AS row_count
  FROM cash_receipts cr
  LEFT JOIN chart_of_accounts coa ON coa.code = cr.legacy_credit_account_code
 WHERE cr.legacy_credit_account_code IS NOT NULL
 GROUP BY COALESCE(coa.category, '__MISSING_CATEGORY__');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM (
                (SELECT category, debit_total, credit_total, line_count
                   FROM v101_journal_category_totals_before
                 EXCEPT
                 SELECT category, debit_total, credit_total, line_count
                   FROM v101_journal_category_totals_after)
                UNION ALL
                (SELECT category, debit_total, credit_total, line_count
                   FROM v101_journal_category_totals_after
                 EXCEPT
                 SELECT category, debit_total, credit_total, line_count
                   FROM v101_journal_category_totals_before)
          ) differences
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            MESSAGE = 'V101 이관 후 검증 실패: journal_lines 카테고리별 차변·대변 합계 불일치';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (
                (SELECT side, category, amount_total, row_count
                   FROM v101_cash_category_totals_before
                 EXCEPT
                 SELECT side, category, amount_total, row_count
                   FROM v101_cash_category_totals_after)
                UNION ALL
                (SELECT side, category, amount_total, row_count
                   FROM v101_cash_category_totals_after
                 EXCEPT
                 SELECT side, category, amount_total, row_count
                   FROM v101_cash_category_totals_before)
          ) differences
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            MESSAGE = 'V101 이관 후 검증 실패: cash_receipts 카테고리별 차변·대변 합계 불일치';
    END IF;
END $$;

----------------------------------------------------------------------
-- 7) chart_of_accounts 3자리 78개 처리
--    물리 삭제 대신 soft-delete한다.
--    이유: 3자리 원본 code/name/category/트리 및 audit 값을 보존하여
--    rollback과 감사 추적을 가능하게 하고, 논리 참조의 복구 여지도 남긴다.
----------------------------------------------------------------------
UPDATE chart_of_accounts
   SET is_deleted = TRUE,
       deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
       deleted_by = COALESCE(deleted_by, 'V101')
 WHERE length(code) = 3
   AND is_deleted = FALSE;

DO $$
DECLARE
    active_legacy_count BIGINT;
BEGIN
    SELECT COUNT(*)
      INTO active_legacy_count
      FROM chart_of_accounts
     WHERE length(code) = 3
       AND is_deleted = FALSE;

    IF active_legacy_count <> 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            MESSAGE = 'V101 이관 후 검증 실패: 활성 3자리 chart_of_accounts가 '
                      || active_legacy_count || '개 남음';
    END IF;
END $$;

-- 결정 7: 실제로 이관된 target은 저장 플래그와 자식 유무 모두 leaf여야 한다.
DO $$
DECLARE
    non_leaf_targets TEXT;
BEGIN
    SELECT string_agg(t.target_code, ', ' ORDER BY t.target_code)
      INTO non_leaf_targets
      FROM v101_migrated_target_codes t
      JOIN chart_of_accounts coa ON coa.code = t.target_code
     WHERE coa.is_deleted = FALSE
       AND (
           coa.is_leaf IS NOT TRUE
           OR EXISTS (
               SELECT 1
                 FROM chart_of_accounts child
                WHERE child.parent_code = coa.code
                  AND child.code <> coa.code
                  AND child.is_deleted = FALSE
           )
       );

    IF non_leaf_targets IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            MESSAGE = 'V101 이관 후 검증 실패: 이관된 target이 leaf가 아님: '
                      || non_leaf_targets;
    END IF;
END $$;

-- 결정 2: 104·105 -> 1059 (기존 104·105 행은 위 UPDATE로 보존 soft-delete)
-- 결정 3: 255 폐기, 220 사용분은 2559로 이관
-- 결정 4: 900 폐기, 9018/9318 분리 대상은 journal_lines 사용 0건
-- 결정 7은 chart_of_accounts 트리거와 위 leaf 검증으로 반영한다.

----------------------------------------------------------------------
-- 8) 신규 입금보고서 기본 계정도 이관 target으로 재정의한다.
--    V51/V48의 기존 기본값은 이미 이관·soft-delete된 자체 3자리 코드다.
--    debit만 바꾸면 credit의 V48 기본값(110)이 같은 함정으로 남으므로
--    두 컬럼을 결정표의 target으로 함께 맞춘다.
----------------------------------------------------------------------
ALTER TABLE cash_receipts
    ALTER COLUMN debit_account_code SET DEFAULT '1039';

ALTER TABLE cash_receipts
    ALTER COLUMN credit_account_code SET DEFAULT '1089';

----------------------------------------------------------------------
-- 9) V52 aging MV를 이관 후 계정 코드로 재정의한다.
--    적용된 V52는 자체 3자리 계정(101/102/110/201)을 분류하므로,
--    V101이 journal_lines를 4자리로 바꾼 뒤에는 확정·취소·재게시 분개가
--    partner_aging_snapshot 순액에서 빠진다. V52는 수정하지 않고 여기서
--    POSTED+REVERSED semantics와 새 이카운트 코드를 함께 재정의한다.
----------------------------------------------------------------------
SET lock_timeout = '10s';
SET statement_timeout = '5min';

DROP MATERIALIZED VIEW IF EXISTS partner_aging_snapshot;

CREATE MATERIALIZED VIEW partner_aging_snapshot AS
SELECT
    jl.partner_id AS partner_id,
    NULL::VARCHAR(100) AS partner_name,
    COALESCE(SUM(CASE
        WHEN jl.debit_amount > 0 AND jl.account_code IN ('1089')
        THEN jl.debit_amount ELSE 0 END), 0) AS total_receivable,
    COALESCE(SUM(CASE
        WHEN jl.credit_amount > 0 AND jl.account_code IN ('2519')
        THEN jl.credit_amount ELSE 0 END), 0) AS total_payable,
    COALESCE(SUM(CASE
        WHEN jl.debit_amount > 0 AND jl.account_code IN ('1019', '1039')
        THEN jl.debit_amount ELSE 0 END), 0) AS total_receipt,
    COALESCE(SUM(CASE
        WHEN jl.credit_amount > 0 AND jl.account_code IN ('1019', '1039')
        THEN jl.credit_amount ELSE 0 END), 0) AS total_disbursement,
    COALESCE(SUM(CASE
        WHEN jl.account_code IN ('1089')
        THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
        ELSE 0 END), 0) AS net_receivable,
    COALESCE(SUM(CASE
        WHEN jl.account_code IN ('2519')
        THEN COALESCE(jl.credit_amount, 0) - COALESCE(jl.debit_amount, 0)
        ELSE 0 END), 0) AS net_payable,
    COALESCE(SUM(CASE
        WHEN jl.account_code IN ('1019', '1039')
        THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
        ELSE 0 END), 0) AS net_cash,
    NOW() AS last_refreshed_at
FROM journal_lines jl
JOIN journals j
  ON j.id = jl.journal_id
 AND j.is_deleted = FALSE
 AND j.status IN ('POSTED', 'REVERSED')
WHERE jl.is_deleted = FALSE
  AND jl.partner_id IS NOT NULL
GROUP BY jl.partner_id;

COMMENT ON MATERIALIZED VIEW partner_aging_snapshot IS
    '거래처별 채권/채무/현금 유량·잔액 스냅샷. V101 이카운트 계정 + POSTED+REVERSED 집계(보상분개 쌍 상쇄로 net_* 정확). REFRESH CONCURRENTLY 전용 unique index 필수.';

CREATE UNIQUE INDEX idx_partner_aging_snapshot_partner_id
    ON partner_aging_snapshot (partner_id);

RESET statement_timeout;
RESET lock_timeout;

----------------------------------------------------------------------
-- 10) 이관 후 카탈로그 가드
--    chart_of_accounts에 존재하는 모든 3자리 legacy 문자열 리터럴을
--    전수 검사한다. 120(char_length)나 uuid_ns_x500처럼 계정 코드와
--    무관한 숫자는 오탐하지 않도록 계정 마스터/매핑의 코드만 비교한다.
----------------------------------------------------------------------
DO $$
DECLARE
    metadata_offending TEXT;
BEGIN
    SELECT string_agg(reference, E'\n' ORDER BY object_kind, object_name, legacy_code)
      INTO metadata_offending
      FROM (
            WITH legacy_codes AS (
                SELECT legacy_code FROM v101_account_code_map
                UNION
                SELECT code
                  FROM chart_of_accounts
                 WHERE length(code) = 3
            )
            SELECT 'column_default' AS object_kind,
                   format('%s.%s.%s=%s', c.table_schema, c.table_name,
                          c.column_name, c.column_default) AS object_name,
                   m.legacy_code,
                   format(
                       'column_default %s.%s.%s references legacy code %s',
                       c.table_schema, c.table_name, c.column_name, m.legacy_code
                   ) AS reference
              FROM information_schema.columns c
              JOIN v101_account_code_map m
                ON c.column_default LIKE '%' || quote_literal(m.legacy_code) || '%'
             WHERE c.column_default IS NOT NULL

            UNION ALL

            SELECT 'check_constraint' AS object_kind,
                   format('%s.%s=%s', cc.constraint_schema, cc.constraint_name,
                          cc.check_clause) AS object_name,
                   m.legacy_code,
                   format(
                       'check_constraint %s.%s references legacy code %s',
                       cc.constraint_schema, cc.constraint_name, m.legacy_code
                   ) AS reference
              FROM information_schema.check_constraints cc
              JOIN v101_account_code_map m
                ON cc.check_clause LIKE '%' || quote_literal(m.legacy_code) || '%'

            UNION ALL

            SELECT 'trigger' AS object_kind,
                   format('%s.%s=%s', n.nspname, c.relname, t.tgname) AS object_name,
                   m.legacy_code,
                   format(
                       'trigger %s.%s.%s references legacy code %s',
                       n.nspname, c.relname, t.tgname, m.legacy_code
                   ) AS reference
              FROM pg_trigger t
              JOIN pg_class c ON c.oid = t.tgrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              JOIN v101_account_code_map m
                ON pg_get_triggerdef(t.oid) LIKE '%' || quote_literal(m.legacy_code) || '%'
             WHERE NOT t.tgisinternal

            UNION ALL

            SELECT 'view' AS object_kind,
                   format('%s.%s', v.schemaname, v.viewname) AS object_name,
                   m.legacy_code,
                   format(
                       'view %s.%s references legacy code %s',
                       v.schemaname, v.viewname, m.legacy_code
                   ) AS reference
              FROM pg_views v
              JOIN v101_account_code_map m
                ON v.definition LIKE '%' || quote_literal(m.legacy_code) || '%'

            UNION ALL

            SELECT 'function' AS object_kind,
                   format('%s.%s(%s)', n.nspname, p.proname,
                          pg_get_function_identity_arguments(p.oid)) AS object_name,
                   m.legacy_code,
                   format(
                       'function %s.%s(%s) references legacy code %s',
                       n.nspname, p.proname,
                       pg_get_function_identity_arguments(p.oid), m.legacy_code
                   ) AS reference
              FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              JOIN legacy_codes m
                ON CASE WHEN p.prokind IN ('f', 'p')
                        THEN pg_get_functiondef(p.oid)
                   END LIKE '%' || quote_literal(m.legacy_code) || '%'
             WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
               AND p.prokind IN ('f', 'p')
           ) references_found;

    IF metadata_offending IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            MESSAGE = 'V101 이관 후 검증 실패: SQL metadata가 폐기 3자리 계정코드를 참조함'
                      || E'\n' || metadata_offending;
    END IF;
END $$;
