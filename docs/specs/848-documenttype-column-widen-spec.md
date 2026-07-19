# #848 documentType 오버플로 — document_type 컬럼 40→70 확장 (기획 spec v2 · OPUS 4.8)

- 이슈: #848 · 브랜치 `feat/848-documenttype-column-widen` · PR #852 · 결정=**3개 저장소 모두 40→70 확장**(개발책임자 2026-07-19 배치·[[project_pending_decisions_2026_07_19]])
- 기준일: 2026-07-19 · 규모=**M**(2 서비스·2 마이그·3 엔티티·1 FE) · **v1=단일컬럼(S)→SOL 기획검수 NO-GO(B1·H1·H2·M) 반영 → v2=3 저장소 + 검증 강화**
- [[feedback_applied_migration_immutable]] · [[feedback_migration_fresh_postgres_probe]] · [[feedback_recon_grep_false_negative]] · [[project_build_conventions]]

## 0. 목표·blast radius
- `documentTypeFor()`가 `GROUPWARE_${code}`(최대 70자 = `GROUPWARE_`(10) + `ApprovalTemplate.code` 최대 60자[`[A-Z0-9_]{2,60}`])를 생성하나 저장 컬럼은 **VARCHAR(40)** → **code 31자+ 시 value-too-long(500/truncation)**. 컬럼을 **40→70**으로 확장해 해소.
- **blast radius = `GROUPWARE_${code}` 를 저장하는 `document_type`/`doc_type` 컬럼 전 3곳** (라이브 DB 실측 확증 — grep-only 은 false-negative[[feedback_recon_grep_false_negative]], 실 DB 값이 권위):

| # | 컬럼 (DB) | 마이그 | 엔티티 | 저장값 (라이브 실측) | 현 오버플로 양상 |
|---|---|---|---|---|
| ① | `groupware_db.approval_lines.document_type` (nullable) | V8 | `ApprovalLineBase.java:44` | `GROUPWARE_${code}` | 발의 시 41–70자 → **DB 500/truncation** |
| ② | `groupware_db.document_templates.doc_type` (NOT NULL) | V10 | `DocumentTemplate.java:36` | `GROUPWARE_${code}` 레이아웃 key | **app `validateDocType(40)` 이 41–70 유효 템플릿 저장을 오거부** (DB 도달 전) |
| ③ | `auth_db.approval_line_config.document_type` (NOT NULL) | V61 | `ApprovalLineConfig.java:41` | `GROUPWARE_${code}` (실측 `GROUPWARE_EXPENSE_REPORT` 24자) | free-form `@RequestParam addStep` (length guard 無) → 41–70자 입력 시 **DB 500** |

- **스코프 밖(명시)**: `approval_collab_comments.document_type`(V4:75)·`approval_collab_suggestions.document_type`(V4:118) 등 협업 `document_type` = **고정 enum CHECK**(`DISPATCH_TASK`…`APPROVAL_LINE`, 최장 18자·`GROUPWARE_${code}` 저장 안 함) → 확장 불요·정확히 경계. (동일 컬럼명이나 의미·소스 상이 — SOL blast-radius 우려 해소.)

## 1. 결정 (SOL 기획검수 반영)
| # | 결정 | 근거 |
|---|---|---|
| D-848-01 | **`ApprovalLineBase.document_type` `@Column(length=40)`→`70`**(shared/approval-core·nullable 유지). 콘크리트 엔티티는 groupware `ApprovalLine` 1개(`extends ApprovalLineBase` grep 확증) | 정찰 |
| D-848-02 | **`DocumentTemplate.DOC_TYPE_MAX_LENGTH 40→70`**(line 36) — `@Column(length)`(line 46) + `validateDocType`(line 136) 자동 반영. **41–70 유효 GROUPWARE_${code} 레이아웃 저장 오거부 해소**(현 실버그) | 정찰·SOL-B |
| D-848-03 | **`ApprovalLineConfig.document_type length 40→70`**(line 41) + **`addStep`/`createDisplayStep` 에 length guard(≤70) 추가**(free-form `@RequestParam` 오버플로 차단·기존 무가드). auth 도 `GROUPWARE_${code}` 실경로(라이브 확증) | SOL-B·라이브 DB |
| D-848-04 | **groupware `V11__widen_document_type_columns.sql`**: `ALTER approval_lines.document_type TYPE VARCHAR(70)` + `ALTER document_templates.doc_type TYPE VARCHAR(70)` + **legacy NULL backfill 재실행**(V10 이 `length<=40` 로 스킵한 41–70 subset·현 활성 NULL **64행**) — V10 조인 재사용(`FROM approval_templates t WHERE template_id=t.id AND document_type IS NULL AND length('GROUPWARE_'||t.code) BETWEEN 41 AND 70`). 매칭 없는 잔여 NULL 은 V10 의도대로 DEFAULT fallback 유지 | SOL-H2·실측 64행 |
| D-848-05 | **auth `V89__widen_approval_line_config_document_type.sql`**: `ALTER approval_line_config.document_type TYPE VARCHAR(70)`(auth 최신 V88). 기존 V1~V88 불변 | SOL-B |
| D-848-06 | **FE `templateSchema.ts MAX_DOC_TYPE_LENGTH 40→70`**(DS-2 신설·doc_type UI 검증 BE parity) | 정찰 |
| D-848-07 | **70 근거 = `GROUPWARE_`(10)+code 최대 60 = 70**. code 상한(60)은 `ApprovalTemplate.validateCode` 유지(접두사·입력 도메인 불변) | 정찰 |

