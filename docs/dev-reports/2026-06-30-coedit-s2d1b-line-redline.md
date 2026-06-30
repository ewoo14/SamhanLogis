# 2026-06-30 코-에디팅 S2d-1b 라인 셀 인라인 레드라인

## 범위

- 임계 통과 전표의 `GET /slips/{id}/redline` 응답에 라인 셀 redline field를 추가했다.
- 대상 라인 필드: `modelName`, `productName`, `specification`, `quantity`, `unitPrice`, `lineTotal`.
- S2d-1 헤더 redline 경로는 유지하고, 라인 셀은 `SlipSnapshot.lines()`를 직접 비교한다.

## 백엔드

- `SlipSnapshot.Line`에 `unitPriceWithVat`, `vatAmount`, `supplyAmount`를 nullable additive 필드로 추가했다.
- `Slip.toSnapshot()`이 `SlipLine`의 VAT 포함 단가, 부가세, 공급가액을 캡처한다.
- `SlipRedlineService`는 anchor 이후 revision을 오름차순으로 읽고, 최신 revision의 현재 행 인덱스에 맞춰 `lines[i].field`를 emit한다.
- 라인 매칭은 `productId + 같은 productId 등장순서(occurrence)`를 안정키로 사용한다. **고유 productId 라인**은 행 삽입/삭제/재정렬 뒤에도 이력이 다른 품목에 혼입되지 않는다(테스트 `lineRedlineFollowsProductIdAcrossReorder`). 한계는 아래 "한계" 절 참조.
- 단가 표시값은 `unitPriceWithVat ?? unitPrice`로 계산한다.
- 합계 표시값은 신규 snapshot이면 `supplyAmount + vatAmount`를 우선 사용한다. legacy snapshot처럼 VAT 필드가 없으면 `lineTotal`을 그대로 사용해 VAT 포함값을 추정하지 않는다.
- `productId`와 actor UUID는 redline 응답의 사용자 표시값에 포함하지 않는다.

## 프론트엔드

- `RedlineCell`에 `format?: (value: string) => string` prop을 추가했다.
- 전표 상세 라인 테이블의 모델명, 품목명, 규격, 수량, 단가(VAT포함), 합계(VAT포함)를 redline fieldPath에 연결했다.
- 수량/단가/합계 redline layer는 천단위 포맷을 적용한다.
- 공급가액/부가세 열은 redline 대상이 아니므로 기존 일반 표시를 유지했다.
- 모바일 라인 카드의 품목명도 `lines[i].productName` redline에 연결했다.
- desktop mock redline 응답에 `lines[0].quantity`/`lines[0].unitPrice`/`lines[0].lineTotal`을 추가하고, `SAMPLE_LINES[0]`에 VAT 필드(`unitPriceWithVat`/`supplyAmount`/`vatAmount`)를 부여해 **redline current 값 = 셀 표시값**이 되도록 정렬했다(mock-mode 캡처/데모 정합 — Design 라운드 BLOCKING 해소).

## 검증

- 추가 단위 테스트:
  - `SlipSnapshotLineTest`: VAT 필드 캡처, legacy JSON 역직렬화 null 호환.
  - `SlipRedlineServiceTest`: VAT포함 단가 누적, productId 기반 재정렬 보존, legacy VAT-null 단일 layer 필터.
  - `RedlineCell.test.tsx`: format prop 천단위 표시.
  - `mock.test.ts`: mock redline 라인 field 계약.
- 추가 통합 테스트:
  - `SlipRedlineIT`: OUTBOUND `process→complete→inspect` anchor 이후 실 DB revision으로 라인 단가/수량 redline(field 존재·layers≥2·actor 체인)과 productId UUID 비노출 검증. (Windows Testcontainers skip → CI Linux 실행. QA 라운드가 `complete` 전이 누락=CI RED를 단독 적발→수정.)

## 비대상

- S2d-2 라이브 Yjs 편집 중 track-changes.
- 라인 삭제 이력 화면 표시. 최신 revision에 없는 라인은 현재 화면에 표시할 행이 없으므로 redline 응답에서 제외한다.

## 한계 (Known limitations) — 듀얼리뷰 NB 명시

- **동일 productId 복수 행**: 매칭이 `productId + 등장순서`라, 같은 productId가 한 전표에 2행 이상이고 그 중복 행들이 anchor 後 상호 재정렬될 경우 occurrence 차원에서 오귀속 가능. 고유 productId(일반적)는 영향 없음. 편집이 라인을 재생성(`SlipLine.create`)해 `SlipLine.id`가 revision 간 불안정하므로, 진짜 안정키로는 productId+occurrence 가 현 최선. (BE/QA NB)
- **legacy snapshot 합계 표시 불일치**: 배포 前 snapshot(VAT 필드 null)의 **과거 layer**는 BE가 `lineTotal`(VAT 제외)을 정직 반환하나, FE 일반 셀은 `lineTotal + round(×0.1)`(VAT 포함 ×1.1)로 표시 → 그 legacy 행의 redline 과거값과 일반 셀 표시가 다를 수 있음. 합의된 "과거 VAT 제외 정직 fallback"(×1.1 가짜 배제)의 **의도된 귀결**이며, 배포 後 1회 편집 시 VAT 필드 재적재로 해소되는 전이적 edge. current(최신 revision) 값은 항상 신규 snapshot이라 셀과 정합. (BE/Design/QA NB)
- **restore 재계산 drift**(극히 드묾): 감사 복원이 `SlipLine.create`로 라인을 재생성하며 다수량 VAT 라인의 `unitPriceWithVat`가 반올림 차로 어긋나 복원 actor에 유령 1-layer가 붙을 수 있음. (BE NB)
