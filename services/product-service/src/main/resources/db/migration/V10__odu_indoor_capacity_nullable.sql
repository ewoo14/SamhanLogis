-- RC9 lookup 추천실외기 시트 sync 보정.
-- HOME_MULTI 행은 실내기 대수(C/D열)와 마력(E열)만 있고 indoor_capacity 실값이 없다.
-- 시트 무값 합성 금지 원칙에 따라 nullable 로 완화한다.

ALTER TABLE odu_recommendation_lookup
    ALTER COLUMN indoor_capacity DROP NOT NULL;
