# #845 DS-1 — 문서 양식 렌더러 Foundation (기획 spec **v2** · CODEX SOL 기획검수 BLOCKING 4·HIGH 5·MED 2 반영)

- 에픽: #845 문서 양식 디자이너 · 파일럿=결재 문서 · 브랜치 `feat/845-ds1-form-renderer-foundation`
- 기준일: 2026-07-18 · 진실원: 결재문서 렌더 정찰 + CODEX SOL 기획검수(2026-07-18) + 에픽 설계서
- [[feedback_reconvergence_before_merge]] · [[feedback_design_system_playwright_mock_suite]] · [[feedback_print_design_iteration]]

## 0. 목표·비목표
- **목표**: 결재 문서 인쇄/미리보기 렌더를 코드→데이터(템플릿) 정의로 전환하는 뼈대. **출력 100% 무변경**(DOM `legacy===new` 바이트 동일 + Playwright screen/print 픽셀 동일)이 최우선 게이트.
- **비목표(후속)**: 편집기(DS-3)·자유 geometry(DS-3/4)·DB 저장/CRUD(DS-2)·전자서명 실연동·타 문서 확장. DS-1은 결재문서 1종·읽기 렌더만.

## 1. 개발책임자 결정 (기획검수 반영)
| # | 결정 |
|---|---|
| D-DS1-01 | **FE 전용**(BE/DB/마이그 없음·DS-2로 분리) |
| D-DS1-02 | 스키마 = 밴드+빌트인요소. **`schemaVersion`(스키마 버전) ↔ 사용자 `revision` 분리**·**안정 band/element key(id) 지금 포함**·composite 빌트인은 DS-1 plugin이며 **DS-3 generic 요소 이관 시 upcaster 경로 예약**(BLOCKING 3) |
| D-DS1-03 | **렌더러 = 2단계 compiler**(BLOCKING 1): `compileApprovalDocument(template, model) → 고정 slot{docHeader, approvalSteps, closingNote, noticeText, bodyNodes[]}` → **단일 legacy projection 컴포넌트**(현 PrintLayout approvalDoc + ApprovalDocView 본문을 그대로 출력). **밴드 wrapper·순서 변화 0.** 요소 순서는 slot 조립에만 반영(허위 데이터주도 아님) |
| D-DS1-04 | 기본 템플릿 = FE 상수. **docType 키 = `GROUPWARE_${resolvedTemplate.code}` → 유형별 활성 레이아웃 → 공통 기본 레이아웃 fallback**(BLOCKING/HIGH). 기존 작성 `ApprovalTemplate`(입력 필드 스키마)와 신규 `DocumentTemplate`(인쇄 레이아웃)은 **명칭·ID·역할 분리** |
| D-DS1-05 | **회귀 = 실행가능 legacy===new**(BLOCKING 4): 순수 presentational `LegacyApprovalDocContent(model)`를 테스트 참조로 유지, 동일 fixture에 `renderToStaticMarkup(legacy)===renderToStaticMarkup(new)` **한 테스트서 단언**(저장 snapshot 갱신으로 회귀 승인 불가). + **Playwright 픽셀 게이트**(HIGH): 고정 viewport/폰트/device-scale, `emulateMedia('print')`+screen 양쪽 baseline diff |
| D-DS1-06 | **ApprovalRenderModel = UUID-stripped 사전계산 계약**(BLOCKING 2·HIGH): renderer 입력을 표시 허용값만 가진 sanitized 모델로 제한. binding = 이 모델의 **allowlist 키만**(임의 경로/계산 문자열 금지). "데이터주도" 범위 = **레이아웃 선택·slot 조립**이며, 변환(정렬/필터/포맷)은 기존 순수 헬퍼가 담당 |
| D-DS1-07 | 각 빌트인 요소에 **truth-table 계약**(§3·HIGH): 입력·정렬·필터·fallback·조건부 DOM·상한 |

## 2. 스코프

