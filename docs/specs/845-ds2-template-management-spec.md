# #845 DS-2 — 문서 양식 템플릿 영속·활성 렌더 (기획 spec v2 · OPUS 4.8)

- 에픽: #845 문서 양식 디자이너 · 파일럿=결재 문서 · 브랜치 `feat/845-ds2-template-management` · PR #847
- 기준일: 2026-07-18 · **v2 = CODEX SOL 기획검수 NO-GO(BLOCKING 5·HIGH 8·MED 3·LOW 1) 반영 전면 개정**
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
| D-DS2-02 | **버전 = status 라이프사이클 `DRAFT`/`ACTIVE`**(에픽 "버전(DRAFT/ACTIVE)" 명문·번호 revision 상태머신 아님). `revision:int`=정보성 편집 카운터(update마다 +1·낙관락). **활성 승격 시 과거 문서 pin 여부=DS-3 무결성 결정**(§7·DS-2는 커스텀 저작 불가로 무의미) | B5(과대가정 교정) |
| D-DS2-03 | **저장 = 컬럼 권위 + `document JSONB`(=`DocumentPayload`만: paper+bands)**. `id/doc_type/name/revision/status`=컬럼 권위. 응답 DTO가 컬럼+payload로 `TemplateEnvelope` 조립. JSONB에 메타 중복 저장 금지(드리프트 방지). JSONB 매핑=`@JdbcTypeCode(SqlTypes.JSON)`+`columnDefinition="jsonb"`(ApprovalLine 선례) | B4 |
| D-DS2-04 | **활성 불변식 = docType당 ACTIVE ≤1**(0=정상·DEFAULT fallback). partial unique `(doc_type) WHERE status='ACTIVE' AND is_deleted=false`. `activate(id)`=docType **명시적 bulk 강등+flush 후 승격**(dirty-flush 순서 의존 금지)·경합/unique 위반→**409**·실 Postgres 동시 activate IT | H1 |
| D-DS2-05 | **docType 권위 = `ApprovalLine.documentType`**(영속·`linkGroupwareDocument`). `ApprovalLineAdminResponse`에 `documentType` **노출 추가** → 렌더러 조회 키. null(레거시/미링크)→입력템플릿 `code`에서 `GROUPWARE_${code}` 유도→그래도 없으면 DEFAULT | B2 |
| D-DS2-06 | **BE 구조검증 = FE parser 불변식과 동일**(schemaVersion·JSON well-formed·singleton 개수 TITLE/APPROVAL_GRID/CLOSING 각1·허용 band·중복 key 금지·paper). **공용 valid/invalid fixture corpus**(repo 커밋)를 BE IT+FE 테스트 양쪽 소비=parity. create/update/**activate 시점 전부** 검증. Java에 TS parser 재구현 금지(불변식만 focused validator) | H6·D6 |
| D-DS2-07 | **렌더러 연결 출력 무변경** — `ApprovalDocView`에 **docType 활성 레이아웃 조회** useQuery 추가 → `resolveDocumentTemplate(dbPayload ?? DEFAULT)`. 활성없음/오류/파싱실패/네트워크 **전 경로 DEFAULT 수렴**(현 픽셀). Query=no-retry·bounded·"조회 완료 후 1회 결정"(race 없음) | B1·B7 |
| D-DS2-08 | **DS-1 부채** — ① `GROUPWARE_DEFAULT` 상수 **recursive freeze** + fallback/DB결과 **deep-clone** 반환(공유 mutate 차단·현 shallow spread 참조공유 해소) ② docType `GROUPWARE_DEFAULT`/`DEFAULT` **예약**(create/update 거부·`ApprovalTemplate.validateCode` 포함 사전 probe) ③ **비기본 fixture**(band 재정렬·요소 생략) parser→compiler 경로 | MED1·D8 |
| D-DS2-09 | **API 계약 명시** — 상태별 precondition·결과·HTTP: create(DRAFT·201)·update(DRAFT만·ACTIVE 422)·activate(→ACTIVE·경합 409)·delete(soft·ACTIVE 삭제 시 활성 0 허용)·rename·**이름 중복 정책**·get/list. VIEW=GET·UPDATE=모든 mutation(action 표) | MED3·LOW1 |
| D-DS2-10 | **입력 상한** — 요청 바이트·band/element 수·문자열 길이·JSON depth BE 제한(DoS 방지)+경계 IT | MED2 |

## 2. 스코프

### ① BE (groupware-service·V10·`groupware_db`)
- **엔티티** `domain/DocumentTemplate.java`(BaseEntity 7-audit·`@SQLRestriction`·static create(DRAFT)·도메인 chain: updateDocument(DRAFT만·revision++)·activate/deactivate·rename·softDelete·직접 set 금지·한국어 Javadoc)·`document JSONB`(DocumentPayload)·컬럼 doc_type/name/revision/status. `domain/DocumentTemplateStatus.java`.
- **마이그** `V10__add_document_templates.sql` — 테이블(7 audit·`document jsonb NOT NULL`)·partial unique(활성)·status CHECK·**seed 없음**(활성 없으면 DEFAULT fallback·§4 라운드트립으로 동일성 증명).
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
- **FE**: ① **route-level 출력 동일성 게이트**(`ApprovalDocView` **실 DocumentRenderer** + API mock{활성없음/활성/오류/malformed} → 출력 assert·**활성없음===현 DEFAULT 골든 바이트동일**) ② **라운드트립 게이트**(`GROUPWARE_DEFAULT`→직렬화→POST→JSONB→active GET→parse→렌더 === frozen golden 바이트동일) ③ 비기본 fixture(compiler 분기) ④ DS-1 골든 18 무회귀 ⑤ deep-clone/freeze mutation 테스트 ⑥ typecheck/vitest.
- **라이브QA**: 실서버 — (a) 활성 레이아웃 없을 때 결재문서 인쇄=현 출력 동일 (b) API로 비기본 레이아웃 생성·활성 후 렌더 반영 (c) 스크린샷 다수.

## 5. 리스크
- **최대=출력 무변경 회귀**(DB 조회 전환) → 전 경로 DEFAULT fallback + **route-level·라운드트립 게이트**(v1 골든만으론 미가드=B1) + 라이브QA.
- activate 경합(flush 순서·partial unique 500)→명시 강등+flush+409·동시 IT. 마이그 부팅(validate)→전체 Flyway+context IT. JSONB 검증 경계(BE 구조 vs FE 의미)→corpus parity.

## 6. 팀 배치 (구현=CODEX LUNA)
- BE: DocumentTemplate 엔티티+V10+validator+repository+service(활성 원자)+controller CRUD+DTO 조립 + ApprovalLineAdminResponse documentType + BE IT(전체 매트릭스).
- FE: documentTemplate api + ApprovalDocView docType 레이아웃 연결(출력무변경) + freeze/clone/예약 + route-level·라운드트립 게이트 + 비기본 fixture.

## 7. 무결성 결정 flag (개발책임자 — DS-3 착수 전 확인)
- **과거 결재문서 재인쇄 = 승인 당시 레이아웃 pin vs 항상 현 활성?** DS-2는 커스텀 저작 불가(편집기 DS-3)라 무의미하나, DS-3 편집기 도입 시 법정/감사 관점 결정 필요([[feedback_integrity_domain_policy_preconfirm]]). DS-2는 "현 활성" 채택·출력무변경 유지.

---
연관 Issue: #845
