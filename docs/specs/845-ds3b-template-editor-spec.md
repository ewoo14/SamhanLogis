# [FEAT] #868 · #845 DS-3b — 문서 양식 편집기 MVP (3-pane 밴드 캔버스 · schema v2) 기획서

- 트랙: T1 (병렬 3트랙 중 design-system / groupware 영역)
- 기준: main `4892b1c0d` · 선행 DS-3a PR #865 머지 완료(`b6bd87866`) · DS-2 PR #847 완료 · 열린 PR 0
- 작성 단계: **OPUS 4.8 기획**(캐논 1단계) — 프로덕션 코드 0줄, 브랜치/커밋/PR 미생성
- 연관 에픽: #845 · 후속 분리: #869(DS-4)

---

## 0. 한 줄 요약

`document_templates` 는 DS-2 에서 이미 저장·활성화·재인쇄 pin 까지 서 있으나 **관리 UI 가 0** 이다(정찰 실측: `clients/desktop/src/renderer/routes/` 에 문서 양식 편집 화면·라우트 부재). DS-3b 는 ① 3-pane 편집기 화면 신설 ② `FIELD`/`TEXT` 요소와 geometry/style/binding 을 담는 **schema v2 + v1→v2 upcaster** ③ 라이브 미리보기·저장 을 낸다. 최우선 불변식은 **DS-3a 가 세운 "승인 당시 레이아웃 pin" 이 v2 도입으로 깨지지 않는 것**이며, 정찰 결과 **현행 코드는 `schemaVersion` 상수를 2 로 올리는 순간 과거 pin 된 v1 문서 전량이 렌더 실패로 강하한다**(§2.6 · 본 슬라이스 최대 리스크).

---

## 1. 범위 / 비범위

### 1.1 범위 (DS-3b)
| # | 항목 | 비고 |
|---|---|---|
| S1 | `/groupware/document-templates` 문서 양식 관리·편집 화면 신설 (목록 + 3-pane 편집기) | 현재 화면·라우트 자체가 없음(실측) |
| S2 | 3-pane = **좌 팔레트 / 중 밴드 캔버스 / 우 속성 패널** | 밴드=HEADER/BODY/FOOTER |
| S3 | 요소 `FIELD` · `TEXT` 신규 + `APPROVAL_GRID` 배치/선택 | v1 7종은 v2 에서도 계속 유효(업캐스트 대상) |
| S4 | **schema v2** — 요소별 `geometry` / `style` / `binding` | §4 |
| S5 | **v1→v2 upcaster** (FE `upcastDocumentTemplate` 실구현 + BE 버전 디스패치 validator) | 현행은 v1 만 통과시키는 스텁 |
| S6 | 저장(생성/수정/활성화/비활성화/삭제) 배선 — 기존 DS-2 엔드포인트 재사용 | 신규 엔드포인트 0 목표 |
| S7 | **라이브 미리보기** — 편집 중 draft 를 실제 `DocumentRenderer` 로 우측/하단 렌더 | 별도 렌더러 신설 금지(이중 진실원 방지) |
| S8 | mock 핸들러 `/admin/groupware/document-templates` 전 메서드 + Playwright mock 회귀 스펙 | 현재 mock 은 active/revisions **읽기 2건만** 존재(실측) |

### 1.2 비범위 (→ DS-4 #869 또는 별건)
| 항목 | 사유 |
|---|---|
| 반복 detail 밴드(행 반복) | 개발책임자 2026-07-19 결정에서 DS-4 로 명시 분리 |
| 이미지 / 로고 / 도장 요소 | 동상 |
| 인쇄 fidelity 정밀화(@page·mm 정합·페이지 넘김 제어) | 동상. DS-3b 는 기존 `PrintLayout` 골격을 유지한다 |
| 드래그 앤 드롭 자유 픽셀 배치의 고급 UX(스냅 그리드·정렬 가이드·다중 선택) | MVP 는 선택+속성 수치 입력 + 순서 이동으로 성립. 과투자 금지 |
| 템플릿 revision 롤백/브라우징 UI | D-DS3A-01 이 DS-3b 요구로 적었으나 **이슈 #868 범위 문구에 없음** → 별도 이슈 제안(§11) |
| 새 docType 도메인 확장 · 결재 외 문서(전표/견적) 편집 | 파일럿=결재 문서 유지 |
| A4 이외 용지 | `paperToPrintLayout` 은 `A4_PORTRAIT` 단일 exhaustive |

> **범위 동결 규율**([[feedback_throughput_parallel_scope_freeze_batch]]): 리뷰 라운드에서 나오는 "새 요소 타입·새 표면" 요구는 기본값이 **이슈 등록 + 다음 슬라이스**다. 현 PR 편입은 개발책임자 결정 + 라운드 비용(≈3~4h) 선제시 후에만.

---

## 2. 정찰 결과 (실측 — 전부 파일 직독)

### 2.1 FE 스키마 v1 실제 형태
`clients/desktop/src/renderer/print/templateSchema.ts`
- `DOCUMENT_TEMPLATE_SCHEMA_VERSION = 1 as const` (L9)
- `DocElement` = **7종 고정 union, 필드는 `{key, type}` 뿐**(L14~21): `TITLE · META_ROWS · APPROVAL_GRID · CONTENT_PARAGRAPHS · FIELD_TABLE · ATTACHMENT_TABLE · CLOSING`. **geometry/style/binding 없음**(이슈 전제와 일치).
- `Band = {key, kind: HEADER|BODY|FOOTER, elements}` · `DocumentPayload = {paper:'A4_PORTRAIT', bands}` · `TemplateEnvelope = {schemaVersion, id?, status?, revision, docType, name, document}`
- `parseDocumentTemplate`: `value.schemaVersion !== DOCUMENT_TEMPLATE_SCHEMA_VERSION` 이면 즉시 `UNKNOWN_VERSION` 실패(L141). **버전 범위가 아니라 단일 상수 일치 검사**.
- 파서가 요소를 재조립할 때 `{key, type}` 만 복사(L126) → **미지의 추가 필드는 조용히 소실**.
- 불변식: band/element key 전역 유일 · 요소별 허용 밴드 고정(`ALLOWED_BANDS`) · `TITLE/APPROVAL_GRID/CLOSING` 각 정확히 1 · `META_ROWS/CONTENT_PARAGRAPHS/FIELD_TABLE/ATTACHMENT_TABLE` 최대 1 · 상한 64KB/depth16/band32/element64/key100/docType70.
- `upcastDocumentTemplate(value, fromVersion)` (L247): `fromVersion !== 1` 이면 throw — **사실상 스텁**.

