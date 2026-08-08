# 이슈 #1142 B 범위 경계 조사

- 조사일: 2026-08-08
- 조사 방식: 정적 코드 조회만 수행. 애플리케이션·Docker·DB·외부 API를 실행하지 않음.
- 대상 전이: `accept` · `inspect` · `complete` · `ship` · `deliver` · `confirm` · `cancel` · `reject`

## 한 문장 결론

**전표에서 파생되는 회계·세금계산서는 CONFIRMED 이전에 생기지 않고, CONFIRMED에서만 생긴다.** 정확히는 `confirm()` 자체도 회계를 만들지 않으며, `CONFIRMED` 전표만 별도 accounting-service 명령의 원천이 될 수 있다.

수동 세금계산서 `DRAFT` 생성은 전표와 무관한 독립 경로이므로 어느 전표 상태에도 종속되지 않는다(`TaxInvoiceService.java:94-111`). 위 결론은 이슈 #1142가 다루는 **해당 전표에서 파생된** 회계 문서에 관한 결론이다.

## 1. 전이별 부수 효과

상태명의 실제 의미에 주의해야 한다. 현 코드의 `complete()`는 `PROCESSING → INSPECTING`이면서 재고를 반영하고, `inspect()`는 `INSPECTING → COMPLETED`이다(`Slip.java:1163-1195`).

| 전이 | 재고 | 회계 | 세금계산서 | 알림·외부 | 파일:줄 |
|---|---|---|---|---|---|
| `accept` (`SENT→ACCEPTED`) | **OUTBOUND만 예약.** batch 품목은 `available→reserved`, serial 품목은 FIFO `AVAILABLE→RESERVED`. 혼합 라인 중간 실패 시 이미 성공한 예약을 역순 release한다. | 없음 | 없음 | 알림 없음. 상태 변경 전에 auth-service 결재선 **인가 조회** 1회. | `SlipService.java:925-960` (`inventoryClient.reserve*`, 보상 목록); `StockService.java:223-270` (batch 예약); `StockInstanceService.java:139-180` (serial 예약); `ApprovalLineAuthorizeClient.java:66-83` (`/auth/internal/approval-line/authorize`) |
| `inspect` (`INSPECTING→COMPLETED`) | 없음. 코드 원문: `재고 영향 없음 — OUTBOUND 의 deduct 는 complete 시점` | 없음 | 없음 | 알림 없음. auth-service 결재선 인가 조회. 로컬에는 검수자·검수시각·완료시각과 revision/redline 기준값을 기록. | `SlipService.java:978-1001`; `Slip.java:1177-1195`; `SlipService.java:1076-1106` |
| `complete` (`PROCESSING→INSPECTING`) | **CONFIRMED 전 핵심 부수 효과.** OUTBOUND batch=`deduct(fromReservation=true)`, serial=`RESERVED→SHIPPED`. 일반 INBOUND batch=lot 생성+balance 가산+INBOUND movement, serial=인스턴스 생성. 반품·회차 serial=`SHIPPED→RECALLED`, batch=일반 lot 입고. | 없음 | 없음 | inventory-service 동기 REST 호출 외 알림·SMS·이카운트·노션 호출 없음. | `SlipService.java:1125-1195`; `SlipService.java:1206-1254`; `StockService.java:175-219,315-368`; `StockInstanceService.java:95-137,183-207,229-268` |
| `ship` (`COMPLETED→SHIPPING`, OUTBOUND) | 없음. 재고 출고는 이미 `complete`에서 끝남. | 없음 | 없음 | 없음 | `SlipService.java:1374-1384`; `Slip.java:1198-1211` |
| `deliver` (`SHIPPING→DELIVERED`, OUTBOUND) | 없음 | 없음 | 없음 | 없음 | `SlipService.java:1386-1396`; `Slip.java:1213-1226` |
| `confirm` (OUTBOUND `DELIVERED→CONFIRMED`, INBOUND `COMPLETED→CONFIRMED`) | 없음 | **직접 생성 없음.** 상태와 `confirmedAt`만 기록. 다만 이후 별도 accounting-service 명령이 매출·매입전표 `DRAFT`를 만들 수 있는 원천 자격이 생김. | **직접 생성/후보등록/배치 없음.** 이후 `POSTED` 매출전표가 별도 후보 조회·묶음 발행 대상이 됨. | 없음 | `SlipService.java:1398-1403`; `Slip.java:1228-1242`; `SalesAccountingSlipCreateAttemptService.java:118-147`; `PurchaseAccountingSlipCreateAttemptService.java:113-142`; `SalesAccountingSlipRepository.java:65-77` |
| `cancel` (`DRAFT/SAVED/SENT→CANCELED`) | 정상 허용 상태에는 예약이 없으므로 없음. 서비스에 `previous==ACCEPTED` release 분기가 있으나 도메인이 ACCEPTED cancel을 먼저 거부하여 **도달 불가**. `PARTNER_ORDER` 원천은 상태와 무관하게 금지. | 없음 | 없음 | 없음 | `Slip.java:1272-1297`; `SlipService.java:1450-1481` |
| `reject` (`SENT/ACCEPTED/INSPECTING→REJECTED`) | `ACCEPTED` OUTBOUND만 batch/serial 예약 해제. `SENT`는 없음. **INSPECTING은 이미 complete 재고 반영 뒤인데 재고 복구가 전혀 없다.** | 없음 | 없음 | 알림 없음. 사유가 있으면 memo 변경과 로컬 EDIT revision 기록. | `Slip.java:1244-1269`; `SlipService.java:1418-1447` |

