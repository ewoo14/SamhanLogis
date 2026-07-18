# #845 DS-2 — 문서 양식 템플릿 영속·활성 렌더 (기획 spec v4 · OPUS 4.8)

- 에픽: #845 문서 양식 디자이너 · 파일럿=결재 문서 · 브랜치 `feat/845-ds2-template-management` · PR #847
- 기준일: 2026-07-18 · **v2 = SOL R1 NO-GO(B5·H8·M3·L1)** · **v3 = SOL R2 NO-GO(신규 B2·H2·M3)** · **v4 = SOL R3 NO-GO(신규 B1 backfill 40초과 crash·H1 bulk @Version/audit·M2) 반영**(backfill 길이 가드·bulk lock_version/audit 명시·canonical JSON 비교·lock_version 미노출)
- 진실원: DS-1 산출물(실측) + 영속 패턴 정찰 + 에픽 설계서(DFD-07) + SOL 검수 실측 확증
- [[feedback_reconvergence_before_merge]] · [[feedback_spec_cross_check_prior_decisions]] · [[feedback_applied_migration_immutable]] · [[feedback_migration_fresh_postgres_probe]] · [[feedback_integrity_domain_policy_preconfirm]] · [[feedback_design_system_playwright_mock_suite]]

## 0. DS-1 실측 기반 스코프 재정의 (v1 오류 교정)
DS-1이 이미 구축한 것(실측):
- `ApprovalDocView`는 결재 → **입력필드 템플릿**(`findActiveApprovalTemplate(templateId)`) 조회 → `resolveApprovalDocumentTemplate()`로 **항상 `GROUPWARE_DEFAULT` 레이아웃**(docType/name만 relabel) 렌더. **저장된 레이아웃 개념 없음**.
- `templateSchema.ts`(`TemplateEnvelope`/`parseDocumentTemplate` 불변식)·`approvalDefaultTemplate.ts`(`GROUPWARE_DEFAULT`·`resolveDocumentTemplate` fallback)·골든 18(`DocumentRenderer` 직접 렌더).

**DS-2 = ①문서 레이아웃(`DocumentPayload`)을 docType별로 DB 영속(CRUD·DRAFT/ACTIVE·활성 1개) ②렌더러가 docType 활성 레이아웃을 조회·적용(없으면 DEFAULT=출력 무변경) ③출력 동일성·라운드트립 게이트.** **관리 UI·시각편집=DS-3**(편집기와 동반·현재 커스텀 레이아웃 저작 불가하므로 UI 단독 가치 미미 → 분리).

