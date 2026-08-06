# PR #1061 R17 구조 진단 (fix 동결)

- 작성일: 2026-08-04
- 범위: 집계·상세·인쇄 금액 산출 경로, R7 불일치 원인, 조인 키 실데이터 분포, 최소 변경 설계 제안
- 원칙: 진단 전용. 제품 코드·실데이터·실행 스택을 변경하지 않는다.

## 1. 세 경로의 금액 산출 지점

### 1.1 공통 하류 원천: slip-service 판매전표 projection

세 경로가 최종적으로 읽는 판매 금액의 물리 원천은 `slip_db.slips` + `slip_lines`다. accounting-service의 `PartnerLedgerSalesClient.find()`는 `GET /internal/slips/partner-ledger-sales`에 `from`, `to`, 선택적 `partnerCode`, `partnerId`를 보낸다 (`PartnerLedgerSalesClient.java:28-39`). slip-service의 `SlipInternalController.findPartnerLedgerSales()`는 이를 `SlipRepository.findPartnerLedgerSales()`로 넘긴다 (`SlipInternalController.java:401-424`). 실제 JPQL은 다음 조건이다 (`SlipRepository.java:80-97`).

```java
SELECT DISTINCT s FROM Slip s
WHERE s.isDeleted = false
  AND s.slipType = OUTBOUND
  AND s.status IN :statuses
  AND s.slipDate BETWEEN :from AND :to
  AND ((:partnerId IS NOT NULL AND (s.partnerId = :partnerId
                                    OR :partnerCode IS NOT NULL AND s.partnerCode = :partnerCode))
       OR :partnerId IS NULL AND (:partnerCode IS NULL OR s.partnerCode = :partnerCode))
```

각 품목 금액은 `PartnerLedgerSalesResponse.lineAmount()`가 만든다. `supplyAmount + vatAmount`를 우선하고, 없으면 `unitPriceWithVat * quantity`, 마지막으로 `lineTotal + vatAmount` 계열 fallback을 쓴다 (`PartnerLedgerSalesResponse.java:70-95`).

### 1.2 집계 — accounting-service `SalesAggregateService.aggregate()`

- HTTP: `GET /accounting/sales/aggregate` → `AccountingReportController.aggregate()` → `SalesAggregateService.aggregate()` (`AccountingReportController.java:115-124`).
- 회계 초기값: `JournalLineRepository.aggregatePostedByPartnerAccount(from,to)` 결과에서 401 매출, 110 채권/수금을 UUID `partnerId`별로 누적한다 (`SalesAggregateService.java:117-155`).
- 판매 금액 교체: 선택 조회는 `applyLedgerSalesTotal()`이 slip-service를 `(partnerCode, partnerId)`로 호출하고, 응답을 다시 `saleBelongsToPartner()`로 검증한 뒤 모든 `lineAmount`를 합해 `salesTotal`을 교체한다 (`SalesAggregateService.java:313-344`).
- 무필터 조회는 `applyUnfilteredLedgerSalesTotals()`이 slip-service를 `(null,null)`로 전수 호출한다. partner master 후보를 `partnerCode`, 다음으로 `businessNumber`에 연결하고, 연결되지 않으면 전표번호별 `LegacyPartnerAggregate`에 `ledgerSaleAmount()`를 더한다 (`SalesAggregateService.java:237-310`).

즉 상단 매출은 단순 회계 쿼리 하나가 아니다. 회계 journal 집계를 뼈대로 만들고 별도 slip-service 조회 결과로 매출만 선택적으로 교체/추가하는 합성 결과다.

### 1.3 상세 — accounting-service `PartnerLedgerReadService.read()`

