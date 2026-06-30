# 코-에디팅 S2d-1b — 라인 셀(품목) 인라인 레드라인 (설계)

> 2026-06-30. 라이브 코-에디팅 에픽(#16) S2d 분할 2. S2d-1(헤더 한정, #677 머지) 후속. slip-service + clients/desktop.

## Goal
임계 통과 전표 조회 시 **라인(품목) 셀**에도 anchor 後 누적 레드라인(track-changes)을 인라인 표시한다(품목명·모델명·규격·수량·단가·합계). S2d-1 헤더 redline에 라인 셀을 추가해 전 셀 redline 완성.

## 배경 — S2d-1에서 라인 셀이 제외된 2 BLOCKING
1. **라인 fieldPath 행인덱스 누적 misattribution**(BE): S2b `fieldChanges`가 라인 변경을 현재 행 인덱스(`lines[i]`)로 방출 → S2d redline이 fieldPath 키로 누적 시, anchor 後 라인 삽입/삭제/재정렬(감사 복원 경로 도달 가능)이 같은 인덱스에 다른 productId 값 혼입 + 이력 손실.
2. **단가/합계 VAT 정합**(FE/Design): 셀 평소 표시는 VAT포함(`unitPriceWithVat`/`supply+vat`)인데 snapshot은 VAT제외(`unitPrice`/`lineTotal`)만 저장 → 인라인 redline이 셀 표시값과 불일치(합계=공급가 중복 표시).

## Architecture
라인 셀 redline을 **헤더와 분리**해, snapshot에서 **productId 기준으로 직접 계산**한다. 헤더 셀은 S2d-1 `fieldChanges` 경로 그대로 유지.

- 헤더 셀: `SlipRedlineService` 기존 경로(fieldChanges 인접쌍, fieldPath=`header.*` 안정키) — 무변경.
- 라인 셀: anchor 後 각 revision 스냅샷의 라인을 **productId로 매칭**해 productId별 체인 구성. 각 추적 필드(modelName·productName·specification·quantity·단가·합계)의 값 변화를 layer로 누적. emit 시 **최신 revision에서 그 productId의 행 인덱스**로 `lines[currentIdx].field` fieldPath 산출(FE가 현재 행 순서로 렌더 → 정합). 최신 revision에 없는 productId(삭제됨)는 skip.

→ productId 안정키이므로 anchor 後 라인 삽입/삭제/재정렬에도 같은 논리 라인 체인 보존(혼입·손실 0).

## 컴포넌트

### 1. SlipSnapshot.Line 확장 (VAT 정합 — 개발책임자 결정 A)
`record Line`에 NON_NULL 필드 3종 추가:
- `BigDecimal unitPriceWithVat` (VAT포함 단가)
- `BigDecimal vatAmount` (부가세)
- `BigDecimal supplyAmount` (공급가액)

`@JsonInclude(NON_NULL)` 유지 → **Flyway 불요**(slip_revisions snapshot은 JSON 컬럼, 과거 JSON은 새 필드 NULL로 역직렬화). 스냅샷 캡처 지점(SlipService snapshot 빌드)에서 live 라인의 해당 값으로 populate.

### 2. SlipRedlineService — 라인 redline 계산
`computeRedline(slipId)`에 라인 처리 추가(헤더는 기존 유지):
- anchor 後 revision들(오름차순) 스냅샷 수집.
- 최신 revision의 각 라인(productId, currentIdx)에 대해, 그 productId를 post-anchor revision들에서 매칭(S2b `lineQueuesByProductId` 발생순서 Deque 재사용)해 체인 구성.
- 추적 필드별 표시값 계산(FE `slipLineAmounts` 대칭, BE 단일 helper):
  - `modelName`/`productName`/`specification`: 원시 문자열.
  - `quantity`: 정수.
  - `단가`(fieldPath `lines[i].unitPrice`): `unitPriceWithVat ?? unitPrice`.
  - `합계`(fieldPath `lines[i].lineTotal`): `(supplyAmount ?? lineTotal) + (vatAmount ?? round((supplyAmount ?? lineTotal) × 0.1))`.
  - 과거(확장 前) 스냅샷은 VAT포함 필드 NULL → VAT제외 fallback(unitPrice·lineTotal). 동일 셀 체인에서 신규 layer=VAT포함, 과거 layer=VAT제외 혼재 가능하나, post-anchor 편집은 S2d-1b 배포 후 발생이 대부분이라 edge.
- 인접 revision 값이 다를 때만 layer 추가(base=첫 값 actor null + 변경 layer). layers≥2 필터.
- UUID(productId/actorId) 비노출 — formatValue·actor resolve는 S2d-1 그대로.

### 3. FE — SlipDetailPage 라인 셀 재배선 + RedlineCell format
- `RedlineCell`에 `format?: (value: string) => string` prop 추가 — 각 layer 값에 적용(수량 천단위·단가/합계 VAT포함 `toLocaleString`).
- `renderRedlineCell(fieldPath, fallback, format?)` 3번째 인자.
- SlipDetailPage 라인 셀 6종(desktop) + 모바일 productName 재배선:
  - modelName/productName/specification: format 없음.
  - quantity: `Number(v).toLocaleString()`.
  - unitPrice(단가): `Number(v).toLocaleString()` (BE가 이미 VAT포함값 emit).
  - lineTotal(합계): `Number(v).toLocaleString()` (BE가 이미 VAT포함값 emit).
- mock redline에 라인 필드(VAT포함값) 추가 — 헤더+라인 정합.

## Data flow
임계 전이(send/inspect)→anchor(V54, S2d-1 기존)·스냅샷 캡처 시 VAT포함 필드 저장 → 조회 시 `GET /slips/{id}/redline`이 헤더(fieldChanges)+라인(productId 체인, VAT포함 표시값) layers 반환 → RedlineCell이 셀별 재귀 스택 렌더(format으로 셀 표시값 정합).

## Error handling
- 과거 스냅샷 VAT포함 NULL → VAT제외 fallback(정직, ×1.1 가짜 금지).
- 최신 revision에 없는 productId(삭제 라인) → 라인 redline skip(현재 화면 미표시 라인이므로 무의미).
- layers≤1 → 일반 표시(redline 없음).

## Testing
- `SlipRedlineServiceTest`: ①라인 단일 셀 누적(단가 VAT포함 표시값) ②**라인 재정렬/삽입 후 productId 체인 보존**(S2d BLOCKING 재현 차단) ③과거 NULL fallback ④layers≥2 필터.
- `SlipRedlineIT`(실 DB): OUTBOUND inspect anchor + 라인 셀(단가/수량) 누적 + UUID 비노출.
- FE `RedlineCell.test`: format prop(수량/단가 천단위). `mock.test`: 라인 redline fields.
- fresh PG probe: 스냅샷 확장이 기존 slip_revisions 역직렬화 무영향(과거 JSON NULL 필드).

## 비대상 (후속)
- S2d-2: 라이브 Yjs 실시간 track-changes(편집 중).
- S3: 6문서 롤아웃.
