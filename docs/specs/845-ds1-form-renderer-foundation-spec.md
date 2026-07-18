# #845 DS-1 — 문서 양식 렌더러 Foundation (기획 spec **v4** · CODEX SOL 기획검수 4라운드 GO)

- 에픽: #845 문서 양식 디자이너 · 파일럿=결재 문서 · 브랜치 `feat/845-ds1-form-renderer-foundation`
- 기준일: 2026-07-18 · 진실원: 결재문서 렌더 정찰 + CODEX SOL 기획검수 R1(BLOCKING4·HIGH5·MED2)→R2(잔여3 blocker)→R3(BLOCKING1·HIGH2)→**R4 GO**(잔여 LOW만) 반영
- [[feedback_reconvergence_before_merge]] · [[feedback_design_system_playwright_mock_suite]] · [[feedback_print_design_iteration]]

## 0. 목표·비목표
- **목표**: 결재 문서 인쇄/미리보기 렌더를 코드→데이터(템플릿) 정의로 전환하는 뼈대. **출력 100% 무변경**이 최우선.
- **무변경 증명 논거(pixel 게이트 범위)**: DS-1은 **`global.css`·`PrintLayout` shell·`@page`·CSS를 일절 변경하지 않는다**(strangler=현 컴포넌트/CSS 재사용). 따라서 **DOM 바이트 동일(`new === frozen-golden`)이면 동일 CSS가 동일 픽셀·동일 pagination을 산출**함이 논리적으로 보장된다. 회귀 표면 = **DOM 뿐**. → 게이트 = ① `new === frozen-golden`(독립 오라클·DOM·핵심 게이트) + ② Playwright screen + `emulateMedia('print')` 스크린샷 **sanity 대조**(단일 페이지 시각 확인·CI Chromium만·신규 도구 0). **무거운 PDF-raster CI 도구(Poppler 등)는 DS-1 비도입**(CSS 무변경이라 pagination 회귀 불가·과설계). 만약 CSS/PrintLayout을 건드리게 되면 그때 범위 재논의.
- **비목표(후속)**: 편집기(DS-3)·자유 geometry(DS-3/4)·DB 저장/CRUD(DS-2)·전자서명 실연동·타 문서. DS-1=결재문서 1종·읽기 렌더만.

