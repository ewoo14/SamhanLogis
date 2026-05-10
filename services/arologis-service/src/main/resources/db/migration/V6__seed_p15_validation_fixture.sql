-- V6__seed_p15_validation_fixture.sql
-- P1-5 arologis 배차 validation fixture — Phase 10 P1-5 (P15ValidationIT 전용).
--
-- 목적:
--   P15ValidationIT 에서 "미배차 슬립 5건 + 가용 기사 3명" 시나리오를 결정적으로
--   검증하기 위한 최소 fixture. UnassignedService / DispatchManualService 경계 테스트.
--
-- 설계 원칙:
--   1) 결정적 UUID — 매 테스트 실행 재현 가능 (고정값).
--   2) 미배차 (unassigned) = Vehicle.status PENDING + Vehicle.assigned_driver_id NULL.
--   3) 가용 기사 = Driver.is_deleted FALSE + source INTERNAL (본 어플).
--   4) V2 ux_dispatches_date_type_active unique 제약 — 각 (dispatch_date, dispatch_type) 조합 1건.
--   5) BaseEntity 7 audit fields 전부 채움 (created_at / created_by 필수, 나머지 NULL).
--   6) 본 SQL 은 dev 로컬 + Testcontainers IT 양쪽에서 Flyway 가 실행.
--      Testcontainers IT 의 @BeforeEach 에서 전체 테이블 deleteAll() 이 먼저 실행되므로
--      본 fixture 는 "초기 스키마 검증" 용도이며, IT 자체 데이터는 JPA 로 세팅.
--   7) 운영 DB 에는 절대 실행 금지 — Profile guard 는 application 레이어(Seeder)에서만 가능.
--      마이그레이션 레이어에서는 주석 + 팀 운영 절차로 통제.
--
-- 의존 순서:
--   drivers → dispatches → vehicles → vehicle_stops (FK 순서)
--
-- UUID 생성 규칙 (고정 hex — 사용자 화면 노출 X, 테스트 코드에서만 참조):
--   기사 3명: p15-drv-001 / p15-drv-002 / p15-drv-003
--   배차 5건: p15-dsp-001 ~ p15-dsp-005
--   차량 5대: p15-veh-001 ~ p15-veh-005  (각 dispatch 당 1대씩)
--   정차 5건: p15-stp-001 ~ p15-stp-005  (각 vehicle 당 1건씩)

----------------------------------------------------------------------
-- 1) 가용 기사 3명 — INTERNAL / appInstalled TRUE / is_deleted FALSE
----------------------------------------------------------------------

