-- PR #818 (#815) 5-agent 리뷰 FIX 1 [P1 DevOps] — GPS multi-source 최신 위치 조회 bound 인덱스
--
-- driver_locations 는 기사 앱이 약 30초 주기로 좌표를 보고하는 대량 적재 테이블이다 (V1 주석
-- "BaseEntity 미상속 — 30일 자동 cleanup 정책" 참조). 기존 GpsSourceAssembler.latestLocationsByDriver
-- 는 driverIds 의 30일치 GPS 이력을 전부 fetch 한 뒤 애플리케이션 메모리에서 (driver_id, source)
-- 조합별 최신 1건만 골라 나머지를 버리는 방식이었다 — 배차 상세 조회 1회마다 불필요한 대량
-- over-fetch 가 발생한다.
--
-- 이를 Postgres DISTINCT ON (driver_id, source) native query
-- (DriverLocationRepository.findLatestPerDriverAndSource) 로 전환 — DB 단에서
-- driverIds × sources 이하로 bound 된 최신 1건씩만 반환한다. 기존
-- ix_driver_locations_driver_captured (V1, driver_id + captured_at DESC 만 포함) 는 source
-- 컬럼이 없어 이 grouping 패턴을 커버하지 못하므로, DISTINCT ON 조회가 사용하는
-- ORDER BY driver_id, source, captured_at DESC 순서를 그대로 커버하는 복합 인덱스를 추가한다.
--
-- DDL 멱등: CREATE INDEX IF NOT EXISTS (fresh / 기적용 환경 모두 안전, V21 패턴 일관).

CREATE INDEX IF NOT EXISTS ix_driver_locations_driver_source_captured
    ON driver_locations (driver_id, source, captured_at DESC);

COMMENT ON INDEX ix_driver_locations_driver_source_captured IS
    'GpsSourceAssembler DISTINCT ON (driver_id, source) 최신 GPS 위치 조회 전용 — driver_id/source 필터 + captured_at DESC 정렬을 index 로 커버';