## 1. 개발책임자 결정
| # | 결정 |
|---|---|
| D-DS1-01 | **FE 전용**(BE/DB/마이그 없음·DS-2 분리) |
| D-DS1-02 | 스키마 = 밴드+빌트인요소. `schemaVersion`↔`revision` 분리·안정 band/element key. **영속 경계 = `TemplateEnvelope{schemaVersion,id?,status?,revision,docType,name, document:DocumentPayload}` + `parseDocumentTemplate(unknown)` + `upcastDocumentTemplate(unknown,fromVersion)`** 계약을 DS-1에 정의(DS-2가 재정의 안 하도록). composite 빌트인=DS-1 plugin·DS-3 generic 이관 upcaster 경로 |
| D-DS1-08 | **approval plugin 불변식(parser 검증·위반 시 `GROUPWARE_DEFAULT` fallback)**: 요소별 **허용 밴드 고정**(TITLE·META_ROWS·APPROVAL_GRID=HEADER / CONTENT_PARAGRAPHS·FIELD_TABLE·ATTACHMENT_TABLE=BODY / CLOSING=FOOTER) · **필수·개수**(TITLE **정확히 1**·APPROVAL_GRID 정확히 1·CLOSING 정확히 1·META_ROWS 최대 1·BODY 요소 각 최대 1) · 중복 key 거부 · 미지원 type/kind/version 거부. → compiled slot totality 보장(`closingNote:string` 등 항상 충족). band 의미 무시(TITLE을 FOOTER에 둬도 header slot 이동) 방지 |
| D-DS1-03 | **렌더러 = 2단계 compiler**: `compileApprovalDocument(template, model) → CompiledApprovalDocument`(=**실제 `PrintLayoutProps`와 정확히 동형**: **`paper:PaperSize`**, `docHeader:PrintDocHeader`, `approvalSteps:PrintApprovalStep[]`, `closingNote:string`, `body:ReactNode`). **`noticeText` slot 없음**(현 PrintLayout이 결재란 존재로 내부 결정·불변). `body`=`LegacyApprovalDocBody({orderedSections})`가 **외곽 `<div>`를 정확히 1회** 출력하고 내부 Content/Field/Attachment 섹션만 요소 순서대로 조립(3중 복제·wrapper 0). **`DocumentRenderer`는 shell 전용 `backTo?:string`을 별도 prop으로 받아 `PrintLayout`에 전달**(현 "상세로 돌아가기" 버튼 DOM 보존·sanitized model엔 approval ID 없음). JSX 명시: `<PrintLayout approvalDoc paper={compiled.paper} backTo={backTo} docHeader={compiled.docHeader} approvalSteps={compiled.approvalSteps} closingNote={compiled.closingNote}>{compiled.body}</PrintLayout>` |
| D-DS1-04 | 기본 템플릿 = FE 상수. docType resolver = `GROUPWARE_${resolvedTemplate.code}` → **template null/not-found/error 시 canonical `GROUPWARE_DEFAULT` 공통 레이아웃** fallback(결정적). 작성 `ApprovalTemplate`↔렌더 `DocumentTemplate` 명칭·ID·역할 분리 |
| D-DS1-05 | **회귀 = 독립 frozen 오라클**: (a) 리팩터 **전** 현 렌더 경로를 **verbatim 복사한 test-only `FrozenApprovalDocLegacy`**(raw DTO→기존 helper→기존 JSX·**불변·프로덕션 추출 컴포넌트/신규 model 미공유**) 유지. (b) 각 fixture로 `renderToStaticMarkup(FrozenLegacy(rawDto))`를 **committed HTML 골든 artifact**로 1회 생성. (c) 테스트: `renderToStaticMarkup(DocumentRenderer(defaultTemplate, buildModel(rawDto))) === 골든`. **골든 재생성=명시적 가드 스크립트만**(`vitest -u` 금지). new와 legacy가 **같은 컴포넌트/model을 공유하지 않아** 오라클 독립 |
| D-DS1-06 | **ApprovalRenderModel = UUID-stripped·projection slot 동형**(역파싱 0): `header:{title,docNo,issueDate(ISO 원문)}`(krDate는 PrintLayout이 적용·현 동일)·`approvalSteps:{label,name,decidedAt,signaturePngBase64}[]`·`body:{paragraphs:string[], fieldRows:{label,value}[], attachments:{typeLabel,title,detail}[]}`·`closing:{note}`. binding = 이 모델 slot의 **discriminated union**(§2②). 변환/정렬/포맷/필터 = 기존 헬퍼 |
| D-DS1-07 | 빌트인 요소 **truth-table**(§3)·**projection truth-table 분리**(min2 grid-col 등 CSS 사실은 projection에·model에 dummy step 삽입 금지) |

## 2. 스코프

### ① ApprovalRenderModel + Frozen Legacy (`print/approvalRenderModel.ts`·`print/__frozen__/FrozenApprovalDocLegacy.tsx` 신규)
- **공통 입력 번들 `FrozenApprovalDocInput { approval: ApprovalLineAdminResponse; templateFields: ApprovalTemplateField[]; attachments: ApprovalAttachment[]; backTo?: string }`** — frozen 오라클과 신규 경로가 **동일 fixture 번들**을 소비(오라클 신뢰성). (현 legacy 출력이 approval DTO 외에 template fields·정렬 전 attachments·route backTo를 요구하므로 rawDto 단일 아님.)
- `buildApprovalRenderModel(input): ApprovalRenderModel` — 기존 `approvalDoc.ts` 헬퍼 재사용해 D-DS1-06 slot-동형 모델 생성. **UUID/내부ID 부재 불변식**(생성 시 제거).
- `FrozenApprovalDocLegacy` = 현 `ApprovalDocView` 본문 + `PrintLayout` approvalDoc 조합의 **verbatim 스냅샷 복사**(입력=`FrozenApprovalDocInput`·fetch/router 없음). test/골든 생성 전용·**절대 편집 금지**(주석 명시). 이것이 독립 오라클.

