# #869 DS-4 문서 양식 고도화 설계

## 목표

DS-3b schema v2 편집기에 실무용 반복 detail 밴드와 이미지/로고 요소를 additive로 추가하고, 기존 `DocumentRenderer → PrintLayout` 인쇄 계약을 유지한다.

## 확정 범위

- `DETAIL`: BODY 밴드에서 반복 품목행을 렌더한다.
- `IMAGE`: HEADER/BODY/FOOTER 밴드에서 지정 위치·크기로 이미지를 렌더한다.
- 새 Flyway migration, 새 API endpoint, 기존 schema v2 요소의 의미 변경은 없다.
- 기존 design-system 컴포넌트를 재사용하며 신규 design-system 컴포넌트는 만들지 않는다.

## 데이터 계약

### Detail 행 원천

파일럿 행 계약은 실제 `services/slip-service`의 `EstimateLineResponse`와 대조한다.

| 허용 열 키 | 실제 DTO 필드 | 의미 |
|---|---|---|
| `productName` | `EstimateLineResponse.productName` | 품목명 snapshot, nullable 아님(BE record 선언상 `String`, FE 소비 시 빈 문자열 fallback) |
| `modelName` | `EstimateLineResponse.modelName` | 모델명, 선택 |
| `specification` | `EstimateLineResponse.specification` | 규격, 선택 |
| `quantity` | `EstimateLineResponse.quantity` | 수량, 정수 |
| `supplyAmount` | `EstimateLineResponse.supplyAmount` | VAT 제외 공급가액 |
| `vatAmount` | `EstimateLineResponse.vatAmount` | 라인 부가세 |
| `lineTotal` | `EstimateLineResponse.lineTotal` | 이 DTO의 도메인 규칙상 `supplyAmount + vatAmount`, VAT 포함 합계 |
| `note` | `EstimateLineResponse.note` | 라인 메모, 선택 |

`unitPrice`와 `unitPriceWithVat`는 legacy/VAT 포함 전환에 따라 의미가 달라질 수 있어 이번 허용 목록에서 제외한다. `EstimateLine` 도메인 Javadoc 및 revision 테스트에서 `lineTotal = 공급가액 + 부가세`를 확인했으며, 다른 DTO의 동명 필드는 이 파일럿 계약에 자동 편입하지 않는다. UUID 필드(`id`, `productId`)와 계보 필드(`setHead`, `parentSetModel`)는 사용자 노출·binding 대상이 아니다.

런타임 렌더 모델은 API DTO를 직접 저장하지 않고 UUID 없는 `ApprovalRenderLineItem` projection을 사용한다. projection의 필드명은 위 허용 목록과 동일하며, 실제 estimate 응답을 이 projection으로 변환하는 adapter 경계에서만 DTO 의존성을 둔다.

### Schema v2 확장

```ts
type DetailColumnKey =
  | 'productName' | 'modelName' | 'specification' | 'quantity'
  | 'supplyAmount' | 'vatAmount' | 'lineTotal' | 'note'

type DetailElement = {
  key: string
  type: 'DETAIL'
  repeatBinding: 'body.lineItems'
  columns: DetailColumnKey[]
  geometry?: Geometry
  style?: ElementStyle
}

type ImageElement = {
  key: string
  type: 'IMAGE'
  src: string
  alt: string
  geometry?: Geometry
  style?: ElementStyle
}
```

`DETAIL`은 BODY 밴드에만 배치한다. `IMAGE`는 HEADER/BODY/FOOTER에 배치할 수 있다. 기존 레거시 7종, `FIELD`, `TEXT` 구조는 변경하지 않으며 parser가 기존 저장 payload를 재조립할 때 필드를 추가하거나 재해석하지 않는다.

### 이미지 출처 보안 정책

허용하는 `src`는 다음 둘뿐이다.

