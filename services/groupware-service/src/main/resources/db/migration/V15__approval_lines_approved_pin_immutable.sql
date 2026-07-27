-- V15__approval_lines_approved_pin_immutable.sql
-- DS-3a 검증품질 보강 — 이미 승인된 미pin 레거시 행에도 레이아웃 최초 각인을 허용하지 않는다.
--
-- V13은 OLD 행에 pin 값이 있는 경우만 보호했다. 그 조건만으로는 과거에 APPROVED로
-- 저장됐지만 pin 값이 비어 있는 행에 사후 레이아웃을 주입할 수 있어, 승인 당시 외형의
-- 감사 사실을 새로 만들어내는 우회가 남는다. 승인 상태 자체를 보호 조건에 포함하되,
-- 아직 승인되지 않은 미pin 행의 정상 최초 각인 경로는 계속 허용한다.
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION prevent_approval_lines_document_template_pin_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF (OLD.status = 'APPROVED'
        OR OLD.document_template_default_pinned
        OR OLD.document_template_id IS NOT NULL)
       AND (
           NEW.document_template_id IS DISTINCT FROM OLD.document_template_id
           OR NEW.document_template_revision IS DISTINCT FROM OLD.document_template_revision
           OR NEW.document_template_default_pinned IS DISTINCT FROM OLD.document_template_default_pinned
       )
    THEN
        RAISE EXCEPTION 'approval_lines document template pin is set once at approval and cannot be modified afterwards';
    END IF;
    RETURN NEW;
END;
$$;