### ① ApprovalRenderModel (sanitized 계약 · `print/approvalRenderModel.ts` 신규)
현 순수 헬퍼(`approvalDoc.ts`)가 raw DTO를 **UUID 제거·표시값만** 담은 모델로 사전계산:
```
ApprovalRenderModel {
  title: string
  metaRows: { label: string; value: string }[]      // 문서번호=approvalNo, 발행일=finalDecidedAt→krDate (없으면 행 자체 제외)
  approvalSteps: { label: string; name: string; decidedAt: string; signaturePngBase64: string }[]  // slice(0,5)·작성자 포함·min 2칸
  paragraphs: string[]                                // content 개행 split
  fieldRows: { label: string; value: string }[]      // template.fields×fieldValues·빈값 제거·displayOrder 정렬·NUMBER→krw·orphan "추가 필드 N"
  attachments: { typeLabel: string; title: string; detail: string }[]  // displayOrder 정렬·3종 분기·제목 fallback
  closing: { note: string; notice: string }          // note=CLOSING_NOTE 상수, notice=전자서명 안내(결재란 존재 시)
}
```
- **UUID/내부ID 부재 불변식**: approvalId/requesterId/approverId/groupId/templateId·field/attachment 내부ID 미포함. 모델 생성 시점에 제거. (테스트가 distinctive fixture ID로 정적 HTML에 부재 단언 — §4.)
- 변환 로직 = 기존 헬퍼 재사용(krw/krDate/formatApprovalDecidedAt·정렬·필터). **새 포맷 로직 0.**

### ② 스키마 타입 (`print/templateSchema.ts` 신규)
```
DocumentTemplate { schemaVersion: 1; docType: string; templateId: string; name: string; revision: number; paper: PaperEnum; bands: Band[] }
Band  { key: string; kind: 'HEADER'|'BODY'|'FOOTER'; elements: DocElement[] }
DocElement { key: string; type: BuiltinElementType; binding: ApprovalModelKey; config?: {...} }  // DS-1: geometry 없음
BuiltinElementType = 'TITLE'|'META_ROWS'|'APPROVAL_GRID'|'CONTENT_PARAGRAPHS'|'FIELD_TABLE'|'ATTACHMENT_TABLE'|'CLOSING'
ApprovalModelKey = 'title'|'metaRows'|'approvalSteps'|'paragraphs'|'fieldRows'|'attachments'|'closing'   // binding allowlist
PaperEnum = 'A4_PORTRAIT'   // canonical 저장 enum
```
- `binding`은 `ApprovalModelKey` union(allowlist)만 — 임의 string 금지(BLOCKING 2·HIGH UUID).
- band/element `key` = 안정 식별자(DS-2 저장·DS-3 선택/reorder/patch 대비·BLOCKING 3).
- **singleton 요소 계약**: TITLE/APPROVAL_GRID/CLOSING은 문서당 1개(중복 = compile 오류). 허용 밴드·개수 명시.
- `PaperEnum → PrintLayout paper('a4-portrait')` = exhaustive `paperToPrintLayout()`·unknown 거부(MED).

### ③ 2단계 compiler + legacy projection (`print/DocumentRenderer.tsx`·`print/LegacyApprovalDocContent.tsx` 신규)
- `compileApprovalDocument(template, model)`: 밴드·요소를 순회해 **고정 slot** 산출(docHeader/approvalSteps/closingNote/noticeText/bodyNodes). 요소 type별로 model의 해당 키를 slot에 매핑. 밴드/요소 순서는 bodyNodes 순서·slot 존재여부에만 반영.
- **`LegacyApprovalDocContent`** = 현 `ApprovalDocView` 본문 3섹션(내용/필드/첨부 테이블·인라인 style 그대로)을 **순수 컴포넌트로 추출**(fetch·router 없음). 이것이 bodyNodes 및 legacy 참조 양쪽에 쓰임.
- `DocumentRenderer` = compile 결과를 `PrintLayout`(approvalDoc·현 골격 불변) + bodyNodes(LegacyApprovalDocContent)로 출력. **wrapper div 0.** `noticeText`는 PrintLayout 내부 하드코딩을 유지하되 compile이 "결재란 존재 시 notice" 조건만 결정(현 동작 동일).

### ④ 기본 템플릿 상수 (`print/approvalDefaultTemplate.ts` 신규)
현 레이아웃 1:1: HEADER(TITLE·META_ROWS·APPROVAL_GRID) · BODY(CONTENT_PARAGRAPHS·FIELD_TABLE·ATTACHMENT_TABLE) · FOOTER(CLOSING). docType resolver = `GROUPWARE_${code}` fallback chain(D-DS1-04). DS-1은 단일 기본 레이아웃만(유형별 활성 레이아웃 = DS-2).

### ⑤ 전환 (`print/ApprovalDocView.tsx` 리팩터)
- 3-fetch 유지 + **로딩/오류 의미 보존**(MED): template fetch 오류=빈 필드로 계속(banner 아님)·approval/attachment 오류=중단·templateId 없음/not-found=orphan 필드. → 컴포넌트 상태 테스트로 고정.
- 변환 → `buildApprovalRenderModel` → `<DocumentRenderer template={resolveTemplate(...)} model={...} />`. PrintLayout shell·global.css 불변.