1. `data:image/png;base64,...`, `data:image/jpeg;base64,...`, `data:image/webp;base64,...` 형식의 비어 있지 않은 base64 data URL
2. 기존 기본 로고 asset인 정확한 root-relative `/print-logo.svg`

`http:`, `https:`, `//host`, `blob:`, `file:`, `javascript:`, `data:image/svg+xml`, query/hash가 붙은 경로 및 token이 들어갈 수 있는 모든 외부 URL은 parser, BE validator, renderer에서 거부한다. 이유는 desktop CSP가 `https:`를 기술적으로 허용하더라도 인쇄 시 네트워크·CSP·오프라인 환경에 따라 출력이 달라질 수 있고, SVG/data URL은 스크립트·외부 참조 표면을 늘리기 때문이다. 업로드 UI는 기존 이미지 정규화 패턴을 따라 PNG data URL로 저장하며, 최대 50KB를 적용한다.

## 렌더링 및 경계 처리

- `DocumentRenderer`가 template과 `ApprovalRenderModel`을 받아 기존 `PrintLayout` props를 compile하는 구조를 유지한다.
- `DETAIL`은 `<table><thead>...`와 `<tbody>` 반복 행으로 렌더한다. 0행에도 열 header를 유지하고, 저장소에서 이미 사용 중인 일반 빈 데이터 문구 `데이터가 없습니다.`를 empty row에 표시한다.
- 1행과 N행은 동일한 projection map을 사용한다. `tbody tr`에는 `break-inside: avoid`를 적용하되 table 전체에는 page-break 방지 속성을 적용하지 않아 여러 페이지로 흐를 수 있게 한다.
- print media에서 `thead { display: table-header-group; }`를 적용해 2페이지 이상에서 열 header를 반복한다.
- `IMAGE`는 geometry를 relative layer 기준의 `%`로 해석하고 `object-fit: contain`으로 지정 박스 안에 그린다. 이미지가 없거나 거부된 경우 element를 숨기고 오류를 삼키지 않도록 parser에서 저장을 차단한다.
- 기존 `.no-print`, `.paper`, A4 `210mm`, print header `row`, screen `max-width:639px` 적층 규칙을 보존한다.

## 편집기

기존 `ElementPalette`, `ElementInspector`, `useTemplateDraft`를 확장한다. 팔레트에 `DETAIL`·`IMAGE` 추가 버튼을 더하고, inspector에서 detail 열 선택/순서와 이미지 파일·geometry/style을 편집한다. `Button`, `Input`, `Select`, `Modal` 등 기존 `@samhan/design-system` import를 사용하고 신규 shared component는 만들지 않는다. 미리보기는 별도 renderer가 아니라 현재 `DocumentRenderer`를 그대로 재사용하며 0/1/N fixture와 구별 가능한 실제 값(예: 품목명·금액)을 표시한다.

## 검증 계약

- 각 새 parser/validator/renderer 동작은 RED → expected failure 확인 → 최소 GREEN 순서로 추가한다.
- mutation RED는 `DETAIL`/`IMAGE`를 기존 타입 집합으로 되돌리기, detail `tbody` map 제거, image src scheme 완화, `thead` 반복 제거, geometry 적용 제거 각각에서 새 테스트가 실패하는 것을 확인한다.
- Playwright mock은 `ac-868-document-template-editor.spec.ts`만 좁혀 실행하며 조건부 `count()` skip을 사용하지 않는다. 1100, 1099, 700, 699, 640, 639, 320과 양쪽 경계에서 실제 줄 수, `flex-direction`, `scrollWidth <= clientWidth`, `elementFromPoint()` hit-test, print 가시성을 단언한다.
- 실제 detail 행을 늘려 2페이지가 되는 fixture를 만들고 `page.pdf()`로 행 절단 없음과 2페이지 열 header 반복을 확인한다.
- 인쇄 CSS는 mock → 캡처 → CSS 수정의 별도 라운드를 최소 3회 기록한다. 기존 golden 파일은 갱신하지 않는다.
