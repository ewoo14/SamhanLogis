# #1144 생성 orchestration·삭제/재생성 수명주기 정찰

> 조사일: 2026-08-14 KST  
> 역할: SOL 정찰자  
> 범위: `feat/1144-accounting-orchestration` 워크트리의 현재 소스, 이슈 #1144/#1142, 결정 문서 Q1~Q7  
> 준수: 코드 수정·Git 명령·재배포·컨테이너 조작·DB 쓰기 없음. 이미 닫힌 V101/활성 373행/미매핑 0/legacy 19건 409는 재조사하지 않았다. 이번 판정에는 DB 조회가 필요하지 않아 DB에도 접속하지 않았다.

## 즉시 결론

1. 명세상 생성 표면은 3개지만 **현재 실제 생성 표면은 외부 작성 화면 1개뿐**이다. 전표 상세와 일마감 생성은 없다. 판매/구매 방향별 단건 POST만 존재하며, 외부 화면의 복수 선택은 `N건 → N건`이 아니라 여러 allocation을 **회계전표 1건·라인 1개로 합친다**.
2. Q1 bulk 명령과 bulk 트랜잭션은 없다. 현재 단건 생성은 `REQUIRES_NEW`이므로 N번 호출하면 각 호출이 따로 커밋되어 **부분 성공이 가능**하다. 항목별 성공/실패 응답도 없다.
3. `VOIDED` enum과 `voidSlip()`은 이미 있으므로 새 상태를 만들 필요는 없다. 그러나 호출자가 없고, DELETE/VOID/unlink API도 없다. 현재 사용자는 회계전표를 삭제·재생성할 수 없다.
4. Q5 마감 게이트 코드는 추가됐지만 서버가 계산한 검증 상태를 읽지 않는다. UI가 보내지 않는 `amountVerified` Boolean을 신뢰하므로, 현 UI의 금액 있는 마감은 `null → false`로 409가 된다. 회계전표 생성 경로는 Q5를 전혀 보지 않는다.
5. 6개 계정 코드의 런타임 집계 사용처는 `CashFlowStatementService`, `FundsStatusService`, `AccountStatementService`가 전부다. 다만 중앙 `AccountEcountMapping`에도 6개가 없고, V1 과거 seed에는 옛 코드가 남아 있다.

가장 큰 결함은 **공통 판정과 실제 쓰기 경로가 서로 다른 답을 내는 것**이다. 부분 배분된 원천에 대해 read model eligibility는 `ALREADY_ALLOCATED`로 차단하지만 실제 create-attempt는 잔여 범위의 추가 배분을 허용한다. 구매 화면은 차단 문구를 보여 주면서도 저장을 실행할 수 있고, 판매 화면은 판정조차 조회하지 않는다.

---

## ① 생성 경로가 지금 몇 개이고 무엇이 다른가

### ①-1. 구현 표면 수

