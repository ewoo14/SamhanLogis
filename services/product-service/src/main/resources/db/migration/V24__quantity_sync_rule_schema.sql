-- V24__quantity_sync_rule_schema.sql
-- #896 슬2: 독립 최상위 Product 간 수량 동기화 규칙 저장 경계.
-- 실 catalog snapshot 미확보 상태이므로 이 migration에는 seed INSERT를 포함하지 않는다.
-- UUID는 내부 FK 전용이며 API는 model_code/model_name만 반환한다.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE quantity_sync_rule (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_key          VARCHAR(100) NOT NULL,
    estimate_category VARCHAR(20)  NOT NULL,
    name              VARCHAR(200) NOT NULL,
    enabled           BOOLEAN      NOT NULL DEFAULT TRUE,
    aggregation       VARCHAR(16)  NOT NULL DEFAULT 'SUM',
    condition_json    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    inactive_behavior VARCHAR(16)  NOT NULL DEFAULT 'ZERO',
    conflict_policy   VARCHAR(16)  NOT NULL DEFAULT 'ADD',
    priority          INTEGER      NOT NULL DEFAULT 0,
    legacy_ref        VARCHAR(255) NOT NULL,
    created_at        TIMESTAMP    NOT NULL,
    created_by        VARCHAR(50)  NOT NULL,
    modified_at       TIMESTAMP,
    modified_by       VARCHAR(50),
    deleted_at        TIMESTAMP,
    deleted_by        VARCHAR(50),
    is_deleted        BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_qsr_category CHECK (estimate_category IN ('HOME_MULTI', 'SINGLE_SET', 'COMM_MULTI')),
    CONSTRAINT chk_qsr_aggregation CHECK (aggregation = 'SUM'),
    CONSTRAINT chk_qsr_condition_object CHECK (jsonb_typeof(condition_json) = 'object'),
    CONSTRAINT chk_qsr_inactive_behavior CHECK (inactive_behavior IN ('ZERO', 'KEEP')),
    CONSTRAINT chk_qsr_conflict_policy CHECK (conflict_policy IN ('ADD', 'REPLACE')),
    CONSTRAINT chk_qsr_priority CHECK (priority >= 0),
    -- 재수렴 결함 3 [MED~HIGH] fix — rule_key가 URL 경로 세그먼트로 항상 안전해야
    -- API로 생성한 규칙을 API로 조회/삭제할 수 있다(S-5). '/'가 들어가면 GET/DELETE가
    -- Spring 라우팅(원문 '/'는 경로 분할, 인코딩 %2F는 Tomcat이 400 HTML로 거부)
    -- 양쪽에서 막혀 영구 고아가 된다. 기존 시드/문서 키 형식(예: HOME_HOSE_1WAY_L)과
    -- QuantitySyncRuleDbProbeIT의 하이픈 키(예: DB-SELFSWAP)를 모두 허용한다.
    CONSTRAINT chk_qsr_rule_key_path_safe CHECK (rule_key ~ '^[A-Za-z0-9_-]+$')
);

CREATE TABLE quantity_sync_source (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id           UUID         NOT NULL REFERENCES quantity_sync_rule(id),
    source_product_id UUID         NOT NULL REFERENCES products(id),
    factor            NUMERIC       NOT NULL DEFAULT 1,
    created_at        TIMESTAMP    NOT NULL,
    created_by        VARCHAR(50)  NOT NULL,
    modified_at       TIMESTAMP,
    modified_by       VARCHAR(50),
    deleted_at        TIMESTAMP,
    deleted_by        VARCHAR(50),
    is_deleted        BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_qss_factor CHECK (
        factor > 0 AND factor <= 1000 AND scale(factor) <= 4 AND factor = round(factor, 4)
    )
);

CREATE TABLE quantity_sync_target (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id           UUID         NOT NULL REFERENCES quantity_sync_rule(id),
    target_product_id UUID         NOT NULL REFERENCES products(id),
    multiplier        NUMERIC       NOT NULL DEFAULT 1,
    rounding_mode     VARCHAR(16)  NOT NULL DEFAULT 'NONE',
    display_order     INTEGER      NOT NULL,
    created_at        TIMESTAMP    NOT NULL,
    created_by        VARCHAR(50)  NOT NULL,
    modified_at       TIMESTAMP,
    modified_by       VARCHAR(50),
    deleted_at        TIMESTAMP,
    deleted_by        VARCHAR(50),
    is_deleted        BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_qst_multiplier CHECK (
        multiplier > 0 AND multiplier <= 1000 AND scale(multiplier) <= 4
        AND multiplier = round(multiplier, 4)
    ),
    CONSTRAINT chk_qst_rounding_mode CHECK (rounding_mode IN ('NONE', 'FLOOR')),
    CONSTRAINT chk_qst_display_order CHECK (display_order >= 1)
);