## 1. 결정 (SOL findings 반영)
| # | 결정 | 근거 findings |
|---|---|---|
| D-DS2-01 | **권한 = 기존 `groupware.approval-templates` 재사용**(에픽 DFD-07 명문). **신규 enum·auth 마이그·IT seed 없음**. MASTER·MANAGER는 V57로 이미 보유(group 101+account materialize)·"수동 조정"도 기존 UI로 동작 | HIGH5·B3·H2·H3 해소(에픽 정렬=새 결정 아님) |
| D-DS2-02 | **버전 = status 라이프사이클 `DRAFT`/`ACTIVE`**(에픽 명문·번호 revision 상태머신 아님). **낙관락 ≠ revision 분리**(R2 신규): `lock_version BIGINT @Version`(JPA 자동·모든 update·409 원천) **별도 컬럼·응답 미노출**(R3: DS-2는 내부 tx 충돌 검출만·If-Match/ETag 없음·DS-3 편집기 stale-save 방지는 read-only version/ETag 후속) + `revision INT`(정보성·`updateDocument()`=DRAFT document 편집서만 수동 +1). 엔티티 `rename()`/`activate()` 메서드는 revision 불변. **DS-2 PUT은 document 교체를 포함하므로(rename-only 전용 endpoint 없음) 매 PUT이 updateDocument 경유해 revision++ — 이는 "PUT=document 편집" 의미상 정상**(rename-only 무증분은 DS-3 편집기 후속·R1-LOW 명확화). **과거 문서 pin=DS-3 무결성 결정**(§7·DS-2는 커스텀 저작 불가로 무의미) | B5·R2-B1 |
| D-DS2-03 | **저장 = 컬럼 권위 + `document JSONB`(=`DocumentPayload`만: paper+bands)**. 권위 컬럼 `id/doc_type/name/revision/status/lock_version/`**`schema_version SMALLINT NOT NULL`**(R2 신규: FE `TemplateEnvelope.schemaVersion` 필수·BE 검증·upcast 원본 권위·JSONB에 미저장). 응답 DTO가 컬럼+payload로 `TemplateEnvelope` 조립. 매핑=`@JdbcTypeCode(SqlTypes.JSON)`+`columnDefinition="jsonb"`(ApprovalLine 선례) | B4·R2-B2 |
| D-DS2-04 | **활성 불변식 = docType당 ACTIVE ≤1**(0=정상·DEFAULT fallback). partial unique `(doc_type) WHERE status='ACTIVE' AND is_deleted=false`. `activate(id)`=**bulk 강등 `WHERE doc_type=:dt AND status='ACTIVE' AND id<>:targetId`**(대상 제외)+flush 후 승격·**이미 ACTIVE면 idempotent**·경합/unique→**409**. **bulk SQL은 `@Version`·audit listener 미발동**(R3): 강등 SQL에 **`lock_version=lock_version+1, modified_at=NOW(), modified_by=:actor` 명시**(stale 미검출·audit 누락 방지). IT: activate(현 ACTIVE)·동일 ID 동시·상이 ID 동시·**강등행 lock_version/audit 증가·stale→409**(실 Postgres) | H1·R2-H3·R3-H1 |
| D-DS2-05 | **docType 권위 = `ApprovalLine.documentType`**(영속·포맷 `GROUPWARE_${code}`·`documentTypeFor` L158). `ApprovalLineAdminResponse`에 `documentType` **노출 추가**→렌더러 조회 키. **V10 backfill**: `UPDATE approval_lines SET document_type='GROUPWARE_'||t.code FROM approval_templates t WHERE template_id=t.id AND document_type IS NULL **AND length('GROUPWARE_'||t.code) <= 40**`(R3 필수: 40초과 legacy 행이 있으면 backfill 자체가 value-too-long으로 마이그 전체 실패 → **초과 행은 skip=null 보존→DEFAULT**·별건서 컬럼 확장 후 잔여 재백필). null→DEFAULT. **`doc_type VARCHAR(40)`=source 정합**. **V1→V10 마이그 IT에 code 30/31자 경계 legacy fixture** | B2·R2-H1·R3-B1 |
| D-DS2-06 | **BE 구조검증 = FE parser 불변식과 동일**(schemaVersion·JSON well-formed·singleton 개수 TITLE/APPROVAL_GRID/CLOSING 각1·허용 band·중복 key 금지·paper). **공용 valid/invalid fixture corpus**(repo 커밋)를 BE IT+FE 테스트 양쪽 소비=parity. create/update/**activate 시점 전부** 검증. Java에 TS parser 재구현 금지(불변식만 focused validator) | H6·D6 |
| D-DS2-07 | **렌더러 연결 출력 무변경** — `ApprovalDocView`에 **docType 활성 레이아웃 조회** useQuery 추가 → `resolveDocumentTemplate(dbPayload ?? DEFAULT)`. 활성없음/오류/파싱실패/네트워크 **전 경로 DEFAULT 수렴**(현 픽셀). Query=`retry:false`·**`refetchOnReconnect:false`**·bounded. **1회 결정 불변식**(R2 신규): late-resolve/reconnect/refetch로 DEFAULT→ACTIVE 교체 race 차단(테스트 매트릭스에 pending→timeout·late resolve·reconnect 포함) | B1·B7·R2-MED1 |
| D-DS2-08 | **DS-1 부채** — ① `GROUPWARE_DEFAULT` 상수 **recursive freeze** + fallback/DB결과 **deep-clone** 반환(공유 mutate 차단·현 shallow spread 참조공유 해소) ② docType `GROUPWARE_DEFAULT`/`DEFAULT` **예약**(create/update 거부·`ApprovalTemplate.validateCode` 포함 사전 probe) ③ **비기본 fixture**(band 재정렬·요소 생략) parser→compiler 경로 | MED1·D8 |
| D-DS2-09 | **API 계약 = 요청/응답 JSON + endpoint 표 확정**(R2 정밀화) — create(body: docType·name·document·schemaVersion → DRAFT·201)·update(DRAFT만·ACTIVE 422)·rename(**PUT 일부**·별 endpoint 아님)·activate(→ACTIVE·경합 409·현 ACTIVE idempotent)·deactivate·delete(soft·ACTIVE 삭제→활성 0 허용). **서버 권위 필드**(client mass-assignment 금지): `status`(activate/deactivate로만)·`revision`·`lock_version`·`id`·audit. **이름 uniqueness=docType 내 유일**(부분 unique). VIEW=GET·UPDATE=모든 mutation(action 표) | MED3·LOW1·R2-MED2 |
| D-DS2-10 | **입력 상한 수치 확정**(R2) — 요청 ≤64KB·JSON depth ≤16·bands ≤32·band당 elements ≤64·key/name ≤100자. BE 강제+경계 IT | MED2·R2-MED3 |

## 2. 스코프

### ① BE (groupware-service·V10·`groupware_db`)
- **엔티티** `domain/DocumentTemplate.java`(BaseEntity 7-audit·`@SQLRestriction`·static create(DRAFT)·도메인 chain: updateDocument(DRAFT만·revision++)·activate/deactivate·rename·softDelete·직접 set 금지·한국어 Javadoc)·`document JSONB`(DocumentPayload)·컬럼 doc_type(VARCHAR 40)/name/revision/status/**`@Version lock_version`**/**schema_version**. `domain/DocumentTemplateStatus.java`.
- **마이그** `V10__add_document_templates.sql` — 테이블(7 audit·`document jsonb NOT NULL`·`lock_version bigint NOT NULL DEFAULT 0`·`schema_version smallint NOT NULL`)·partial unique(활성)·**이름 부분 unique `(doc_type,name) WHERE is_deleted=false`**·status CHECK·**approval_lines.document_type backfill**(D-DS2-05)·**seed 없음**(활성 없으면 DEFAULT fallback·§4 라운드트립으로 동일성 증명).
- **validator** `service/DocumentPayloadValidator.java`(공용 corpus 불변식). **repository/service**(create/update/activate 원자·delete soft/findActiveByDocType)·**controller** `/admin/groupware/document-templates`(CRUD+activate·`@RequirePermission("groupware.approval-templates",VIEW/UPDATE)`) + 렌더러용 `/groupware/document-templates/active?docType=`(인증-only). **DTO**(TemplateEnvelope 조립).
- **ApprovalLineAdminResponse**에 `documentType` 노출(D-DS2-05).