| 명세 경로 | 현재 상태 | 실제 호출/결과 | 근거 |
|---|---|---|---|
| 전표 상세에서 1건 생성 | **없음** | `SlipDetailPage`에서 회계전표 생성 API를 호출하지 않고, 회계 서비스 Controller도 목록·단건 생성·전기만 제공한다. | `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:1`; `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/SalesAccountingSlipController.java:24`; 같은 파일`:36`; 같은 파일`:52`; `PurchaseAccountingSlipController.java:24`; 같은 파일`:36`; 같은 파일`:52` |
| 외부 일괄 생성 | **부분 존재 — 실제로는 단건 합산 생성** | 화면에서 여러 원천 allocation을 고르지만 합산 수량과 반올림 평균단가로 라인 1개를 만들고 POST 1회 한다. 결과는 회계전표 1건이다. | `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipFormPage.tsx:42`; 같은 파일`:47`; 같은 파일`:51`; 같은 파일`:71`; 같은 파일`:78`; 같은 파일`:95`; 구매 동형 `PurchaseAccountingSlipFormPage.tsx:44`; 같은 파일`:49`; 같은 파일`:53`; 같은 파일`:81`; 같은 파일`:88`; 같은 파일`:105` |
| 일마감에서 생성 | **없음** | 일마감은 세금계산서 또는 이미 POSTED인 회계전표를 집계해 snapshot을 잠글 뿐, 원 판매/구매전표에서 회계전표를 만들지 않는다. | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DailyClosingService.java:133`; 같은 파일`:135`; 같은 파일`:148`; 같은 파일`:166`; 같은 파일`:342`; 같은 파일`:354` |

판정: 의도된 3경로 중 완성된 것은 0개다. 생성 가능한 UI 표면은 외부 작성 1종뿐이고, 그것도 Q1의 `N건 → N건`이 아니다. 방향별 서버 endpoint는 매출/매입 2개지만 둘 다 같은 단건 계약이다 (`SalesAccountingSlipController.java:36`, `PurchaseAccountingSlipController.java:36`).

### ①-2. VAT·거래처·과배분 대조

| 항목 | 전표 상세 | 외부 작성(현행 유일 생성) | 일마감 | 판정 |
|---|---|---|---|---|
| VAT | 경로 없음 | FE가 `합계 allocation 금액 ÷ 합계 수량`을 `Math.round`한 합성 단가를 만들고, BE가 `qty × unitPrice`를 VAT 포함액으로 보아 과세면 `1.1` 분리한다. 영세/면세는 VAT 0이다. | 생성 경로 없음. 기존 세금계산서/POSTED 회계전표에 저장된 공급가·VAT·합계를 합산한다. | 원천별 금액을 N건으로 보존하지 않는다. 나누어떨어지지 않는 합계는 합성 단가 반올림 때문에 `qty×unitPrice != allocation 합계`가 되어 서버에서 라인-배분 불일치로 실패할 수 있다. 근거: `SalesAccountingSlipFormPage.tsx:47-58`, `:78-94`; `VatCalculator.java:24-32`; `SalesAccountingSlip.java:95-112`; 구매 동형 `PurchaseAccountingSlip.java:94-111`. |
| 거래처 | 경로 없음 | FE는 선택 원천의 거래처 정보 누락/혼합을 막고 첫 원천 거래처를 요청에 넣는다. BE는 요청의 partnerCode/name을 신뢰하지 않고 원천 snapshot의 거래처를 헤더에 복사하며, 모든 원천 partnerId 일치를 다시 검사한다. | 생성 경로 없음. 마감 필터 거래처만 lookup한다. | 현행 외부 경로의 거래처 정본은 BE 원천 snapshot이다. 근거: `SlipLineAllocationEditor.tsx:61-91`; `SalesAccountingSlipCreateAttemptService.java:82-84`, `:118-147`; 구매 동형 `PurchaseAccountingSlipCreateAttemptService.java:81-83`, `:113-142`; `DailyClosingService.java:119-130`. |
| 과배분 | 경로 없음 | FE 표시는 전체 원천금액 합계 대비 전체 배분 합계만 비교한다. BE는 sourceLine별 advisory transaction lock을 잡고 기존 활성 allocation + 현재 요청 누계를 차감해 금액·수량을 각각 검사한다. | 생성 경로 없음 | FE 총합 검사는 한 원천 과배분과 다른 원천 미배분이 상쇄될 수 있다. 최종 정합성은 BE sourceLine별 검사에만 있다. 근거: `SlipLineAllocationEditor.tsx:164-170`, `:225-254`; `SalesAccountingSlipCreateAttemptService.java:62-76`, `:145-174`, `:177-180`; `SalesAccountingSlipAllocationRepository.java:29-47`; 구매 동형 `PurchaseAccountingSlipCreateAttemptService.java:61-75`, `:140-169`, `:172-175`. |

### ①-3. `#1213` read model을 누가 쓰는가

