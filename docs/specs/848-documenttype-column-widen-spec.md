# #848 documentType 오버플로 — document_type 컬럼 40→70 확장 (기획 spec v4 · OPUS 4.8)

- 이슈: #848 · 브랜치 `feat/848-documenttype-column-widen` · PR #852 · 결정=**3개 저장소 모두 40→70 확장**(개발책임자 2026-07-19 배치·[[project_pending_decisions_2026_07_19]])
- 기준일: 2026-07-19 · 규모=**M**(2 서비스·2 마이그·3 엔티티·1 FE) · **v1(단일컬럼·S)→SOL NO-GO(B1·H1·H2·M) → v2(3 저장소)→SOL NO-GO(BLOCKING 0·H1~M3·L1/L2) → v3(전량 반영)→SOL NO-GO(BLOCKING 0·전 지적 resolved·NEW H3 마이그멱등 false-green·M4 SET LOCAL tx) → v4=H3/M4 반영**
- [[feedback_applied_migration_immutable]] · [[feedback_migration_fresh_postgres_probe]] · [[feedback_recon_grep_false_negative]] · [[project_build_conventions]]

## 0. 목표·blast radius
- `documentTypeFor()`가 `GROUPWARE_${code}`(최대 70자 = `GROUPWARE_`(10) + `ApprovalTemplate.code` 최대 60자[`[A-Z0-9_]{2,60}`])를 생성하나 저장 컬럼은 **VARCHAR(40)** → **code 31자+ 시 value-too-long(500/truncation)**. 컬럼을 **40→70**으로 확장해 해소.
- **blast radius = `GROUPWARE_${code}` 를 저장하는 `document_type`/`doc_type` 컬럼 전 3곳** — **SOL 재검수가 15개 서비스 DB 전수 조회로 정확히 3곳임을 confirmed-0 확증**(grep-only 은 false-negative[[feedback_recon_grep_false_negative]], 실 DB 값이 권위):

| # | 컬럼 (DB) | 마이그 | 엔티티 | 저장값 (라이브 실측) | 현 오버플로 양상 |
|---|---|---|---|---|
| ① | `groupware_db.approval_lines.document_type` (nullable) | V8 | `ApprovalLineBase.java:44` | `GROUPWARE_${code}` (실측 `GROUPWARE_EXPENSE_REPORT`) | 발의 시 41–70자 → **DB 500/truncation** |
| ② | `groupware_db.document_templates.doc_type` (NOT NULL) | V10 | `DocumentTemplate.java:36` | `GROUPWARE_${code}` 레이아웃 key (실측 EXPENSE_REPORT·QA_TEST) | **app `validateDocType(40)` 이 41–70 유효 템플릿 저장을 오거부** (DB 도달 전) |
| ③ | `auth_db.approval_line_config.document_type` (NOT NULL) | V61 | `ApprovalLineConfig.java:41` | `GROUPWARE_${code}` (실측 `GROUPWARE_EXPENSE_REPORT` 24자) + 전표종류(SLIP_*·ACCOUNTING_JOURNAL) 혼재 | free-form `@RequestParam addStep` (length guard 無) → 41–70자 입력 시 **DB 500** |

- **스코프 밖(명시)**: 협업 `document_type`(`approval_collab_comments` V4:75·`approval_collab_suggestions` V4:118 등)은 **고정 `CollabDocumentType` enum**(코드에서만 발급·`GROUPWARE_${code}` 유입 경로 없음). **groupware V4 CHECK 목록의 최장은 18자**(`ACCOUNTING_VOUCHER`)이나, 전체 `CollabDocumentType` enum 에는 `ACCOUNTING_CASH_RECEIPT`(23자·`CollabDocumentType.java:9`)도 존재 — 그럼에도 **협업 컬럼엔 `GROUPWARE_` 유입 0**(SOL 15-DB 값분포 확증)이라 확장 불요. (동일 컬럼명이나 의미·소스 상이.)

