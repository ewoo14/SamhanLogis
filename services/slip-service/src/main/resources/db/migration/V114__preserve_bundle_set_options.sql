-- S37: 전표 구성품의 화면 선택 옵션 문맥을 저장 후 재조회까지 보존한다.
ALTER TABLE slip_lines
    ADD COLUMN IF NOT EXISTS bundle_set_options JSONB;
