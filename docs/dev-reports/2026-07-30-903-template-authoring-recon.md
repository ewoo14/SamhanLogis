# PR #998 / #903 문서 양식 저작 방식 정찰 보고서

- 정찰일: 2026-07-30
- 작업 디렉터리: `D:\dev\Samhan-Public\.claude\worktrees\w998-template`
- 관점: 문서 양식(출력물 양식)의 저작·저장·렌더링 경로와 워드 방식/엑셀 방식 선택 접점
- 작업 종류: 읽기 전용 정찰

이번 정찰에서는 구현, 라이브러리 설치, `npm install`, Docker, Gradle, 테스트 실행을 하지 않았다. 소스·마이그레이션·기존 개발 리포트·기존 결정 문서와 외부 라이브러리의 공식 저장소/패키지 메타데이터만 확인했다.

## 0. 결론

현재 저장소에는 문서 양식 저작 경로가 **부분적으로 이미 존재한다**.

1. **실제 저장형 편집기**는 그룹웨어 결재 문서 양식에 한정해 존재한다.
   - 관리자 목록: `/groupware/document-templates`
   - 신규/수정 편집기: `/groupware/document-templates/new/edit`, `/groupware/document-templates/:id/edit`
   - DB: groupware-service의 `document_templates.document` JSONB
   - 승인 시점의 출력 재현: `document_template_revisions` JSONB + `approval_lines`의 template/revision pin
2. **견적서와 판매전표의 현재 출력 양식**은 해당 템플릿 DB를 읽지 않는다.
   - 견적서: `QuoteView.tsx`의 JSX/HTML table/CSS가 직접 양식을 구성한다.
   - 판매전표: `/sales/:id/print/dispatch`가 `DispatchView` → `DispatchDocument`를 직접 구성한다.
   - 따라서 이 두 출력물에 대해 사용자가 편집하는 양식 화면과 양식 정의 저장 경로는 현재 확인한 실제 경로에 없다. 전체 저장소의 모든 잠재적·미연결 실험 코드는 이 정찰만으로는 **판정불가**다.
3. 현재의 “워드 방식”에 가장 가까운 것은 `DocumentPayload.bands[].elements[]`와 요소별 `%` geometry다. 다만 완전한 워드 문서 모델이 아니라, 절대 배치 요소와 일반 흐름/반복 표를 섞은 **하이브리드 모델**이다.
4. 현재의 “엑셀 방식”은 양식 저작 모드로는 구현되어 있지 않다. `DETAIL`과 각 출력물의 `<table>`은 표 렌더링일 뿐 셀 격자·병합·행고·열폭·인쇄영역을 저장하는 workbook 모델이 아니다. Excel 관련 기존 코드는 목록 다운로드/업로드와 백엔드 export/parse다.
5. 워드/엑셀 선택 스위치를 붙일 가장 안전한 접점은 `PrintLayout`의 paper 토글이 아니라 다음 세 곳이다.
   - 저장 계약: `TemplateEnvelope`/`DocumentPayload`와 FE/BE request
   - 저작 진입점: `DocumentTemplateEditorPage` 및 신규 양식 생성
   - 출력 dispatch: `DocumentRenderer`의 compile 단계

`PrintLayout.showFormatToggle`은 워드/엑셀이 아니라 A4와 88mm 출력 폭을 뜻하므로 이 스위치에 저작 방식을 얹으면 의미가 충돌한다.

## 1. 실제 저작·저장·렌더링 경로

### 1.1 양식 정의 저장 위치

#### A. 그룹웨어 결재 문서: DB JSONB가 권위 있는 저장소

| 확인 대상 | 실제 근거 | 판정 |
|---|---|---|
| 양식 테이블 | `services/groupware-service/src/main/resources/db/migration/V10__add_document_templates.sql:2-25`에서 `document_templates`를 만들고 `doc_type`, `name`, `revision`, `status`, `schema_version`, `document JSONB` 및 ACTIVE unique index를 정의한다. | 양식 정의가 DB에 저장된다. |
| JSON 모델 | `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentPayload.java:7-32`는 `paper`, `bands`, 요소의 `geometry`, `binding`, `text`, `repeatBinding`, `columns`, `src`, `alt`를 모델링한다. | 현재 저장 포맷은 문서형 envelope + band/element JSON이다. |
| JPA 매핑 | `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentTemplate.java:30-73`에서 `@Table(name = "document_templates")`와 `@Column(name = "document", columnDefinition = "jsonb")`를 확인했다. | 서버도 같은 JSONB를 aggregate의 `document`로 취급한다. |
| 상태/수정 | `DocumentTemplate.java:92-115`는 신규 DRAFT와 DRAFT만 수정 가능한 revision 증가를 구현하고, `:120-145`는 ACTIVE/DRAFT 전환과 soft delete를 구현한다. | 단순 파일 저장이 아니라 lifecycle이 있는 양식 aggregate다. |
| FE 저장 계약 | `clients/desktop/src/renderer/api/documentTemplate.ts:28-33`의 `DocumentTemplateInput`은 `docType`, `name`, `schemaVersion`, `document`만 보낸다. `:104-122`에서 POST/PUT으로 저장한다. | 현재 API 계약에는 저작 방식 필드가 없다. |
| 런타임 parser | `clients/desktop/src/renderer/print/templateSchema.ts:10-17`은 schema v1/v2와 DRAFT/ACTIVE를 정의하고, `:161-180`은 `DocumentPayload`와 `TemplateEnvelope`를 정의한다. | 현재 envelope에도 `authoringMode`/`layoutMode`가 없다. |
| 기본 양식 | `clients/desktop/src/renderer/print/approvalDefaultTemplate.ts:32-65`에 `GROUPWARE_DEFAULT`가 코드로 하드코딩되어 있다. `:73-92`는 잘못된/없는 응답을 이 기본값으로 수렴시킨다. | DB ACTIVE가 없을 때의 코드 기본 양식이 별도로 존재한다. |
| 크기 제한/검증 | `templateSchema.ts:216-226`, `:611-664`에서 요청 크기, band/element 수, JSON parser 제한을 검증한다. 서버 대응은 `DocumentPayloadValidator.java:84-120`이다. | 새 엑셀 workbook JSON을 넣을 경우에도 기존 JSON 제한과 validator를 함께 설계해야 한다. |