| 소비자 | 조회 | 실제 쓰기 차단 | 현행 문제 | 근거 |
|---|---:|---:|---|---|
| 구매 회계전표 작성 화면 | O | **X** | eligibility를 조회해 문구만 표시한다. 저장 버튼 disabled 조건에는 eligibility가 없고 `handleSubmit`도 이를 검사하지 않는다. 기본 `dailyAmountVerified=false`라 금액 검증 사유까지 항상 섞인다. | `PurchaseAccountingSlipFormPage.tsx:62-68`, `:78-106`, `:172-193`; `accountingSlipLinkApi.ts:30-37`; `AccountingSlipEligibility.java:45-51` |
| 구매 회계전표 목록 | O | **X** | 이미 생성된 전표의 원천을 다시 판정해 “생성 차단/가능”을 표시할 뿐, 전기 mutation은 별도다. | `PurchaseAccountingSlipPage.tsx:53-65`, `:74-94`, `:124-130` |
| 판매 작성/목록 | **X** | X | read model API import·호출이 없다. | `SalesAccountingSlipFormPage.tsx:1-20`; `SalesAccountingSlipPage.tsx:1-14`, `:41-57` |
| 매출/매입 create-attempt 서비스 | **X** | **X** | read model/eligibility를 주입하지 않고 자체 partner/status/잔여 검사를 다시 수행한다. | `SalesAccountingSlipCreateAttemptService.java:30-42`, `:118-174`; `PurchaseAccountingSlipCreateAttemptService.java:30-42`, `:113-169` |
| 전표 상세 | X | X | 생성 경로 자체가 없다. | `SlipDetailPage.tsx:1` |
| 일마감 | X | X | 공통 link read model이 아니라 기존 저장 합계만 집계한다. | `DailyClosingService.java:133-145`, `:342-363` |

#### 같은 입력에 다른 답을 내는 확정 결함

| 입력 상태 | `#1213` eligibility 답 | 실제 생성 답 | 근거 |
|---|---|---|---|
| 원천 전표가 일부만 allocation되어 연결 회계전표가 있고 잔여 금액/수량도 있음 | linked slip이 하나라도 있으면 `ALREADY_ALLOCATED` → 차단 | 기존 allocation을 뺀 잔여 이내면 추가 생성 허용 | `AccountingSlipEligibility.java:52-59`; `AccountingSlipLinkReadModelService.java:53-82`; `SalesAccountingSlipCreateAttemptService.java:145-174`; 구매 동형 `PurchaseAccountingSlipCreateAttemptService.java:140-169` |
| 구매 작성 화면에서 eligibility 차단 | “생성 차단” 문구 표시 | 버튼은 활성일 수 있고 POST 실행 가능 | `PurchaseAccountingSlipFormPage.tsx:172-193`; 같은 파일`:78-106` |
| 같은 판매 원천 | 판정 조회 자체 없음 | create-attempt 자체 규칙으로 POST | `SalesAccountingSlipFormPage.tsx:1-20`; `SalesAccountingSlipCreateAttemptService.java:38-42` |

이 분열이 이번 트랙의 우선 결함이다. 새 orchestration이 단순히 기존 create-attempt를 감싸기만 하면 `#1213`의 정책 정본을 여전히 우회한다.

---

## ② Q1 원자성이 지금 어디까지 되는가

