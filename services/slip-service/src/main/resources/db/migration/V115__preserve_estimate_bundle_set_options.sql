-- S39: 견적 BUNDLE 선택 문맥을 estimate_lines에 저장한다. 기존 행은 null로 유지한다.
ALTER TABLE estimate_lines
    ADD COLUMN IF NOT EXISTS bundle_set_options JSONB;