CREATE UNIQUE INDEX ux_qsr_rule_key_active
    ON quantity_sync_rule (rule_key)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_qsr_category_priority_active
    ON quantity_sync_rule (estimate_category, priority, rule_key)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX ux_qss_rule_source_active
    ON quantity_sync_source (rule_id, source_product_id)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_qss_product_active
    ON quantity_sync_source (source_product_id)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX ux_qst_rule_target_active
    ON quantity_sync_target (rule_id, target_product_id)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX ux_qst_rule_display_order_active
    ON quantity_sync_target (rule_id, display_order)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_qst_product_active
    ON quantity_sync_target (target_product_id)
    WHERE is_deleted = FALSE;

-- 재수렴 결함 1 [최우선] fix — 카테고리 판정 원천을 products.estimate_category(V18 이후 죽은
-- 컬럼, V18__add_product_estimate_exposure.sql:2-3)에서 product_estimate_exposure M:N
-- 테이블로 옮긴다. 실 API(POST /products estimateCategories)로 만든 품목은 전부 이 테이블에만
-- 행이 생기고 products 컬럼은 항상 NULL로 남으므로, 죽은 컬럼을 계속 읽으면 실 API로 만든
-- 어떤 품목도 이 함수가 카테고리를 찾지 못해 모든 규칙 연결이 거부된다(S-1).
--
-- 품목은 여러 카테고리에 동시 노출될 수 있어(M:N, S-3) 스칼라 반환이 아니라 "이 카테고리에
-- 노출되어 있는가" 멤버십 판정으로 바꾼다 — source/target 각각이 rule의 category에 노출만
-- 되어 있으면 연결을 허용한다(다른 카테고리에도 노출되어 있다는 사실은 이 판정과 무관하다).
-- 이는 §6.5 "같은 category 안에서만 연결"을 M:N으로 그대로 확장한 것이며 신규 승인이 아니다
-- (product-service의 Product는 여전히 정확히 1개 rule category 전용이 아니라 노출 집합을 갖고,
-- 규칙은 그 집합의 원소 하나와 일치하면 된다).
CREATE OR REPLACE FUNCTION quantity_sync_product_in_category(p_product_id UUID, p_category VARCHAR)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM product_estimate_exposure e
         WHERE e.product_id = p_product_id
           AND e.is_deleted = FALSE
           AND (CASE WHEN e.estimate_category = 'COMMERCIAL_MULTI' THEN 'COMM_MULTI'
                     ELSE e.estimate_category END) = p_category
    );
$$;

-- condition_json은 정본에 정의된 typed operator만 허용한다.
CREATE OR REPLACE FUNCTION quantity_sync_validate_condition(p_condition JSONB)
RETURNS VOID
LANGUAGE PLPGSQL
AS $$
DECLARE
    operator_name TEXT;
    operator_value JSONB;
    child JSONB;
    option_key TEXT;