### ② FE (desktop) — 렌더러 연결만(관리 UI=DS-3)
- **api client** `renderer/api/documentTemplate.ts`(`findActiveDocumentTemplate(docType)`·payload normalize).
- `ApprovalDocView.tsx`(docType 활성 레이아웃 조회 useQuery+resolveDocumentTemplate)·`approvalDefaultTemplate.ts`(freeze+deep-clone·`resolveDocumentTemplate`가 DB payload 우선·예약 docType).

## 3. 기존 결정 교차검증
- 에픽 DFD-07 권한 재사용 **정렬**(이탈 교정). ApprovalTemplate(입력필드)↔DocumentTemplate(레이아웃) **엔티티/테이블/route 분리, 권한 page-code만 공유**(파일럿).
- soft-delete·마이그 불변(groupware V1~V9·V10만·auth 무변경)·ddl-auto validate 정확일치·UUID 비노출·회사정보 배제.

## 4. 검증 매트릭스 (SOL 강화 반영)
- **BE IT**(Testcontainers): CRUD·**활성 ≤1**(2 ACTIVE 거부·**동시 activate 경합**·activate 강등+승격 원자·409)·**전체 Flyway V1→V10 + Spring `ddl-auto=validate` 부팅**·**JSONB round-trip**·CHECK/partial-index 직접 위반 probe·**구조검증 corpus parity**(valid 통과/invalid 거부)·입력 상한 경계·soft-delete. **fresh Postgres**(DROP/CREATE·ON_ERROR_STOP).
- **auth**: 변경 없음(재사용) → 기존 `PageCodeSeedConsistencyIT` 그대로 green.
- **FE**: ① **route-level 출력 동일성 게이트**(`ApprovalDocView` **실 DocumentRenderer** + API mock{활성없음/활성/오류/malformed/**pending→timeout/late-resolve/reconnect**} → 출력 assert·**활성없음===현 DEFAULT 골든 바이트동일**·1회 결정 race 없음) ② 비기본 fixture(compiler 분기) ③ DS-1 골든 18 무회귀 ④ deep-clone/freeze mutation 테스트 ⑤ typecheck/vitest.
- **라운드트립 게이트(2단계·FE mock만은 실 Postgres JSONB 왕복 미증명=false-green)**: **(1단계·BE 소유)** Testcontainers HTTP E2E — `GROUPWARE_DEFAULT` payload POST→activate→active GET, 반환 DocumentPayload를 **typed deep-equality**(또는 정렬 canonical JSON bytes)로 입력과 비교(R3: JSONB는 key순서/whitespace 미보존이라 raw 바이트동일 부적합) + **canonical active-response artifact 커밋**. **(2단계·FE 소유)** frozen-golden 테스트가 그 artifact를 parse→렌더 === frozen golden **바이트동일**(실제 출력 바이트동일은 이 단계서 보증). 실행: BE `gradlew :groupware-service:test`·FE `npm run test`.
- **라이브QA**: 실서버 — (a) 활성 레이아웃 없을 때 결재문서 인쇄=현 출력 동일 (b) API로 비기본 레이아웃 생성·활성 후 렌더 반영 (c) 스크린샷 다수.

## 5. 리스크
- **최대=출력 무변경 회귀**(DB 조회 전환) → 전 경로 DEFAULT fallback + **route-level·라운드트립 게이트**(v1 골든만으론 미가드=B1) + 라이브QA.
- activate 경합(flush 순서·partial unique 500)→명시 강등+flush+409·동시 IT. 마이그 부팅(validate)→전체 Flyway+context IT. JSONB 검증 경계(BE 구조 vs FE 의미)→corpus parity.

## 6. 팀 배치 (구현=CODEX LUNA)
- BE: DocumentTemplate 엔티티+V10+validator+repository+service(활성 원자)+controller CRUD+DTO 조립 + ApprovalLineAdminResponse documentType + BE IT(전체 매트릭스).
- FE: documentTemplate api + ApprovalDocView docType 레이아웃 연결(출력무변경) + freeze/clone/예약 + route-level·라운드트립 게이트 + 비기본 fixture.

## 7. 무결성 결정 flag / 선재 결함 (개발책임자)
- **과거 결재문서 재인쇄 = 승인 당시 레이아웃 pin vs 항상 현 활성?** DS-2는 커스텀 저작 불가(편집기 DS-3)라 무의미하나, DS-3 편집기 도입 시 법정/감사 관점 결정 필요([[feedback_integrity_domain_policy_preconfirm]]). DS-2는 "현 활성" 채택·출력무변경 유지.
- **선재 결함(DS-2 범위 외·별건 등록 예정)**: `documentTypeFor()`가 `GROUPWARE_${code}`(최대 70자)를 `ApprovalLineBase.document_type VARCHAR(40)`(공유 base)에 저장 → **code 31자+ 결재 생성 시 오늘도 오버플로**. DS-2 무관(입력템플릿 도메인·기존 코드). DS-2는 doc_type 40 정합만 하고, 이 선재 제약은 PM 자율 이슈 등록·처분은 개발책임자([[feedback_fix_in_current_pr_no_split]] 범위 외 결함 규칙).

---
연관 Issue: #845