## 1. 결정 (SOL 2회 검수 반영)
| # | 결정 | 근거 |
|---|---|---|
| D-848-01 | **`ApprovalLineBase.document_type` `@Column(length=40)`→`70`**(shared/approval-core·nullable 유지). 콘크리트 엔티티는 groupware `ApprovalLine` 1개(`extends ApprovalLineBase` grep 확증) | 정찰 |
| D-848-02 | **`DocumentTemplate.DOC_TYPE_MAX_LENGTH 40→70`**(line 36) — `@Column(length)`(line 46) + `validateDocType`(line 136) 자동 반영. **41–70 유효 GROUPWARE_${code} 레이아웃 저장 오거부 해소**(현 실버그) | 정찰·SOL-B1 |
| D-848-03 | **`ApprovalLineConfig.document_type length 40→70`**(line 41) + **`addStep`/`createDisplayStep` 에 length guard(≤70, 초과 시 `INVALID_INPUT`) 추가**(free-form `@RequestParam` 오버플로 차단·기존 무가드 확증 `ApprovalLineConfig.java:70`·`ApprovalLineConfigService.java:104`). auth 도 `GROUPWARE_${code}` 실경로(라이브 확증) | SOL-B1·라이브 DB |
| D-848-04 | **groupware `V11__widen_document_type_columns.sql`**(첫 문장 `SET LOCAL lock_timeout='5s';`·SOL-M4): `ALTER approval_lines.document_type TYPE VARCHAR(70)` + `ALTER document_templates.doc_type TYPE VARCHAR(70)` + **legacy NULL backfill**(V10 이 `length<=40` 로 스킵했을 41–70 subset·V10 조인 재사용 `FROM approval_templates t WHERE template_id=t.id AND document_type IS NULL AND length('GROUPWARE_'||t.code) BETWEEN 41 AND 70`). ⚠️**현 라이브 대상 = 0행**(활성 NULL 64행은 전부 `template_id IS NULL` 독립형 결재·backfill 무영향·정당 — 직접 실측 확인). backfill 은 **타 환경(prod)의 V10-skipped 41–70 행 복구 목적**·`IS NULL` 조건으로 멱등 | SOL-H1(실측 정정)·M4 |
| D-848-05 | **auth `V89__widen_approval_line_config_document_type.sql`**(첫 문장 `SET LOCAL lock_timeout='5s';`): `ALTER approval_line_config.document_type TYPE VARCHAR(70)`(auth 최신 V88·파일+라이브 Flyway 이력 확증). 기존 V1~V88 불변 | SOL-B1·M4 |
| D-848-06 | **FE `templateSchema.ts MAX_DOC_TYPE_LENGTH 40→70`**(DS-2 신설·`templateSchema.ts:78`·`:149` 유일 가드·blast 누락 없음) | 정찰·SOL-M2 |
| D-848-07 | **70 근거 = `GROUPWARE_`(10)+code 최대 60 = 70**. code 상한(60)은 `ApprovalTemplate.validateCode`(`:47`·`:119`) 유지(접두사·입력 도메인 불변) | 정찰 |
| D-848-08 | **오류문구·주석 parity(SOL-M1·L1)**: `DocumentTemplate.java:135/137` 하드코딩 `1~40자` → 상수 보간(또는 `1~70자`). `ApprovalLineConfig.java:40` 주석("CollabDocumentType name") → 동적 `GROUPWARE_${code}` 저장 현실 반영 갱신 | SOL-M1·L1 |

## 2. 스코프
- `shared/approval-core/.../ApprovalLineBase.java`: `@Column(length)` 40→70.
- `services/groupware-service/.../domain/DocumentTemplate.java`: `DOC_TYPE_MAX_LENGTH` 40→70 + **오류문구(line 135/137) 상수 보간**.
- `services/groupware-service/.../db/migration/V11__widen_document_type_columns.sql` 신규(2 ALTER + backfill).
- `services/auth-service/.../domain/ApprovalLineConfig.java`: `@Column(length)` 40→70 + `createDisplayStep` length guard(≤70) + **line 40 주석 갱신**.
- `services/auth-service/.../service/ApprovalLineConfigService.java`: `addStep` length guard(≤70·`INVALID_INPUT`).
- `services/auth-service/.../db/migration/V89__widen_approval_line_config_document_type.sql` 신규(1 ALTER).
- `clients/desktop/src/renderer/print/templateSchema.ts`: `MAX_DOC_TYPE_LENGTH` 40→70.