#### B. 승인 당시 출력 재현: append-only revision JSONB

- `services/groupware-service/src/main/resources/db/migration/V12__pin_document_template_revisions.sql:10-28`은 `document_template_revisions`에 `template_id`, `revision`, `schema_version`, `document JSONB`를 저장하고 `(template_id, revision)`을 unique로 만든다.
- 같은 파일 `:45-62`는 `approval_lines.document_template_id`와 `document_template_revision`을 추가하고 복합 FK로 revision을 pin한다.
- 같은 파일 `:64-75`는 revision의 UPDATE/DELETE를 거부하는 append-only trigger를 만든다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/DocumentTemplateRevisionService.java:22-31`, `:45-71`은 현재 revision을 append하고 승인 당시 revision을 조회하는 서버 경로다.
- FE는 `clients/desktop/src/renderer/api/documentTemplate.ts:61-85`에서 `/groupware/document-templates/{templateId}/revisions/{revision}`을 조회한다.

따라서 “저장”과 “승인 문서의 재인쇄용 고정”은 이미 분리되어 있다. 워드/엑셀 mode를 양식 정의에 추가한다면 현재의 revision pin은 재사용할 수 있지만, mode가 revision에 함께 들어가야 승인 당시 같은 renderer를 선택할 수 있다.

#### C. 견적서: 데이터 snapshot은 있으나 출력 레이아웃 저장소로 확인되지 않음

- `services/slip-service/src/main/resources/db/migration/V36__create_quote_snapshot.sql:11-18`은 legacy 종합견적서 UI 작업상태 전체를 base64 JSON blob으로 보존한다고 설명한다.
- 같은 파일 `:27-55`의 `quote_snapshots.snapshot_data`와 `preview_image`는 UI 작업상태와 미리보기 이미지다. 레이아웃 template 또는 editor schema로 정의된 컬럼은 아니다.
- 실제 인쇄 라우트는 `clients/desktop/src/renderer/routes/index.tsx:534-536`의 `/sales/estimates/:estimateNumber/print` → `QuoteView`다.
- `clients/desktop/src/renderer/print/QuoteView.tsx:69-72`에서 `PrintLayout` 안에 `quote-page`를 직접 렌더링하고, `:75-102`, `:162-221`에서 공급자/메타/라인 table을 JSX로 직접 만든다.

판정: `quote_snapshots`는 **견적 데이터/작업상태 저장**으로 확인되며, 현재 `QuoteView` 인쇄 레이아웃을 사용자가 편집할 수 있는 정의 저장소로는 연결되어 있지 않다. 데이터 snapshot과 양식 정의를 혼동하면 안 된다.

#### D. 판매전표: 현재 라우트는 코드 기반 양식

- 현재 실제 route는 `clients/desktop/src/renderer/routes/index.tsx:83`, `:556`의 `/sales/:id/print/dispatch` → `DispatchView`다.
- `clients/desktop/src/renderer/print/DispatchView.tsx:38-54`에서 전표/창고/결재 구조를 조회하고, `:81-98`에서 자체 no-print toolbar와 `window.print()`를 실행한다.
- `clients/desktop/src/renderer/print/DispatchDocument.tsx:85-114`는 `dispatch-page`와 `dispatch-table`을 직접 렌더링하고, `:115-141`은 전표 line을 table row로 만든다.

현재 `clients/desktop/src/renderer/print/` 파일 목록에는 `OutboundView.tsx`가 없고, route도 `OutboundView`가 아니라 `DispatchView`를 가리킨다. 과거 문서에서 `OutboundView`를 기준 양식으로 부르는 것은 확인되지만, 이 worktree의 현재 연결된 출력 경로는 `DispatchView`다. 이 차이는 기존 결정 교차검증 절에서 별도로 다룬다.

### 1.2 사용자가 양식을 편집하는 화면

#### 존재하는 화면: 그룹웨어 문서 양식 편집기

- route 등록은 `clients/desktop/src/renderer/routes/index.tsx:392-405`에 있다.
  - `/groupware/document-templates` → `GroupwareDocumentTemplateAdminPage`
  - `/groupware/document-templates/:id/edit` → `DocumentTemplateEditorPage`
- 신규 생성 진입은 `clients/desktop/src/renderer/routes/GroupwareDocumentTemplateAdminPage.tsx:65-67`의 `/groupware/document-templates/new/edit`다.
- 목록에서 양식명을 누르면 `GroupwareDocumentTemplateAdminPage.tsx:79-92`에서 수정 route와 ACTIVE/DRAFT lifecycle 조작으로 이어진다.
- 편집기 입력/저장 모델은 `clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx:98-105`, 저장 mutation은 `:138-153`이다.
- 편집 화면은 `DocumentTemplateEditorPage.tsx:288-320`의 3-pane 구조다.
  - 왼쪽: `ElementPalette`
  - 가운데: `BandCanvas`
  - 오른쪽: `ElementInspector`
  - 가운데 오른쪽: 실제 `DocumentRenderer` 미리보기
- 팔레트 요소는 `clients/desktop/src/renderer/components/documentTemplate/ElementPalette.tsx:6-12`의 `TEXT`, `FIELD`, `DETAIL`, `IMAGE` 및 legacy 요소들이다.
- geometry inspector는 `clients/desktop/src/renderer/components/documentTemplate/ElementInspector.tsx:95-99`, `:312-360`에서 요소별 위치/크기와 스타일을 0~100 범위로 수정한다.
- 초깃값의 `DETAIL`은 `clients/desktop/src/renderer/components/documentTemplate/useTemplateDraft.ts:157-164`에서 `body.lineItems`, column 배열, `{ x: 0, y: 0, w: 100, h: 40 }`로 생성된다.
- ACTIVE 잠금과 저장 조건은 `DocumentTemplateEditorPage.tsx:169-224`, `:325-335`에 있다. 즉, 화면만 있는 mock이 아니라 DRAFT 저장/ACTIVE lifecycle과 연결된 편집 화면이다.

#### 부재한 화면: 견적서/판매전표 양식 저작

현행 연결 경로에서 확인한 견적서와 판매전표는 각각 `QuoteView`와 `DispatchView`가 데이터를 조회한 뒤 JSX로 출력한다. 이 두 route에서 `findActiveDocumentTemplate`, `DocumentTemplateEditorPage`, `document-templates` API를 호출하는 경로는 확인되지 않았다.

따라서 다음은 현재 기준 **부재**로 판정한다.

- 견적서 출력 JSX를 사용자가 편집하는 route
- 판매전표 출력 JSX를 사용자가 편집하는 route
- 견적서/판매전표 레이아웃을 `document_templates`로 저장하는 adapter
- Excel 파일을 가져와 양식으로 편집하는 FE 화면

다만 저장소 전체에 연결되지 않은 실험/폐기 예정 코드를 모두 제거했다는 의미의 전역 부재 판정은 하지 않는다. 연결된 실제 route와 그 호출 경로 기준의 판정이다.

### 1.3 인쇄/미리보기 렌더링 경로

#### 저장형 그룹웨어 양식

```text
/groupware/approvals/:id/print
  → ApprovalDocView
  → active template 또는 pinned revision 조회
  → resolveDocumentTemplate (없거나 malformed면 GROUPWARE_DEFAULT)
  → DocumentRenderer
  → PrintLayout
  → window.print() / @media print
