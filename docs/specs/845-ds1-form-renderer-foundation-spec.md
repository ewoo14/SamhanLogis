# #845 DS-1 — 문서 양식 렌더러 Foundation (기획 spec **v3** · CODEX SOL 기획검수 2라운드 전량 반영)

- 에픽: #845 문서 양식 디자이너 · 파일럿=결재 문서 · 브랜치 `feat/845-ds1-form-renderer-foundation`
- 기준일: 2026-07-18 · 진실원: 결재문서 렌더 정찰 + CODEX SOL 기획검수 R1(BLOCKING4·HIGH5·MED2)·R2(잔여 3 blocker + 신규) 반영
- [[feedback_reconvergence_before_merge]] · [[feedback_design_system_playwright_mock_suite]] · [[feedback_print_design_iteration]]

## 0. 목표·비목표
- **목표**: 결재 문서 인쇄/미리보기 렌더를 코드→데이터(템플릿) 정의로 전환하는 뼈대. **출력 100% 무변경**이 최우선. 무변경 증명 = ① `new === frozen-golden`(독립 오라클·DOM) ② Playwright screen+print+**PDF raster** 픽셀 0-diff.
- **비목표(후속)**: 편집기(DS-3)·자유 geometry(DS-3/4)·DB 저장/CRUD(DS-2)·전자서명 실연동·타 문서. DS-1=결재문서 1종·읽기 렌더만.

## 1. 개발책임자 결정
| # | 결정 |
|---|---|
| D-DS1-01 | **FE 전용**(BE/DB/마이그 없음·DS-2 분리) |
| D-DS1-02 | 스키마 = 밴드+빌트인요소. `schemaVersion`↔`revision` 분리·안정 band/element key. **영속 경계 = `TemplateEnvelope{schemaVersion,id?,status?,revision,docType,name, document:DocumentPayload}` + `parseDocumentTemplate(unknown)`(band/type/binding/중복key/미지원version 검증·실패 fallback) + `upcastDocumentTemplate(unknown,fromVersion)`** 계약을 DS-1에 정의(DS-2가 재정의 안 하도록). composite 빌트인=DS-1 plugin·DS-3 generic 이관 upcaster 경로 |
| D-DS1-03 | **렌더러 = 2단계 compiler**: `compileApprovalDocument(template, model) → CompiledApprovalDocument`(=**실제 `PrintLayoutProps`와 정확히 동형**: `docHeader:PrintDocHeader`, `approvalSteps:PrintApprovalStep[]`, `closingNote:string`, `body:ReactNode`). **`noticeText` slot 없음**(현 PrintLayout이 결재란 존재로 내부 결정·불변). `body`=`LegacyApprovalDocBody({orderedSections})`가 **외곽 `<div>`를 정확히 1회** 출력하고 내부 Content/Field/Attachment 섹션만 요소 순서대로 조립(3중 복제·wrapper 0) |
| D-DS1-04 | 기본 템플릿 = FE 상수. docType resolver = `GROUPWARE_${resolvedTemplate.code}` → **template null/not-found/error 시 canonical `GROUPWARE_DEFAULT` 공통 레이아웃** fallback(결정적). 작성 `ApprovalTemplate`↔렌더 `DocumentTemplate` 명칭·ID·역할 분리 |
| D-DS1-05 | **회귀 = 독립 frozen 오라클**: (a) 리팩터 **전** 현 렌더 경로를 **verbatim 복사한 test-only `FrozenApprovalDocLegacy`**(raw DTO→기존 helper→기존 JSX·**불변·프로덕션 추출 컴포넌트/신규 model 미공유**) 유지. (b) 각 fixture로 `renderToStaticMarkup(FrozenLegacy(rawDto))`를 **committed HTML 골든 artifact**로 1회 생성. (c) 테스트: `renderToStaticMarkup(DocumentRenderer(defaultTemplate, buildModel(rawDto))) === 골든`. **골든 재생성=명시적 가드 스크립트만**(`vitest -u` 금지). new와 legacy가 **같은 컴포넌트/model을 공유하지 않아** 오라클 독립 |
| D-DS1-06 | **ApprovalRenderModel = UUID-stripped·projection slot 동형**(역파싱 0): `header:{title,docNo,issueDate(ISO 원문)}`(krDate는 PrintLayout이 적용·현 동일)·`approvalSteps:{label,name,decidedAt,signaturePngBase64}[]`·`body:{paragraphs:string[], fieldRows:{label,value}[], attachments:{typeLabel,title,detail}[]}`·`closing:{note}`. binding = 이 모델 slot의 **discriminated union**(§2②). 변환/정렬/포맷/필터 = 기존 헬퍼 |
| D-DS1-07 | 빌트인 요소 **truth-table**(§3)·**projection truth-table 분리**(min2 grid-col 등 CSS 사실은 projection에·model에 dummy step 삽입 금지) |

