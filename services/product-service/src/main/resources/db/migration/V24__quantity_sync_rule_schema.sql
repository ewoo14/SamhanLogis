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

-- 🚨 2026-07-28 범위 축소(개발책임자 결정, PR #958 R5 이후) — 이 지점부터 EOF까지 있던
-- DB 레벨 강제층(quantity_sync_product_in_category / quantity_sync_validate_condition /
-- quantity_sync_validate_rule_graph / quantity_sync_deferred_validate 4개 함수 +
-- quantity_sync_rule·quantity_sync_source·quantity_sync_target·products·bundle_component·
-- product_estimate_exposure 6개 테이블에 붙인 CONSTRAINT TRIGGER 6개)를 전부 제거했다.
--
-- 이유 — products/bundle_component/product_estimate_exposure 3개는 품목 CRUD·시트 sync
-- 2종·이카운트 임포트·구성품 관리 등 오래된 쓰기 경로가 많아, 라운드마다 그중 하나가 이
-- 트리거에 새로 걸렸다(R5 재수렴: 5라운드 연속 도달 가능 결함, 수렴비 c 1.00→3.50 악화,
-- 도달 가능 결함 7건 중 6건이 이 층에서 발생 — A1-②·A1-③·A2-①·A2-②·A3-①·A3-②, PR #958
-- 코멘트 5098930357). 경로별 가드나 예외 번역기(QuantitySyncViolationTranslator, 이번에
-- 함께 제거)로는 이 구조 자체를 끝낼 수 없었다.
--
-- 이 슬라이스(#896 슬2) 이후에도 남는 것: 아래 3개 테이블 자체와 그 CHECK 제약·부분
-- unique 인덱스(모두 유지), 그리고 QuantitySyncRuleValidator(Java)의 그래프 검증 전부
-- (category 멤버십·source=target 금지·REPLACE 중복·순환·BUNDLE 경계·삭제/비노출 품목
-- 거부) — Java 계층이 유일한 강제 지점이 된다. 이로써 I-2("서비스 계층 우회 SQL도
-- 막는다")는 이 슬라이스에서 더 이상 성립하지 않는다 — 직접 SQL로 quantity_sync_rule/
-- source/target에 그래프 불변식을 위반하는 행을 넣어도 막히지 않는다. 이 트레이드오프는
-- 의도적이며, DB 레벨 강제 재도입은 #896 슬3(evaluator 도입 시점, 실측 기반)으로 미룬다.
-- 상세 근거·제거/유지 목록 전수·검증 원문은
-- docs/dev-reports/2026-07-28-896-s2-quantity-sync-schema.md §10을 참조.
