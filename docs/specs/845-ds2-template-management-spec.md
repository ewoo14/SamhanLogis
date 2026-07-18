# #845 DS-2 — 문서 양식 템플릿 관리 (기획 spec · OPUS 4.8)

- 에픽: #845 문서 양식 디자이너 · 파일럿=결재 문서 · 브랜치 `feat/845-ds2-template-management`
- 기준일: 2026-07-18 · 진실원: DS-2 영속 패턴 정찰 + DS-1 산출물(`templateSchema.ts` 영속 계약) + 에픽 설계서
- [[feedback_reconvergence_before_merge]] · [[feedback_applied_migration_immutable]] · [[feedback_migration_fresh_postgres_probe]] · [[feedback_pgc_c2_widening_option_a]] · [[feedback_enum_expansion_check_constraint]]

## 0. 목표·비목표
- **목표**: DS-1 `DocumentTemplate` 스키마를 **groupware-service DB에 영속**(CRUD·버전·활성)하고, 결재문서 렌더러가 **FE 상수 → DB 활성 템플릿 조회**로 전환. 다중 명명 템플릿 라이브러리 + 문서유형별 활성 1개.
- **핵심 불변식**: **출력 100% 무변경 유지**(DB에 활성 템플릿 없거나 파싱 실패 시 `GROUPWARE_DEFAULT`=현 FE 상수로 fallback → DS-1 골든 게이트가 그대로 가드).
- **비목표(후속)**: 편집기/자유 geometry/캔버스(DS-3)·타 문서유형 확장. DS-2는 **BE 영속 + 최소 관리 UI(편집 없음) + 렌더러 연결**만.

## 1. 개발책임자 결정
| # | 결정 |
|---|---|
| D-DS2-01 | **저장 = 단일 JSONB 컬럼** `document JSONB`(DS-1 `parseDocumentTemplate`가 payload 통째 파싱 전제·`approval_lines.field_values JSONB` 선례). 밴드/요소 정규화 자식테이블 **비채택**(DS-1 parser와 이중표현 방지) |
| D-DS2-02 | **엔티티 = ApprovalTemplate 패턴 복제** — `extends BaseEntity`(7 audit) + `@SQLRestriction("is_deleted=false")` + `@UuidGenerator` + **private 생성자 + static `create()`** + **도메인 메서드 chain**(activate/deactivate/rename/newRevision/softDelete·직접 set 금지·한국어 Javadoc) |
| D-DS2-03 | **버전/활성 = 신규 설계**(ApprovalTemplate엔 active boolean만). `revision:int` + `status:DRAFT|ACTIVE`. **문서유형별 활성 1개 불변식** = partial unique `ux_document_templates_active ON (doc_type) WHERE status='ACTIVE' AND is_deleted=false`. `activate(id)` = 같은 docType 기존 ACTIVE→DRAFT 강등 후 승격(서비스 트랜잭션) |
| D-DS2-04 | **권한 = page-code `groupware.document-templates`** · **PageCode enum `GROUPWARE_DOCUMENT_TEMPLATES` + auth V78 seed 동시**(`PageCodeSeedConsistencyIT` 하드게이트). MASTER=enum만으로 전권(동적)·**MANAGER=V57 패턴**(group_page_permissions can_view/can_update=TRUE + account_page_permissions 머터리얼라이즈·system_master 제외). role_page_permissions(V55)는 레거시·미사용 |
| D-DS2-05 | **CRUD API = 컨트롤러 복제** — `/admin/groupware/document-templates[/{id}]` GET/POST/PUT/DELETE `@RequirePermission(VIEW/UPDATE)` + 활성 승격 `POST .../{id}/activate` + **렌더러용 `/groupware/document-templates/active?docType=` (인증-only)** |
| D-DS2-06 | **검증 이중** — **BE**: 저장 시 구조 검증(schemaVersion·JSON 파싱·singleton 개수·discriminated type)만(`ObjectMapper`·ApprovalTemplateService optionsJson 선례). Java parser 재구현 금지. **FE**: 조회 후 렌더 직전 DS-1 `parseDocumentTemplate` 재검증 + `GROUPWARE_DEFAULT` fallback(의미검증·타입안전 유지) |
| D-DS2-07 | **렌더러 연결 = 출력 무변경 우선** — `ApprovalDocView`에 docType별 활성 문서템플릿 조회 useQuery 추가 → `resolveDocumentTemplate(dbJson ?? GROUPWARE_DEFAULT)`. **활성 없음/오류/파싱실패 → GROUPWARE_DEFAULT(현 픽셀 동일)**. DS-1 골든 스위트가 무회귀 가드 |
| D-DS2-08 | **DS-1 이관 부채 처리** — ① `GROUPWARE_DEFAULT` sentinel 예약(사용자 docType/code로 불가·검증 거부) ② DB 조회 결과 **deep-clone/freeze**(공유 상수 mutate 방지) ③ 비기본 템플릿(band 재정렬/생략) compiler 분기 **fixture 추가**(test-debt 해소) |
| D-DS2-09 | **최소 관리 UI**(편집기 없음·DS-3) — 문서유형별 템플릿 목록·기본에서 생성+명명·활성 승격·삭제·복제. 시각 편집 없음(모든 템플릿은 현재 기본과 동일 내용·DS-3서 편집) |

