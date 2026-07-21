-- V13__approval_lines_document_template_pin_immutable.sql
-- DS-3a R3 fix — 승인 시점에 각인된 문서 레이아웃 pin(approval_lines의 3컬럼)을
-- append-once로 강제한다.
--
-- V12는 참조 대상(document_template_revisions)에는 append-only 트리거를 걸었지만, 참조
-- 주체(approval_lines의 document_template_id/document_template_revision/
-- document_template_default_pinned)는 자유롭게 UPDATE 가능한 채로 남겨두었다. 애플리케이션
-- 계층에서는 ApprovalLine.pinDocumentTemplate()/pinDefaultDocumentTemplate()가 APPROVED
-- 전이 시 1회만 호출되고 재진입을 막지만, 애플리케이션을 우회한 직접 UPDATE는 기존 CHECK
-- 제약(동시 상태만 배타)만 통과하면 그대로 반영된다 — 감사·법정 문서의 "승인 당시 외형"
-- 각인이 사후에 조용히 위조/철회될 수 있다.
--
-- R3 통합/보안 차원 격리 probe 실측:
--   TEST-A  UPDATE approval_lines SET default_pinned=FALSE, document_template_id=…,
--           revision=3  →  UPDATE 1 (ACTIVE-0 각인이 "이 양식이었다"로 위조됨)
--   TEST-A2 각인 통째 NULL화                                →  UPDATE 1 (미pin으로 복귀 =
--           원 BLOCKING 결함으로 회귀)
--
-- 트리거는 OLD 행이 이미 "pin된 상태"(default_pinned=true 이거나 document_template_id가
-- NOT NULL)일 때 pin 3컬럼 중 하나라도 값이 바뀌는 UPDATE만 차단한다. 최초 pin 전이(OLD가
-- 미pin 상태 — id/revision NULL, default_pinned=false)는 그대로 허용해
-- ApprovalLineService.pinApprovedLayout()의 유일한 정상 경로를 막지 않는다. 값이 그대로인
-- UPDATE(예: 다른 컬럼만 바뀌는 soft-delete 등, Hibernate가 전체 컬럼을 SET에 포함하는
-- 경우 포함)는 IS DISTINCT FROM 조건상 걸리지 않는다.
--
-- TRUNCATE 가드는 이 마이그레이션 범위에 포함하지 않는다 — document_template_revisions
-- 쪽과 동일한 이유로 이미 FABLE5 R1에서 PM이 별건으로 이월한 결정이다
-- (GroupwareAdminControllerIT.java 의 cleanup() 주석 참고): 기존 IT
-- (DocumentTemplateIT/GroupwareAdminControllerIT)가 픽스처 리셋에 이미
-- "TRUNCATE TABLE document_template_revisions, document_templates"를 쓰고 있어 STATEMENT
-- 레벨 TRUNCATE 가드를 추가하면 그 리셋과 정면 충돌한다. 애플리케이션 경로는 TRUNCATE를
-- 발행하지 않으므로 위협모델은 DB 관리자 권한으로 한정된다(R3 재확인, 이월 유지).
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION prevent_approval_lines_document_template_pin_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF (OLD.document_template_default_pinned OR OLD.document_template_id IS NOT NULL)
       AND (
           NEW.document_template_id IS DISTINCT FROM OLD.document_template_id
           OR NEW.document_template_revision IS DISTINCT FROM OLD.document_template_revision
           OR NEW.document_template_default_pinned IS DISTINCT FROM OLD.document_template_default_pinned
       )
    THEN
        -- R3 LOW fix — 예외 메시지에 approval_lines.id(UUID)를 넣지 않는다. 이 예외는
        -- 정상 애플리케이션 경로에서는 절대 발생하지 않지만(직접 SQL 우회 전용 방어선),
        -- 혹시 상위 계층이 예외 메시지를 그대로 응답에 실어보내는 사고가 나더라도
        -- UUID가 새지 않도록 한다([[feedback_uuid_no_user_visibility]]). 형제
        -- document_template_revisions 트리거(V12)도 동일하게 id를 넣지 않는다.
        RAISE EXCEPTION 'approval_lines document template pin is set once at approval and cannot be modified afterwards';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_approval_lines_document_template_pin_immutable
    BEFORE UPDATE ON approval_lines
    FOR EACH ROW EXECUTE FUNCTION prevent_approval_lines_document_template_pin_mutation();
