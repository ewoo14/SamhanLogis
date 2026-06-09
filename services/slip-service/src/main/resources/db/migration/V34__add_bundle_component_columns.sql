-- V34__add_bundle_component_columns.sql
-- 2026-06-09 — 세트→전표 구성품 전개(PR-3, 옵션 A). 견적/전표 라인에 세트 구성품 메타 추가.
--   set_head: 전개된 세트 그룹의 첫 구성품 라인(전표/견적 화면 그룹 헤더 표시용).
--   parent_set_model: 이 라인이 속한 세트의 부모 modelCode(세트 구성품일 때만, 일반 라인 null).
-- 둘 다 nullable/default — 기존 라인(비세트)은 set_head=false, parent_set_model=null.

ALTER TABLE estimate_lines
    ADD COLUMN IF NOT EXISTS set_head        BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS parent_set_model VARCHAR(64);

ALTER TABLE slip_lines
    ADD COLUMN IF NOT EXISTS set_head        BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS parent_set_model VARCHAR(64);
