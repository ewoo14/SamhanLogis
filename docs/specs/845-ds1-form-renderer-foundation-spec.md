# #845 DS-1 — 문서 양식 렌더러 Foundation (기획 spec · OPUS 4.8)

- 에픽: #845 문서 양식 디자이너 · 파일럿=결재 문서 · 브랜치 `feat/845-ds1-form-renderer-foundation`
- 기준일: 2026-07-18 · 진실원: 결재문서 렌더 경로 정찰(2026-07-18) + 에픽 설계서 `docs/specs/document-form-designer-epic-design.md`
- [[feedback_reconvergence_before_merge]] · [[feedback_design_system_playwright_mock_suite]] · [[feedback_print_design_iteration]]

## 0. 목표·비목표
- **목표**: 결재 문서 인쇄/미리보기 렌더를 **코드 정의 → 데이터(템플릿) 정의**로 전환하는 엔진의 뼈대. **출력 100% 무변경**(픽셀/DOM 동일)이 최우선 수용 기준.
- **비목표(후속)**: 편집기(DS-3)·자유 geometry 배치(DS-3/4)·DB 템플릿 저장/CRUD(DS-2)·전자서명 실연동·타 문서 확장. **DS-1은 결재 문서 1종·읽기 렌더만**.

## 1. 개발책임자 결정 (에픽 설계서 + DS-1 판단)
| # | 결정 |
|---|---|
| D-DS1-01 | **DS-1 = FE 전용**(BE/DB/마이그레이션 없음). 템플릿 DB 저장·CRUD·버전은 **DS-2**. DS-1은 스키마 타입 + **FE 기본 템플릿 상수** + 렌더러 + 전환 + 회귀 가드. → blast radius 최소·무결성 도메인 미접촉 |
| D-DS1-02 | **스키마 = 밴드+빌트인 요소(flow 레이아웃·geometry 없음)**. 에픽 vocabulary(Band/Element) 채택하되 DS-1은 x/y 자유배치 미지원(현 흐름 재현). DS-3에서 geometry·요소종류 확장(전방 호환) |
| D-DS1-03 | **렌더러 = desktop-로컬 · strangler/adapter**. 템플릿의 밴드·빌트인 요소 목록을 해석해 **현 결재문서 섹션 컴포넌트를 재사용**해 그림 → **DOM 동일 보장**. 범용 geometry 렌더는 DS-3+. design-system 일반화도 후속 |
| D-DS1-04 | **기본 템플릿 = FE 상수**(`GROUPWARE_APPROVAL` 1:1 디스크립터). 렌더러가 이 상수를 읽어 현 레이아웃 재현 |
| D-DS1-05 | **회귀 가드 = 골든 마스터 DOM 스냅샷**. 전환 **전** `renderToStaticMarkup` 스냅샷 확보 → 전환 **후** 렌더러 출력과 **동일** 단언. + 라이브QA 인쇄 미리보기 시각 대조 |

## 2. 스코프

### ① 스키마 타입 (`clients/desktop/src/renderer/print/templateSchema.ts` 신규)
```
DocumentTemplate { docType: string; name: string; version: number; paper: 'A4_PORTRAIT'; bands: Band[] }
Band { kind: 'HEADER'|'BODY'|'FOOTER'; elements: DocElement[] }
DocElement =                          // DS-1: 빌트인 종류만·geometry 없음(flow)
  | { type:'TITLE'; binding:string }                                   // approval.title → h1
  | { type:'META_ROWS'; rows:{label:string; binding:string; format?:'krDate'}[] }  // 문서번호/발행일
  | { type:'APPROVAL_GRID'; binding:string; maxCells:number }          // steps → 결재란(2~5)
  | { type:'CONTENT_PARAGRAPHS'; binding:string }                      // content → 문단
  | { type:'FIELD_TABLE'; binding:string; labelColMm:number; numberFormat?:'krw' } // fieldValues+template.fields
  | { type:'ATTACHMENT_TABLE'; binding:string }                        // attachments
  | { type:'CLOSING'; noteBinding?:string; noteConstant?:string; noticeConstant:string }
```
- **전방 호환**: DS-3에서 `DocElement`에 `geometry?{x,y,w,h}`·자유 요소(TEXT/IMAGE/LINE) 추가. DS-1은 geometry 미사용(flow).
- 바인딩 키는 렌더 데이터(`ApprovalDocData`: approval + attachments + template.fields)의 경로.