## 2. 스코프

### ① ApprovalRenderModel + Frozen Legacy (`print/approvalRenderModel.ts`·`print/__frozen__/FrozenApprovalDocLegacy.tsx` 신규)
- `buildApprovalRenderModel(rawDto): ApprovalRenderModel` — 기존 `approvalDoc.ts` 헬퍼 재사용해 D-DS1-06 slot-동형 모델 생성. **UUID/내부ID 부재 불변식**(생성 시 제거).
- `FrozenApprovalDocLegacy` = 현 `ApprovalDocView` 본문 + `PrintLayout` approvalDoc 조합의 **verbatim 스냅샷 복사**(raw DTO 입력·fetch/router 없음). test/골든 생성 전용·**절대 편집 금지**(주석 명시). 이것이 독립 오라클.

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
parseDocumentTemplate(u:unknown): { ok:true; value:TemplateEnvelope } | { ok:false; error }  // 중복key·미지원 type/kind·unknown version 거부, 실패 시 GROUPWARE_DEFAULT fallback
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
- **Playwright**: screen + `emulateMedia('print')` baseline + **긴 content는 PDF 생성→raster 0-diff**(@page·page-break·다중 페이지 실인쇄 검증). 고정 viewport/폰트/scale. ac-* 관례·CI hard gate.
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
F1 단일 step(min2 grid·[작성,결재]) · F2 **raw 0/4/5/6 step**(slice(0,5)·5·6서 결재칸 잘림=골든) · F3 unsorted · F4 APPROVED/PENDING/REJECTED 혼합 · F5 null 이름 · F6 NUMBER 유효/무효+numeric TEXT(krw NUMBER행만) · F7 orphan 필드 · F8 template null/not-found/error · F9 첨부 3종·역순·제목fallback · F10 세 섹션 전부 빈 · F11 빈 발행일 · F12 UUID 부재 단언 · **F13 긴 content(다중 페이지·PDF raster)** · F14 whitespace-only/CRLF content trim.
→ 각 fixture new===골든 + (F1·F10·F13 등 핵심) Playwright 픽셀/PDF.

## 5. 기존 결정 교차검증
회사정보 배제 유지 · UUID 비노출(sanitized model+discriminated binding으로 스키마 강제) · slice(0,5) 명시 · PrintPreview 미접촉.

## 6. 리스크
출력 드리프트 → 독립 frozen 오라클 + new===골든 + Playwright/PDF 3중. 과설계 경계=flow·빌트인·FE상수만(geometry/DB/편집기 후속). schemaVersion·key·envelope·parser만 미리 심어 DS-2/3 재정의 방지.

## 7. 팀 배치 (구현=CODEX LUNA)
desktop print: approvalRenderModel + FrozenApprovalDocLegacy(verbatim·불변) + templateSchema(+parse/upcast/paperMap) + approvalDefaultTemplate + LegacyApprovalDocBody(추출) + compileApprovalDocument + DocumentRenderer + ApprovalDocView 전환 + new===골든 vitest + fetch-state 테스트 + Playwright/PDF 픽셀 스위트.

---
연관 Issue: #845