```

파일 근거:

- route: `clients/desktop/src/renderer/routes/index.tsx:376-381`
- active/pinned template 조회: `clients/desktop/src/renderer/print/ApprovalDocView.tsx:147-173`
- fallback/결정: `ApprovalDocView.tsx:184-230`
- 실제 renderer 연결: `ApprovalDocView.tsx:258-264`, `:302-306`
- compile: `clients/desktop/src/renderer/print/DocumentRenderer.tsx:602-675`
- `PrintLayout` 연결: `DocumentRenderer.tsx:676-720`
- paper 변환: `clients/desktop/src/renderer/print/templateSchema.ts:695-702`

`DocumentRenderer`의 현재 의미는 다음과 같다.

- `DocumentRenderer.tsx:99-114`, `:168-178`의 `geometryStyle`은 FIELD/TEXT/IMAGE를 `position: absolute`와 `%` 좌표로 렌더링한다.
- `DocumentRenderer.tsx:118-157`은 반복 DETAIL을 absolute로 두지 않고 flow/margin 기반으로 처리해야 한다고 명시한다.
- `DocumentRenderer.tsx:205-237`의 `renderDetailElement`는 `model.body.lineItems`를 HTML table row로 출력한다.
- `DocumentRenderer.tsx:602-675`는 band/element 순서를 `PrintLayout`의 header/body/footer props와 children으로 compile한다.

즉 현재 저장형 renderer는 이미 “양식 JSON → 출력 DOM” compiler다. 이 compiler가 워드/엑셀 renderer를 선택할 가장 유력한 내부 접점이다.

#### 기존 코드 기반 출력물

| 출력물 | 실제 route/entry | 렌더 방식 |
|---|---|---|
| 견적서 | `routes/index.tsx:534-536` → `QuoteView` | `QuoteView.tsx:69-251`의 JSX/HTML table + `PrintLayout paper="a4-portrait"` |
| 판매전표/출고 작업지시서 | `routes/index.tsx:553-556` → `DispatchView` | `DispatchView.tsx:81-98`의 `window.print()` + `DispatchDocument.tsx:85-220` |
| 거래명세서/세금계산서 | `routes/index.tsx:553-555` | 별도 print page가 공통 shell 또는 자체 DOM을 구성. 기존 범위는 `docs/dev-reports/slip-output-format-slice.md`에 기록되어 있다. |
| 매입 전표 | `routes/index.tsx:581` → `PurchaseSlipPrintPage` | 기존 `PrintLayout` 계열 FE 출력 경로. 상세 구조/QA는 `docs/dev-reports/sp-08-5-5-purchase-print-form.md`에 기록되어 있다. |
| 결재문서 | `routes/index.tsx:376-381` → `ApprovalDocView` | 저장형 `DocumentRenderer` → `PrintLayout` |

공통 shell인 `clients/desktop/src/renderer/print/PrintLayout.tsx:25-31`은 A4 portrait/landscape와 `receipt-88mm` paper class를 정의한다. `:48-62`의 `showFormatToggle`은 A4↔88mm 전환용 prop이다. 실제 인쇄 버튼은 `PrintLayout.tsx:124-140`의 no-print toolbar에서 `window.print()`를 호출한다.

중요하게도 `PrintLayout`의 주석과 props는 본문을 children에게 위임한다고 명시한다. 따라서 `PrintLayout`은 저작 engine이 아니라 출력 shell이다. 견적서의 본문 JSX, 저장형 결재문서의 `DocumentRenderer`, 판매전표의 `DispatchDocument`가 서로 다른 본문 경로다.

#### 별도 headless 출력 경로

- `clients/desktop/vite.print-renderer.config.ts:5-14`, `:24-29`는 Electron renderer와 분리된 `file://`/`dist/print-renderer` build를 정의한다.
- `clients/desktop/print-renderer/PrintRendererApp.tsx:4-8`, `:50-59`는 interactive `DispatchView`와 같은 `DispatchDocument`를 headless 사본에 사용한다.