| 질문 | 현행 판정 | 근거 |
|---|---|---|
| 실제 bulk endpoint/명령이 있는가 | **없음.** 생성 endpoint는 매출/매입 각각 단건 POST 하나다. | `SalesAccountingSlipController.java:36-42`; `PurchaseAccountingSlipController.java:36-42`; `salesAccountingSlipApi.ts:218-225`; `purchaseAccountingSlipApi.ts:206-213` |
| 현재 외부 화면이 N건을 만드는가 | **아니오.** N allocation을 라인 1개·회계전표 1건으로 합쳐 POST 1회 한다. | `SalesAccountingSlipFormPage.tsx:42-58`, `:71-95`; 구매 동형 `PurchaseAccountingSlipFormPage.tsx:44-60`, `:81-105` |
| 단건 트랜잭션 경계 | create-attempt 1회가 `REQUIRES_NEW`다. 번호 충돌 retry도 새 transaction으로 다시 시도한다. | `SalesAccountingSlipCreateAttemptService.java:38-41`; `SalesAccountingSlipService.java:49-62`; 구매 동형 `PurchaseAccountingSlipCreateAttemptService.java:38-41`; `PurchaseAccountingSlipService.java:49-62` |
| 클라이언트가 현 endpoint를 N회 호출하면 | **부분 성공 가능.** 각 호출이 독립 `REQUIRES_NEW`이므로 앞 호출 커밋 후 뒤 호출 실패를 한 transaction으로 되돌릴 상위 bulk 경계가 없다. | 위 트랜잭션 근거 + 단건 endpoint 근거 |
| 한 단건 요청 내부의 원자성 | 헤더·라인·allocation 저장은 한 create-attempt transaction 안에서 전부 성공/롤백된다. | `SalesAccountingSlipCreateAttemptService.java:38-41`, `:86-115`; 구매 동형 `PurchaseAccountingSlipCreateAttemptService.java:38-41`, `:85-110` |
| 실패 시 사용자가 무엇이 됐는지 아는가 | 현 화면은 한 요청뿐이라 “저장 실패” 일반 문구만 보인다. 서버의 전표별 성공/실패 목록, 실패한 원천 전표번호, rollback 여부를 보여 주는 bulk 결과 계약은 없다. N회 호출 구현 시 앞서 성공한 항목을 이 화면에서 알 방법이 없다. | `SalesAccountingSlipFormPage.tsx:170-174`; `PurchaseAccountingSlipFormPage.tsx:180-184`; API 응답이 단일 `SalesAccountingSlipResponse`/`PurchaseAccountingSlipResponse`: `salesAccountingSlipApi.ts:218-225`, `purchaseAccountingSlipApi.ts:206-213` |

판정: **Q1은 미구현**이다. 지금은 “N건 전부 성공/실패”가 아니라 “회계전표 1건 transaction”만 보장한다. 현 endpoint를 반복 호출하는 순간 부분 성공을 허용한다.

미결: Q1 실패 응답이 전체 rollback 후에도 각 원천별 검증 사유를 모두 반환할지, 첫 실패만 반환할지 결정 문서에 없다. 사용자가 무엇을 고쳐야 하는지 알 수 있게 하려면 이 계약을 정해야 한다.

---

## ③ 삭제/재생성 수명주기의 현재 상태

| 항목 | 현재 상태 | 근거 |
|---|---|---|
| 사용자 삭제/VOID 경로 | **없음.** 두 Controller는 GET/POST create/POST post만 있고 DELETE/PATCH VOID가 없다. | `SalesAccountingSlipController.java:24-58`; `PurchaseAccountingSlipController.java:24-58` |
| `VOIDED` 존재 여부 | **이미 존재. 새로 만들 필요 없음.** 매출/매입 enum 모두 `DRAFT/POSTED/VOIDED`다. | `SalesSlipStatus.java:3-9`; `PurchaseSlipStatus.java:3-9` |
| `voidSlip()` 구현 | 두 엔티티에 있으나 production 호출자 0이다. 현재 구현은 POSTED만 허용하지 않고 DRAFT도 바로 VOIDED로 바꿀 수 있으며 actor audit도 기록하지 않는다. | `SalesAccountingSlip.java:126-129`; `PurchaseAccountingSlip.java:125-128`; production 전수 검색 결과 호출자 없음 |
| DRAFT soft-delete | 엔티티는 `BaseEntity`와 `@SQLRestriction(is_deleted=false)`를 갖지만, 회계전표에 `markDeleted()`를 호출하는 service/API가 없다. | `SalesAccountingSlip.java:24-29`; `PurchaseAccountingSlip.java:24-29`; 두 Controller 전체 |
| hard delete | **현재 도달 가능한 회계전표 삭제 경로에는 hard delete가 없다.** 정확히는 삭제 경로 자체가 없다. V102 보정/재발방지는 `UPDATE ... is_deleted=true`만 사용한다. | `V102__quarantine_orphan_accounting_allocations.sql:1-2`, `:33-36`, `:38-60` |
| allocation 연쇄 | 과거 잔재를 V102가 격리하고, 향후 헤더 soft-delete 시 trigger가 활성 allocation을 soft-delete한다. 애플리케이션 수명주기는 아직 이 trigger를 호출할 진입점이 없다. | `V102__quarantine_orphan_accounting_allocations.sql:14-36`, `:38-60` |
| 세금계산서 연결 | 회계전표는 `taxInvoiceId`를 한 번만 연결할 수 있고 unlink 메서드가 없다. 묶음/수신 서비스가 연결한다. | `SalesAccountingSlip.java:131-137`; `PurchaseAccountingSlip.java:130-139`; `TaxInvoiceBatchFromSalesSlipsService.java:108-112`; `TaxInvoiceInboundService.java:107-110` |
| 연결 세금계산서 취소 | 세금계산서 취소는 상태를 CANCELLED로 만들고 기존 journal을 **역분개**하지만, 연결 회계전표의 `taxInvoiceId`는 지우지 않는다. | `TaxInvoiceService.java:349-357`; `SalesAccountingSlipRepository.java:37`; `PurchaseAccountingSlipRepository.java:37`(두 find 메서드의 production 소비 없음) |
| 연결된 계산서가 있는 회계전표 삭제 시 | 삭제 endpoint가 없어 사용자는 삭제 자체를 실행할 수 없다. 따라서 “계산서를 먼저 취소·연결해제”하는 가드도 없고, 직접적인 사용자 결과는 route 부재다. | 두 AccountingSlip Controller 전체; unlink 메서드 부재 근거 위와 같음 |
| 총계정원장 Q2 파생 | 회계전표 `post()`는 상태·시각·처리자만 바꾸고 journal을 생성하지 않는다. 따라서 “전기 취소 후 재전기”할 원장 인과가 현재 없다. 세금계산서 취소의 autoReverse는 Q2 파생 결정과 다른 기존 축이다. | `SalesAccountingSlipService.java:77-82`; `PurchaseAccountingSlipService.java:77-82`; `SalesAccountingSlip.java:115-124`; `PurchaseAccountingSlip.java:114-123`; `TaxInvoiceService.java:332-357` |