### 경계 판정

- `CONFIRMED` 이전 B에 확실히 포함되는 부수 효과는 `accept`의 **출고 예약**과 `complete`의 **출고 차감·serial 출고·입고·회수**다.
- 회계 문서 생성은 `CONFIRMED` 이전에는 거부된다. 매출은 `SalesAccountingSlipCreateAttemptService.java:129-132`, 매입은 `PurchaseAccountingSlipCreateAttemptService.java:124-127`에서 원천 상태가 `CONFIRMED`가 아니면 예외를 던진다.
- `confirm()`은 accounting-service를 호출하지 않는다(`SlipService.java:1398-1403`). 회계는 확정 뒤 사용자가 별도 생성·반영 명령을 실행할 때 생긴다.
- lifecycle 메서드 본문에는 SMS, Notion, 이카운트 호출이 없다. e-Count API는 제거됐다는 엔티티 원문이 있다: `Slip.java:443-446` — `e-Count API 호출은 완전 제거 (사용자 결정)`.

## 2. 역연산 가용성

### 2.1 재고

| 정방향 효과 | 역연산 API | 두 번 되돌릴 때 | 부분 실패 보상 | 소관 |
|---|---|---|---|---|
| batch 예약 `POST /inventory/reserve` | **있음**: `POST /inventory/release` (`InventoryClient.java:92-95`, `StockController.java:242`) | **멱등하지 않다.** release는 과거 RESERVE movement의 “존재”만 검사하고(`StockService.java:286-300`) RELEASE 완료 여부는 검사하지 않는다. RESERVE movement는 남으므로 두 번째 호출도 `balance.release()`를 실행해 예약 부족 409 또는 잘못된 추가 해제를 낼 수 있다(`StockService.java:303-312`). | `accept` 중간 실패 시 역순 release (`SlipService.java:934-960`). release 보상 자체 실패는 audit에 남기지만 수량형 `RELEASE`는 저장 식별자 부족으로 자동 재시도 대상이 아님(코드 결정 기록 `DECISIONS.md:D-SER-27`). | inventory-service |
| serial 예약 `reserve-batch` | **있음**: `release-batch` (`InventoryClient.java:231-235`, `StockInstanceController.java:173`) | **멱등**. 두 번째 호출은 RESERVED 후보가 없어 빈 결과로 끝남(`StockInstanceService.java:217-226`). | `accept` 중간 실패 시 역순 release. 실패 audit 및 serial 보상 재시도 경로가 있음(`SlipService.java:946-960`). | inventory-service |
| batch 출고 차감 `deduct` | **없음.** inventory controller/service에 deduct 반대 API가 없다. | 해당 없음 | **없음.** OUTBOUND `complete` 루프에는 try/compensation이 없어 앞 라인 성공 후 뒤 라인 실패 시 원격 차감이 남을 수 있다(`SlipService.java:1144-1158`). | inventory-service |
| serial 출고 `ship-batch` (`RESERVED→SHIPPED`) | **없음.** `release-batch`는 RESERVED만 대상으로 하므로 SHIPPED를 되돌리지 못한다(`StockInstanceService.java:193-226`). | 해당 없음 | **없음.** OUTBOUND `complete`에 보상 루프 없음. 정방향 재호출 자체는 RESERVED가 없으면 기존 SHIPPED 목록을 반환하므로 사실상 멱등(`StockInstanceService.java:193-207`). | inventory-service |
| batch 입고 `lots/inbound` | **없음.** lot/balance/movement를 반대로 되돌리는 endpoint 없음. 코드에도 `batch inbound 는 현재 inverse API 가 없`다고 명시(`SlipService.java:1244-1245`). | 역연산 없음. 정방향은 동일 `lotNo`(+ 저장 라인은 `inboundLineId`) lot가 있으면 no-op이라 멱등(`StockService.java:194-204`). | **없음.** 일반 INBOUND complete에는 보상 루프가 없고, 회수 혼합전표에서도 batch 입고가 여러 줄이면 앞 batch 성공·뒤 batch 실패를 되돌리지 못함. | inventory-service |
| serial 일반 입고 `instances/batch` | **없음.** 생성 인스턴스 삭제/입고취소 API 없음. | 역연산 없음. 정방향은 `(inboundSlipNo, productId)` 기존 개수를 세어 부족분만 생성하므로 멱등(`StockInstanceService.java:118-136`). | **없음.** 일반 INBOUND complete에 보상 루프 없음. | inventory-service |
| serial 회수 `recall-batch` (`SHIPPED→RECALLED`) | **있음**: `unrecall-batch` (`InventoryClient.java:257-269`, `StockInstanceController.java:217`) | **멱등**. 두 번째 호출은 RECALLED 후보가 없어 빈 결과(`StockInstanceService.java:341-349`). | **부분적으로 있음.** serial 회수 뒤 batch 입고 실패 시 serial만 역순 unrecall. 보상 실패 audit/자동 재시도 가능. batch 입고 자체는 보상 불가(`SlipService.java:1229-1254`). | inventory-service |