BEGIN
    IF p_condition IS NULL OR jsonb_typeof(p_condition) <> 'object' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'quantity_sync condition_json must be an object';
    END IF;

    IF p_condition = '{}'::jsonb THEN
        RETURN;
    END IF;

    IF (SELECT count(*) FROM jsonb_object_keys(p_condition)) <> 1 THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'quantity_sync condition_json must contain one operator';
    END IF;

    SELECT k INTO operator_name FROM jsonb_object_keys(p_condition) AS keys(k);
    IF operator_name NOT IN ('optionEquals', 'optionIn', 'all', 'any', 'not') THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'quantity_sync condition_json operator is not allowed';
    END IF;
    operator_value := p_condition -> operator_name;

    IF operator_name IN ('optionEquals', 'optionIn') THEN
        IF jsonb_typeof(operator_value) <> 'array'
           OR jsonb_array_length(operator_value) <> 2
           OR jsonb_typeof(operator_value -> 0) <> 'string' THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'quantity_sync option condition must be [key,value]';
        END IF;
        option_key := operator_value ->> 0;
        -- 2026-07-28 R1 대조(SONNET5): 이전 18개 하드코딩 option key allowlist의 근거를
        -- 저장소 전체에서 찾지 못했다(legacy-quantity-golden/fixtures.js 실 식별자와 문자
        -- 그대로 일치 0개, remoteOption/panelOption은 BundleComponent 세트옵션이라는 다른
        -- 도메인 필드명과 우연히 같음). 근거 없는 key-vocabulary 검증은 evaluator가 실제
        -- 옵션 계약을 읽는 슬3으로 미루고(J-5), 여기서는 공백이 아닌 문자열만 요구한다.
        IF option_key IS NULL OR length(btrim(option_key)) = 0 THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'quantity_sync option key must not be blank';
        END IF;
        IF operator_name = 'optionEquals'
           AND jsonb_typeof(operator_value -> 1) NOT IN ('string', 'number', 'boolean', 'null') THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'quantity_sync optionEquals value must be scalar';
        END IF;
        IF operator_name = 'optionIn'
           AND (jsonb_typeof(operator_value -> 1) <> 'array'
                OR jsonb_array_length(operator_value -> 1) = 0) THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'quantity_sync optionIn value must be a non-empty array';
        END IF;
        RETURN;
    END IF;

    IF operator_name = 'not' THEN
        PERFORM quantity_sync_validate_condition(operator_value);
        RETURN;
    END IF;

    IF jsonb_typeof(operator_value) <> 'array' OR jsonb_array_length(operator_value) = 0 THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'quantity_sync all/any value must be a non-empty array';
    END IF;
    FOR child IN SELECT value FROM jsonb_array_elements(operator_value) AS values(value) LOOP
        PERFORM quantity_sync_validate_condition(child);
    END LOOP;
END;
$$;