판정: 수명주기는 **상태 골격만 있고 업무 경로는 없다**. `VOIDED`를 새로 추가하는 작업으로 올리면 중복 구현이다. 필요한 것은 상태 전이 제약, soft-delete/VOID application service, 계산서 cancel+unlink 선행, allocation/감사, 재생성 멱등성의 배선이다.

미결:

- CANCELLED 세금계산서를 unlink한 뒤 같은 계산서를 새 회계전표에 재연결할지, 새 계산서를 만들지 결정이 없다.
- `voidSlip()`의 actor를 어느 audit 필드/별도 이력에 남길지 정해져 있지 않다.
- Q2×Q3의 “전기 취소”를 Journal 상태 전이로 표현할지 별도 posting link로 표현할지 결정 문서의 남은 파생 결정이다. 임의로 정하면 안 된다.

---

## ④ Q5 일마감 게이트

| 질문 | 현재 답 | 근거 |
|---|---|---|
| 검증 결과는 어디서 계산하는가 | 상세 조회 때 `MonthEndCloseService`가 품목/가격 referent를 재조회하고 `revalidateProductLines()` 결과의 `verified`를 응답한다. 이는 표시용 read model이며 `DailyClosing`에 저장되는 검증 상태가 아니다. | `MonthEndCloseService.java:248-258`, `:261-293`, `:296-330`; `DailyClosing.java:65-116` |
| 화면은 무엇을 보여 주는가 | `verified=true/false/null`을 확인/불일치/판정불가 배지로 보여 준다. | `DailyClosingPage.tsx:712-739` |
| 마감 service는 그 결과를 읽는가 | **아니오.** 집계 뒤 요청 Boolean `amountVerified`만 `Boolean.TRUE.equals()`로 평가한다. 합계가 0보다 크고 false/null이면 409다. | `DailyClosingService.java:133-146`; `AccountingSlipEligibility.java:86-95`; `CreateDailyClosingRequest.java:21-37` |
| 데스크톱은 `amountVerified`를 보내는가 | **아니오.** FE request 타입과 실행 payload에 필드가 없다. 따라서 현 UI의 금액 있는 마감은 null로 들어가 차단된다. | `clients/desktop/src/renderer/api/accounting.ts:1285-1299`; `DailyClosingPage.tsx:485-500` |
| 검증 상태가 감사/재사용 가능한가 | **아니오.** 누가 어떤 라인을 확인했는지, false/null을 어떻게 정정했는지, 어떤 상세 snapshot에 동의했는지 저장되지 않는다. | `DailyClosing.java:65-116`; `CreateDailyClosingRequest.java:23-38` |
| 회계전표 생성 경로가 Q5를 보는가 | **아니오.** create-attempt는 `AccountingSlipEligibility`나 DailyClosing을 호출하지 않는다. | `SalesAccountingSlipCreateAttemptService.java:30-42`; `PurchaseAccountingSlipCreateAttemptService.java:30-42` |
| `#1213` eligibility가 실제 일마감 상태를 보는가 | **아니오.** API caller가 넘긴 `dailyAmountVerified` parameter를 그대로 평가하며 GET 기본값과 FE batch 기본값은 false다. | `AccountingSlipLinkController.java:33-44`, `:47-64`; `accountingSlipLinkApi.ts:30-37` |