- HTTP: FE `getLedgerData()`가 `GET /accounting/journals/partner-ledger`를 호출한다 (`partnerLedgerApi.ts:247-265`). controller는 `PartnerLedgerReadService.read()`로 위임한다 (`AccountingReportController.java:143-150`).
- 조회: 선택어를 partner master의 `partnerId/partnerCode`로 해석한 뒤 slip-service를 `(salesPartnerCode, partnerId)`로 별도 호출한다 (`PartnerLedgerReadService.java:39-80`).
- 재검증: master가 있으면 `saleBelongsToPartner()`가 `partnerCode` 일치 또는 `partnerCode 공란 + businessNumber 일치`만 남긴다 (`PartnerLedgerReadService.java:149-175`).
- 금액: 판매문서의 line은 slip projection의 `lineAmount`를 그대로 가지며 (`PartnerLedgerReadService.java:131-146`), FE `buildPartnerLedgerLines()`가 이를 debit으로 변환한다 (`partnerLedgerApi.ts:156-174`).
- 화면 호출: 행 클릭 후 `partner-ledger-detail` query가 위 API를 호출한다 (`PartnerLedgerPage.tsx:256-260`).

### 1.4 인쇄 — FE `PartnerLedgerView`

인쇄는 상세 화면의 `ledgerQuery.data`를 전달받지 않는다. `handlePrint()`가 query string만 가진 인쇄 route로 이동하고 (`PartnerLedgerPage.tsx:299-304`), `PartnerLedgerView`가 `partner-ledger-print` query에서 `getLedgerData()`를 다시 호출한다 (`PartnerLedgerView.tsx:205-220`). 이후 상세와 같은 debit line을 합산해 `totalDebit`을 만든다 (`PartnerLedgerView.tsx:222-245`).

### 1.5 동일 소스 여부 판정

- 물리 금액 원천과 slip-service JPQL/lineAmount 계산은 세 경로 모두 같다.
- 그러나 산출 결과 객체는 공유하지 않는다. 집계와 상세는 서로 다른 accounting-service 메서드가 각각 slip-service를 호출하고 서로 다른 조인/재검증/합성 로직을 수행한다.
- 인쇄는 상세와 같은 endpoint·service를 쓰지만 상세 결과를 재사용하지 않고 독립 HTTP/query-cache key로 재조회한다.
- 따라서 현재 구조는 **같은 원천을 세 번 해석하는 구조**이지, **하나의 산출 결과를 세 표면이 공유하는 구조**가 아니다.

## 2. R7 수치 불일치 원인

### 2.1 `P-2026-0005`: 집계 26,000,000원, 상세·인쇄 0건

실 master UUID는 `8f2bc08a-c6f3-3bc3-af98-7fdd58d2b38e`다. `accounting_db`에는 2026-01-13 `REVERSED / SLIP` 분개의 401 대변 **26,000,000원**, 110 차변 **28,600,000원**이 있다. 반면 2026-01-01~03-31의 원장 대상 slip에는 이 UUID 또는 `P-2026-0005` 코드로 연결되는 전표가 **0건**이다.

선택 집계는 먼저 journal 금액 26,000,000원을 `byPartner`에 만든다 (`SalesAggregateService.java:117-151`). 이후 `applyLedgerSalesTotal()`의 slip 조회 결과가 비어 있으므로 `if (!ledgerSales.isEmpty())` 내부의 교체가 실행되지 않는다 (`:316-327`). 따라서 집계에는 journal 26,000,000원이 그대로 남는다.

상세는 같은 journal 집계를 읽지 않는다. 판매 상세는 slip-service 결과, 수금 상세는 `cash_receipts`만 합친다 (`PartnerLedgerReadService.java:70-116`). 대상 slip이 0건이므로 판매문서가 없고, 인쇄도 같은 상세 API를 재호출하므로 함께 비어 있다. 즉 **P-2026-0005의 26,000,000원은 상세의 합이 아니라 집계에만 남은 회계 journal 값**이다.

### 2.2 `P-2026-0017`·`P-2026-0026`: 집계도 `—`, 상세·인쇄 0건

실 master와 기간 내 slip은 다음과 같다.

| 거래처 | master UUID | accounting 401 | 기간 내 slip | slip 금액 | slip 식별 필드 |
|---|---|---:|---|---:|---|
| P-2026-0017 | `0beb5a9c-...` | 20,000,000원 | `2026/03/08-1`, INSPECTING | 12,276,000원 | partnerId만 있음, partnerCode·businessNumber 공란 |
| P-2026-0026 | `301d1c4a-...` | 23,000,000원 | `2026/01/26-1`, COMPLETED | 5,656,200원 | partnerId만 있음, partnerCode·businessNumber 공란 |

