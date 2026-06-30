# 2026-06-30 코-에디팅 S2d-1b 라인 셀 인라인 레드라인

## 범위

- 임계 통과 전표의 `GET /slips/{id}/redline` 응답에 라인 셀 redline field를 추가했다.
- 대상 라인 필드: `modelName`, `productName`, `specification`, `quantity`, `unitPrice`, `lineTotal`.
- S2d-1 헤더 redline 경로는 유지하고, 라인 셀은 `SlipSnapshot.lines()`를 직접 비교한다.

## 백엔드

- `SlipSnapshot.Line`에 `unitPriceWithVat`, `vatAmount`, `supplyAmount`를 nullable additive 필드로 추가했다.
- `Slip.toSnapshot()`이 `SlipLine`의 VAT 포함 단가, 부가세, 공급가액을 캡처한다.
- `SlipRedlineService`는 anchor 이후 revision을 오름차순으로 읽고, 최신 revision의 현재 행 인덱스에 맞춰 `lines[i].field`를 emit한다.
- 라인 매칭은 `productId + 같은 productId 등장순서`를 안정키로 사용한다. 행 삽입/재정렬 뒤에도 기존 행 인덱스 이력이 다른 품목에 혼입되지 않는다.
- 단가 표시값은 `unitPriceWithVat ?? unitPrice`로 계산한다.
- 합계 표시값은 신규 snapshot이면 `supplyAmount + vatAmount`를 우선 사용한다. legacy snapshot처럼 VAT 필드가 없으면 `lineTotal`을 그대로 사용해 VAT 포함값을 추정하지 않는다.
- `productId`와 actor UUID는 redline 응답의 사용자 표시값에 포함하지 않는다.

## 프론트엔드

- `RedlineCell`에 `format?: (value: string) => string` prop을 추가했다.
- 전표 상세 라인 테이블의 모델명, 품목명, 규격, 수량, 단가(VAT포함), 합계(VAT포함)를 redline fieldPath에 연결했다.
- 수량/단가/합계 redline layer는 천단위 포맷을 적용한다.
- 공급가액/부가세 열은 redline 대상이 아니므로 기존 일반 표시를 유지했다.
- 모바일 라인 카드의 품목명도 `lines[i].productName` redline에 연결했다.
- desktop mock redline 응답에 `lines[0].quantity`, `lines[0].unitPrice`를 추가했다.

## 검증

- 추가 단위 테스트:
  - `SlipSnapshotLineTest`: VAT 필드 캡처, legacy JSON 역직렬화 null 호환.
  - `SlipRedlineServiceTest`: VAT포함 단가 누적, productId 기반 재정렬 보존, legacy VAT-null 단일 layer 필터.
  - `RedlineCell.test.tsx`: format prop 천단위 표시.
  - `mock.test.ts`: mock redline 라인 field 계약.
- 추가 통합 테스트:
  - `SlipRedlineIT`: OUTBOUND inspect anchor 이후 실 DB revision을 통해 라인 단가/수량 redline과 productId UUID 비노출 검증.

## 비대상

- S2d-2 라이브 Yjs 편집 중 track-changes.
- 라인 삭제 이력 화면 표시. 최신 revision에 없는 라인은 현재 화면에 표시할 행이 없으므로 redline 응답에서 제외한다.