판정: Q5는 **마감 차단 조건만 부분 구현**됐고, 검증 정본과 생성 게이트는 없다. 현재는 서버 계산 결과가 아니라 UI assertion Boolean에 의존하며, UI가 그 Boolean조차 보내지 않아 비영 마감이 전부 막힌다. 반대로 회계전표 생성은 미검증 여부와 무관하게 가능하다.

미결: Q5의 “검증 완료”가 (a) 모든 상세 라인 `verified=true`, (b) 불일치/판정불가를 회계담당자가 사유와 함께 승인, (c) 둘 중 하나인지 결정 문서에 없다. 저장·감사 모델을 임의로 정하지 말고 먼저 확정해야 한다.

---

## ⑤ 계정과목 미매핑 6건 사용처 전수

### ⑤-1. 런타임 사용처와 변경 영향

| 기존 → 정본 | 런타임 사용처 | 현재 집계 의미 | 바꾸면 달라지는 것 | 근거 |
|---|---|---|---|---|
| `141` 토지 → `2019` | `CashFlowStatementService.INVESTING_ACCOUNTS` | `141` debit은 투자 유출, credit은 투자 유입 | 4자리 `2019` 토지 분개가 현금흐름표 투자활동 취득/처분 및 투자현금흐름 합계에 들어온다. `141`만 보던 현재 코드는 V101 이후 4자리 행을 누락한다. | `CashFlowStatementService.java:61-68`, `:198-225` |
| `163` 소프트웨어 → `2374` | 동일 | `163`을 투자활동 무형자산으로 집계 | `2374` 컴퓨터소프트웨어의 취득/처분과 투자현금흐름 합계가 바뀐다. | 같은 파일`:61-68`, `:198-225` |
| `148` → `2224` 건설중인자산 | 동일 | `148`을 투자활동 자산으로 집계 | `2224` 건설중인자산의 debit/credit이 투자활동에 들어와 투자현금흐름 합계가 바뀐다. | 같은 파일`:61-68`, `:198-225` |
| `230` → `2515` 단기차입금 | `CashFlowStatementService.FINANCING_ACCOUNTS` | `230` credit=차입 유입, debit=상환 유출 | `2515` 단기차입금의 차입/상환과 재무현금흐름 합계가 반영된다. 자금현황은 이미 `2515`를 차입금으로 사용하므로 두 보고서 코드가 정렬된다. | `CashFlowStatementService.java:70-75`, `:227-254`; `FundsStatusService.java:53-56` |
| `114` 대여금 → `1082` 단기대여금 | `FundsStatusService`, `AccountStatementService` | 자금현황 대여금 그룹 및 계정별원장 기본 채권 코드가 `114`를 조회 | 자금현황의 기초/증가/감소/기말, 증가 상세와 계정별원장의 채권 잔액·합계가 `1082` 기준으로 바뀐다. | `FundsStatusService.java:53-61`, `:74-81`, `:95-128`, `:155-169`; `AccountStatementService.java:52-59`, `:77-105`, `:265-274` |
| `120` → `1209` 미수금 | `AccountStatementService` | 기본 채권 코드·채권 그룹으로 `120` 조회 | 계정별원장의 미수금 거래처별 잔액과 채권 subtotal/total이 `1209` 기준으로 바뀐다. | `AccountStatementService.java:52-59`, `:77-105`, `:265-280` |