-- source/target/condition/product graph 전체를 transaction commit 시점에 fail-closed로 검사한다.
CREATE OR REPLACE FUNCTION quantity_sync_validate_rule_graph()
RETURNS VOID
LANGUAGE PLPGSQL
AS $$
BEGIN
    -- 재수렴 M-7 — products/bundle_component 4개 row-level constraint trigger는 quantity_sync_rule
    -- 데이터와 무관한 UPDATE에도 무조건 이 함수를 호출한다(FOR EACH ROW는 constraint trigger의
    -- PostgreSQL 하드 제약이라 FOR EACH STATEMENT로 바꿀 수 없다). 아래 모든 검사는 활성
    -- (is_deleted=false) 규칙이 하나도 없으면 전부 공집합이라 항상 통과한다 — "규칙 0건이면
    -- 트리거 비용도 0에 가깝다"는 R1 fix의 보류 근거가 재수렴 실측(150행 UPDATE 63.1ms vs
    -- disable 6.45ms, ≈10배)으로 반증됐으므로, 규칙이 실제로 0건일 때 이 함수가 나머지
    -- EXISTS 5개+재귀 CTE 1개를 전부 도는 대신 파티션 인덱스(ux_qsr_rule_key_active) 존재
    -- 검사 1건만 하고 반환하도록 짧게 끊는다. 규칙이 하나라도 있으면 이 조건은 거짓이라
    -- 아래 전체 검사가 그대로 실행된다(동작 변화 없음 — 순수 성능 최적화).
    IF NOT EXISTS (SELECT 1 FROM quantity_sync_rule WHERE is_deleted = FALSE) THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM quantity_sync_rule r
         WHERE r.is_deleted = FALSE
           AND NOT EXISTS (
               SELECT 1 FROM quantity_sync_source s
                WHERE s.rule_id = r.id AND s.is_deleted = FALSE
           )
    ) OR EXISTS (
        SELECT 1
          FROM quantity_sync_rule r
         WHERE r.is_deleted = FALSE
           AND NOT EXISTS (
               SELECT 1 FROM quantity_sync_target t
                WHERE t.rule_id = r.id AND t.is_deleted = FALSE
           )
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'quantity_sync rule must have active source and target rows';
    END IF;

    PERFORM quantity_sync_validate_condition(r.condition_json)
      FROM quantity_sync_rule r
     WHERE r.is_deleted = FALSE;

    IF EXISTS (
        SELECT 1
          FROM quantity_sync_rule r
          JOIN quantity_sync_source s ON s.rule_id = r.id AND s.is_deleted = FALSE
          JOIN quantity_sync_target t ON t.rule_id = r.id AND t.is_deleted = FALSE
         WHERE r.is_deleted = FALSE
           AND s.source_product_id = t.target_product_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'quantity_sync source and target cannot be the same product';
    END IF;

    -- 재수렴 결함 1 [최우선] fix 중 발견 — 카테고리 판정이 이제 product_estimate_exposure의
    -- is_deleted 플래그에 의존하므로(quantity_sync_product_in_category), ProductService.delete()가
    -- 품목 자신을 soft-delete할 때 그 품목의 노출 행도 함께 soft-delete한다(기존 동작,
    -- ProductService.java:701). 이 EXISTS가 r.enabled를 걸러내지 않으면 "품목 단종/삭제는
    -- 비활성 규칙을 막지 않는다"(R1 결함 2(a), survey.md:509 — 바로 아래 EXISTS는 이미
    -- r.enabled=TRUE로 걸러낸다)는 불변식이 이 검사에서만 깨진다: 삭제 대상 품목을 비활성
    -- 규칙이 참조하면, 그 품목의 노출이 사라지는 순간 이 검사가 "카테고리 밖" 위반으로
    -- 오판해 삭제 자체를 막는다(재수렴 라운드 실측 — QuantitySyncRuleProductDeletionCascadeHttpIT
    -- DELETE 단계가 204 대신 409). 원본(V18 이전 dead column 시절)에는 이 EXISTS에 enabled
    -- 게이팅이 아예 없었지만, 그때는 category 값이 delete로 바뀌지 않는 별도 컬럼이라
    -- 이 상호작용이 도달 불가능했다 — 판정 원천을 옮기며 처음으로 도달 가능해진 잠복 결함이라
    -- 같은 파일의 다른 EXISTS와 동일하게 여기서도 enabled 게이팅을 맞춘다.
    IF EXISTS (
        SELECT 1
          FROM quantity_sync_rule r
          JOIN quantity_sync_source s ON s.rule_id = r.id AND s.is_deleted = FALSE
          JOIN quantity_sync_target t ON t.rule_id = r.id AND t.is_deleted = FALSE
         WHERE r.is_deleted = FALSE AND r.enabled = TRUE
           AND (NOT quantity_sync_product_in_category(s.source_product_id, r.estimate_category)
                OR NOT quantity_sync_product_in_category(t.target_product_id, r.estimate_category))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'quantity_sync source and target must stay inside rule category';
    END IF;

    -- R1 결함 2 [MED]: enabled=false 규칙은 강제력이 없다(survey.md:509) — 양쪽 다
    -- enabled=TRUE일 때만 REPLACE 중복으로 본다.
    IF EXISTS (
        SELECT 1
          FROM quantity_sync_rule r1
          JOIN quantity_sync_rule r2 ON r1.id < r2.id
          JOIN quantity_sync_target t1 ON t1.rule_id = r1.id AND t1.is_deleted = FALSE
          JOIN quantity_sync_target t2 ON t2.rule_id = r2.id AND t2.is_deleted = FALSE
         WHERE r1.is_deleted = FALSE AND r2.is_deleted = FALSE
           AND r1.enabled = TRUE AND r2.enabled = TRUE
           AND r1.conflict_policy = 'REPLACE'
           AND r2.conflict_policy = 'REPLACE'
           AND r1.estimate_category = r2.estimate_category
           AND r1.condition_json = r2.condition_json
           AND t1.target_product_id = t2.target_product_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'quantity_sync duplicate REPLACE condition and target';
    END IF;

    -- R1 결함 2(a) [MED]: enabled=false 규칙은 강제력이 없다(survey.md:509) — 비활성
    -- 규칙이 참조하는 Product를 단종/삭제해도 이 검사가 막으면 안 된다.
    IF EXISTS (
        SELECT 1
          FROM quantity_sync_rule r
          JOIN quantity_sync_source s ON s.rule_id = r.id AND s.is_deleted = FALSE
          JOIN quantity_sync_target t ON t.rule_id = r.id AND t.is_deleted = FALSE
          JOIN products sp ON sp.id = s.source_product_id
          JOIN products tp ON tp.id = t.target_product_id
         WHERE r.is_deleted = FALSE AND r.enabled = TRUE
           AND (sp.is_deleted = TRUE OR sp.status <> 'ACTIVE' OR sp.usage_scope = 'NONE'
                OR tp.is_deleted = TRUE OR tp.status <> 'ACTIVE' OR tp.usage_scope = 'NONE')
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'quantity_sync cannot reference deleted or invisible product';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM quantity_sync_rule r
          JOIN quantity_sync_source s ON s.rule_id = r.id AND s.is_deleted = FALSE
          JOIN quantity_sync_target t ON t.rule_id = r.id AND t.is_deleted = FALSE
          JOIN products sp ON sp.id = s.source_product_id
          JOIN products tp ON tp.id = t.target_product_id
          JOIN bundle_component bc
            ON bc.bundle_product_id = sp.id
           AND bc.is_deleted = FALSE
           AND bc.component_product_code IN (tp.model_code, tp.model_name)
         WHERE r.is_deleted = FALSE
           AND sp.product_type = 'BUNDLE'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'quantity_sync cannot connect a BUNDLE to its own component';
    END IF;

    -- R1 결함 2(b) [MED]: enabled=false 규칙은 강제력이 없다(survey.md:509) — 비활성
    -- 규칙의 간선은 순환 그래프에서 제외한다.
    IF EXISTS (
        WITH RECURSIVE edges AS (
            SELECT s.source_product_id, t.target_product_id
              FROM quantity_sync_rule r
              JOIN quantity_sync_source s ON s.rule_id = r.id AND s.is_deleted = FALSE
              JOIN quantity_sync_target t ON t.rule_id = r.id AND t.is_deleted = FALSE
             WHERE r.is_deleted = FALSE AND r.enabled = TRUE
        ), walk(start_node, current_node, path) AS (
            SELECT source_product_id, target_product_id,
                   ARRAY[source_product_id, target_product_id]::UUID[]
              FROM edges
            UNION ALL
            SELECT w.start_node, e.target_product_id, w.path || e.target_product_id
              FROM walk w
              JOIN edges e ON e.source_product_id = w.current_node
             WHERE e.target_product_id = w.start_node
                OR NOT (e.target_product_id = ANY(w.path))
        )
        SELECT 1 FROM walk WHERE current_node = start_node
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'quantity_sync source target graph contains a cycle';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION quantity_sync_deferred_validate()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
    PERFORM quantity_sync_validate_rule_graph();
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_qsr_validate_graph
    AFTER INSERT OR UPDATE OR DELETE ON quantity_sync_rule
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION quantity_sync_deferred_validate();

CREATE CONSTRAINT TRIGGER trg_qss_validate_graph
    AFTER INSERT OR UPDATE OR DELETE ON quantity_sync_source
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION quantity_sync_deferred_validate();

CREATE CONSTRAINT TRIGGER trg_qst_validate_graph
    AFTER INSERT OR UPDATE OR DELETE ON quantity_sync_target
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION quantity_sync_deferred_validate();

-- Product visibility/deletion 및 BUNDLE 구성 변경도 기존 graph를 다시 검사한다.
CREATE CONSTRAINT TRIGGER trg_qsr_product_validate_graph
    AFTER INSERT OR UPDATE OR DELETE ON products
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION quantity_sync_deferred_validate();

CREATE CONSTRAINT TRIGGER trg_qsr_bundle_validate_graph
    AFTER INSERT OR UPDATE OR DELETE ON bundle_component
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION quantity_sync_deferred_validate();

-- 재수렴 결함 1 [최우선] fix — 카테고리 판정 원천이 product_estimate_exposure로 옮겨갔으므로
-- (quantity_sync_product_in_category) 이 테이블의 변경도 products/bundle_component와 동일하게
-- 기존 graph를 다시 검사해야 한다. 그렇지 않으면 노출 카테고리가 바뀐 뒤에도 quantity_sync_rule/
-- source/target 자신을 건드리는 무관한 쓰기가 있을 때까지 위반이 감지되지 않는다.
CREATE CONSTRAINT TRIGGER trg_qsr_exposure_validate_graph
    AFTER INSERT OR UPDATE OR DELETE ON product_estimate_exposure
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION quantity_sync_deferred_validate();