### ② 스키마 타입 + 영속 경계 (`print/templateSchema.ts` 신규)
```
TemplateEnvelope { schemaVersion:1; id?:string; status?:'DRAFT'|'ACTIVE'; revision:number; docType:string; name:string; document:DocumentPayload }
DocumentPayload { paper:'A4_PORTRAIT'; bands:Band[] }
Band { key:string; kind:'HEADER'|'BODY'|'FOOTER'; elements:DocElement[] }
DocElement =                                  // discriminated union: type가 binding 결정(타입안전)
  | { key:string; type:'TITLE' }              // → header.title
  | { key:string; type:'META_ROWS' }          // → header.docNo/issueDate
  | { key:string; type:'APPROVAL_GRID' }      // → approvalSteps
  | { key:string; type:'CONTENT_PARAGRAPHS' } // → body.paragraphs
  | { key:string; type:'FIELD_TABLE' }        // → body.fieldRows
  | { key:string; type:'ATTACHMENT_TABLE' }   // → body.attachments
  | { key:string; type:'CLOSING' }            // → closing.note
parseDocumentTemplate(u:unknown): { ok:true; value:TemplateEnvelope } | { ok:false; error }  // 중복key·미지원 type/kind·unknown version 거부 + D-DS1-08 불변식(허용밴드·필수·개수) 검증, 실패 시 GROUPWARE_DEFAULT fallback
upcastDocumentTemplate(u:unknown, from:number): TemplateEnvelope  // 버전별 함수·지원범위 명시
paperToPrintLayout(p:'A4_PORTRAIT'):'a4-portrait'  // exhaustive·unknown throw
```
- band/element `key` = 문서 내 유일·안정(DS-2 저장·DS-3 patch 대비). singleton(TITLE/APPROVAL_GRID/CLOSING) 중복 = parse 오류.

### ③ 2단계 compiler + projection (`print/DocumentRenderer.tsx`·`print/LegacyApprovalDocBody.tsx` 신규)
- `compileApprovalDocument(template, model): CompiledApprovalDocument` — 밴드·요소 순회해 `PrintLayoutProps`-동형 slot 산출(§D-DS1-03). BODY 요소 순서 → `orderedSections`.
- `LegacyApprovalDocBody({orderedSections})` = 현 본문 3섹션(인라인 style 그대로)을 **순수 컴포넌트로 추출**·외곽 div 1회. (프로덕션 경로. Frozen legacy와 별개 파일.)
- `DocumentRenderer` = `<PrintLayout approvalDoc {...compiled.docHeader/approvalSteps/closingNote}>{compiled.body}</PrintLayout>`. PrintLayout·global.css 불변.

### ④ 기본 템플릿 상수 (`print/approvalDefaultTemplate.ts`)
HEADER(TITLE·META_ROWS·APPROVAL_GRID)·BODY(CONTENT_PARAGRAPHS·FIELD_TABLE·ATTACHMENT_TABLE)·FOOTER(CLOSING). docType resolver D-DS1-04. `GROUPWARE_DEFAULT` = 이 상수와 동일 레이아웃.

### ⑤ 전환 (`print/ApprovalDocView.tsx`)
- 3-fetch 유지 + **오류 의미 보존**(현: template 오류=빈 필드 계속·approval/attachment 오류=중단·id/not-found=orphan). → 상태 테스트(jsdom+MemoryRouter+**미완료 promise로 loading**·prefilled cache로 done).
- 변환→`buildApprovalRenderModel`→`<DocumentRenderer template={resolve(...)} model={...} />`.

### ⑥ 회귀 가드
- **new === frozen 골든**(D-DS1-05·vitest jsdom·독립 오라클·골든 immutable).
- **Playwright sanity**: screen + `emulateMedia('print')` 스크린샷 baseline(고정 viewport/폰트/device-scale·한글 폰트 로드 대기·애니메이션 off). ac-* 관례·CI Chromium만·신규 도구 0. **CSS/PrintLayout 무변경이라 DOM 동일 = 픽셀·pagination 동일**(§0 논거)이므로 이 스크린샷은 보조 sanity(무거운 PDF-raster 비도입).
- ApprovalDocView fetch-state 테스트. 기존 `approvalDoc.test.ts` 무회귀.