전수 검색 결론: 위 세 런타임 서비스 외에 6개 문자열을 집계 조건으로 쓰는 production 소스는 없다. 과거 baseline seed에는 여섯 3자리 leaf가 모두 존재하지만 이는 신규 DB의 역사적 V1 정의이고 현행 집계 소비자는 아니다 (`V1__init_accounting_service.sql:153-165`, `:177`).

### ⑤-2. 함께 정렬해야 할 중앙 정책 표면

| 표면 | 현재 상태 | 영향/판정 | 근거 |
|---|---|---|---|
| `AccountEcountMapping` | 6개 모두 `CONFIRMED`에 없음 | 보고서 상수만 바꾸면 외부 3자리 입력 정규화와 target→legacy 역호환 조회가 정렬되지 않는다. `114/120`을 쓰는 AccountStatement는 특히 중앙 매핑과 기본 코드 목록을 함께 보아야 한다. | `AccountEcountMapping.java:18-32`, `:44-70`; `AccountStatementService.java:52-59`, `:265-272` |
| V101 migration | 6개는 journal 사용코드 이관표에 없고 target 목록에도 없음 | 이번 6개는 “V101 적용/미매핑 0”의 닫힌 데이터 게이트와 별개인 **소스 상수 매핑**이다. 기존 V101을 다시 조사하거나 적용할 일이 아니다. | `V101__unify_legacy_account_codes.sql:325-369` |

### ⑤-3. 대분류 코드는 leaf 매핑 대상이 아님

| 코드 | 코드 근거 | 판정 |
|---|---|---|
| `100·200·300·400·500·800·900` | `AccountService`가 이 7개를 `LEGACY_CONTROL_ACCOUNT_CODES`로 명시하고 `requireLeafAccount()`에서 저장 전 차단한다. 저장된 `is_leaf=false`도 별도로 차단한다. | **대분류/통제(parent) 코드이며 leaf 매핑 대상이 아니다.** `AccountService.java:20-21`, `:34-50` |
| `900` 추가 근거 | V101은 `900`을 사용 0건인 폐기/분리 상위 코드로 두고 데이터 UPDATE를 하지 않는다. 기존 결정도 자식이 있는 진짜 상위 계정이라고 명시한다. | `900 → 단일 leaf` 매핑 금지. 필요 시 `9018/9318`은 거래 의미별 별도 leaf다. `V101__unify_legacy_account_codes.sql:349-358`; `docs/decisions/2026-08-13-account-code-unification.md:91-103` |

잔여 불일치: `AccountEcountMapping.UNDETERMINED`에는 아직 `900`이 있어 표시 정책상 “미정”으로 보일 수 있다 (`AccountEcountMapping.java:30-32`). leaf 기표 차단은 맞지만, 중앙 표시 정책은 “대분류/폐기” 결정과 어긋난다. 6개 leaf 매핑과 별개로 정리 여부를 판단해야 한다.

---

## 슬라이스 분할 제안

한 PR에 전부 넣으면 Q1 transaction, Q5 검증 정본, 세금계산서 취소, 원장 posting이 서로 얽혀 검증 범위가 폭발한다. 다음 순서를 권장한다.