### 2.2 BE 영속 구조
- `services/groupware-service/.../domain/DocumentTemplate.java` — `SUPPORTED_SCHEMA_VERSION = 1`(L38), 생성자에서 `schemaVersion != 1` 이면 `INVALID_INPUT` throw(L73). `revision` 은 `updateDocument()` 마다 ++, **`updateDocument`/`rename` 은 DRAFT 에서만 허용**(`ensureDraft`, L95/118). `@Version lock_version` 낙관락. `@SQLRestriction("is_deleted = false")`.
- `domain/DocumentPayload.java` — **Java record `Element(String key, String type)`**. → v2 필드를 record 에 추가하지 않으면 **저장 시 소실**(§2.7).
- `service/DocumentPayloadValidator.java` — `schemaVersion == null || != 1` 이면 reject. FE `parseDocumentTemplate` 와 동일 불변식을 JsonNode 단계에서 중복 구현(ECMAScript trim parity 포함). 마지막에 `objectMapper.treeToValue(document, DocumentPayload.class)` 로 **typed 변환한 결과가 그대로 영속**된다.
- `service/DocumentTemplateService.java` — `create`/`update` 가 `validator.validate(...)` 후 `saveAndFlush` → `revisionService.ensureCurrentRevision(saved)`. `activate(id, actor)` 는 **저장된 payload 를 `template.getSchemaVersion()` 으로 재검증**(L114) 후 타 ACTIVE 강등 → 승격.
- `service/DocumentTemplateRevisionService.java` — `ensureCurrentRevision` 은 `(templateId, revision)` 없을 때만 append(경합은 `CONFLICT`). `findResponse` 는 soft-delete 된 양식의 이력도 읽는다.
- 마이그: `V10__add_document_templates.sql`(테이블, `schema_version SMALLINT NOT NULL`, **schema_version 에 CHECK 없음**, ACTIVE 부분 유니크 인덱스), `V11__widen_document_type_columns.sql`, `V12__pin_document_template_revisions.sql`(이력 테이블 + `approval_lines` 3컬럼 각인 + append-only 트리거 + 복합 FK), `V13__approval_lines_document_template_pin_immutable.sql`(각인 append-once 트리거).

### 2.3 API 계약(현행 · 신규 필요 0 목표)
`controller/GroupwareDocumentTemplateController.java`
| 메서드 | 경로 | 권한 |
|---|---|---|
| GET | `/admin/groupware/document-templates` | `@RequirePermission(page="groupware.approval-templates", VIEW)` |
| GET | `/admin/groupware/document-templates/{id}` | 동 VIEW |
| POST | `/admin/groupware/document-templates` | 동 UPDATE |
| PUT | `/admin/groupware/document-templates/{id}` | 동 UPDATE |
| DELETE | `/admin/groupware/document-templates/{id}` | 동 UPDATE |
| POST | `.../{id}/activate` · `.../{id}/deactivate` | 동 UPDATE |
| GET | `/groupware/document-templates/active?docType=` | 인증-only |
| GET | `/groupware/document-templates/{templateId}/revisions/{revision}` | 인증-only (D-DS3A-05) |

FE client 는 `clients/desktop/src/renderer/api/documentTemplate.ts` 에 **CRUD 전건 이미 존재**(`listDocumentTemplates`/`getDocumentTemplate`/`create`/`update`/`activate`/`deactivate`/`deleteDocumentTemplate`) — 화면만 없다.

### 2.4 재인쇄 pin 구현 위치(실측)
- BE 각인: `ApprovalLine`(pin 3컬럼) + `ApprovalLineService.pinApprovedLayout()` — APPROVED 전이와 동일 트랜잭션.
- FE 렌더 분기: `clients/desktop/src/renderer/print/ApprovalDocView.tsx` L147~245.
  - `documentTemplateQuery` 가 `documentTemplateDefaultPinned` → null / pin 3컬럼 유효 → `findDocumentTemplateRevision(templateId, revision, docType)` / 그 외 → `findActiveDocumentTemplate(docType)`.
  - `layoutDecision` 1회 latch + 배너 3종(`unpinned` / `default-pinned` / `pin-fetch-failed`) 동시 latch, 전부 `no-print`.
  - `staleTime:0` + `refetchOnMount:'always'` + `key={id}` / `key={layoutEpochKey}` 2단 remount.
- 렌더러: `print/DocumentRenderer.tsx` — 밴드 wrapper 0, HEADER 요소 존재 여부로 `docHeader`/`approvalSteps` 결정, BODY 요소를 `LegacyApprovalDocBody` 섹션으로 투영. **geometry 를 소비하는 코드는 없다**(v2 렌더 경로 신설 필요).
- 기본 양식: `print/approvalDefaultTemplate.ts` — `GROUPWARE_DEFAULT`(deepFreeze) + `resolveDocumentTemplate`(파싱 실패 시 DEFAULT).