이 경로는 양식 저작 UI가 아니라 서버 Playwright가 읽는 정적 출력 번들이다. 나중에 Excel/Word renderer를 추가하면 interactive preview와 headless output이 같은 renderer를 공유하는지 별도 확인해야 한다.

## 2. 워드 방식과 엑셀 방식이 갈라지는 코드 지점

### 2.1 현재 워드 방식에 가까운 코드

현재 저장형 템플릿은 문서 한 장을 band와 요소로 구성한다.

- `templateSchema.ts:161-180`의 `Band`, `DocumentPayload`, `TemplateEnvelope`
- `templateSchema.ts:64-115`의 FIELD/TEXT/DETAIL/IMAGE와 legacy 요소
- `ElementInspector.tsx:95-99`, `:312-360`의 `%` 기반 x/y/w/h 편집
- `DocumentRenderer.tsx:99-114`, `:168-178`의 absolute positioning

이 구조는 “문서 페이지 위에서 텍스트/필드/이미지를 자유 배치한다”는 점에서 워드 방식의 접점이다. 그러나 다음 이유로 완전한 Word clone이라고 부르면 안 된다.

- 일반 문단의 line wrapping/flow model이 없다.
- FIELD/TEXT/IMAGE의 absolute layer와 DETAIL의 HTML table flow가 혼합되어 있다.
- paper는 현재 `A4_PORTRAIT`만 허용되고, `paperToPrintLayout`도 그 값만 연결한다.
- 표/결재/첨부 같은 legacy 요소는 타입별 renderer가 따로 처리한다.

판정: 현재는 **자유 배치형 approval template renderer**이지, 범용 문서형 저작 engine은 아니다.

### 2.2 현재 엑셀 방식에 해당하는 코드와 그 한계

현재 코드에서 엑셀 방식으로 오인할 수 있는 것은 세 종류다.

1. **DETAIL 반복 표**
   - `DocumentRenderer.tsx:205-237`의 HTML table
   - `useTemplateDraft.ts:157-164`의 repeat binding/column 배열
   - 이는 행 반복을 위한 문서 요소이지, 셀을 직접 편집하는 workbook grid가 아니다.
2. **견적서/판매전표의 HTML table**
   - `QuoteView.tsx:75-102`, `:162-221`
   - `DispatchDocument.tsx:114-141`
   - 열 구조가 JSX에 고정되어 있고, 셀 병합·열 폭·행 높이·수식·인쇄 영역이 template JSON으로 저장되지 않는다.
3. **기존 Excel I/O**
   - FE `clients/desktop/src/renderer/api/excelExportApi.ts:1-23`, `:124-219`는 `.xlsx` API를 blob으로 다운로드하고 mock mode에서는 CSV blob을 반환한다.
   - `clients/desktop/src/renderer/EXCEL-EXPORT-DESIGN.md:1-18`도 목록 상단의 “Excel 다운로드” UI 설계다.
   - Java `shared/ecount-io/build.gradle:1-5`, `:19-24`는 Apache POI 기반 Excel IO module이며, `shared/ecount-io/src/main/java/com/samhanair/logis/ecount/io/ExcelExporter.java:26-40`, `:67-128`은 workbook export를 한다.