| 순서 | 슬라이스 | 닫는 범위 | 선행/완료 기준 |
|---:|---|---|---|
| 0 | **6개 계정 코드 정렬** | 중앙 `AccountEcountMapping` + 세 보고서 상수 + 집계 회귀 테스트. 대분류 7개는 매핑하지 않음. | 독립·저위험. 6개 변경 전후 각 보고서 포함/제외 표본으로 금액 영향 고정. |
| 1 | **단일 생성 orchestration kernel** | `원천 전표 1건 → 회계전표 1건` 서버 명령. `#1213` eligibility를 실제 쓰기 가드로 사용하고 VAT·거래처·전량 allocation을 서버 한 곳에서 산출. 매출/매입 공통 계약. | UI 없음. 부분 allocation을 허용할지 Q1의 1:1에 맞춰 전량만 허용할지 먼저 확정. 같은 입력에 read/write 판정 동일. |
| 2 | **외부 N건 원자 bulk** | N개 명령을 **한 transaction**에서 실행, 하나 실패 시 전체 rollback. 원천 전표번호별 검증 결과를 반환하고 외부 화면을 N건→N건으로 교체. | 슬라이스 1 필요. 중간 항목 실패·번호 충돌·동시 과배분에서 DB 0건 또는 N건만 존재. 사용자에게 전체 rollback과 항목별 사유 표시. |
| 3 | **전표 상세 단건** | 판매/구매 상세에서 자기 전표만 슬라이스 1 명령 호출, 연결 read model 표시. | 슬라이스 1 필요. UUID 미노출, 전표번호로 결과 표시. |
| 4 | **Q5 검증 정본 + 일마감 생성** | 상세 재검증 결과/회계담당자 판단을 감사 가능한 상태로 확정하고, 마감과 일마감 생성이 그 서버 정본을 보도록 연결. 현 `amountVerified` 자기신고 제거/대체. | “검증 완료”의 미결 의미를 개발책임자가 먼저 확정. 슬라이스 1 필요. 회계전표 생성과 close 모두 같은 Q5 판정. |
| 5 | **삭제/재생성 수명주기** | DRAFT header/line/allocation soft-delete, POSTED VOIDED, 계산서 취소+unlink 선행, 재생성 멱등성, 사용자 오류 표면. 기존 V102 trigger와 정합. | unlink 후 계산서 재사용/재발행 정책 확정. `VOIDED` enum은 재사용. hard delete 0. |
| 6 | **총계정원장 posting 취소/재전기** | 회계전표 POST→journal 인과를 먼저 만들고, VOID 시 역분개가 아닌 전기 취소, 재생성 전표 POST 시 재전기. | Q2×Q3 남은 파생 결정의 상태/감사 표현 확정 후 착수. 세금계산서 기존 autoReverse와 중복 journal이 생기지 않음. |

## 최종 미결 목록

| 미결 | 왜 임의 결정하면 안 되는가 |
|---|---|
| 부분 allocation을 계속 허용할지, Q1 1:1 명령에서 원천 전표 전량만 허용할지 | 현재 read model과 create-attempt가 반대 답을 내는 직접 원인이다. |
| bulk rollback 시 첫 실패만 반환할지 모든 항목의 검증 사유를 반환할지 | 사용자가 무엇을 고칠지 아는 수준과 구현 복잡도가 달라진다. |
| Q5 검증 완료의 정의와 판단 audit | `verified=false/null`을 무조건 차단할지, 회계담당자 사유 승인으로 통과할지 결정이 없다. |
| CANCELLED 계산서 unlink 후 재사용/신규 발행 정책 | 계산서 번호·국세/감사 의미가 달라진다. |
| Q2 “전기 취소”의 Journal 상태·link 모델 | 현재 회계전표 POST는 journal을 만들지 않고 세금계산서 취소는 autoReverse한다. 중복 분개를 피하려면 인과 정본 결정이 선행돼야 한다. |

## 기존 이슈·결정 대조

- 이슈 #1144는 3경로, Q1 1:1, 삭제 후 재생성을 아직 열린 범위로 명시한다. #1213 완료 코멘트도 다음 순위를 “공통 생성 orchestration”과 “삭제/재생성”으로 남겼다.
- CLOSED #1142는 검수 완료 전표 되돌리기 범위 B를 #1144의 “역처리가 아니라 삭제 후 재생성”으로 넘겼다. 별도 새 되돌리기 체계를 만들 근거가 없다.
- `docs/decisions/2026-08-14-accounting-slip-link-decisions.md:16-20`, `:34-78`의 Q1~Q5를 정본으로 사용했다. `VOIDED`와 V102를 새로 만들자는 제안은 하지 않았다.

