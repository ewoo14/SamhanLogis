# #848 documentType 컬럼 40→70 확장 (2026-07-19, PR #852)

## 문제
`groupware ApprovalLineService.documentTypeFor()`가 결재 발의 시 `GROUPWARE_${code}`(최대 70자 = `GROUPWARE_`(10) + `ApprovalTemplate.code`(정규식 `[A-Z0-9_]{2,60}`))를 생성하나, 이를 저장하는 `document_type`/`doc_type` 컬럼이 **VARCHAR(40)**. code 31자+ 결재유형에서 파생값이 41–70자가 되어 **value-too-long(500/truncation)**. #845 DS-2 완료 시점의 선재 결함으로 식별.

## 스코프 (3 저장소)
`GROUPWARE_${code}`를 저장하는 컬럼을 라이브 DB 17-DB 전수 실측으로 정확히 3곳 확정(grep-only는 false-negative — 실 DB 값이 권위):

| # | 컬럼 (DB) | 마이그 | 엔티티 |
|---|---|---|---|
| ① | `groupware_db.approval_lines.document_type` (nullable) | V11 | `shared/approval-core ApprovalLineBase` |
| ② | `groupware_db.document_templates.doc_type` (NOT NULL) | V11 | `groupware DocumentTemplate` |
| ③ | `auth_db.approval_line_config.document_type` (NOT NULL) | V89 | `auth ApprovalLineConfig` |

협업 `document_type`(`approval_collab_comments`·`approval_collab_suggestions` 등 다수 컬럼)은 고정 `CollabDocumentType` enum(최장 `ACCOUNTING_CASH_RECEIPT` 23자·`GROUPWARE_` 유입 0)이라 스코프 밖. `approval_attachments.ref_doc_type`(별 enum)도 무관.

변경: 3 엔티티 length 70 + `DocumentTemplate.DOC_TYPE_MAX_LENGTH`(오류문구 상수 보간) + auth `createDisplayStep`/`addStep` length guard(≤70) + groupware V11(2 ALTER + backfill)·auth V89(1 ALTER, 둘 다 첫 문장 `SET LOCAL lock_timeout='5s'`) + FE `templateSchema.MAX_DOC_TYPE_LENGTH` 70 + DTO `@Size(70)`(아래 R1).

## 워크플로우 (캐논)
- **OPUS 기획** spec v1(단일 컬럼) → **CODEX SOL 5.6 기획검수** v1→v4 수렴 GO. 반증 반영: v2(auth/document_templates 도 40 — 3저장소), v3(ddl-validate length 미검사→`information_schema` 단언·V10 legacy NULL 실측 정정·마이그 IT), v4(H3 마이그 멱등 false-green 금지=`JdbcTemplate.update()` count=0·M4 `SET LOCAL` tx 위치).
- **CODEX LUNA 5.6 구현**: 위 스코프 + genuine 검증 IT. genuine `--rerun-tasks --no-build-cache` 524 tests green.
- **OPUS R1 5-agent 적대검증 + 라이브 QA**: **[HIGH] `DocumentTemplateCreate/UpdateRequest.docType @Size(max=40)` 미확장** — `@Valid`(Bean Validation)가 도메인 `validateDocType(70)`보다 먼저 발동해 41–70자 docType 저장을 **실 HTTP 400 차단**. 서비스 직접호출 IT(`service.create()`)가 `@Valid`를 우회해 마스킹(false-green). 라이브 QA가 실 HTTP 400 "size must be between 0 and 40"로 관통 포착. **OPUS 라운드 fix**: DTO `@Size(40→70)` + `AddApprovalLineStepRequest.documentType @Size(70)` + anti-false-green MockMvc HTTP 경계 IT. 라이브 재확증 65자 docType POST 400→**201**·72자 400 "0 and 70".
- **CODEX SOL 5.6 R2 5-agent 적대검증**(리뷰=SOL·fix=LUNA): HTTP 경계 IT 정확값 round-trip 단언(presence-only 해소)·JDBC 71 원인(22001) 특정·mock 70 parity·CI `skipped=0` hard gate·DTO 한글 message·docs/PR/spec/메모리 sync·배포 runbook.

## 검증
- **genuine**(`--rerun-tasks --no-build-cache`): groupware+auth 524 tests skipped=0 failures=0. FE vitest + typecheck green. CI 38/38 green(#848 IT 실제 실행 확인).
- **ddl-validate는 VARCHAR length 미검사** → `information_schema.character_maximum_length=70` 단언 IT(3컬럼) + 실 flush 경계 IT(41/70 성공·71 거부·정확값 round-trip) + genuine 마이그 IT(V10 상태 재현→V11 backfill·`template_id IS NULL` 불변·`JdbcTemplate.update()` count=0 멱등).
- **라이브 QA**(실서버 :8080·V11/V89 적용): 3컬럼 실 write 경로 41–70 저장 실증 — ①발의→`approval_lines.document_type` 65자(201·원버그 documentTypeFor 경로) ②문서양식 POST 65자(201·R1 fix 전 400)+activate+active GET 65자 읽기(DEFAULT fallback 아님) ③auth addStep 65자(201·DB 영속). 증거 `docs/qa/848/`.

## 교훈
- **라이브 QA가 IT 마스킹을 관통**([[feedback_live_qa_penetrates_it_masking]]): BE 경계 검증을 `service.create()` 직접호출로만 하면 `@Valid`(DTO @Size) 게이트를 우회해 false-green. 실 FE가 타는 **HTTP 경로(MockMvc/라이브)**로 검증해야 컬럼·엔티티·도메인 확장이 실제 도달 가능함을 보장.
- **blast-radius는 grep 아닌 라이브 DB 값분포**([[feedback_recon_grep_false_negative]]): auth `approval_line_config`도 `GROUPWARE_${code}` 실경로였음(좁은 grep은 false-negative).
- **ddl-auto validate는 VARCHAR(n) length를 검사하지 않음**: 부팅 green≠폭 확장 → `information_schema` 단언 필수.
- **마이그 멱등은 `flyway.migrate()` migrationsExecuted=0으로 검증 금지**(flyway_schema_history 때문에 항상 green): 동일 backfill UPDATE를 `JdbcTemplate.update()`로 재실행해 count=0 단언.

연관 Issue: #848