## 3. 검증 (SOL H1·H2·M1·M2 반영 — ddl-validate 는 VARCHAR length 미검사)
- ⚠️ **ddl-auto validate 부팅은 타입(VARCHAR)만 검증·length(n) 미검증**(Hibernate 6.x) → 부팅 green ≠ 컬럼 폭 확장. **아래 length 단언 필수**.
- **`information_schema.columns.character_maximum_length = 70` 단언 IT** — 3 컬럼(groupware approval_lines.document_type·document_templates.doc_type / auth approval_line_config.document_type) 각각 SQL probe.
- **컬럼별 경계 IT**(41–70 성공 + 71 거부 — SOL-H2 로 approval_lines 도 71 경계 포함, 3 컬럼 대칭):
  - groupware ① `approval_lines`: **code 60자 결재유형 → 발의 → `document_type=GROUPWARE_${code}`(70자) 저장→재조회 일치**. **code 61자 → `ApprovalTemplate.validateCode` `INVALID_INPUT` 거부**(정상경로 71 파생 불가 증명). + **JDBC/flush 경계 probe: `approval_lines.document_type` 71자 직접 저장이 DB 에서 실패**(컬럼 정확히 70 확증·information_schema 보완).
  - groupware ② `document_templates`: doc_type 41·70자 저장 성공(`validateDocType(70)` 통과)·**71자 → `INVALID_INPUT` 거부 + 오류메시지에 70 반영 단언**(SOL-M1).
  - auth ③ `approval_line_config`: `addStep`/`createDisplayStep` documentType 41·70자 저장 성공·**71자 → `INVALID_INPUT` 거부**(length guard).
- **genuine 마이그레이션 IT**(SOL-H1 — fresh 빈 DB probe 는 backfill 0행이라 데이터 동작 미검증): 격리 schema 에서 V10 까지 migrate → V10 상태 재현(code 31·60자 템플릿 심고 `template_id` 연결된 approval_lines 의 `document_type`=NULL 상태 + non-NULL 40자 이하 행 + `template_id IS NULL` 행) → **V11 migrate** → 단언: ⒜ 41·70자 파생 backfill 실행 ⒝ 기존 non-NULL 불변 ⒞ `template_id IS NULL` 행 불변 ⒟ **멱등 = 동일 backfill `UPDATE` 를 `JdbcTemplate.update()` 로 직접 재실행→반환 count `0` 단언**. ⚠️ **2번째 `Flyway.migrate()` 의 `migrationsExecuted=0` 은 `flyway_schema_history` 때문에 backfill 멱등과 무관하게 항상 green=false-green → 금지**(SOL-H3·[[feedback_gradle_test_cache_false_green]] 계열). (기존 격리 schema/target migrate 패턴 `DocumentTemplateIT.java:328`·`template_id`+NULL 시딩 helper `:393`·`template_id=null` 검증 `:361` 재사용.)
- **FE 경계 vitest**(SOL-M2): `templateSchema` docType 70자 parse 성공·71자 실패 단언.
- **fresh Postgres probe**: groupware V1→V11·auth V1→V89 DROP/CREATE + `psql ON_ERROR_STOP`([[feedback_migration_fresh_postgres_probe]]).
- **genuine**: `--rerun-tasks --no-build-cache`·변경 모듈 전체(groupware·auth·shared/approval-core 의존)([[feedback_changed_module_full_test_before_push]]). JUnit report·skipped=0.
- **라이브QA**(실서버 :8080·V11/V89 적용·실측 완료): code 55자 결재유형 생성 → ⒜ **결재 발의 → `approval_lines.document_type=GROUPWARE_${code}`(65자) 저장 201**(원버그 documentTypeFor 경로·확장 전 40이면 500) ⒝ **문서양식 POST(65자 doc_type) 201 + activate + active GET 65자 반환**(읽기 경로·DEFAULT fallback 아님) ⒞ **auth addStep `documentType=GROUPWARE_${code}`(65자) 201 + DB 65자 영속**. 경계 72자 → 400 "size must be between 0 and 70". 증거=`docs/qa/848/`. (R1 fix 전 문서양식 POST 는 DTO `@Size(40)` 로 400 "0 and 40" → fix 후 201.)