### ② 기본 템플릿 상수 (`.../print/approvalDefaultTemplate.ts` 신규)
현 결재문서 레이아웃의 1:1 디스크립터:
- HEADER 밴드: TITLE(title) + META_ROWS(문서번호=approvalNo·발행일=finalDecidedAt/krDate) + APPROVAL_GRID(steps·maxCells 5)
- BODY 밴드: CONTENT_PARAGRAPHS(content) + FIELD_TABLE(fieldValues·labelColMm 32·krw) + ATTACHMENT_TABLE(attachments)
- FOOTER 밴드: CLOSING(noteConstant=현 CLOSING_NOTE·noticeConstant=현 안내문구)
- 순서·설정은 현 `approvalDoc.ts`/`ApprovalDocView` 출력과 동일.

### ③ 렌더러 (`.../print/DocumentRenderer.tsx` 신규)
- `<DocumentRenderer template data />` — 밴드·요소를 순회하며 **type별 현 섹션 컴포넌트로 위임**:
  - HEADER/APPROVAL_GRID/CLOSING → `PrintLayout`(approvalDoc)의 헤더/결재란/맺음 골격(현 구조 그대로).
  - CONTENT/FIELD_TABLE/ATTACHMENT_TABLE → 현 `ApprovalDocView` 본문 3섹션을 **함수 추출**해 재사용(인라인 style·mm·색 그대로).
- 요소 렌더 = 현 순수 헬퍼(`approvalDoc.ts`: buildDocHeader/buildApprovalSteps/contentParagraphs/fieldRows/attachment*) 재사용. **새 포맷 로직 금지**(krw/krDate/formatApprovalDecidedAt 그대로).

### ④ 전환 (`.../print/ApprovalDocView.tsx` 리팩터)
- 3-fetch(approval/attachments/template)는 유지. 변환 결과를 `<DocumentRenderer template={approvalDefaultTemplate} data={...} />`로 렌더.
- `PrintLayout` shell(paper·no-print 액션바·window.print)·global.css `.print-approval-*`는 **불변**(DOM/CSS 동일).

### ⑤ 회귀 가드
- **골든 마스터 스냅샷 테스트**(신규 `ApprovalDocView.snapshot.test.tsx`): 전환 전 현 렌더의 `renderToStaticMarkup` HTML을 골든으로 커밋 → 전환 후 렌더러 출력이 **바이트 동일** 단언. 다중 픽스처(단일 step·5 step·필드 유/무·첨부 3종·긴 content·빈 발행일).
- 기존 `approvalDoc.test.ts`(순수 헬퍼) 무회귀.
- 라이브QA: 인쇄 미리보기(`/groupware/approvals/:id/print`) 전환 전후 **시각 스샷 대조**(실서버·실 결재 문서).

## 3. 기존 결정 교차검증
- 회사정보 훅 결재 헤더 배제(2026-06-14) 유지 — 기본 템플릿에 회사블록 없음.
- 결재란 slice(0,5) 상한 = APPROVAL_GRID.maxCells=5로 스키마 명시(조용한 컷 → 명시적 상한).
- UUID 비노출: 결재란/필드에 UUID 미표시(현 approverName·label만) 유지.
- design-system PrintPreview(미사용·고아)는 DS-1서 손대지 않음(후속 일반화 시 검토).

## 4. 검증 매트릭스
- desktop: typecheck·vitest(스키마/렌더러/골든 스냅샷·approvalDoc.test 무회귀). **골든 스냅샷 = 전환 전후 바이트 동일**이 핵심 게이트.
- 라이브QA: 실서버 결재 문서 인쇄 미리보기 전후 시각 동일(스샷 다수).
- 픽스처: 단일/다중 step·필드 유무·첨부 유무·빈 발행일·긴 content.

## 5. 리스크
- **최대 리스크 = 출력 드리프트**(인라인 하드코딩 레이아웃을 렌더러 경유로 재현 시 1px/1속성이라도 다르면 회귀). → strangler(현 컴포넌트 재사용·새 렌더 로직 0)로 근본 차단 + 골든 마스터 바이트 동일 가드.
- SignatureViewer DOM 결합(global.css `.print-approval-signature-viewer > div:first-child`) — 결재란 재사용 시 구조 보존.
- 스키마 과설계 경계: DS-1은 flow·빌트인 요소만(geometry·자유요소·DB는 후속). 스코프 크리프 금지.

## 6. 팀 배치 (구현=CODEX LUNA)
- desktop print: templateSchema 타입 + approvalDefaultTemplate 상수 + DocumentRenderer(현 섹션 추출·재사용) + ApprovalDocView 전환 + 골든 마스터 스냅샷 테스트.

---
연관 Issue: #845