### 2.5 화면·라우팅·권한(실측)
- `routes/index.tsx` L381~387: `/groupware/approval-templates` → `PermissionGuard pageCode="groupware.approval-templates" action="view"` → `GroupwareApprovalTemplateAdminPage`(= **입력 양식** 관리, 문서 레이아웃 아님).
- `components/AppLayout.tsx` L589 `dynamicCanAccess('groupware.approval-templates','view')` · L1259~1266 사이드바 "결재 양식" 링크 `requiredRole="MASTER / MANAGER"`.
- **`/groupware/document-templates` 라우트·메뉴·화면 전부 부재** — grep 0매치를 라우트 파일 직독으로 교차 확인함([[feedback_recon_grep_false_negative]] 준수).

### 2.6 🔴 최대 리스크 — 상수 bump 시 pin 붕괴 (실측 경로)
`findDocumentTemplateRevision`(`api/documentTemplate.ts` L61~85)은 이력 응답의 `schemaVersion` 을 그대로 `normalize` → `parseDocumentTemplate` 에 넘긴다. 파서는 `schemaVersion !== DOCUMENT_TEMPLATE_SCHEMA_VERSION` 이면 `UNKNOWN_VERSION`.
→ **`DOCUMENT_TEMPLATE_SCHEMA_VERSION` 을 2 로 올리면, v1 로 각인된 과거 승인 문서 전량이 `null` → `pin-fetch-failed` 배너 + `GROUPWARE_DEFAULT` 렌더**로 강하한다. 감사·법정 무결성 위반이며 CI 는 green 일 수 있다(현 골든은 전부 v1 경로). §4·§7 의 1순위 RED 대상.

### 2.7 🔴 2순위 — typed record 스트립 (실측 경로)
BE `DocumentPayloadValidator.validate()` 가 `treeToValue(document, DocumentPayload.class)` 결과를 영속시키고 `DocumentPayload.Element` 는 `(key, type)` 뿐 → **`geometry`/`style`/`binding` 을 record 에 추가하지 않으면 저장 왕복에서 조용히 소실**된다(422 도 아니고 무증상). FE `parseDocumentTemplate` 도 동일하게 `{key,type}` 만 재조립하므로 **양 층 모두** 확장해야 한다.

### 2.8 mock / 테스트 게이트(실측)
- `api/mock.ts`: document-templates 핸들러는 `active`(L10286) 와 `revisions`(L10298) **읽기 2건뿐**. `/admin/groupware/document-templates` CRUD mock **없음** → 편집기 mock 스펙을 쓰려면 신설 필수.
- `clients/desktop/playwright.config.ts`: `testDir=./playwright`, `*-real-qa.spec.ts` 등 명시 제외. CI 잡 = `.github/workflows/qa-e2e.yml` **`Desktop Playwright (mock 회귀 hard gate)`** — `npx playwright test` 전량 + `scripts/assert-playwright-ran.mjs` silent-skip 가드. 신규 mock 스펙은 자동 게이트 대상.
- 골든 회귀: `print/__goldens__/` 17 HTML + `approvalRenderGolden.test.tsx`(frozen===golden AND new===golden) + `__frozen__/FrozenApprovalDocLegacy.tsx`. **DS-1 strangler 불변식** = v1 문서의 DOM 출력 무변경.
- `frontend-desktop` CI 잡: design-system 사전 `npm ci && npm run build` → desktop `npm ci` → typecheck/lint/build/build:web/build:capacitor/vitest.

---

## 3. 기존 결정 교차검증 (`.claude/memory/`, `docs/dev-reports/`, `migration/decisions/DECISIONS.md` grep 대조)

