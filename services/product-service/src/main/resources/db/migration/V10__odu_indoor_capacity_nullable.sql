-- RC9 lookup 추천실외기 시트 sync 보정.
-- HOME_MULTI 행은 실내기 대수(C/D열)와 마력(E열)만 있고 indoor_capacity 실값이 없다.
-- 시트 무값 합성 금지 원칙에 따라 nullable 로 완화한다.

ALTER TABLE odu_recommendation_lookup
    ALTER COLUMN indoor_capacity DROP NOT NULL;

-- active 추천실외기 natural key 중복 방지.
-- NULLS NOT DISTINCT 대신 COALESCE functional index 를 사용해 PG 버전 이식성을 유지한다.
CREATE UNIQUE INDEX ux_odu_natural_active ON odu_recommendation_lookup (
    recommendation_type,
    COALESCE(indoor_capacity, -1::numeric),
    COALESCE(indoor_count, -1),
    outdoor_hp
) WHERE is_deleted = false;