앞선 조사에서 말한 “대응 역연산이 없는 일부 재고 API”는 정확히 **`deduct`, `ship-batch`, `lots/inbound`, `instances/batch`** 네 종류다. `recall-batch`에는 `unrecall-batch`가 있고, 예약에는 release 계열이 있다. 단 batch 수량 `release`는 역연산이 존재해도 반복 호출 멱등은 아니다.

### 2.2 회계·세금계산서

| 대상 | 역연산/취소 수단 | 멱등성·부분 실패 | 소관 |
|---|---|---|---|
| 매출·매입전표 `DRAFT/POSTED` | 엔티티에 `voidSlip()`은 있으나(`SalesAccountingSlip.java:126-129`, `PurchaseAccountingSlip.java:125-128`) main service/controller에서 호출하는 API가 없다. 즉 **운영 역연산 API 없음**. | `voidSlip()` 자체는 이미 VOIDED면 return이라 멱등이지만 노출 경로가 없다. 원천 slip 되돌림과 자동 연계도 없다. | accounting-service |
| 세금계산서 `ISSUED` + 표준 발행 자동분개 | **있음**: `POST /admin/tax-invoices/{id}/cancel` (`TaxInvoiceController.java:149-156`). `CANCELLED` 전이 후 원분개를 차/대 swap한 새 POSTED 역분개로 만들고 연결(`TaxInvoiceService.java:349-357`, `JournalService.java:220-254`). | 두 번째 취소는 ISSUED가 아니므로 409, 즉 요청 관점에서 멱등하지 않다(`TaxInvoice.java:507-523`). 서비스가 단일 accounting 트랜잭션이며 역분개 실패/마감 차단 시 세금계산서 상태도 롤백된다고 명시(`TaxInvoiceService.java:331-341`). | accounting-service |
| 매출전표 묶음 세금계산서 | 별도 생성 경로가 `TaxInvoice.issue()`를 직접 호출해 ISSUED로 만들고 매출전표에 링크한다(`TaxInvoiceBatchFromSalesSlipsService.java:96-123`). 이후 위 cancel API는 사용할 수 있다. | 이 묶음 경로는 `TaxInvoiceService.issue()`를 거치지 않아 발행 시 자동 Journal 생성 코드가 호출되지 않는다. 이 경로의 `journalId`가 null이면 cancel은 상태만 CANCELLED로 바꾸고 역분개는 만들지 않는다(`TaxInvoiceService.java:352-355`). | accounting-service |