R16 JPQL의 `partnerId OR partnerCode` 덕분에 두 raw slip은 조회된다 (`SlipRepository.java:87-89`). 그러나 slip-service 외부 projection은 UUID를 의도적으로 제거하고 `partnerCode/businessNumber`만 반환한다 (`PartnerLedgerSalesResponse.java:12-24, 59-67`). 두 행은 그 두 필드가 모두 공란이다.

그 결과 accounting-service의 `saleBelongsToPartner()`는 코드 일치도, `code 공란 + businessNumber 일치`도 증명하지 못해 두 sale을 모두 버린다 (`SalesAggregateService.java:330-344`, `PartnerLedgerReadService.java:149-163`).

여기서 집계의 결정적 비대칭이 생긴다. `applyLedgerSalesTotal()`은 **필터 전 raw `ledgerSales`가 비었는지**만 확인한 뒤, 필터 후 stream 합계를 계산한다. raw 목록은 1건이므로 블록에 들어가지만 필터 후에는 0건이라 합계 0이 되고, 이미 존재한 journal 매출 20,000,000원/23,000,000원을 0으로 덮는다 (`SalesAggregateService.java:316-327`). FE `fmtKrw(0)`가 `—`로 표시하므로 R7 수치와 일치한다.

상세는 동일 재검증에서 두 sale을 제거하므로 documents가 비고, 인쇄도 같은 API를 다시 호출하므로 함께 빈다. 따라서 **R16은 조회 축에서는 OR를 허용했지만, 응답 경계에서 UUID를 제거한 뒤 재검증 축은 code/businessNumber만 유지하여 UUID-only 정상 전표를 다시 잃었다.**

### 2.3 식별 불가 합계 354,121,900원과 차액 156,645,500원

무필터 집계는 slip-service를 `(partnerCode=null, partnerId=null)`로 불러 원장 포함 5상태 전체를 읽는다. 현재 기간의 code 공란 출고 전표를 같은 `lineAmount` 계산식으로 나누면 다음과 같다.

| cohort | 상태 | 전표 | 라인 | 금액 |
|---|---|---:|---:|---:|
| 발화 기준 | COMPLETED·DELIVERED·CONFIRMED | 21 | 62 | **197,476,400원** |
| 추가 유입 | INSPECTING | 5 | 12 | **87,841,600원** |
| 추가 유입 | SHIPPING | 5 | 15 | **68,803,900원** |
| 화면 식별 불가 | 위 합계 | 31 | 89 | **354,121,900원** |

따라서 차액은 추정이 아니라 다음 항등식으로 닫힌다.

```text
87,841,600 + 68,803,900 = 156,645,500
197,476,400 + 156,645,500 = 354,121,900
```

slip-service의 `PARTNER_LEDGER_SALES_STATUSES`가 `CONFIRMED, DELIVERED, COMPLETED`뿐 아니라 `SHIPPING, INSPECTING`도 포함하기 때문이다 (`SlipInternalController.java:75-81`). 10건/27라인 모두 `partnerId`는 있으나 `partnerCode/businessNumber`가 공란이다. 무필터 projection에는 UUID가 없으므로 accounting-service는 이들을 실제 master UUID에 연결할 수 없고, `applyUnfilteredLedgerSalesTotals()`가 전표번호별 `LegacyPartnerAggregate` 10개를 추가한다 (`SalesAggregateService.java:271-303`). 기존 21개와 합쳐 화면의 식별 불가 31행이 된다.

### 2.4 근본 구조

1. 집계는 journal UUID 축으로 시작한 뒤 UUID가 제거된 slip projection을 code/businessNumber 축으로 재조인한다.
2. 상세는 journal 매출을 사용하지 않고 slip projection을 별도로 읽어 같은 code/businessNumber 재검증을 한다.
3. 선택 집계는 raw 조회 존재 여부와 재검증 후 존재 여부를 서로 다른 시점에 판단해, 재검증 0건이면 journal 정상값을 0으로 덮는다.
4. 무필터 집계는 endpoint의 5상태 전체를 사용하지만 R7 발화 기준은 3상태다.

세 불일치는 하나의 버그가 아니라 **원천 집합(회계 journal vs slip), 식별 축(UUID vs code/businessNumber), 상태 집합(3상태 vs 5상태)을 경로마다 다시 조립하는 구조**에서 나온다.