## 3. 빌트인 요소 truth-table (요소 = 데이터 slot 조립 / projection = DOM·CSS 사실)
| 요소 | 입력 | 정렬/필터/포맷 | 조건부 |
|---|---|---|---|
| TITLE | header.title | — | h1 |
| META_ROWS | docNo=approvalNo·issueDate=finalDecidedAt(APPROVED 최종·ISO) | krDate는 **projection**(PrintLayout) | 발행일 없으면 **행 생략** |
| APPROVAL_GRID | approvalSteps(작성자0 + steps) | 정렬·라벨(마지막 원소=결재·중간=합의) **slice(0,5) 전에 라벨 부여**(현 동작·F2 골든) | 일시 APPROVED만·서명 ''·빈배열=박스 미렌더 |
| CONTENT_PARAGRAPHS | body.paragraphs | content 개행 split·**trim·빈문단 제거** | 빈 섹션 생략 |
| FIELD_TABLE | body.fieldRows | displayOrder 정렬·빈값 제거·**NUMBER행만** krw(v)‖raw·orphan "추가 필드 N" | 빈 섹션 생략 |
| ATTACHMENT_TABLE | body.attachments | displayOrder 정렬·3종 분기·제목 fallback | 빈 섹션 생략 |
| CLOSING | closing.note(CLOSING_NOTE) | — | notice=**projection**(결재란 존재 시) |

**projection truth-table(DOM/CSS)**: grid col=`max(2,N)`(빈 cell padding 아님·dummy step 금지)·slice(0,5)는 라벨 부여 **후** 적용(5·6 step서 결재칸 잘림=**현 동작·무변경 대상**·UX 변경은 별도 결정)·notice/divider 조건.

## 4. fixture 매트릭스 (분기 커버리지)
F1 단일 step(min2 grid·[작성,결재]) · F2 **raw 0/4/5/6 step**(slice(0,5)·5·6서 결재칸 잘림=골든) · F3 unsorted · F4 APPROVED/PENDING/REJECTED 혼합 · F5 null 이름 · F6 NUMBER 유효/무효+numeric TEXT(krw NUMBER행만) · F7 orphan 필드 · F8 template null/not-found/error(+ **불변식 위반 템플릿 → GROUPWARE_DEFAULT fallback**) · F9 첨부 3종·역순·제목fallback · F10 세 섹션 전부 빈 · F11 빈 발행일 · F12 UUID 부재 단언 · **F13 긴 content(다중 페이지·DOM 구조 new===골든)** · F14 whitespace-only/CRLF content trim.
→ 각 fixture **new===골든**(핵심 게이트) + (F1·F10·F13 등 대표) **Playwright screen+print sanity**.

## 5. 기존 결정 교차검증
회사정보 배제 유지 · UUID 비노출(sanitized model+discriminated binding으로 스키마 강제) · slice(0,5) 명시 · PrintPreview 미접촉.

## 6. 리스크
출력 드리프트 → 독립 frozen 오라클 + new===골든(DOM) + Playwright screen/print sanity(§0 논거: CSS/PrintLayout 무변경). 과설계 경계=flow·빌트인·FE상수만(geometry/DB/편집기 후속). schemaVersion·key·envelope·parser만 미리 심어 DS-2/3 재정의 방지.

## 7. 팀 배치 (구현=CODEX LUNA)
desktop print: approvalRenderModel + FrozenApprovalDocInput 번들 + FrozenApprovalDocLegacy(verbatim·불변) + templateSchema(+parse[불변식 검증]/upcast/paperMap) + approvalDefaultTemplate(+GROUPWARE_DEFAULT) + LegacyApprovalDocBody(추출) + compileApprovalDocument(paper 포함) + DocumentRenderer(backTo prop) + ApprovalDocView 전환 + new===골든 vitest + fetch-state 테스트 + Playwright screen+print sanity 스위트.

---
연관 Issue: #845