## 3. 품목·금액 수정 가능 여부

### 현재 가능한 흐름

- 매출·매입 direct PUT은 헤더와 라인을 통째로 교체하여 품목·수량·단가·공급가액 등을 바꿀 수 있다(`SalesSlipUpdateService.java:78-138`, `SlipUpdateService.java:72-135`).
- 그러나 실제 도메인 수정 가드는 공통 `EDITABLE_STATUSES = DRAFT, SAVED`뿐이다(`Slip.java:63-64`, `Slip.java:1859-1875`). 매출은 `updateSalesHeader`와 `replaceSalesLines`가 `requireEditable()`을 호출한다(`Slip.java:828-899`); 매입의 `updateHeader/replaceLines`도 같은 가드를 사용한다(`Slip.java:777-816`).
- 따라서 임의 이전 단계 되돌림의 목표가 `SENT`, `ACCEPTED`, `PROCESSING`, `INSPECTING`, `COMPLETED`이면 **direct PUT으로 품목·금액 수정은 막힌다**. `DRAFT` 또는 `SAVED`까지 되돌려야 현재 direct PUT 경로가 열린다.
- 별도 콘텐츠 revision 복원은 상태를 복원하지 않는다. 현재 상태 잠금 정책을 통과한 뒤 헤더·라인 내용만 덮는다(`SlipService.java:672-718`; 기존 feasibility 보고서의 `Slip.java:2207-2209`). 이것은 “상태 되돌림 후 일반 수정”과 다른 경로다.

### 판정

“되돌린 뒤 품목·금액을 수정하고 다시 진행”은 **DRAFT/SAVED로 되돌린 경우에만 현 direct PUT 코드와 맞는다.** B가 `SENT` 이후 임의 상태까지만 허용하는 뜻이면 현 수정 경로로는 목적을 달성하지 못한다. 또한 DRAFT/SAVED로 되돌리는 상태 API 자체는 아직 없다.

품목 변경 뒤 재진행할 때는 과거 재고 부수 효과를 먼저 정확히 역산해야 한다. 상태만 DRAFT/SAVED로 바꾸고 기존 예약·차감·입고를 남기면 새 라인으로 재진행되어 이중 반영될 수 있다는 사실까지는 코드 호출 구조로 확정된다.

## 4. 세금계산서

### 언제 생기는가

1. 전표 `confirm()`은 세금계산서를 만들지 않는다(`SlipService.java:1398-1403`).
2. `CONFIRMED` 원천 라인으로 별도 매출전표 `DRAFT`를 생성한다. 비확정 원천은 거부한다(`SalesAccountingSlipCreateAttemptService.java:118-147`).
3. 매출전표를 별도 `post`하여 `POSTED`로 만든다(`SalesAccountingSlipService.java:71-82`).
4. 후보 조회는 `POSTED AND taxInvoiceId IS NULL`만 고른다(`SalesAccountingSlipRepository.java:65-77`). 후보 조회 자체는 등록 entity를 만들지 않는다.
5. 별도 묶음 발행 POST가 세금계산서를 생성·즉시 `ISSUED`로 만들고 원 매출전표들을 링크한다(`TaxInvoiceBatchFromSalesSlipsService.java:73-123`).

독립 수동 경로는 전표와 무관하게 DRAFT를 만들 수 있고(`TaxInvoiceService.java:94-111`), 표준 `issue()`에서 ISSUED+자동분개가 생긴다(`TaxInvoiceService.java:223-265`).

