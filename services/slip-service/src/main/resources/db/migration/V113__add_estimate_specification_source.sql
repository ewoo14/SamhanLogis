-- 견적 규격 원문(최대 50자)과 provenance를 분리해 자동 규격도 경계 길이를 보존한다.
ALTER TABLE estimate_lines
    ADD COLUMN specification_source VARCHAR(20);