## 2. 스코프
- `shared/approval-core/.../ApprovalLineBase.java`: `@Column(length)` 40→70.
- `services/groupware-service/.../domain/DocumentTemplate.java`: `DOC_TYPE_MAX_LENGTH` 40→70.
- `services/groupware-service/.../db/migration/V11__widen_document_type_columns.sql` 신규(2 ALTER + backfill).
- `services/auth-service/.../domain/ApprovalLineConfig.java`: `@Column(length)` 40→70 + `createDisplayStep`/service `addStep` length guard(≤70·초과 시 `INVALID_INPUT`).
- `services/auth-service/.../db/migration/V89__widen_approval_line_config_document_type.sql` 신규(1 ALTER).
- `clients/desktop/src/renderer/print/templateSchema.ts`: `MAX_DOC_TYPE_LENGTH` 40→70.

## 3. 검증 (SOL H1 반영 — ddl-validate 는 VARCHAR length 미검사)
- ⚠️ **ddl-auto validate 부팅은 타입(VARCHAR)만 검증·length(n) 미검증**(Hibernate 6.x) → 부팅 green ≠ 컬럼 폭 확장. **아래 length 단언 필수**.
- **`information_schema.columns.character_maximum_length = 70` 단언 IT** — 3 컬럼(groupware approval_lines.document_type·document_templates.doc_type / auth approval_line_config.document_type) 각각 SQL probe.
- **실 flush IT**(mock 아닌 실 DB round-trip):
  - groupware ①: 결재 발의 → `document_type = GROUPWARE_${code}`(code 31·60자 경계 → 41·70자) 저장→재조회 일치.
  - groupware ②: `DocumentTemplate` doc_type 41–70자 저장 성공(`validateDocType(70)` 통과)·71자 거부.
  - auth ③: `addStep`/`createDisplayStep` documentType 41–70자 저장 성공·**71자 → `INVALID_INPUT` 거부**(length guard).
- **fresh Postgres probe**: groupware V1→V11·auth V1→V89 DROP/CREATE + `psql ON_ERROR_STOP`([[feedback_migration_fresh_postgres_probe]]).
- **genuine**: `--rerun-tasks --no-build-cache`·변경 모듈 전체(groupware·auth·shared/approval-core 의존 서비스)([[feedback_changed_module_full_test_before_push]]). JUnit report·skipped=0.
- **라이브QA**: 실서버 — code 31–60자 결재유형 생성 → 결재 발의 성공(스샷)·해당 문서 레이아웃 템플릿 저장 성공·auth 결재선 설정 GROUPWARE_${code} 조회 정상.

## 4. 리스크
- **ALTER COLUMN TYPE VARCHAR(40)→70 = Postgres no-rewrite**(9.2+·확장은 binary-coercible) → **테이블 재작성·인덱스 재빌드 없음**, brief `ACCESS EXCLUSIVE` catalog 락만. `doc_type` 인덱스 2개(`ux_document_templates_active_doc_type`·`ux_document_templates_name_active`) 영향 없음. 소규모 테이블·안전.
- **적용 마이그 불변**(groupware V1~V10·auth V1~V88 무수정·V11/V89 신규만)[[feedback_applied_migration_immutable]].
- 배포: groupware+auth 2 서비스 마이그(독립 DB·독립 컬럼 → 순서 무관). 엔티티(70)↔컬럼(70) 동시 배포(부팅 validate).
- 선재 오버플로(code 31자+ 기존 발의)는 본 확장으로 해소(별건 아님). legacy 64 NULL 중 41–70 subset = backfill 로 정상 레이아웃 복원(개선).

## 5. 팀 배치 (구현=CODEX LUNA)
- **BE(shared)**: ApprovalLineBase @Column length 70.
- **BE(groupware)**: DocumentTemplate DOC_TYPE_MAX_LENGTH 70 + V11(2 ALTER + backfill) + IT(발의 41–70 + document_templates 41–70/71거부 + information_schema 2컬럼).
- **BE(auth)**: ApprovalLineConfig length 70 + addStep/createDisplayStep length guard + V89 + IT(addStep 41–70/71거부 + information_schema 1컬럼).
- **FE**: templateSchema MAX_DOC_TYPE_LENGTH 70(vitest parity).

---
연관 Issue: #848