## 4. 리스크
- **ALTER COLUMN TYPE VARCHAR(40)→70 = Postgres no-rewrite**(PG 16.14·확장은 binary-coercible) → **테이블 재작성 없음**(relfilenode 불변 실측). ⚠️ **단 대상 컬럼을 키에 포함한 유니크 인덱스 3개는 ALTER 락 내에서 재빌드됨**(R1-D1 relfilenode 추적 실측: `ux_document_templates_active_doc_type`·`ux_document_templates_name_active`·auth `uq_approval_line_config_doctype_seq_active` — PG 공식 "indexes on the affected columns must still be rebuilt"). 재빌드는 ALTER 가 이미 잡은 `ACCESS EXCLUSIVE` 락 내에서 수행되어 **추가 락·추가 차단창 없음**·소규모(document_templates 5행·approval_line_config 13행 → sub-ms). `approval_lines`(document_type 인덱스 無)는 catalog 변경만. 현 관련 락/열린 tx 0.
- ⚠️ **락 대기(SOL-M3·M4)**: 라이브 `lock_timeout=0` → "brief ACCESS EXCLUSIVE" 는 **락 획득 후에만** 참·선행 장기 tx 있으면 무기한 대기 가능. **배포 runbook: ⒜ 사전 blocker query**(`pg_locks`/`pg_stat_activity` 장기 tx 확인) **⒝ `SET LOCAL lock_timeout='5s'` 를 V11/V89 마이그 트랜잭션 첫 문장으로 삽입**(Flyway 는 마이그를 tx 로 감쌈 → SET LOCAL 이 ALTER 락 획득에 적용·5s 초과 시 fail-fast 후 저활동창 재시도). ⚠️ **별도 psql 명령의 `SET LOCAL` 은 `can only be used in transaction blocks` 로 무효**(SOL-M4 라이브 실측). 저활동창 선택 시 blocker query 필수 선행.
- **적용 마이그 불변**(groupware V1~V10·auth V1~V88 무수정·V11/V89 신규만)[[feedback_applied_migration_immutable]].
- 배포: groupware+auth 2 서비스 마이그. 데이터 정합상 **순서 무관**(독립 DB·독립 컬럼·상호 FK 없음)이나, **안전 배포 순서 권장 = auth V89 → groupware V11 → desktop**(각 단계 검증 후 진행·동시 재시작 시 양쪽 blocker 있으면 5s 후 둘 다 Flyway fail→동시 기동불가 회피). 엔티티(70)↔컬럼(70) 동시 배포(부팅 validate).

## 6. 배포 runbook (실행 절차)
1. **사전 blocker 확인**(각 DB): `SELECT pid, state, now()-xact_start AS dur, query FROM pg_stat_activity WHERE datname IN ('auth_db','groupware_db') AND state<>'idle' AND now()-xact_start > interval '3 s' ORDER BY dur DESC;` → 장기 tx 있으면 해소/대기 후 진행(없어야 GO).
2. **auth V89 적용**: 서비스 배포(Flyway 자동). `SELECT character_maximum_length FROM information_schema.columns WHERE table_name='approval_line_config' AND column_name='document_type';` = **70** 확인 + `SELECT success FROM flyway_schema_history WHERE version='89';` = t.
3. **groupware V11 적용**: 배포. `approval_lines.document_type`·`document_templates.doc_type` = **70** 확인 + V11 success=t. code 31–60 결재유형 발의 smoke(발의 201·approval_lines 41–70 저장).
4. **desktop 배포**: 문서양식 편집기에서 41–70 docType 저장·active 렌더 확인.
5. **락 타임아웃**: V11/V89 첫 문장 `SET LOCAL lock_timeout='5s'` → blocker 시 fail-fast. 실패 시 1번 재확인 후 저활동창 재배포(마이그 멱등·재적용 안전).
- 선재 오버플로(code 31자+ 기존 발의)는 본 확장으로 해소(별건 아님). 71자는 기존 VARCHAR(40)에서도 유효 입력 아니었고 파생 최대 70 → **기존 유효 입력 회귀 0**.

## 5. 팀 배치 (구현=CODEX LUNA)
- **BE(shared)**: ApprovalLineBase @Column length 70.
- **BE(groupware)**: DocumentTemplate DOC_TYPE_MAX_LENGTH 70 + 오류문구 상수화 + V11(2 ALTER + backfill) + IT(발의 code60→70 + code61 거부 + approval_lines 71 JDBC 경계 + document_templates 41/70/71+메시지 + information_schema 2컬럼 + **genuine 마이그 IT V10재현→V11 backfill 4단언**).
- **BE(auth)**: ApprovalLineConfig length 70 + 주석갱신 + addStep/createDisplayStep length guard + V89 + IT(addStep 41/70/71 + information_schema 1컬럼).
- **FE**: templateSchema MAX_DOC_TYPE_LENGTH 70 + 경계 vitest(70 성공·71 실패).

---
연관 Issue: #848