### 발행 뒤 정정·취소

- DRAFT는 `update()`로 헤더·라인 교체 가능하다(`TaxInvoiceService.java:114-180`).
- ISSUED는 직접 수정하지 않고 cancel endpoint로 `CANCELLED` 처리하며, 표준 발행에서 연결된 원분개가 있으면 자동 역분개한다(`TaxInvoiceService.java:331-357`).
- “수정세금계산서/정정발행”이라는 별도 도메인·endpoint는 코드 검색에서 찾지 못했다. 취소 후 새 계산서를 다시 만드는 업무 연결, 원 계산서 참조번호, 수정 사유 유형 계약도 찾지 못했다.
- 원천 slip 또는 매출·매입전표를 되돌릴 때 이미 발행된 세금계산서를 자동 조회·취소·unlink하는 호출은 slip-service에 없다. accounting-service에도 원천 slip 상태 변경 이벤트를 소비하는 코드가 없다.

따라서 **전표를 되돌리면 이미 발행된 계산서를 어떻게 할지에 관한 방침은 코드에 없다.** 계산서 cancel 수단은 존재하지만 전표 되돌림과 자동 결합되어 있지 않다.

## 5. 사실로부터 남는 범위 선택지

설계 제안이 아니라 현재 코드 경계만 적는다.

- B가 `CONFIRMED` 이전 상태들만을 뜻하면: 재고 예약·차감·입고·회수는 포함하지만, 해당 전표에서 파생된 회계·세금계산서는 포함하지 않는다.
- 개발책임자의 “회계·계산서도 손대야 한다”는 이유까지 범위에 포함하려면: 코드상 `CONFIRMED` 이후 파생 문서 존재 여부를 다루는 범위다. 이는 최초 A/B/C 분류의 C 경계에 해당한다.
- 단, 수동 세금계산서는 원천 전표 연결이 필수가 아니어서 slip만으로 연관 여부를 확정할 수 없다.

## 6. 확정하지 못한 것

1. 개발책임자가 “B”라고 한 표현을 우선할지, “회계·계산서도 손댄다”는 이유를 우선하여 C 경계까지 의도한 것인지 **코드로는 모른다**. 개발책임자 범위 확인이 필요하다.
2. `CONFIRMED` 전표를 되돌릴 때 기존 매출·매입전표, POSTED 여부, 세금계산서 링크를 차단/취소/유지 중 무엇으로 처리할지 **방침이 코드에 없다**.
3. 묶음 세금계산서 경로가 표준 `TaxInvoiceService.issue()`를 우회하여 자동분개를 만들지 않는 것이 의도인지 결함인지 **모른다**. 해당 기능 결정 문서와 운영 데이터의 `journal_id`를 조회해야 하지만 이번 라운드는 DB 조회도 수행하지 않았다.
4. 독립 수동 세금계산서와 특정 slip의 업무상 연관 관계는 명시적 `sourceSlipId` 계약이 없어 **모른다**. 운영자가 memo/번호로 수동 연결하는지 업무 규정 확인이 필요하다.
5. `INSPECTING→REJECTED`가 complete 재고를 복구하지 않는 현 동작이 의도인지 결함인지 **모른다**.
6. batch `release`의 두 번째 호출이 실제 운영 데이터에서 항상 409인지, 다른 예약과 섞이면 잘못된 수량을 해제할 수 있는지는 동시 상태에 따라 달라 정적 코드만으로 단일 결과를 확정할 수 없다. 다만 RELEASE 완료 여부를 검사하지 않아 멱등하지 않다는 것은 확정된다.
7. 외부에서 이미 발송된 SMS·노션 메시지와 전표 전이의 간접 연계가 별도 운영 자동화에 있는지는 이 저장소 코드만으로 **모른다**. 저장소 내 lifecycle 메서드에는 호출이 없다.

## 7. 신규 파일

- `docs/dev-reports/2026-08-08-1142-scope-b-boundary.md`

이번 조사에서 위 보고서 외 신규 파일은 만들지 않았고 기존 파일은 수정하지 않았다.
