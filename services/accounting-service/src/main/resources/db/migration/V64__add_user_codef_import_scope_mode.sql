-- V64__add_user_codef_import_scope_mode.sql
-- #825 슬5 FABLE5 R1 fix — BLOCKING#1 근본 해소: CODEF 가져오기 선택 scope 에
-- scope_mode(ALL/SELECTED) 컬럼을 추가해 '전체 저장'과 '미저장'을 실제로 구별한다.
--
-- 배경(개발책임자 결정 1 — 2026-07-21):
--   원 spec(D-S5-01)은 "마이그레이션 0건"을 전제했으나, 실측 결과 CODEF 저장 scope 는
--   accountRefSelections 등 ref 목록만으로는 '전체'(refs=[])와 '아직 저장 안 함'을
--   구별할 수 없어 ALL 저장 직후 가져오기가 400 으로 자기모순되는 BLOCKING 결함이
--   확인되었다(CodefImportScopedService.resolveRefs 의 '저장 선택 사용' 분기가 저장된
--   refs 가 비어 있으면 무조건 거부). 이 결함은 scope_mode 를 저장하지 않고는 근본
--   해소가 불가능하여 개발책임자가 "마이그 0건" 전제를 번복했다.
--   (일마감 daily_closings.partner_id, 안전재고 safety_stock_configs.warehouse_id 는
--   기존 결정대로 마이그 없음 — 본 변경은 CODEF 도메인에 한정된다.)
--
-- 기존 행 backfill 정책(소급 추정 각인 금지):
--   본 슬라이스 이전(scopeMode 필드 자체가 요청 계약에 없던 시절)에 저장된 행은
--   ALL 의도였는지 단순히 빈 상태였는지 코드만으로는 알 수 없다. '전체'로 단정하는
--   것은 근거 없는 각인이자 위조이므로, 보수적으로 SELECTED 로 채운다 — 오늘과
--   동일하게 "저장된 선택이 비어 있음" 거부 동작이 유지되어(반대로 ALL 로 단정하면
--   저장 당시 의도치 않았을 수 있는 전체 열거로 동작이 바뀌는 회귀 위험이 있다)
--   회귀가 없고, 사용자가 재저장하면 실제 scope_mode 로 갱신된다.

ALTER TABLE user_codef_import_scope
    ADD COLUMN scope_mode VARCHAR(20);

UPDATE user_codef_import_scope
   SET scope_mode = 'SELECTED'
 WHERE scope_mode IS NULL;

ALTER TABLE user_codef_import_scope
    ALTER COLUMN scope_mode SET NOT NULL;

ALTER TABLE user_codef_import_scope
    ADD CONSTRAINT ck_user_codef_import_scope_mode
        CHECK (scope_mode IN ('ALL', 'SELECTED'));

COMMENT ON COLUMN user_codef_import_scope.scope_mode IS
    '저장 당시 명시적 선택 범위(ALL=전체·SELECTED=개별 선택). #825 슬5 R1 — refs=[] 가 전체/미저장 두 의미를 겸하던 자기모순 해소';