따라서 현재 엑셀 방식의 **저작·저장·미리보기 renderer는 부재**한다. 기존 Excel 코드는 출력 양식 저작과 직접 연결되지 않는다.

### 2.3 mode 선택 스위치를 붙일 접점

권장 분리는 아래와 같다.

```text
저작 방식 선택
  → TemplateEnvelope/DocumentPayload에 mode 보존
  → Editor adapter 선택
      WORD  → 현재 BandCanvas + ElementInspector 계열
      EXCEL → cell grid editor + workbook-like JSON
  → DocumentRenderer compile dispatch
      WORD  → 현재 band/element compiler
      EXCEL → cell-grid compiler
  → 공통 PrintLayout shell
  → 브라우저 print / headless print renderer
```

구체 접점:

| 접점 | 현행 파일 | 붙일 이유 |
|---|---|---|
| 저장 계약 | `templateSchema.ts:161-180`, `documentTemplate.ts:28-33`, BE `DocumentTemplateCreateRequest.java:10-15` / `DocumentTemplateUpdateRequest.java:10-15` | mode가 없으면 저장 후 재조회·승인 pin 시 renderer를 재선택할 수 없다. |
| 신규 저작 진입 | `GroupwareDocumentTemplateAdminPage.tsx:65-67`, `DocumentTemplateEditorPage.tsx:40-105` | 새 양식 생성 시 워드/엑셀을 선택하고 선택된 adapter를 열 수 있다. 기존 DRAFT 편집은 저장된 mode를 따라가야 한다. |
| 편집기 분기 | `DocumentTemplateEditorPage.tsx:288-320`, `BandCanvas.tsx`, `ElementInspector.tsx` | 현재 화면은 band/element 전용이다. Excel mode에서는 cell grid editor를 별도 adapter로 두는 것이 경계가 명확하다. |
| 렌더 분기 | `DocumentRenderer.tsx:602-720` | 현재 템플릿을 `PrintLayout` props와 body로 compile하는 한 지점이다. `WORD`/`EXCEL` renderer dispatch를 이 단계에 둘 수 있다. |
| 출력 shell | `PrintLayout.tsx:48-62`, `:107-140` | paper size/no-print/window.print만 유지한다. 저작 방식 책임을 넣지 않는 것이 기존 A4/88mm 의미를 보존한다. |

반대로 `PrintLayout.showFormatToggle`에는 mode를 붙이지 않아야 한다. 이 prop의 현재 계약은 “88mm ↔ A4”이고, 워드/엑셀은 문서 layout model의 선택이므로 서로 다른 축이다.

mode 저장 위치는 후속 설계 결정이 필요하다.

- **권장 후보**: 기존 `document JSONB` 안에 `authoringMode`와 mode별 payload를 넣는다. 기존 `document_templates`/revision 저장과 함께 pin되고 DB migration 없이 legacy default를 둘 수 있다.
- **대안**: `document_templates`와 `document_template_revisions`에 별도 `authoring_mode` column을 둔다. SQL 조회/통계가 필요하면 명확하지만, 현재 JSON document와 mode를 이중 관리하게 된다.
- 현재 어느 쪽을 확정했다는 기존 결정은 찾지 못했으므로, 최종 위치는 **판정불가/후속 결정 필요**로 남긴다.

## 3. 엑셀 라이브러리 후보와 라이선스

아래 라이선스 확인은 2026-07-30에 공식 저장소/공식 문서와 npm registry의 package metadata를 읽은 결과다. “상업 사용 가능”은 해당 오픈소스 라이선스의 일반적 허용 범위를 뜻하며, 배포 방식에 따른 NOTICE/저작권 고지/법무 검토는 별도로 필요하다.

### 3.1 프론트엔드 / Electron 후보