## 3. 조인 키 4조합 실 건수

`slip_db.slips`의 **활성 행(`is_deleted=false`) 전체**를 read-only SQL로 집계했다. 공란 코드는 `NULLIF(BTRIM(partner_code),'') IS NULL`로 판정했다.

```sql
SELECT COUNT(*) FILTER (WHERE partner_id IS NOT NULL
                         AND NULLIF(BTRIM(partner_code),'') IS NOT NULL) AS both_present,
       COUNT(*) FILTER (WHERE partner_id IS NOT NULL
                         AND NULLIF(BTRIM(partner_code),'') IS NULL) AS id_only,
       COUNT(*) FILTER (WHERE partner_id IS NULL
                         AND NULLIF(BTRIM(partner_code),'') IS NOT NULL) AS code_only,
       COUNT(*) FILTER (WHERE partner_id IS NULL
                         AND NULLIF(BTRIM(partner_code),'') IS NULL) AS both_absent
FROM slips
WHERE is_deleted=false;
```

| 조합 | 활성 전표 수 |
|---|---:|
| partnerId 있음 & partnerCode 있음 | **319건** |
| partnerId 있음 & partnerCode 없음 | **102건** |
| partnerId 없음 & partnerCode 있음 | **3건** |
| partnerId 없음 & partnerCode 없음 | **1,931건** |
| 합계 | **2,355건** |

교차 검산: `partnerCode 없음`은 `102 + 1,931 = 2,033건`으로 사용자 제시 실측과 정확히 일치한다. soft-delete 포함 전체 2,465행은 각각 `426 / 102 / 4 / 1,933`이지만, 서비스 조회가 `isDeleted=false`를 강제하므로 진단의 권위 분모는 활성 2,355행이다.

## 4. 최소 변경 설계 제안

### 대안 A — 공통 `PartnerLedgerReadModel` 산출기 도입 (최소 변경, 권고)

accounting-service 안에 집계와 상세가 함께 호출하는 단일 read-model 산출기를 둔다. 입력은 `(from, to, optional partner selector)`, 출력은 다음처럼 한 번 해석이 끝난 불변 결과다.

```text
PartnerLedgerReadModel
  partners[]
    resolvedPartnerKey       내부 UUID 또는 UNRESOLVED 전표 key
    partnerCode/name/bizNo   화면용 snapshot
    documents[]              SALE/CASH_RECEIPT 원장 문서
    salesTotal               documents에서 계산
    paymentTotal             documents에서 계산
    receivableBalance        동일 규칙으로 계산
```

구체적 최소 변경점:

1. 내부 전용 `PartnerLedgerSalesResponse`에 `partnerId`를 포함한다. `/internal/**` 경계 안에서만 소비하고 public accounting DTO/FE에는 내보내지 않는다. 그러면 UUID-only와 code-only를 한 resolver에서 각각 `partnerId 우선, 유일한 partnerCode 보조`로 해석할 수 있다.
2. 원장 포함 상태를 한 상수/계약으로 고정한다. R7 발화 계약을 권위로 삼는다면 `COMPLETED|DELIVERED|CONFIRMED` 3상태만 canonical result에 포함한다. `INSPECTING|SHIPPING`을 포함해야 한다면 발화 기준과 화면 기대액을 함께 바꿔야 하며, 경로별로 다르게 둘 수는 없다.
3. `SalesAggregateService`는 더 이상 journal sales를 만든 뒤 slip 값으로 조건부 overwrite하지 않는다. `salesTotal`은 공통 result의 `documents` 합에서만 읽는다. 110 수금/채권 등 journal 전용 값이 필요하면 같은 result 조립 단계에서 한 번 합성한다.
4. `PartnerLedgerReadService`도 독자 `salesClient.find()`·`saleBelongsToPartner()`를 제거하고 같은 result의 선택 partner documents를 반환한다.
5. 인쇄는 현재처럼 상세 endpoint를 호출해도 계산 규칙은 공유된다. 더 강하게 같은 순간의 결과를 보장하려면 상세 화면 query cache의 data를 route state로 전달하거나 read-model revision token으로 재조회한다.