INSERT INTO drivers (
    id, driver_code, phone_number, vehicle_type, source,
    app_installed, app_user_id,
    created_at, created_by, modified_at, modified_by,
    deleted_at, deleted_by, is_deleted
) VALUES
-- DRV-P15-001 : 1톤 INTERNAL
(
    '00000000-0015-0000-0001-000000000001',
    'DRV-P15-001',
    '010-9001-0001',
    '1톤',
    'INTERNAL',
    TRUE,
    NULL,
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
-- DRV-P15-002 : 2.5톤 INTERNAL
(
    '00000000-0015-0000-0001-000000000002',
    'DRV-P15-002',
    '010-9001-0002',
    '2.5톤',
    'INTERNAL',
    TRUE,
    NULL,
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
-- DRV-P15-003 : 5톤 INTERNAL
(
    '00000000-0015-0000-0001-000000000003',
    'DRV-P15-003',
    '010-9001-0003',
    '5톤',
    'INTERNAL',
    TRUE,
    NULL,
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
)
ON CONFLICT DO NOTHING;

----------------------------------------------------------------------
-- 2) 미배차 배차 5건 — 각 다른 (dispatch_date, dispatch_type) 조합
--    V2 ux_dispatches_date_type_active unique 제약 충돌 방지
--    날짜: 2026-05-20 ~ 2026-05-24, type: DAY/DAY/NIGHT/DAY/NIGHT
----------------------------------------------------------------------

INSERT INTO dispatches (
    id, dispatch_date, dispatch_type, raw_kakao_text,
    created_at, created_by, modified_at, modified_by,
    deleted_at, deleted_by, is_deleted
) VALUES
(
    '00000000-0015-0000-0002-000000000001',
    '2026-05-20', 'DAY',
    '5월 20일 주간입니다\n1. 1톤 서울 강남구 역삼동\n - 에스엠하나공조 / 501 / 9시하차\n',
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
(
    '00000000-0015-0000-0002-000000000002',
    '2026-05-21', 'DAY',
    '5월 21일 주간입니다\n1. 2.5톤 서울 송파구 잠실동\n - 한국공조시스템 / 502 / 10시하차\n',
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
(
    '00000000-0015-0000-0002-000000000003',
    '2026-05-21', 'NIGHT',
    '5월 21일 야상입니다\n1. 5톤 경기 성남시 분당구\n - 대한냉동시스템 / 503 / 오전일찍\n',
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
(
    '00000000-0015-0000-0002-000000000004',
    '2026-05-22', 'DAY',
    '5월 22일 주간입니다\n1. 1톤 인천 남동구 구월동\n - 인천공조 / 504 / 11시하차\n',
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
(
    '00000000-0015-0000-0002-000000000005',
    '2026-05-22', 'NIGHT',
    '5월 22일 야상입니다\n1. 2.5톤 경기 고양시 일산동구\n - 일산공조 / 505 / 아침8시\n',
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
)
ON CONFLICT DO NOTHING;

----------------------------------------------------------------------
-- 3) 미배차 차량 5대 — status=PENDING, assigned_driver_id=NULL
--    각 dispatch 당 1대 (sequence=1)
----------------------------------------------------------------------

INSERT INTO vehicles (
    id, dispatch_id, sequence, tonnage, label,
    assigned_driver_id, match_source, external_ref_id, status,
    created_at, created_by, modified_at, modified_by,
    deleted_at, deleted_by, is_deleted
) VALUES
(
    '00000000-0015-0000-0003-000000000001',
    '00000000-0015-0000-0002-000000000001',
    1, 'TONNAGE_1', '1번차 (에스엠하나공조)',
    NULL, NULL, NULL, 'PENDING',
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
(
    '00000000-0015-0000-0003-000000000002',
    '00000000-0015-0000-0002-000000000002',
    1, 'TONNAGE_2_5', '1번차 (한국공조시스템)',
    NULL, NULL, NULL, 'PENDING',
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
(
    '00000000-0015-0000-0003-000000000003',
    '00000000-0015-0000-0002-000000000003',
    1, 'TONNAGE_5', '1번차 (대한냉동시스템)',
    NULL, NULL, NULL, 'PENDING',
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
(
    '00000000-0015-0000-0003-000000000004',
    '00000000-0015-0000-0002-000000000004',
    1, 'TONNAGE_1', '1번차 (인천공조)',
    NULL, NULL, NULL, 'PENDING',
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
(
    '00000000-0015-0000-0003-000000000005',
    '00000000-0015-0000-0002-000000000005',
    1, 'TONNAGE_2_5', '1번차 (일산공조)',
    NULL, NULL, NULL, 'PENDING',
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
)
ON CONFLICT DO NOTHING;

----------------------------------------------------------------------
-- 4) 정차 5건 — status=PENDING (미배차 vehicle 에 종속)
--    parsed_partner_code = NULL (lookup 미실행 — 미배차 조건 확인용)
----------------------------------------------------------------------

INSERT INTO vehicle_stops (
    id, vehicle_id, sequence, raw_text,
    parsed_address, parsed_partner_name, parsed_kakao_seq,
    parsed_partner_code, notes,
    classified_region_group, status,
    actual_arrival_time, actual_delivery_time,
    created_at, created_by, modified_at, modified_by,
    deleted_at, deleted_by, is_deleted
) VALUES
(
    '00000000-0015-0000-0004-000000000001',
    '00000000-0015-0000-0003-000000000001',
    1,
    ' - 에스엠하나공조 / 501 / 9시하차',
    '서울 강남구 역삼동 123-1',
    '에스엠하나공조',
    501,
    NULL,
    '9시하차',
    '서울특별시',
    'PENDING',
    NULL, NULL,
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
(
    '00000000-0015-0000-0004-000000000002',
    '00000000-0015-0000-0003-000000000002',
    1,
    ' - 한국공조시스템 / 502 / 10시하차',
    '서울 송파구 잠실동 456-2',
    '한국공조시스템',
    502,
    NULL,
    '10시하차',
    '서울특별시',
    'PENDING',
    NULL, NULL,
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
(
    '00000000-0015-0000-0004-000000000003',
    '00000000-0015-0000-0003-000000000003',
    1,
    ' - 대한냉동시스템 / 503 / 오전일찍',
    '경기 성남시 분당구 판교동 789-3',
    '대한냉동시스템',
    503,
    NULL,
    '오전일찍',
    '경기동부',
    'PENDING',
    NULL, NULL,
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
(
    '00000000-0015-0000-0004-000000000004',
    '00000000-0015-0000-0003-000000000004',
    1,
    ' - 인천공조 / 504 / 11시하차',
    '인천 남동구 구월동 12-4',
    '인천공조',
    504,
    NULL,
    '11시하차',
    '인천광역시',
    'PENDING',
    NULL, NULL,
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
),
(
    '00000000-0015-0000-0004-000000000005',
    '00000000-0015-0000-0003-000000000005',
    1,
    ' - 일산공조 / 505 / 아침8시',
    '경기 고양시 일산동구 마두동 34-5',
    '일산공조',
    505,
    NULL,
    '아침8시',
    '경기서북부',
    'PENDING',
    NULL, NULL,
    CURRENT_TIMESTAMP, 'seed-v6', NULL, NULL, NULL, NULL, FALSE
)
ON CONFLICT DO NOTHING;