| 후보 | 확인된 용도 | 라이선스/상업 사용 | 이 저장소에 적용할 때의 판단 |
|---|---|---|---|
| **ExcelJS** (`exceljs`) | XLSX/JSON 읽기·쓰기와 스타일 조작. 공식 README에 browserified bundle을 명시한다. | npm metadata 4.4.0은 MIT. MIT 조건에 따른 저작권·라이선스 고지는 필요하지만 사내 상업 사용은 가능하다. [공식 README](https://github.com/exceljs/exceljs#readme), [LICENSE](https://github.com/exceljs/exceljs/blob/master/LICENSE) | **I/O adapter 후보**. 셀 grid 편집 UI 자체는 아니므로 FortuneSheet 같은 editor와 결합하거나 자체 grid가 필요하다. Electron renderer/Node 양쪽에서 검토 가능하다. |
| **SheetJS Community Edition** (`xlsx`) | 브라우저에서 XLSX/CSV 등 workbook parse/write. | npm metadata 0.18.5와 공식 저장소 LICENSE가 Apache-2.0이다. Apache 2.0 조건·NOTICE·저작권 고지를 지키면 상업 사용 가능하다. Community Edition과 별도 Pro 기능/조건을 혼동하면 안 된다. [공식 README](https://github.com/SheetJS/sheetjs), [LICENSE](https://github.com/SheetJS/sheetjs/blob/master/LICENSE) | **가벼운 import/export 후보**. 셀 grid editor와 인쇄 renderer는 제공하지 않는다. 브라우저에서 입력 파일을 JSON model로 바꾸는 adapter 용도가 적합하다. |
| **FortuneSheet React** (`@fortune-sheet/react`) | Excel/Google Sheets에 가까운 브라우저용 interactive spreadsheet/grid UI. 공식 README는 React `Workbook` 사용 예를 제공한다. | npm metadata 1.0.4와 공식 README는 MIT. MIT 조건의 고지 후 사내 상업 사용 가능하다. [공식 README](https://github.com/ruilisi/fortune-sheet#readme), [LICENSE](https://github.com/ruilisi/fortune-sheet/blob/master/LICENSE) | **실제 엑셀 방식 저작 UI 후보**. 셀 편집 UX는 제공하지만, 이 프로젝트의 문서 필드 binding, 반복 line item, 결재 영역, A4 print fidelity, XLSX round-trip은 별도 adapter/검증이 필요하다. XLSX import/export가 이 프로젝트 요구를 그대로 충족한다고 단정할 수 없다. |

현재 `clients/desktop/package.json:31-77`의 dependencies/devDependencies에는 위 XLSX/grid 라이브러리가 없다. 기존 Excel 기능은 별도 설치 없이 API blob을 내려받는 경로다.

### 3.2 백엔드 Java 후보

| 후보 | 확인된 용도 | 라이선스/상업 사용 | 이 저장소에 적용할 때의 판단 |
|---|---|---|---|
| **Apache POI** (`poi-ooxml`) | OOXML `.xlsx` 생성·파싱·셀/스타일/인쇄 설정 조작. | 공식 Apache POI 법무 페이지가 Apache License 2.0 릴리스를 명시한다. Apache 2.0 조건을 지키면 상업 사용 가능하다. [공식 License and Notice](https://poi.apache.org/legal.html) | **우선 후보/이미 사용 중**. `shared/ecount-io/build.gradle:19-24`에 `poi-ooxml:5.4.0`이 있고, `slip-service/build.gradle:43-46`, `inventory-service/build.gradle:49-50`, `arologis-service/build.gradle:67-72`에도 사용 사례가 있다. 새 양식 mode를 위해 Java 의존성을 추가하기 전에 shared module 재사용을 검토할 수 있다. 단 POI는 브라우저의 interactive editor나 HTML/PDF 시각 renderer가 아니다. |
| **Alibaba EasyExcel** | 대용량 Java Excel import/export, streaming 중심. | 공식 README가 Apache License를 표시한다. Apache 2.0 조건을 지키면 상업 사용 가능하다. [공식 README](https://github.com/alibaba/easyexcel), [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) | **조건부 후보**. 공식 README에 유지보수 모드 진입 안내가 있어 신규 핵심 양식 engine의 1순위로 보기는 어렵다. 현재 저장소에는 사용 근거를 확인하지 못했다. |
| **Aspose.Cells for Java** | 상용 spreadsheet model, 고급 XLSX 기능과 print/page setup 후보. | 오픈소스 라이선스가 아니라 상용 제품 라이선스다. 상업 운영은 유료 라이선스 범위에서 가능하지만, 현재 정찰에서 가격·배포 형태·계약 조건은 **판정불가**다. [제품 페이지](https://products.aspose.com/cells/java/), [구매 페이지](https://purchase.aspose.com/buy/cells) | **유료 fallback**. POI로 충족하지 못하는 Excel fidelity/호환성이 사업상 필수일 때만 비용·vendor lock-in을 포함해 검토한다. 현재 도입을 권고할 근거는 없다. |

라이브러리 역할을 분리해야 한다.

- UI 저작: FortuneSheet 또는 자체 cell grid
- XLSX import/export: ExcelJS 또는 SheetJS CE(브라우저), Apache POI(Java)
- 최종 인쇄: 현재의 브라우저 DOM/`@media print`/headless Chromium 계열을 별도 구현

어느 후보도 “엑셀 파일을 읽으면 이 저장소의 결재 문서 출력물과 동일한 A4 HTML/PDF가 자동으로 나온다”고 보장하지 않는다. 특히 cell grid와 문서 출력물의 row repeat, page break, 결재란, 한글 폰트는 별도 모델링과 QA가 필요하다.

## 4. 기존 결정·기존 리포트와의 교차검증

다음 자료를 실제로 열어 현 코드와 대조했다.

- `.claude/memory/project_print_preview_standardization.md`
- `docs/dev-reports/2026-07-18-845-ds1-form-renderer-foundation.md`
- `docs/dev-reports/2026-07-18-845-ds2-template-management.md`
- `docs/dev-reports/2026-07-22-845-ds3b-template-editor.md`
- `docs/dev-reports/2026-07-23-869-ds4-document-template-advanced.md`
- `docs/dev-reports/approval-doc-print-preview.md`
- `docs/dev-reports/slip-output-format-slice.md`
- `docs/dev-reports/sp-08-4-4-order-print-form.md`
- `docs/dev-reports/sp-08-5-5-purchase-print-form.md`
- `docs/dev-reports/sp-08-6-4-sales-print-form.md`

### 4.1 정합한 부분

1. `project_print_preview_standardization.md`가 정한 “문서 성격별 양식을 유지하고 모든 문서를 한 layout으로 강제하지 않는다”는 방향과 현재 코드가 정합하다. `PrintLayout`은 shell이고, `QuoteView`/`DispatchDocument`/`DocumentRenderer`가 각 본문을 가진다.
2. DS-1 → DS-2 → DS-3b 리포트의 진행 순서가 현 코드에 반영되어 있다.
   - DS-1의 parser/default/compiler 경계: `templateSchema.ts`, `approvalDefaultTemplate.ts`, `DocumentRenderer.tsx`
   - DS-2의 JSONB/DRAFT/ACTIVE: V10 migration, `DocumentTemplate.java`, controller/service
   - DS-3b의 3-pane editor/JSONB round trip: `DocumentTemplateEditorPage.tsx`, `BandCanvas`, `ElementInspector`
3. DS-4의 `DocumentRenderer → PrintLayout` 유지와 기존 출력물 비영향 원칙도 현 코드와 정합하다. 다만 이것은 그룹웨어 결재 template renderer의 범위이지 견적서/판매전표를 자동으로 editor에 편입했다는 결정은 아니다.
4. 기존 견적 snapshot 결정과 현 코드도 데이터 관점에서는 정합하다. `quote_snapshots`는 작업상태 blob이고, `QuoteView`는 별도 JSX 출력이다. 그러므로 견적 데이터 저장이 있다고 해서 견적 레이아웃 저작이 있다고 볼 수 없다.

### 4.2 모순 또는 결정-현 코드 간 gap

#### 모순 A — `OutboundView` 표준화 결정과 현재 route

- memory 결정은 `전표(입고/출고) = OutboundView 통일 + A4/88mm 토글`로 기록한다.
- `docs/design/print-preview-standardization/DESIGN.md:15-42`, `:356-420`도 `OutboundView.tsx`를 기준 양식으로 기술한다.
- 그러나 현재 실제 route는 `routes/index.tsx:556`의 `/sales/:id/print/dispatch` → `DispatchView`이고, `clients/desktop/src/renderer/print/OutboundView.tsx` 파일은 현재 worktree 파일 목록에 없다.
- 현재 `DispatchView.tsx:81-98`은 `PrintLayout`을 사용하지 않고 자체 toolbar + `window.print()`를 수행한다. `DispatchDocument.tsx:85-141`이 양식 본문을 직접 렌더링한다.
- `PrintLayout.tsx:56-62`에 88mm/A4 toggle prop과 `receipt-88mm` type은 남아 있지만, 현재 `DispatchView`에서 그 prop을 호출하지 않는다.

판정: **기존 결정 문서와 현재 연결 경로가 완전히 정합하지 않다.** 후속 `sales-slip-form-unify-rename` 계획은 OutboundView를 폐기하고 DispatchView를 판매전표 단일 양식으로 삼는 방향을 기록하고 있으므로, 이 worktree에서는 “이후 변경이 반영된 현재 코드”로 보인다. 다만 88mm 요구를 의도적으로 폐기한 것인지 단순 누락인지까지는 이 정찰만으로 **판정불가**다.

PR #998에서 이 모순을 해소하지 않고 mode switch를 `PrintLayout`에 붙이면, 과거 88mm 결정과 현재 판매전표 route가 동시에 더 불명확해진다. 우선 mode switch 대상에 견적서/판매전표를 포함할지, 기존 `DispatchView`를 template renderer로 이관할지를 별도 범위 결정으로 고정해야 한다.

#### 모순 B — 견적서 “종합견적서 epic/data model first”와 현재 인쇄 view

기존 memory는 견적서를 GAS 종합견적서와 snapshot/data model 중심으로 분리한다. 현재 `QuoteView.tsx:69-251`은 A4 HTML 출력이 실제로 존재하지만, 양식 정의는 JSX에 있다. 이는 기존 결정과 직접 충돌한다기보다 “출력 mock/legacy 경로가 살아 있고 template authoring으로 이관되지 않은 gap”이다. #903의 워드/엑셀 선택을 견적서에 바로 적용한다고 가정하면 기존 견적 data model-first 결정과 범위가 충돌할 수 있다.

#### 모순 C — DS-1의 “editor/DB later”와 현재 editor/DB

DS-1 리포트에서 editor/DB는 후속 단계로 남아 있었지만 DS-2/DS-3b 리포트와 현재 코드에서 이미 구현되었다. 이는 결정 변경이라기보다 후속 slice가 완료된 진행 상태다. 현재 정찰에서 “편집기 부재”로 판정하면 안 된다. 단, 그 편집기의 범위는 그룹웨어 결재 문서다.

#### 제한 D — DETAIL/IMAGE editor와 ACTIVE gate

`ElementPalette.tsx:6-12`와 `useTemplateDraft.ts:157-171`은 DETAIL/IMAGE를 편집할 수 있게 하지만 `DocumentTemplateService.java:114-119`, `DocumentPayloadValidator.java:116-120`은 자동 업데이트 선행 전 DETAIL/IMAGE가 포함된 양식의 activation을 막는다. DS-4 리포트에 기록된 정책과 현재 코드가 정합하다.

따라서 Excel mode에서 셀 grid와 이미지/반복행을 추가할 때는 “저장 가능”과 “ACTIVE로 사용 가능”을 분리해서 보여줘야 한다. 현재 정책을 그대로 적용하면 Excel prototype이 저장만 되고 실제 active 출력에 쓰이지 않을 수 있다.

## 5. 머지 가능한 최소 슬라이스 제안

추천 범위는 기존 저장형 그룹웨어 template에 먼저 붙이는 4단계다. 견적서/판매전표의 legacy JSX를 첫 Excel/Word mode 실험에 동시에 넣지 않는 것이 안전하다. 각 슬라이스는 독립적으로 리뷰·롤백 가능한 단위로 정의한다.

### 슬라이스 1 — 저작 방식 공통 계약 고정

- **목표**: mode 이름·표시 라벨·legacy 기본값을 한 곳에 고정한다.
- **첫 PR 크기**: 신규 FE 파일 1개, 약 20~40줄.
- **예상 파일**: `clients/desktop/src/renderer/print/templateAuthoringMode.ts` (신규)
- **내용**: `WORD | EXCEL` 타입, 사용자 표시 라벨, legacy template의 기본 mode(권장 `WORD`), 알 수 없는 값/누락값의 normalize 규칙.
- **제외**: API, DB, UI, renderer 동작 변경. 기존 출력 회귀가 없어야 한다.
- **머지 조건**: 다음 슬라이스가 공통 import할 안정된 계약이며, 현재 경로의 화면/저장 동작은 그대로다.

첫 슬라이스를 이 정도로 작게 두면 mode 명칭이 확정되기 전에 DB/API/라이브러리까지 묶는 일을 피할 수 있다.

### 슬라이스 2 — 기존 template JSONB에 mode round-trip 추가

- **목표**: 신규 저장 양식은 mode를 보존하고, 기존 v1/v2 양식과 DB row는 `WORD`로 안전하게 읽는다.
- **예상 범위**: `templateSchema.ts`, FE `DocumentTemplateInput`, Java `DocumentPayload`/validator/request DTO, 관련 parser/계약 테스트.
- **저장 위치 권장**: 첫 구현은 기존 `document JSONB` 안에 mode를 넣고, 별도 SQL column은 통계/조회 요구가 생길 때 재검토한다.
- **동작**: ACTIVE/pinned revision에도 mode가 같이 보존되어 승인 당시 renderer 선택이 동일해야 한다.
- **제외**: Excel editor와 실제 renderer 분기. mode가 없는 legacy 양식은 계속 기존 renderer를 사용한다.

### 슬라이스 3 — Excel mode의 최소 저작 vertical slice

- **목표**: 그룹웨어 결재 문서 한 종류에 한해 cell grid를 편집하고 DRAFT JSONB를 저장/재진입한다.
- **FE**: `DocumentTemplateEditorPage` 안에서 mode에 따라 현재 BandCanvas 또는 Excel grid adapter를 선택한다.
- **모델 최소 범위**: 셀 값/field binding, 행·열 크기, 병합, 반복 line-item 영역, A4 인쇄영역. 수식·다중 sheet·범용 Excel 파일 편집은 제외한다.
- **라이브러리 권장 검토 순서**: UI는 `@fortune-sheet/react`, XLSX import/export가 필요할 때만 `ExcelJS` 또는 SheetJS CE를 adapter로 붙인다. 먼저 현재 기능에 필요한 cell model을 정하고 라이브러리 객체를 DB에 그대로 저장하지 않는다.
- **제외**: QuoteView/DispatchView 이관, 88mm 정책 변경, 기존 legacy template 일괄 변환.

### 슬라이스 4 — renderer dispatch와 한 문서 type의 출력 검증

- **목표**: 저장된 mode에 따라 `DocumentRenderer`가 Word renderer 또는 Excel renderer를 선택하고, 동일한 `PrintLayout` shell/승인 revision pin/headless 출력에서 결과를 검증한다.
- **접점**: `DocumentRenderer.tsx:602-720` compile dispatch. `PrintLayout`은 paper/no-print/window.print 책임만 유지한다.
- **파일럿**: 기존 저장형 그룹웨어 결재 문서 한 종류. 견적서와 판매전표는 별도 adapter 이관 결정 후 진행한다.
- **검증**: DRAFT preview, ACTIVE 출력, 승인 후 pinned revision 재출력, line-item 다량 행/page break, 한글 폰트, headless `print-renderer` 결과를 함께 확인한다.
- **완료 조건**: mode 누락 legacy 양식의 기존 출력이 변하지 않고, Excel mode의 preview와 실제 print/headless 결과가 같은 model에서 나온다.

## 6. 이번 정찰에서 새로 만든 파일

- `docs/dev-reports/2026-07-30-903-template-authoring-recon.md` — 본 정찰 보고서

이 라운드에는 구현 파일, 라이브러리 lockfile, migration, 테스트 fixture를 만들지 않았다.