대가:

- 내부 response에 UUID 1필드가 늘지만 사용자 노출 UUID 금지 규칙은 깨지지 않는다.
- journal-only 매출을 어떻게 문서화할지 한 번 결정해야 한다. 현재 `P-2026-0005`처럼 journal 26,000,000원은 있고 slip 문서는 없는 경우, (a) 집계도 0으로 맞추거나 (b) journal을 `SALE_SUMMARY` 문서 1행으로 상세·인쇄에 포함해야 한다. **현재 R7의 26,000,000원을 정상값으로 유지하려면 (b)가 필요**하다.
- 무필터 bulk 결과를 한 번 조립해야 하므로 현재 서비스 분리는 손대지만 DB migration은 필요 없다.

권고 세부안은 **A + journal-only `SALE_SUMMARY` 문서**다. 기존 정상 집계액을 보존하면서 상세·인쇄도 같은 26/20/23백만원을 보여 줄 수 있고, 실제 품목이 없는 journal-only 금액을 품목처럼 위장하지도 않는다.

### 대안 B — accounting journal을 유일 정본으로 전환

401/110 journal line과 cash receipt만으로 aggregate/detail/print를 모두 만든다. 기존 `JournalLineRepository` query를 partner별 문서 projection으로 확장하고 slip-service는 배송주소/품목의 optional enrichment로만 사용한다.

대가:

- 상단 26/20/23백만원은 즉시 세 표면에서 일치한다.
- 현재 accounting `source_ref_id`와 slip UUID의 교집합이 0인 seed 구조 때문에 품목명·배송주소·전표 원문을 결합할 수 없다. 상세·인쇄의 품목형 원장 요구를 후퇴시키거나 별도 reconciliation이 필요하다.
- 고아 journal 30건과 slip-only 31건을 어떤 원천으로 표시할지 정책 결정이 필요하다.

### 대안 C — slip 문서를 유일 정본으로 전환

공통 result를 slip `documents`에서만 만들고 집계 sales도 그 합으로 계산한다. journal은 수금/채권 보조에만 쓴다.

대가:

- 코드가 가장 단순하고 상세 합 = 인쇄 합 = 집계 합이 구조적으로 보장된다.
- slip이 없는 `P-2026-0005`의 journal 26,000,000원 및 유사 고아 회계 매출이 집계에서 사라진다. 현재 정상값 기대와 충돌하므로 데이터 reconciliation/backfill 전에는 채택하기 어렵다.

### 대안 D — 영속 reconciliation projection 구축 (장기 정답)

`slip UUID ↔ journal source_ref_id ↔ partner UUID/code snapshot`을 보존하는 원장 read-model 테이블 또는 이벤트 projection을 만들고, 세 표면이 그 projection만 읽게 한다.

대가:

- 두 DB의 현재 교집합 0, UUID-only/code-only 양방향 legacy를 명시적으로 감사·보정할 수 있는 가장 강한 설계다.
- migration, backfill, 불일치 격리 정책, 이벤트 재처리/일관성 운영이 필요해 이번 PR의 최소 변경 범위를 넘는다.

### 제안 결론

이번 PR에서는 대안 A로 계산·식별·상태 계약을 한 곳에 모으고, `journal-only`는 명시적 summary document로 표현하는 것이 최소 위험이다. 대안 D는 후속 독립 슬라이스로 분리한다. 핵심 acceptance criterion은 다음 하나로 고정한다.

```text
각 partner의 aggregate.salesTotal
= detail.documents 중 매출 금액 합
= print가 같은 documents에서 표시하는 매출 합
```

## 5. 새 파일 목록

- `docs/dev-reports/2026-08-04-1001-r17-structural-diagnosis.md`

제품 코드·테스트·DB 데이터 파일은 생성하거나 수정하지 않았다.

## 6. 진단 중 수행한 검증

- `git pull`: `Already up to date.`
- `slip_db`, `partner_db`, `accounting_db`: `docker exec ... psql ... SELECT`만 수행했다. INSERT/UPDATE/DELETE/DDL 없음.
- Docker build/up/restart 없음. 서비스 프로세스 변경 없음.
- 전체 Playwright/Gradle suite 미실행.