| # | DS-3b 설계 결정 | 대조한 기확정 결정(출처) | 판정 |
|---|---|---|---|
| 1 | schema v2 도입 + FIELD/TEXT/geometry/style/binding | **D-DS3A-04** "스키마 v1 유지 — FIELD/TEXT·geometry/style/binding 은 DS-3b" (DECISIONS L3055) · `docs/specs/845-ds3a-reprint-pin-spec.md` L82/L170 | ✅ 정확히 위임된 범위 |
| 2 | 재인쇄 렌더 4-우선순위(pin → default-pinned → 현 ACTIVE → 조회실패 DEFAULT+alert)를 **그대로 보존** | **D-DS3A-06**(R3 정정, 3-way 재정의 · 배너 role 구분 · no-print · 상호배타) | ✅ 준수 — DS-3b 는 이 분기에 **손대지 않는다**. 단, v2 도입이 ①경로를 사실상 무력화하지 않는지 §4.4 로 보증 |
| 3 | v1 로 pin 된 문서는 **v1 그대로** 렌더(업캐스트 후에도 시각 동일) | **D-DS3A-01** pin 기전=참조 각인 + 복합 FK · **DS-1 strangler**(출력 100% 무변경, 골든 17) | ✅ — 단 §2.6 붕괴 경로가 실재하므로 RED-first 로 고정 |
| 4 | 편집기 권한 = 기존 `groupware.approval-templates` 재사용, 신규 page-code seed 0 | **D-DS3A-05** 권한 이원화(관리 CRUD=`groupware.approval-templates` 재사용 / 재인쇄 이력 조회=인증-only) · [[feedback_fe_canaccess_pagecode_be_match]] | ✅ 상충 없음 |
| 5 | 저장 = 기존 DS-2 엔드포인트 재사용, 신규 엔드포인트 0 | **D-DS2-11**(document JSONB 권위·V10 한정·409 경합) · **D-DS2-12**(로딩 종료 후 1회 결정·DEFAULT 수렴) | ✅ |
| 6 | ACTIVE 양식 직접 편집 금지(DRAFT 만 편집) → 편집기 UX 가 이를 드러냄 | `DocumentTemplate.ensureDraft`(구현 사실) · D-DS2-11 ACTIVE 단일성 | ✅ 구현 제약과 일치. **spec 이 이를 명시하지 않으면 편집기가 422 를 사용자에게 흘린다**(§5.3) |
| 7 | 라이브 미리보기 = 실 `DocumentRenderer` 재사용 | `project_print_preview_standardization`(전표/견적/결재 PrintLayout 표준화 #481~484) · DS-1 "2단계 compiler·wrapper 0" | ✅ — 별도 미리보기 렌더러 신설은 **표준화 결정과 상충**하므로 금지 |
| 8 | 화면 UUID 미노출(템플릿 id 는 key/API path 전용) | [[feedback_uuid_no_user_visibility]] · `GroupwareApprovalTemplateAdminPage.tsx` 헤더 주석 선례 | ✅ |
| 9 | Role 표기 `MASTER / MANAGER` 풀네임 | [[feedback_role_naming_full]] · `AppLayout.tsx` L1262 선례 | ✅ |
| 10 | revision 롤백·이력 브라우징 UI | **D-DS3A-01** 이 "DS-3b 편집기가 이력·롤백·브라우징을 요구"라 적음 ↔ **이슈 #868 범위 문구에는 없음** | ⚠️ **불일치** — MVP 는 이슈 문구를 권위로 삼아 비범위, 별도 이슈로 등록 제안(§11). 착수 전 PR 에 결정 기록 |
| 11 | 자동저장 없음(명시 저장 버튼만) | `updateDocument()` 가 매 저장마다 `revision++` + `ensureCurrentRevision` append(구현 사실) | ✅ 신규 결정 — 자동저장 시 이력 폭증. spec 결정으로 명문화 |
| 12 | Flyway 신규 V 필요성 | [[feedback_applied_migration_immutable]] · [[feedback_enum_expansion_check_constraint]] | §6 참조 — V10~V13 **일절 수정 금지**, 필요 시 V14 신규만 |

---

## 4. schema v2 + upcaster 설계

### 4.1 v2 요소 모델
```
DocElementV2 =
  | 레거시 composite 7종(v1 그대로): TITLE·META_ROWS·APPROVAL_GRID·CONTENT_PARAGRAPHS·FIELD_TABLE·ATTACHMENT_TABLE·CLOSING
  | { key, type:'FIELD', binding: BindingRef, geometry?, style? }
  | { key, type:'TEXT',  text: string,        geometry?, style? }
```
- **레거시 7종을 v2 에서 제거하지 않는다.** 제거하면 upcast 가 손실 변환이 되어 §3-3 이 깨진다.
- `geometry` = 밴드 상대 박스 `{ x, y, w, h }` (단위 = 밴드 폭 대비 % 또는 mm — 구현 라운드에서 하나로 확정하고 spec 에 박제; MVP 는 **% 권장**: A4 폭 의존 제거).
- `style` = 화이트리스트 키만: `{ fontSize?, bold?, align?('left'|'center'|'right'), border?(boolean) }`. 자유 CSS 문자열 금지(주입 표면).
- `binding` = **allowlist 열거형만**(DS-1 "binding allowlist" 연장): `header.title` · `header.docNo` · `header.issueDate` · `closing.note` · `body.fieldRow[<fieldKey>]`. **UUID·내부 id 로 해석되는 경로는 스키마 수준에서 부재**([[feedback_uuid_no_user_visibility]]).
- 상한: v1 상한 전부 승계(64KB/depth16/band32/element64/key100). v2 는 요소 수가 늘 수 있으므로 **depth 는 여유가 없다** — geometry/style 중첩을 1단(flat object)으로 유지.

### 4.2 v2 배치 불변식
- `APPROVAL_GRID` 는 **여전히 정확히 1개**(이슈 명시 요소이자 감사 핵심).
- `TITLE`/`CLOSING` singleton 유지 — 단 v2 에서 `TEXT` 로 제목을 대체 저작하는 경우를 허용할지는 **미확정**. MVP 는 **singleton 유지**(레거시와 동형)로 두고, 제목 자유화는 DS-4.
- `FIELD`/`TEXT` 는 개수 무제한(밴드당 64 상한 내), 밴드 종류 제약 없음(HEADER/BODY/FOOTER 어디든).
- key 전역 유일 유지 — 편집기가 요소 추가 시 충돌 없는 key 를 생성해야 한다(§9).

### 4.3 버전 판별 방식
- **권위 = `TemplateEnvelope.schemaVersion` (BE `document_templates.schema_version` / `document_template_revisions.schema_version` 컬럼)**. JSONB 안에 버전을 중복 저장하지 않는다(D-DS2-03 이 이미 "JSONB 에 미저장" 결정).
- FE: 단일 상수 비교를 **버전 디스패치 테이블**로 교체.
  ```
  SUPPORTED_SCHEMA_VERSIONS = [1, 2]
  CURRENT_SCHEMA_VERSION    = 2      // 신규 저장 시 기록
  parseDocumentTemplate(v)  → 버전별 파서로 분기(v1 파서는 원문 보존, v2 파서 신설)
  upcastDocumentTemplate(v, from) → from=1 → upcastV1ToV2 · from=2 → identity
  ```
- BE: `DocumentTemplate.SUPPORTED_SCHEMA_VERSION` 상수를 `Set.of((short)1,(short)2)` 류 허용집합 + `CURRENT` 로 분리. `DocumentPayloadValidator.validate(schemaVersion, node)` 를 **버전별 분기**로 개편(v1 규칙은 현행 그대로 동결, v2 규칙 신설).
- `DocumentTemplateService.activate()` 가 저장된 payload 를 `template.getSchemaVersion()` 으로 재검증하므로, **v1 로 저장된 레거시 양식의 활성화가 계속 통과**해야 한다(RED 대상 §7-R4).

### 4.4 pin 불변 보장 구조 (핵심)
| 보장 | 방식 |
|---|---|
| G1. **pin 된 v1 revision 은 영원히 v1 규칙으로 파싱된다** | 이력 응답의 `schemaVersion`(=1)로 v1 파서를 선택. 상수 일치 검사 폐기. `document_template_revisions` 는 append-only 트리거(V12)로 DB 가 이미 원문 불변을 강제 |
| G2. **업캐스트는 렌더 직전 메모리에서만 일어난다** | 저장소(JSONB)에 대한 in-place 업캐스트 **금지**. v1 행을 v2 로 재기록하는 배치 마이그레이션 **금지**(pin 원문 위조에 해당) |
| G3. **업캐스트 결과의 DOM 이 v1 렌더와 동일** | upcast 는 레거시 7종에 geometry/style/binding 을 **추가하지 않는다**(undefined 유지). v2 렌더러는 geometry 없는 레거시 요소를 **기존 flow 경로**로 그린다 → 골든 17 이 그대로 통과해야 한다 |
| G4. **편집이 과거 문서를 건드릴 수 없다** | `updateDocument()` 는 `document_templates` 행만 바꾸고 `revision++` 후 새 이력 행을 append. 과거 이력 행은 트리거로 UPDATE/DELETE 불가. `approval_lines` 각인도 V13 append-once 트리거로 사후 변조 불가 |
| G5. **미pin 문서의 fallback 경로가 v2 로 바뀌어도 배너 의미가 유지** | `unpinned` 배너 문구는 "현재 양식으로 표시" — 현재 ACTIVE 가 v2 여도 사실 그대로. 배너 로직 변경 금지 |

> **업캐스트 방향은 단방향(v1→v2)만.** 다운캐스트(v2→v1)는 정의하지 않는다 — 정보 손실이 발생하고 pin 원문 보존 원칙과 충돌한다.

### 4.5 v1→v2 업캐스트 규칙 표
| v1 | v2 | 비고 |
|---|---|---|
| `schemaVersion: 1` | `2` (메모리 상에서만) | 저장소 값은 불변 |
| `document.paper` | 그대로 | |
| `bands[]` (key/kind/elements) | 그대로 | |
| 레거시 요소 `{key,type}` | `{key,type}` — geometry/style/binding **미부여** | G3 |
| (신규) | `FIELD`/`TEXT` 는 v1 문서에 존재할 수 없음 | |
| 상한/불변식 | v2 규칙 적용 시 v1 문서는 전부 통과해야 함 | 통과 못 하면 v2 규칙이 잘못된 것 |

---

## 5. 경계 / 권한 / 계약 / 무결성

### 5.1 권한
- 신규 라우트 `/groupware/document-templates` → `PermissionGuard pageCode="groupware.approval-templates" action="view"`.
- 저장/활성화/삭제 버튼 노출·실행 = `usePermissions` 의 `update` 판정. **FE 숨김은 UX 이고 권위는 BE `@RequirePermission(..., UPDATE)`** — 이미 컨트롤러에 존재.
- 사이드바 링크: "결재 문서 양식"(기존 "결재 양식"=입력 양식과 구분되는 라벨), `requiredRole="MASTER / MANAGER"`.
- **auth-service 마이그레이션·권한 seed 신규 0건**(D-DS3A-05 동일 근거). `permissionsApi.ts` 의 page-code union 에 신규 추가 없음.
- 🚨 트랙A(#864) 회고 교훈: **VIEW 만 가진 사용자가 어떤 경로로도 저장에 도달하지 못함**을 BE 강제 + RED 로 증명할 것(§7-R6).

### 5.2 API 계약
- 신규 엔드포인트 **0** 목표. 저장 요청 body 는 기존 `DocumentTemplateCreateRequest/UpdateRequest`(docType/name/schemaVersion/document) 를 그대로 쓰되 `schemaVersion` 이 2 를 허용하도록 BE 확장.
- 409(이름 중복·활성화 경합) / 422(ACTIVE 편집·docType 변경·예약 docType) / 400(구조 위반) 를 편집기가 **한국어 사용자 메시지로 표면화**해야 한다(현재 화면이 없어 미배선).
- `lock_version` 은 DTO 미노출(D-DS2-03) — 편집기는 낙관락 충돌을 409/`ObjectOptimisticLockingFailureException` 경유 메시지로만 처리.

### 5.3 무결성 영향
- 편집기는 **DRAFT 만 수정 가능**. ACTIVE 양식을 고치려면 `deactivate` → 편집 → `activate`. 이 사이 해당 docType 은 ACTIVE 0 이 되며, 그 순간 승인되는 문서는 D-DS3A-03 에 따라 `document_template_default_pinned=true` 로 각인된다 → **운영상 "편집 중 승인" 이 기본 양식 고정을 유발**. 편집기 UX 에 이 부작용을 경고 문구로 고지한다(신규 도메인 정책이 아니라 기존 결정의 표면화).
- 감사: `document_templates`/`document_template_revisions` 는 BaseEntity 7 audit + soft delete. 편집 행위 자체의 별도 감사 로그 신설은 비범위.

---

## 6. 데이터 · 마이그레이션 영향

| 항목 | 판단 |
|---|---|
| `document_templates.schema_version` | 이미 `SMALLINT NOT NULL`, **CHECK 제약 없음**(V10 실측) → 2 저장에 DDL 변경 불필요 |
| `document_template_revisions.schema_version` | 동일하게 `SMALLINT NOT NULL`, 제약 없음 |
| `document` JSONB | 컬럼 타입 변경 없음. v2 payload 는 같은 컬럼에 저장 |
| 기존 v1 행 재기록 | **금지**(G2). backfill/마이그레이션 데이터 변환 0 |
| V10~V13 | [[feedback_applied_migration_immutable]] — 주석 포함 수정 금지 |
| 신규 V14 | **원칙적으로 불필요.** 다만 `schema_version IN (1,2)` CHECK 를 방어적으로 추가한다면 신규 `V14__document_template_schema_version_check.sql` 로만. 채택 여부는 구현 라운드 결정(불필요한 마이그는 추가하지 않는 편을 기본값으로 둔다) |
| enum 확장 | 요소 `type` 은 DB enum/CHECK 가 아니라 JSONB 내부 문자열 → CHECK 마이그 대상 아님. `DocumentTemplateStatus` 무변경 |
| fresh Postgres probe | V14 를 추가하는 경우에만 필요([[feedback_migration_fresh_postgres_probe]]). 추가하지 않으면 기존 IT 로 충분 |

---

## 7. 테스트 전략 — RED-first 대상 열거

> 규율: **결함을 재현하는 실패 테스트를 먼저 쓰고 RED 원문을 제출한 뒤** 고친다. RED 를 만들 수 없으면 결함 미이해 신호 → 고치지 말고 보고([[feedback_canonical_workflow]]).

| # | RED 로 먼저 재현할 결함 | 위치/층 | GREEN 조건 |
|---|---|---|---|
| **R1** 🔴 | `CURRENT_SCHEMA_VERSION` 을 2 로 올린 상태에서 **v1 로 pin 된 승인 문서를 재인쇄** → 현행 로직이면 `pin-fetch-failed` 배너 + DEFAULT 렌더 | FE `documentTemplate.ts` + `ApprovalDocView` 통합 | v1 pin 문서가 **v1 원문 그대로** 렌더되고 배너 0 |
| **R2** 🔴 | v2 payload(geometry/style/binding 포함)를 저장 후 재조회 → **필드 소실**(BE record 스트립 §2.7) | BE IT (실 Postgres, JSONB 왕복) | 저장→조회 왕복에서 geometry/style/binding 이 **바이트 동등** |
| **R3** 🔴 | FE `parseDocumentTemplate` 가 v2 요소의 추가 필드를 **드롭**(§2.1 L126) | FE 단위 | 파서 출력이 입력의 v2 필드를 보존 |
| **R4** | v1 로 저장된 레거시 양식의 `activate()` 가 v2-only validator 에 걸려 **400/422** | BE IT | v1 양식 활성화 계속 성공 |
| **R5** | v1 문서를 v2 로 업캐스트해 렌더한 DOM 이 **골든 17 과 불일치** | FE 골든(`approvalRenderGolden.test.tsx`) | `new === frozen === golden` 유지 |
| **R6** | `groupware.approval-templates` **VIEW 만** 보유한 사용자가 편집기 저장에 도달 | FE mock 스펙 + BE 실 HTTP | 403 / 버튼 미노출 양측 |
| **R7** | 편집기가 **ACTIVE 양식**을 저장 시도 → 사용자에게 원문 422 노출(무처리) | FE mock 스펙 | 한국어 안내 + 저장 차단 |
| **R8** | 요소 추가 시 **중복 key** 생성 → 저장 400 | FE 단위 | key 자동 생성이 전역 유일 보장 |
| **R9** | 라이브 미리보기가 저장 전 draft 를 반영하지 않음(또는 저장된 것과 다른 렌더러 사용) | FE 단위/mock | 미리보기 = 실 `DocumentRenderer` 출력과 동일 |

### 뮤테이션 RED 로 지킬 불변식
- **INV-1 (최우선)**: "pin 된 과거 문서의 렌더 출력은 편집기·v2 도입과 무관하게 불변." → 뮤테이션: ①버전 디스패치를 상수 비교로 되돌린다 ②upcast 가 레거시 요소에 기본 geometry 를 부여한다 ③`ApprovalDocView` 의 pin 분기를 현재 ACTIVE 조회로 바꾼다 — **셋 각각이 개별 RED** 를 내야 한다(한 층만 지워도 RED = false-green 아님, DS-3a 선례 방식).
- **INV-2**: v2 필드는 FE 파서·BE record·JSONB 3층 전부에서 보존된다 → 어느 한 층만 스트립해도 RED.
- **INV-3**: 저장 권위는 BE — FE 가드를 제거해도 403.

### 실행 게이트
- desktop: `npm run typecheck` + `npm run lint` + `npm test`(vitest) — 로컬 필수.
- **design-system 변경 시**: `clients/web/design-system` 에서 `npm ci && npm run build` 선행(정션 `clients/desktop/node_modules/@samhan/design-system → clients/web/design-system` 실측) + **Playwright mock 스위트 필수**([[feedback_design_system_playwright_mock_suite]]).
- Desktop Playwright hard gate: `cd clients/desktop && npx playwright test` (mock :5173). **신규 mock 스펙은 시드 id 기준·지어낸 id 금지**([[feedback_verify_playwright_gate_before_adversarial]]).
- BE: `./gradlew :services:groupware-service:test --rerun-tasks --no-build-cache`(캐시 false-green 방지).

---

## 8. 라이브QA 시나리오 (실서버 실제 실행 — 정적검사 대체 금지)

전제: Docker 로컬 스택 `up -d --build`(jar 만 빌드하면 이미지 stale — [[project_local_stack_qa_gotchas]]), 데스크톱 `:8080`, mock OFF, 계정 `dev_master`/`${QA_DEV_DEFAULT_PASSWORD}`. **매 리뷰 라운드마다 GUI 스크린샷 다수**([[feedback_live_qa_every_round_screenshots]]) + SendUserFile + PR SHA-pinned 인라인.

| # | 사용자 경로 | 기대 |
|---|---|---|
| L1 | 로그인 → 사이드바 "결재 문서 양식" 진입 | 목록 표시, UUID 미노출 |
| L2 | 신규 양식 생성(docType 선택·이름) → 3-pane 편집기 진입 | 좌 팔레트/중 밴드 캔버스/우 속성 |
| L3 | 팔레트에서 `TEXT` 추가 → 문구 입력 → 속성에서 정렬/굵기/좌표 변경 | 라이브 미리보기가 즉시 반영 |
| L4 | `FIELD` 추가 → binding 선택(문서번호/발행일/결재 필드) | 미리보기에 실제 값 자리 표시 |
| L5 | `APPROVAL_GRID` 위치 이동 | 미리보기 결재란 이동, 1개 초과 추가 불가 |
| L6 | **저장** → 목록 복귀 → 재진입 | 저장 내용 **전부 복원**(geometry/style/binding 소실 0 — R2 의 라이브 대응) |
| L7 | 활성화 → 해당 docType 신규 결재 상신·승인 → 인쇄 미리보기 | 새 v2 양식으로 렌더 |
| L8 | 🔴 **L7 승인 문서를 pin 시킨 뒤 양식을 다시 편집·재활성화 → L7 문서 재인쇄** | **승인 당시 외형 그대로**(배너 0). 편집 전/후 스크린샷 픽셀 비교 |
| L9 | 🔴 **DS-3a 시절 v1 로 pin 된 기존 승인 문서 재인쇄** | v1 원문 렌더, `pin-fetch-failed` 배너 **미출현**(§2.6 회귀 감시) |
| L10 | ACTIVE 양식 편집 시도 | 한국어 안내 + 차단(422 원문 노출 없음) |
| L11 | VIEW 전용 계정으로 편집기 진입 | 저장/활성화 버튼 미노출 + 강제 요청 시 403 |
| L12 | 인쇄 미디어(`print` emulate) + 실제 PDF 출력 | 편집기 UI/배너가 인쇄물에 **미포함**(`no-print` 불변식) |

> L8/L9 는 이 슬라이스의 **머지 게이트 그 자체**다. 공유 실데이터에 write 하지 말고 전용 throwaway docType/양식으로 수행([[feedback_qa_live_shared_data_readonly]] — DS-3a 에서 실제 오염 사고 있었음).

---

## 9. 파일 단위 구현 계획

### FE — desktop (`clients/desktop/src/renderer/`)
| 파일 | 신설/수정 | 역할 |
|---|---|---|
| `print/templateSchema.ts` | 수정 | `SUPPORTED_SCHEMA_VERSIONS`/`CURRENT_SCHEMA_VERSION`, v2 타입(`DocElementV2`·`Geometry`·`ElementStyle`·`BindingRef`), 버전 디스패치 파서, `upcastV1ToV2` 실구현 |
| `print/templateSchema.v2.test.ts` | 신설 | v2 파서/상한/불변식 + **R3** |
| `print/templateUpcast.test.ts` | 신설 | v1→v2 업캐스트 규칙표 검증 + **R5 골든 연동** |
| `print/DocumentRenderer.tsx` | 수정 | v2 요소(`FIELD`/`TEXT`) 렌더 분기 추가. **geometry 없는 레거시 요소는 기존 flow 경로 그대로**(G3) |
| `print/DocumentRenderer.test.tsx`(기존 `DocumentRenderer.test.tsx`) | 수정 | v2 compile 케이스 추가 |
| `print/approvalRenderGolden.test.tsx` · `__goldens__/` | **무변경 유지** | 골든이 바뀌면 strangler 위반 신호 |
| `api/documentTemplate.ts` | 수정 | `normalize` 가 버전별 파서를 타도록. `findDocumentTemplateRevision` 의 v1 경로 보존(**R1**) |
| `api/documentTemplate.test.ts` | 수정 | **R1** 회귀 테스트 |
| `routes/GroupwareDocumentTemplateAdminPage.tsx` | **신설** | 목록 + 생성/활성화/비활성화/삭제 + 편집기 진입 |
| `routes/DocumentTemplateEditorPage.tsx` | **신설** | 3-pane 셸(팔레트/캔버스/속성) + 저장 + 라이브 미리보기 |
| `components/documentTemplate/ElementPalette.tsx` | **신설** | FIELD/TEXT/APPROVAL_GRID + 레거시 요소 추가 |
| `components/documentTemplate/BandCanvas.tsx` | **신설** | HEADER/BODY/FOOTER 밴드, 요소 선택·순서 이동 |
| `components/documentTemplate/ElementInspector.tsx` | **신설** | 선택 요소의 binding/geometry/style 편집 |
| `components/documentTemplate/useTemplateDraft.ts` | **신설** | draft 상태·key 생성(**R8**)·유효성·dirty 관리 |
| `routes/index.tsx` | 수정 | `/groupware/document-templates`(+ `/:id/edit`) 라우트 + `PermissionGuard` |
| `components/AppLayout.tsx` | 수정 | 사이드바 "결재 문서 양식" 링크(`MASTER / MANAGER`) |
| `api/mock.ts` | 수정 | `/admin/groupware/document-templates` CRUD·activate·deactivate mock + 권한 판정 + v1/v2 시드 |
| `playwright/ac-868-document-template-editor.spec.ts` | **신설** | mock 회귀 hard gate 스펙(시드 id 사용) |
| `playwright/868-ds3b-real-qa.spec.ts` | **신설** | 실서버 라이브QA 하네스(`-real-qa` 접미사 필수 — CI mock 잡 제외 컨벤션) |

### BE — groupware-service
| 파일 | 신설/수정 | 역할 |
|---|---|---|
| `domain/DocumentPayload.java` | 수정 | `Element` record 에 `geometry`/`style`/`binding`/`text` 추가(nullable) — **R2 핵심** |
| `domain/DocumentTemplate.java` | 수정 | `SUPPORTED_SCHEMA_VERSION` → 허용집합 + `CURRENT` |
| `service/DocumentPayloadValidator.java` | 수정 | 버전별 분기. **v1 규칙 동결**, v2 규칙 신설(요소 타입·binding allowlist·style 화이트리스트·geometry 범위) |
| `dto/DocumentTemplateCreateRequest/UpdateRequest.java` | 수정(필요 시) | schemaVersion 2 허용 |
| `it/DocumentTemplateIT.java` | 수정 | v2 JSONB 왕복(**R2**) · v1 활성화 유지(**R4**) · 권한 403(**R6**) |
| `it/GroupwareAdminControllerIT.java` | 수정 | 재인쇄 revision 조회가 v1/v2 혼재 상태에서 정확(**R1 의 BE 대응**) |
| `src/test/resources/document-template-fixtures/` | 추가 | v2 fixture(BE/FE 공유 corpus) |

### 문서(매 PR 동기화 의무 — [[feedback_continuous_docs_sync]])
`README.md` · `ROADMAP.md` · `services/groupware-service/README.md` · `docs/samhan-public-overview.html` · `migration/decisions/DECISIONS.md`(D-DS3B-01~) · `docs/dev-reports/2026-07-2x-845-ds3b-template-editor.md` · `docs/specs/845-ds3b-template-editor-spec.md`

### design-system
- 기존 컴포넌트(`Card`·`Button`·`FormField`·`Input`·`Select`·`Modal`·`DataTable`·`Tabs`·`DragHandle`)로 3-pane 을 구성하는 것을 **기본값**으로 한다. **design-system 신규 컴포넌트 추가는 가급적 회피** — 추가 시 `npm run build` 선행 + Playwright mock 스위트 필수 + 회귀 표면 확대.

---

## 10. 리스크 · 함정 (repo 알려진 함정 대조)

| # | 리스크 | 대응 |
|---|---|---|
| K1 🔴 | **상수 bump 로 pin 붕괴**(§2.6) | R1 RED-first + L9 라이브QA + INV-1 뮤테이션 3각도 |
| K2 🔴 | **typed record/파서 스트립으로 v2 필드 무증상 소실**(§2.7) | R2/R3 RED-first + 실 DB IT(모의 저장 금지 — [[feedback_live_qa_penetrates_it_masking]] saveAndFlush mock false-green) |
| K3 | 골든 17 회귀 | upcast 가 레거시 요소를 변형하지 않음(G3). 골든 갱신 유혹 = strangler 위반 신호이므로 **골든 파일 수정 금지** |
| K4 | design-system 정션 (`clients/desktop/node_modules/@samhan/design-system → clients/web/design-system` 실측 심링크) | 루트 rename/의존 변경 시 `npm install` 재실행([[feedback_rename_filedep_junction]]) · CI 는 design-system 사전 build 필수 |
| K5 | stale dist — design-system 수정 후 `npm run build` 누락 시 desktop 이 옛 dist 소비 | 변경 시 build 선행을 구현 지시에 박제 |
| K6 | Playwright mock 스펙이 지어낸 id 사용 → 404 → hard gate RED 서프라이즈 | 시드 id 기준([[feedback_verify_playwright_gate_before_adversarial]]). **PM 이 적대검증 전 `gh pr checks` 로 회수** |
| K7 | vitest green ≠ typecheck green | `npm run typecheck` 로컬 필수 |
| K8 | react-query freshness — 편집 저장 후 목록/미리보기 stale | `staleTime:0` + `refetchOnMount:'always'` + route-param `key=` remount([[feedback_react_query_freshness_route_param_reset]]). ApprovalDocView 선례 그대로 |
| K9 | 라이브QA 가 공유 실 템플릿에 write → 오염 | 전용 throwaway docType/양식만([[feedback_qa_live_shared_data_readonly]] — DS-3a 실제 사고) |
| K10 | 스크린샷 원복이 스펙 수정을 삭제 | `git checkout -- clients/desktop/playwright/` **디렉토리 통째 금지**([[feedback_screenshot_restore_scope_destroys_edits]]) |
| K11 | 병렬 트랙(T2 #866 · T3 #824)과 파일 경합 | 영역 분리(groupware/print vs messaging vs estimate). 공유는 `routes/index.tsx`·`AppLayout.tsx`·`mock.ts` 정도 → 머지 순서 시 `git merge origin/main` 후 재-CI([[feedback_stacked_pr_ci_false_green]]) |
| K12 | 편집기 UX 과투자로 라운드 폭증 | §1.2 비범위 엄수 + 범위 동결. "fix 가 새 표면을 만든다" 감지 시 PM 바운드 판단 |
| K13 | 자동저장으로 revision 이력 폭증 | 명시 저장 버튼만(§3-11) |
| K14 | 한국어/용어 | "전표"(슬립 금지) · Role 풀네임 · 커밋/PR/Issue 한국어 · 화면 UUID 금지 |

---

## 11. 미확정 / 개발책임자 확인 필요 (착수 전 PR 에 기록)

| # | 항목 | 기본값(무응답 시) |
|---|---|---|
| U1 | revision 롤백·이력 브라우징 UI (D-DS3A-01 은 DS-3b 요구로 적었으나 이슈 #868 범위 문구엔 없음) | **비범위** — 별도 이슈 등록 후 DS-4 이후 처리 |
| U2 | geometry 단위 = % vs mm | **%**(밴드 폭 상대) |
| U3 | v2 에서 `TITLE`/`CLOSING` singleton 완화 여부 | **유지**(완화는 DS-4) |
| U4 | `schema_version IN (1,2)` 방어 CHECK 를 위한 V14 신규 마이그 채택 여부 | **미채택**(불필요 마이그 추가 지양) |
| U5 | 편집 중 ACTIVE 0 구간이 승인 문서를 `default_pinned` 로 각인시키는 부작용의 UX 처리 수준 | **경고 문구 고지**(기존 결정의 표면화, 신규 정책 아님) |

---

## 12. 캐논 진행 순서 (이 슬라이스)

1. (본 문서) OPUS 기획 → **조기 PR OPEN**(draft 금지) + 기획 리뷰 게시
2. CODEX LUNA 5.6 구현 + 게시 (`sandbox: danger-full-access`, git 금지 · PM commit 대행)
3. OPUS 4.8 5-agents 적대리뷰 + 라이브QA(L1~L12 스크린샷) + SONNET5 fix + 게시
4. CODEX SOL 5.6 5-agents 리뷰 + CODEX LUNA 5.6 fix + 게시
5. **도달 가능한 결함 0 수렴까지 반복**(검증 품질 결함은 이월 1이슈)
6. PM 종합 게시 + CI green(exact SHA) + 라이브QA 실서버 실행 → PM 머지 → #868 close