## 2. 스코프

### ① BE (groupware-service·V10 마이그·`groupware_db`)
- **엔티티** `domain/DocumentTemplate.java`(ApprovalTemplate 복제·JSONB `document`·`revision`·`status` enum·`docType`·`name`). `domain/DocumentTemplateStatus.java`(DRAFT/ACTIVE).
- **마이그** `db/migration/V10__add_document_templates.sql` — `document_templates(id, doc_type, name, revision, status, document JSONB, ...7 audit)` + partial unique(활성 1개·D-DS2-03) + status CHECK 제약 + idempotent seed(기본 GROUPWARE_DEFAULT envelope·선택: seed 없이 fallback 의존이 더 안전 → **seed 없음 채택**·활성 없으면 FE fallback).
- **repository/service/controller/DTO** — ApprovalTemplate 스택 복제. service: create(DRAFT)·update(document 구조검증)·activate(트랜잭션 강등+승격)·delete(soft)·findByDocTypeActive. controller: CRUD + activate + active 조회.
- **권한** — `PageCode.java` enum 추가 + auth `V78__seed_groupware_document_templates_permissions.sql`(MANAGER group/account_page_permissions·V57 복제).

### ② FE (desktop)
- **api client** `renderer/api/documentTemplate.ts`(list/get/create/update/delete/activate/active·DTO normalize·`groupwareApprovalTemplate.ts` 본).
- **렌더러 연결** `print/ApprovalDocView.tsx`(활성 조회 useQuery+resolveDocumentTemplate)·`print/approvalDefaultTemplate.ts`(DB우선 fallback GROUPWARE_DEFAULT·deep-clone). `templateSchema.ts` parser 재사용.
- **관리 UI** `routes/GroupwareDocumentTemplateAdminPage.tsx`(목록·생성·명명·활성·삭제·복제·편집 없음) + route 등록 + canAccess page-code.

## 3. 기존 결정 교차검증
- **ApprovalTemplate(입력 필드)↔DocumentTemplate(렌더 레이아웃) 분리** — 클래스명/page-code(`approval-templates`≠`document-templates`)/테이블명 충돌 방지(D-DS1-04·에픽).
- soft-delete replace-set·마이그 불변(V1~V9/V77 수정금지·V10/V78만)·ddl-auto validate(엔티티↔SQL 정확일치)·enum+seed 동시(IT).
- 출력 무변경(DS-1 §0)·UUID 비노출·회사정보 배제 유지.

## 4. 검증 매트릭스
- **BE IT**: CRUD·**활성 1개 불변식**(같은 docType 2개 ACTIVE 거부·activate 강등)·권한(MASTER/MANAGER 접근·비권한 403)·JSONB 구조검증(잘못된 schemaVersion/singleton 거부)·soft-delete. **fresh Postgres 마이그 probe**(V10 DROP/CREATE·ON_ERROR_STOP).
- **auth IT**: `PageCodeSeedConsistencyIT` green(enum+seed 동시)·MANAGER group/account_page_permissions 머터리얼라이즈.
- **FE**: **DS-1 골든 스위트 무회귀**(활성 없음→GROUPWARE_DEFAULT→현 픽셀)·비기본 템플릿 fixture(compiler 분기)·관리 UI Playwright mock 스위트(목록/생성/활성/삭제)·typecheck/vitest.
- **라이브QA**: 실서버 결재문서 인쇄(활성 템플릿 없을 때 현 출력 동일)·관리 UI CRUD·활성 승격 후 렌더.

## 5. 리스크
- **최대=출력 무변경 회귀**(렌더러가 DB 조회로 바뀌며 fallback 미스 시 픽셀 드리프트) → fallback→GROUPWARE_DEFAULT + DS-1 골든 가드 + 라이브QA.
- 마이그레이션(ddl-auto validate 부팅 실패·partial unique 활성경합)·권한 seed 누락(MANAGER 접근불가)·enum-seed 불일치(IT RED).
- JSONB 저장 검증 경계(BE 구조만·FE 의미)·버전/활성 상태머신 신규 설계 복잡도.

## 6. 팀 배치 (구현=CODEX LUNA)
- BE: DocumentTemplate 엔티티+V10 마이그+repository+service(버전/활성)+controller CRUD+DTO + auth V78 권한 seed+PageCode enum + BE IT.
- FE: documentTemplate api client + ApprovalDocView/resolver DB 연결(출력 무변경) + 관리 UI + 비기본 fixture + 골든 무회귀.

---
연관 Issue: #845