### ⑥ 회귀 가드
- **legacy===new**(D-DS1-05): `DocumentRenderer(defaultTemplate, model)` HTML === `LegacyApprovalDocContent+PrintLayout` HTML, 동일 fixture, 동일 테스트(vitest·jsdom).
- **Playwright 픽셀 게이트**: mock 렌더 페이지에 결재문서 픽스처 렌더 → screen + `emulateMedia('print')` 스크린샷 baseline(고정 viewport/폰트/scale). ac-* 관례 디렉토리·CI hard gate.
- **ApprovalDocView fetch-state 테스트**: jsdom+MemoryRouter+prefilled QueryClient로 id없음/각 query loading·error/template null·not-found 고정.
- 기존 `approvalDoc.test.ts` 무회귀.

## 3. 빌트인 요소 truth-table (HIGH)
| 요소 | 입력 | 정렬/필터 | fallback/조건부 | 상한 |
|---|---|---|---|---|
| TITLE | model.title | — | 항상 h1 | — |
| META_ROWS | approvalNo·finalDecidedAt | 발행일 없으면 **행 생략** | — | — |
| APPROVAL_GRID | model.approvalSteps | steps 정렬·작성자 0번 삽입·라벨(마지막=결재/중간=합의) | 일시는 APPROVED만·서명 placeholder('')·**빈 배열이면 결재란 박스 미렌더**·**grid col=max(2,N)** | **slice(0,5)**(작성자 포함 전체 배열) |
| CONTENT_PARAGRAPHS | content 개행 split | — | **빈 본문 섹션 생략** | — |
| FIELD_TABLE | template.fields×fieldValues | displayOrder 정렬·빈값 제거 | **NUMBER 행만** `krw(v)||raw`(numeric TEXT 미포맷)·orphan "추가 필드 N"·**빈 필드 섹션 생략** | — |
| ATTACHMENT_TABLE | attachments | displayOrder 정렬 | 3종(SLIP_REF/PARTNER_LEDGER_REF/FILE) 분기·제목 fallback·**빈 첨부 섹션 생략** | — |
| CLOSING | CLOSING_NOTE 상수 | — | notice(전자서명 안내)는 **결재란 존재 시만** | — |

## 4. fixture 매트릭스 (분기 커버리지 표 · HIGH)
| fixture | 커버 분기 |
|---|---|
| F1 단일 step | grid min 2칸·[작성,결재] |
| F2 4/5/6 step | slice(0,5) 컷·[작성,합의…,결재] |
| F3 unsorted sequence | steps 정렬 |
| F4 APPROVED/PENDING/REJECTED 혼합 | 일시 APPROVED만·빈 time |
| F5 null 이름 | name fallback |
| F6 NUMBER 유효/무효 + numeric TEXT | krw NUMBER행만 |
| F7 orphan 필드 | "추가 필드 N" |
| F8 template null/not-found/error | orphan·오류 의미 |
| F9 첨부 3종·displayOrder 역순·제목 fallback | attachment 분기 |
| F10 세 본문 섹션 전부 빈 | 섹션 생략·notice 조건 |
| F11 빈 발행일 | META 행 생략 |
| F12 UUID 부재 | distinctive fixture ID 정적HTML 부재 단언 |
→ 각 fixture로 legacy===new + (핵심 몇은) Playwright 픽셀.

## 5. 기존 결정 교차검증
회사정보 배제(2026-06-14) 유지 · UUID 비노출(sanitized model + binding allowlist로 스키마 수준 강제) · 결재란 slice(0,5) 명시 상한 · design-system PrintPreview 미사용(DS-1 미접촉).

## 6. 리스크
- 최대=출력 드리프트 → **legacy projection 재사용(새 렌더 로직 0) + legacy===new + Playwright 픽셀** 3중 가드로 근본 차단.
- 과설계 경계: DS-1은 flow·빌트인·FE상수만. geometry/자유요소/DB/편집기 후속. schemaVersion·element key만 미리 심어 DS-2/3 재작업 방지(과소도 방지).
- SignatureViewer DOM 결합(`> div:first-child`) 보존.

## 7. 팀 배치 (구현=CODEX LUNA)
desktop print: approvalRenderModel(sanitized) + templateSchema + approvalDefaultTemplate + LegacyApprovalDocContent(추출) + compileApprovalDocument + DocumentRenderer + ApprovalDocView 전환 + legacy===new vitest + fetch-state 테스트 + Playwright 픽셀 스위트.

---
연관 Issue: #845
