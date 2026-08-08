# #1144 P0-C + P0-D 통합 설계 — 원장 source identity 계약

> 작성일: 2026-08-09 KST  
> 코드 기준: `main` `d77623067`  
> 범위: 설계만 수행. 코드·마이그레이션 수정, 실 DB 쓰기, Docker 재배포, 이슈 생성, commit/push 없음.  
> DB 확인: 실행 중인 `samhan-postgres`에 `BEGIN TRANSACTION READ ONLY`로 `SELECT`만 실행했다.

## 0. 결론

인용된 전제는 현재 `main`과 공유 DB에서 모두 재현됐다.

- P0-C: INBOUND **20건 / 12거래처 / 116,747,400원**이 거래처별 채무 문서원장에서 누락돼 있다.
- P0-C 위험: 현행 판매전표 DTO에는 `slipType`도 `slipId`도 없고 소비자는 모두 `SALE`로 fold한다. repository 조건만 INBOUND까지 넓히면 위 **116,747,400원 전액이 채권으로 잘못 합산**된다.
- P0-D: 개별 세금계산서 발행은 110 채권 분개를 만들지만, 매출 회계전표 묶음 발행은 `ISSUED` 상태와 연결만 만들고 분개하지 않는다.
- OUTBOUND **40건 / 34거래처 / 359,003,920원**은 이미 거래처별 채권 문서원장에 직접 반영된다.
- 현재 ISSUED이면서 분개가 없는 세금계산서는 **8건 / 23,100,000원**이다. 다만 DB에 발행 경로 provenance가 없어 8건 모두를 묶음 발행 결과라고 단정할 수 없다.

통합 계약의 핵심은 다음 한 문장이다.

> **원장의 경제적 원천키는 회계전표 ID·세금계산서 ID·전표번호가 아니라 `원천 시스템 + 원천 전표 타입 + 원천 전표 UUID`이고, 금액 배분·분개 연결은 같은 키의 라인 UUID까지 내려간다. 회계전표·세금계산서·journal은 이 원천을 다시 식별하는 파생 산출물이지 새로운 매출·매입 원천이 아니다.**

권장 구현 경계는 **통합 1 PR, 내부 순서 4단계**다. source identity 계약과 RED 검증 게이트를 먼저 넣고, P0-C 타입 안전 read model, P0-D 게시·역분개, 세금계산서 발행 경로 통합 순으로 완성한 뒤 한 번에 배포한다. 구현은 이 문서 범위가 아니다.

---

## 1. 재현 결과와 추가로 발견한 셋째 경계

### 1.1 측정 시각과 기준값

공유 DB이므로 아래 값은 각 측정 시각의 스냅샷이다.

| DB | 측정 시각(KST) | 결과 |
|---|---|---|
| `slip_db` | **2026-08-09 05:16:14.589255** | INBOUND 20건/12거래처/116,747,400원, OUTBOUND 40건/34거래처/359,003,920원 |
| `slip_db` | **2026-08-09 05:19:43.148757** | INBOUND 46라인, OUTBOUND 101라인. 금액은 위와 동일 |
| `accounting_db` | **2026-08-09 05:16:33.992238** | 활성 매출·매입 회계전표 각 0건, ISSUED 무분개 8건/23,100,000원, ISSUED 유분개 4건/4,259,999원 |
| `accounting_db` | **2026-08-09 05:17:20.172333** | 거래처 원장 저장 snapshot 14건/7개 거래처 |
| `slip_db` | **2026-08-09 05:17:50.858290** | 위 snapshot 기간·거래처와 현재 INBOUND cohort가 겹치는 snapshot 0건 |
| `accounting_db` | **2026-08-09 05:19:27.233685** | 110 순액 512,683,000원, 201 순액 -3,270,000원, 210 순액 -700,000원. 이는 60개 원천 전표와 연결됐다는 뜻은 아님 |

### 1.2 코드 재현

- OUTBOUND만 조회: `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java:256-273`, 특히 `:260`.
- 원장은 회계 반영 완료 목록이 아니라 거래 사실 문서라는 주석: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java:381-394`.
- 응답에 `slipType`·`slipId`가 없음: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponse.java:17-26`.
- accounting client도 동일하게 타입·ID가 없음: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLedgerSalesClient.java:48-64`.
- 모든 원천 문서를 SALE·차변으로 만듦: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java:165-170,243-249`.
- journal 중복제거 키가 빈 집합: 같은 파일 `:172-180`; 실제 비교 지점은 `:296-307`.
- 매출·매입 회계전표 POST는 상태만 전이: `SalesAccountingSlipService.java:71-82`, `PurchaseAccountingSlipService.java:71-82`.

### 1.3 셋째 경계 — 세금계산서 타입과 방향도 지금은 단일 정본이 아니다

`TaxInvoice` 생성자는 `invoiceType`과 무관하게 기본 `direction=OUTBOUND`를 둔다(`TaxInvoice.java:196-208`). 개별 `TaxInvoiceService.issue()`는 `invoiceType`/`direction`을 검사하지 않고 항상 110/255/401을 만든다(`TaxInvoiceService.java:228-264`). 반면 수신 경로만 `PURCHASE + INBOUND`를 명시적으로 만든다(`TaxInvoice.java:328-359`, `TaxInvoiceInboundService.java:83-109`).

실 DB에는 **`direction=OUTBOUND`, `invoice_type=PURCHASE`, ISSUED, 무분개 3건 / 6,050,000원**이 있다(2026-08-09 05:19:27.233685 KST). 이 자료의 업무 의미와 생성 경로는 provenance가 없어 확정할 수 없다. 따라서 “묶음 발행을 개별 `issue()`에 그대로 위임”하면 안 된다. 그렇게 하면 PURCHASE 표기 자료도 110 채권으로 게시될 수 있다.

---

## 2. source identity 계약

### 2.1 식별자 선택

#### 권장 원천키

문서 단위:

```text
sourceDocumentKey = (originSystem, originDocumentType, originDocumentId)

OUTBOUND 예: (SLIP_SERVICE, OUTBOUND_SLIP, slips.id)
INBOUND  예: (SLIP_SERVICE, INBOUND_SLIP,  slips.id)
```

라인 단위:

```text
sourceLineKey = (sourceDocumentKey, slip_lines.id)
```

표시·로그용 canonical 문자열은 다음처럼 만들 수 있으나 DB에서는 분리 컬럼을 정본으로 둔다.

```text
SLIP_SERVICE/OUTBOUND_SLIP/{slipId}
SLIP_SERVICE/INBOUND_SLIP/{slipId}
SLIP_SERVICE/OUTBOUND_SLIP/{slipId}/LINE/{lineId}
```

UUID는 내부 계약과 조인에만 쓰고 화면에는 계속 `slipNo`, 거래처 코드·명칭을 표시한다.

#### 사용하지 않을 키

| 후보 | 제외 이유 |
|---|---|
| 회계 매출·매입전표 `id` | 원천이 아니라 파생 산출물이다. 삭제 후 재생성하면 ID가 바뀐다. |
| 회계전표 `slipNo` | 표시·업무 검색키이며 재채번·정규화 가능성이 있다. 타입 공간도 분리돼 있지 않다. |
| 세금계산서 `id` | 원천 전표 N건을 1건으로 묶을 수 있고, 같은 경제적 원천을 다시 세게 된다. |
| `taxInvoiceNo`/회계전표번호 | 사람이 읽는 번호이며 변경·재발행 수명주기를 source identity로 표현하지 못한다. |
| `journals.source_ref_id` 단독 | 현재 세금계산서 UUID와 역분개 원분개 UUID라는 두 의미를 가진다(`Journal.java:86-98`, `JournalService.java:229-240`). 원천 전표 N:M도 표현하지 못한다. |
| `slipId` 단독 | 서비스/타입 namespace가 없고, 채권/채무 방향을 키에서 검증할 수 없다. |

### 2.2 채권/채무 방향의 정본

원천 전표가 있는 경우 방향은 **`Slip.slipType`**이 정한다.

| 코드 원천 | 원장 방향 | 업무 문서 | 근거 |
|---|---|---|---|
| `OUTBOUND` | `RECEIVABLE` | 매출 | 개발책임자 명세 “매출전표는 채권”; 매출 회계전표 생성 서비스가 OUTBOUND만 허용(`SalesAccountingSlipCreateAttemptService.java:118-128`) |
| `INBOUND` | `PAYABLE` | 매입 | 개발책임자 명세 “매입전표는 채무”; 매입 회계전표 생성 서비스가 INBOUND만 허용(`PurchaseAccountingSlipCreateAttemptService.java:113-123`) |

방향은 금액 부호, 계정코드, DTO를 받은 화면, 세금계산서 상태로 추론하지 않는다. 내부 projection이 반드시 `originDocumentId`, `originLineId`, `slipType`, `ledgerDirection`을 함께 전달하고, accounting-service는 다음 불변식을 검사한다.

```text
OUTBOUND_SLIP <=> slipType=OUTBOUND <=> ledgerDirection=RECEIVABLE
INBOUND_SLIP  <=> slipType=INBOUND  <=> ledgerDirection=PAYABLE
```

불일치·누락은 0원 fallback이나 SALE 기본값으로 흡수하지 않고 요청/조회 전체를 실패시킨다. `PartnerLedgerSalesResponse.from()`은 실제 entity의 `slip.getId()`와 `slip.getSlipType()`을 전사해야 하며, accounting client와 read model도 enum으로 받는다. FE에는 UUID를 노출하지 않지만 `SALE/PURCHASE`, `RECEIVABLE/PAYABLE` 타입은 보존한다.

원천 전표가 없는 독립 세금계산서를 어떤 방향으로 볼지는 코드로 확정할 수 없다. §7 Q3에서 정책 결정 전까지 독립 세금계산서는 새 source identity 계약의 자동 게시 대상으로 넣지 않는다.

### 2.3 경제적 원천과 파생 산출물 분리

논리 모델은 다음 세 층이다. 정확한 테이블/클래스명은 구현 계획에서 확정하되 의미는 바꾸지 않는다.

1. **Source document/line**
   - 정본: `sourceDocumentKey`, `sourceLineKey`, 방향, 거래처, 원천일자, 원천금액.
   - 원천 전표 삭제·번호 변경과 무관하게 identity는 재사용하거나 덮어쓰지 않는다.
2. **Artifact link**
   - 파생 산출물: `SALES_ACCOUNTING_SLIP`, `PURCHASE_ACCOUNTING_SLIP`, `TAX_INVOICE`, `JOURNAL`.
   - 각 artifact가 어느 source line 금액을 얼마만큼 대표하는지 append-only lineage로 연결한다.
   - 기존 `sales_accounting_slip_allocations`/`purchase_accounting_slip_allocations`의 `source_slip_id`, `source_line_id`, `allocated_amount`가 현재 가장 가까운 근거다(`V18:65-85`, `V19:65-85`).
3. **Posting/reversal claim**
   - 원분개 claim: `(journalId, sourceLineKey, allocatedAmount, ORIGINAL)`.
   - 역분개 claim: `(reversalJournalId, sourceLineKey, allocatedAmount, REVERSAL)`.
   - 한 journal에 여러 원천, 한 원천 라인에 여러 부분 배분을 허용하므로 journal header의 UUID 하나로 대체하지 않는다.

`journals.source_ref_id`는 legacy deep-link 호환 필드로 남길 수 있으나 새 원장 중복제거의 정본으로 사용하지 않는다. 새 경로는 explicit lineage가 없으면 게시하지 않는다.

### 2.4 원장에 한 줄을 넣는 규칙

거래처별 문서원장의 중복제거 단위는 `sourceDocumentKey`다.

1. slip-service source projection을 먼저 읽는다.
2. 같은 `sourceDocumentKey`는 정확히 한 문서로만 만든다.
3. 해당 source를 대표하는 회계전표·세금계산서·journal lineage는 문서의 연결 상태/번호를 보강할 뿐 금액 문서를 추가하지 않는다.
4. lineage가 없는 legacy journal은 임의로 원천과 합치지 않고 `JOURNAL_ONLY`로 유지한다.
5. `RECEIVABLE`과 `PAYABLE`은 별도 누계로 fold한다. 한쪽을 음수로 바꿔 같은 `salesTotal`에 넣지 않는다.
6. 총계정원장은 현행대로 journal line만 읽는다. 거래처별 문서원장의 원천 문서를 총계정원장에 가상 journal로 넣지 않는다. 이 표면 범위는 §7 Q1의 개발책임자 결정 대상이다.

따라서 같은 원천이 다음 두 경로로 들어와도 한 번만 보인다.

```text
slip-service 원천 문서 ───────────────┐
                                      ├─ sourceDocumentKey 1개 ─ 문서원장 1행
회계전표 → journal → 세금계산서 lineage ┘
```

### 2.5 POST 멱등성과 삭제 후 재생성

회계전표 POST는 다음을 한 DB 트랜잭션으로 처리한다.

1. 모든 `sourceLineKey`에 대해 기존 생성 코드와 같은 source line 단위 잠금을 획득한다(`SalesAccountingSlipCreateAttemptService.java:177-180`, purchase 동형 `:172-175`).
2. 회계전표 종류와 source 방향이 일치하는지 다시 검증한다.
3. 현재까지의 `ORIGINAL - REVERSAL` net claim과 이번 배분을 더해 원천 라인의 수량·금액을 넘지 않는지 검사한다.
4. journal, journal lines, source claims, 회계전표 `POSTED` 전이를 함께 저장한다.
5. 동일 회계전표의 같은 POST 재시도는 `(artifactType, artifactId, POST)` 멱등키로 기존 결과를 반환한다. journal을 두 개 만들지 않는다.

삭제/재생성 계약:

- `DRAFT`: 분개가 없으므로 soft-delete 가능.
- `POSTED`: 즉시 soft-delete 금지. 먼저 `VOIDED + 역분개 + REVERSAL claim`을 한 트랜잭션으로 만든다.
- 재생성된 회계전표는 새 artifact ID를 가져도 같은 `sourceLineKey`를 사용한다. 이전 claim의 net이 0이 된 뒤에만 다시 POST할 수 있다.
- 문서원장에서는 artifact가 바뀌어도 `sourceDocumentKey`가 같으므로 계속 1행이다.
- 원분개와 역분개는 삭제·UPDATE하지 않고 감사 이력으로 남긴다.
- 연결 세금계산서의 취소/연결해제 순서는 업무 결정이 필요하므로 §7 Q4 전에는 POSTED 회계전표 삭제 기능을 열지 않는다.

이 계약은 “같은 원천이 두 경로로 들어와도 1회”, “회계전표 전/후 1회”, “삭제 후 재생성해도 1회”를 각각 source document dedup, posting claim, reversal net으로 분리해 보장한다.

### 2.6 대안 비교

| 안 | 설명 | 장점 | 치명적 대가 |
|---|---|---|---|
| **A. 타입+원천 UUID + explicit lineage (권장)** | 위 계약 | N:M 배분, 재시도, 삭제·재생성, 역분개를 모두 표현. 업무번호와 내부키 분리 | lineage 저장·조회와 gate가 추가됨 |
| B. `journals.source_ref_id=회계전표 id` | journal header 한 컬럼 재사용 | 변경량이 작음 | 회계전표 재생성 시 키가 바뀌고, 한 journal의 여러 원천을 표현 못함. 현행 역분개 과부하도 계속됨 |
| C. 원장 event store를 새 정본으로 구축 | 모든 원장 행을 append-only event로 재작성 | 장기적으로 가장 명시적 | P0-C/P0-D 범위를 넘어 기존 입금·수기·seed·snapshot까지 이관해야 함. 현재 P0에 과도함 |

---

## 3. 개별 발행과 묶음 발행 대조 및 통합 설계

### 3.1 현재 차이

| 단계 | 개별 발행 | 묶음 발행 |
|---|---|---|
| endpoint | `TaxInvoiceController.java:119-132` → `taxInvoiceService.issue()` | `TaxInvoiceBatchController.java:74-87` → `createFromSalesSlips()` |
| 입력 원천 | 회계전표 연결 없이 생성된 DRAFT도 가능 | POSTED·미연결 매출 회계전표만 후보(`SalesAccountingSlipRepository.java:65-77`) |
| 상태 | `TaxInvoice.issue()`로 ISSUED | 같은 domain `issue()`로 ISSUED (`TaxInvoiceBatchFromSalesSlipsService.java:108-112`) |
| 분개 | 110 차변, 255·401 대변 생성(`TaxInvoiceService.java:234-263`) | `JournalService` 의존성/호출 없음(`TaxInvoiceBatchFromSalesSlipsService.java:35-38,96-113`) |
| journal 연결 | `ti.linkJournal()` (`TaxInvoiceService.java:264`) | 없음 |
| 회계전표 연결 | 일반 개별 경로에는 필수 아님 | 선택한 매출 회계전표 N건에 `taxInvoiceId` 연결 (`:108-111`) |

### 3.2 권장 통합

개발책임자 명세의 “회계전표 생성 및 연결의 이유는 세금계산서 발행 및 다른 회계메뉴에서 확인하기 위함”에 맞춰 다음을 권장한다.

1. **매출·매입 회계전표 POST가 journal을 만든다.**
   - 매출 source는 RECEIVABLE, 매입 source는 PAYABLE.
   - 정확한 상대 계정/VAT 계정은 §7 Q2 결정 전에는 확정하지 않는다.
2. **세금계산서 발행은 이미 POST된 회계전표 source set을 소비한다.**
   - 개별과 묶음 모두 하나의 issuance orchestrator를 호출한다.
   - source lineage와 POST journal 존재를 검증하고 ISSUED·연결만 만든다.
   - 110/201/210 금액 변화는 **0원**이어야 한다.
3. **개별 발행의 현행 110 자동 분개는 새 연결형 경로에서는 제거한다.**
   - legacy 독립 세금계산서 정책은 별도 분기한다.
4. **부분 성공을 금지한다.**
   - 세금계산서 ISSUED, 회계전표 연결, lineage 검증이 한 트랜잭션이어야 한다.
   - POST journal이 없으면 ISSUED를 만들지 않는다.

대안은 두 가지다.

- 세금계산서 발행이 journal을 소유하도록 유지하고 묶음도 같은 서비스를 호출: 현행 개별 경로와 가깝지만 회계전표 POST 후 다른 회계메뉴에 나타나는 시점이 늦고, PURCHASE/INBOUND 분기 및 독립 세금계산서 방향을 별도 확정해야 한다.
- 회계전표 POST는 provisional, 세금계산서 발행은 확정/치환: 임시 계정, 치환 실패, 역분개 2단계가 추가되어 P0에 비해 지나치게 복잡하다.

---

## 4. 기존 데이터 소급 선택지와 금액

정답을 확정하지 않는다. 아래는 개발책임자 선택지와 비용이다.

### 4.1 P0-C 문서원장

| 선택지 | 지금 움직이는 표시 금액 | 대가 |
|---|---:|---|
| **C-1. 활성 정본 상태 전건 소급 표시** | 채무 문서 **+116,747,400원**, 20건/12거래처. 채권 **0원 변화** | live read라 회계 DB write는 없지만 기존 화면·CSV·인쇄 합계가 즉시 달라진다. 새 snapshot에는 채무가 들어간다. |
| C-2. cutover 이후 전표만 표시 | 현재 **0원** | 기존 20건/116,747,400원은 계속 누락돼 원장이 영구히 틀리다. 동일 거래처에서 날짜 전후 계약이 갈린다. |
| C-3. 전건 표시하되 기존 snapshot은 당시 이력으로 동결 | live는 C-1과 동일 | 현재 저장 snapshot 14건은 수정하지 않는다. 측정상 현재 INBOUND와 기간·거래처가 겹치는 snapshot은 0건이지만, 향후 reader가 구/신 schema를 모두 읽어야 한다. |

### 4.2 ISSUED 무분개 8건

측정 시각 2026-08-09 05:16:33.992238 KST:

- SALES + OUTBOUND: **5건 / 17,050,000원**
- PURCHASE + OUTBOUND: **3건 / 6,050,000원**
- 합계: **8건 / 23,100,000원**

| 선택지 | journal 표면의 최대 금액 이동 | 대가 |
|---|---:|---|
| D-1. legacy 예외, 소급 분개 없음 | **0원** | 과거 ISSUED 무분개 8건이 남는다. 새 gate는 cutover 이후만 강제하고 history에 legacy 표시가 필요하다. |
| D-2. source 연결이 증명되는 건만 소급 | 현재 자동 증명 cohort **0건 / 0원** | 활성 회계 매출·매입전표 0건, 세금계산서와 활성 회계전표 연결 0건이라 자동 처리할 자료가 없다. 수동 증명이 끝난 건만 범위가 늘어난다. |
| D-3. 8건 전부 분개 | 총액 기준 최대 **23,100,000원**이 채권/채무 계정과 상대 계정에 게시 | 3건/6,050,000원은 OUTBOUND+PURCHASE라 방향을 코드로 확정할 수 없다. 8건의 실제 발행 provenance도 없다. 일괄 110 게시 금지. 오류 시 hard delete가 아니라 역분개 필요. |
| D-4. 취소 후 올바른 회계전표 경로로 재생성 | 경제 금액 최대 **23,100,000원**에 접촉, 취소·신규 journal이 모두 남음 | 외부 발행 여부, 세금계산서 번호·감사 이력, 마감 기간을 함께 다뤄 가장 위험하다. |

### 4.3 원천 전표 60건을 회계 journal까지 전면 backfill

| 원천 | 최대 gross 게시 대상 | 기존 문서원장 |
|---|---:|---|
| OUTBOUND 40건 | 채권 계열 **359,003,920원** | 이미 반영됨. 문서원장 증가는 0이어야 함 |
| INBOUND 20건 | 채무 계열 **116,747,400원** | 현재 누락. P0-C 소급 시 문서원장 +116,747,400원 |

이 안은 활성 회계전표 0건에서 회계전표·journal 자체를 소급 생성해야 한다. 기존 세금계산서 관련 110 순액 **4,259,999원**이 OUTBOUND 359,003,920원의 일부와 같은 거래인지 연결키가 없어 알 수 없다. 따라서 전면 backfill의 실제 순증은 확정할 수 없으며 **`359,003,920 + 116,747,400`을 그대로 게시하는 실행안으로 해석하면 안 된다.** 수동 매칭과 역분개 절차를 승인한 뒤 별도 데이터 작업으로만 가능하다.

---

## 5. 검증 게이트 — 합격 기준을 먼저 기계로 만든다

### 5.1 게이트 실행 원칙

구현 전에 다음 두 층을 RED로 만든다.

1. **실 데이터 read-only gate**
   - `slip_db`, `accounting_db`를 각각 `BEGIN TRANSACTION READ ONLY`로 조회한다.
   - 각 명령의 종료코드를 즉시 검사한다. 파이프 뒤 `$LASTEXITCODE`를 읽지 않는다.
   - 두 DB 결과는 runner가 `(source type, source UUID, line UUID)`로 메모리 조인한다.
   - 측정 시각·DB명·cutover 기준을 결과 JSON/Markdown에 남긴다.
2. **Testcontainers/계약 테스트**
   - 같은 source를 direct projection, 회계전표 journal, 세금계산서 양쪽으로 공급한다.
   - 중복 0, 방향 교차 0, POST 재시도 1건, 역분개 후 재생성 net 1건을 검증한다.

### 5.2 불변식

#### G1. source identity 완전성

```text
모든 거래처 문서원장 행은 sourceDocumentKey != null
모든 원천 라인은 sourceLineKey != null
같은 sourceDocumentKey의 문서 수 = 1
```

현재: OUTBOUND 문서 40건/359,003,920원은 표시되지만 DTO에 `slipType`·`slipId`가 없어 **identity 완전성 40건 FAIL**. INBOUND 20건은 행 자체가 없다.

#### G2. 방향별 문서원장 보존

거래처별·전체로 다음을 비교한다.

```text
SUM(source OUTBOUND amount) = SUM(ledger RECEIVABLE source-document amount)
SUM(source INBOUND amount)  = SUM(ledger PAYABLE source-document amount)
OUTBOUND가 PAYABLE에 들어간 건수 = 0
INBOUND가 RECEIVABLE에 들어간 건수 = 0
```

현재 측정:

| 불변식 | source | 현행 원장 | 깨진 범위 |
|---|---:|---:|---:|
| OUTBOUND→채권 문서 | 40건/34거래처/359,003,920원 | 금액 반영됨 | source identity 40건 누락 |
| INBOUND→채무 문서 | 20건/12거래처/116,747,400원 | 0건/0원 | **20건/12거래처/116,747,400원** |
| INBOUND→채권 금지 | 20건/116,747,400원 | 현재 조회 자체가 안 돼 오분류 0 | 단순 repository 확장 시 20건/116,747,400원 FAIL하도록 적대 테스트 필요 |

파트너별 diff가 한 건이라도 있으면 실패한다. 전체 합만 맞고 거래처가 바뀐 경우도 통과시키지 않는다.

#### G3. 게시 금액과 lineage 보존

부분 배분을 허용하므로 “모든 source 금액=POST journal”을 항상 요구하지 않는다.

```text
각 POSTED 회계전표 total = 그 journal의 채변합 = 대변합
각 POSTED 회계전표 total = 연결된 ORIGINAL source claims 합
각 sourceLineKey의 net claim(ORIGINAL-REVERSAL) <= 원천 라인 금액
모든 원천 라인이 전액 POST된 cohort에서만 source 합 = net journal 합
```

현재 활성 회계 매출·매입전표가 각 0건이라 실행 표본은 **0건/0원**이다. 이 게이트는 현재 vacuous pass가 아니라 **NO_SAMPLE**로 보고하고 fixture 계약 테스트를 필수로 한다.

#### G4. POST 원자성·멱등성

```text
POSTED 회계전표인데 original journal이 없는 건수 = 0
동일 (artifactType, artifactId, POST)의 original journal 수 = 1
journal은 있는데 source claim이 없는 신규 자동분개 수 = 0
```

동일 요청 2회, 동시에 2회, 첫 저장 중 예외 후 재시도를 각각 테스트한다. 상태만 POSTED 또는 orphan journal이 남으면 실패한다.

#### G5. 문서원장 중복 금지

```text
source projection + linked journal을 함께 읽은 뒤
COUNT(DISTINCT sourceDocumentKey) = 문서원장 source-document 행 수
source별 문서원장 amount = 원천 문서 amount (POST 전/후 동일)
```

현재 `canonicalSlipKeys=Set.of()`라 source-linked journal을 추가하면 이 gate가 막아야 한다. 현 DB에는 활성 회계전표 source journal이 0건이라 실제 이중계상 금액은 현재 0원이나, 중복제거 계약은 **구현되지 않은 상태**다.

#### G6. 세금계산서 발행 인과

권장안 기준:

```text
연결형 ISSUED tax invoice의 모든 accounting slip = POSTED
연결형 ISSUED tax invoice의 source set = 연결 회계전표 source set
세금계산서 발행 전후 110/201/210 delta = 0
개별 발행과 묶음 발행의 결과 계약이 동일
```

현재 legacy/provenance gate는 **ISSUED 무분개 8건/23,100,000원**, 활성 회계전표 연결 0건 때문에 FAIL/미분류다. 이 8건을 자동 오류로 수정하지 말고 cutover 전 legacy cohort로 별도 표시한다.

#### G7. 역분개·삭제·재생성

기계 시나리오:

1. OUTBOUND와 INBOUND 원천 각 1건 생성.
2. 회계전표 A 생성·POST.
3. 같은 POST 재시도 → journal 수 불변.
4. 세금계산서 개별/묶음 발행 → 문서원장 금액 불변.
5. POSTED 직접 삭제 시도 → 거부.
6. VOID+역분개 → net claim 0, 문서원장 원천 행은 1개 유지.
7. 회계전표 B 재생성·POST → net claim 1회, 문서원장 source key 1개.

#### G8. legacy source field 오염 감시

- 현재 `(source_type, source_ref_id)` 활성 중복 그룹은 **0개**다(2026-08-09 05:16:33.992238 KST).
- 그러나 `source_ref_id`가 다른 journal을 가리키는 활성 역분개는 **24건**이다. 이는 중복이 아니라 필드 과부하 증거다.
- 새 lineage에서 원천 문서 ID와 원분개 ID가 같은 컬럼에 들어오면 실패한다.

#### G9. snapshot 불변

- 기존 `PARTNER_LEDGER` snapshot **14건/7거래처**는 당시 payload로 복원한다.
- 이번 측정에서는 현재 INBOUND와 기간·거래처가 겹치는 snapshot이 **0건**이었다.
- 새 snapshot은 schema version과 `SALE/PURCHASE`, `RECEIVABLE/PAYABLE`, source key를 저장하되 UUID는 화면에 렌더링하지 않는다.
- 코드 rollback 시에도 이미 저장한 snapshot을 hard delete하지 않는다.

### 5.3 gate 산출물 제안

구현 시 신규 제안 경로:

- `scripts/qa/1144-p0cd-ledger-invariants.ps1` — 두 DB read-only 조회, 종료코드 즉시 검사, 결과 비교.
- `scripts/qa/sql/1144-p0cd-slip-source-baseline.sql` — source 문서·라인·거래처별 정본.
- `scripts/qa/sql/1144-p0cd-accounting-lineage-baseline.sql` — journal·claim·세금계산서 인과.
- accounting/slip service의 source identity 계약 테스트와 삭제→재생성 통합 테스트.

파일명은 구현 계획에서 저장소 기존 QA 구조와 충돌 여부를 확인한 뒤 확정한다. 이번 설계 라운드에는 생성하지 않았다.

---

## 6. 슬라이스 경계

### 권장: 통합 1 PR, 내부 순서 분리, 한 번에 배포

source identity가 P0-C read path와 P0-D write path의 공통 계약이므로 최종 배포는 나누지 않는 편이 안전하다.

1. **Gate/contract**: G1~G9를 RED로 고정. source enum/DTO 계약과 legacy cutover 기준을 먼저 확정.
2. **P0-C**: OUTBOUND/INBOUND 타입 안전 projection, 별도 RECEIVABLE/PAYABLE fold, UI/CSV/인쇄/snapshot schema.
3. **P0-D**: explicit lineage, 회계전표 POST journal, 원자성·멱등성·역분개·삭제 가드.
4. **발행 통합**: 개별/묶음 issuance orchestrator, 연결 gate, 세금계산서 발행 시 채권·채무 delta 0.

한 단계라도 실패하면 PR 전체를 배포하지 않는다. 특히 P0-D만 먼저 켜는 상태를 만들지 않는다.

### 부득이하게 2 PR로 나누는 경우

| 순서 | 범위 | 중간 상태 영향 |
|---|---|---|
| PR 1 | gate + source identity DTO + P0-C read/UI | 문서원장 채무 +116,747,400원으로 더 정확해짐. DB journal write 없음. 채권 359,003,920원 불변. 분개 기반 표면은 현행대로라 UI에 거래 기준/게시 기준을 명시해야 함 |
| PR 2 | P0-D lineage/post/reversal + 발행 통합 | PR 1의 source key를 소비. 배포 전 G5가 journal 중복 0을 보장 |

역순은 금지한다. PR 2를 먼저 배포하면 현재 빈 `canonicalSlipKeys` 때문에 OUTBOUND 원천 문서와 신규 110 journal이 이중계상될 수 있다. PR 1 이후 중간 상태는 원장이 더 틀리지는 않지만, 문서원장과 총계정원장의 시점 차이가 계속되므로 Q1 승인이 필요하다.

---

## 7. 개발책임자 판단이 필요한 질문

### Q1. “거래처별 채권/채무 원장”의 표면 범위

- **(a) 거래처별 문서원장만 전표 즉시, 채권채무 현황·총계정원장은 POST 후**
  - 비용: 현행 회계 audit 의미를 보존한다. 메뉴별 시점이 다르므로 `거래 기준`/`게시 기준` 안내가 필요하다.
- (b) 문서원장+채권채무 현황은 즉시, 총계정원장은 POST 후
  - 비용: aging에 미게시 문서 상계 규칙이 추가된다.
- (c) 세 표면 모두 즉시
  - 비용: 총계정원장이 순수 journal 원장이 아니게 되고 provisional 계정·치환 계약이 필요하다.

설계 추천은 **(a)**다. 이는 코드가 명시한 문서원장과 총계정원장의 현재 역할을 보존하면서 개발책임자 명세의 “회계전표 전 거래처별 원장 반영”을 충족한다.

### Q2. 회계전표 POST 계정과 세금계산서 책임

- **(a) 회계전표 POST가 채권·채무 journal 생성, 세금계산서 발행 delta 0 (권장)**
  - 금액 영향: 미래 POST부터 해당 회계전표 금액이 journal 표면에 1회 반영. 현행 개별 세금계산서 110 생성 책임 제거.
  - 추가 결정: 매출·매입 각각의 상대 계정과 VAT 계정.
- (b) 세금계산서 발행이 journal 생성, 회계전표 POST는 상태만
  - 금액 영향: 묶음도 개별과 같게 만들 수 있으나 다른 회계메뉴 반영이 발행까지 늦어진다.
- (c) POST 임시분개→발행 확정분개
  - 금액 영향: 총액은 같아도 역분개·치환 journal이 늘며 실패 복구가 가장 복잡하다.

### Q3. 독립 세금계산서

- **(a) 회계전표 source가 없으면 신규 발행 차단 (명세 정렬 권장)**
  - 기존 활성 세금계산서 19건은 legacy history로 유지하고 신규부터 gate 적용.
- (b) 독립 발행 허용, 세금계산서 자체를 별도 source로 등록
  - `SALES/PURCHASE`와 `OUTBOUND/INBOUND` 조합별 채권/채무 규칙을 추가로 결정해야 한다. 현재 OUTBOUND+PURCHASE 3건/6,050,000원 경계가 있다.
- (c) 독립 발행은 허용하되 회계 영향 없음
  - 세금계산서와 회계메뉴 인과가 갈라진 legacy 성격을 미래에도 유지한다.

### Q4. P0-C 소급

- **(a) 전건 live 소급 (권장)**: 채무 문서원장 **+116,747,400원**, 20건/12거래처. 채권 변화 0원.
- (b) 앞으로만: 현재 변화 0원, 기존 누락 116,747,400원 영구 잔존.

### Q5. ISSUED 무분개 8건

- **(a) legacy 예외, 소급 0원**
- (b) 수동으로 source가 증명된 건만: 현재 자동 cohort **0건/0원**, 검토 결과만큼 변동.
- (c) 전건 재처리: 최대 **23,100,000원** 접촉. 그중 3건/6,050,000원 방향 미확정, provenance 미확정, 역분개 필요 가능.

### Q6. 회계전표 삭제 후 연결 세금계산서

- (a) 세금계산서 취소→회계전표 VOID/역분개→재생성→새 세금계산서
  - 감사 이력이 가장 명확하지만 외부 발행 취소까지 필요하다.
- (b) 세금계산서 연결만 해제하고 회계전표 VOID/재생성 후 재연결
  - 기존 세금계산서 번호를 보존하지만 법적/외부 발행 상태와 허용되는지 확인이 필요하다.
- (c) 연결 세금계산서가 있으면 회계전표 삭제·재생성 금지
  - 가장 안전하지만 명세 규칙 11의 사용 범위를 제한한다.

---

## 8. 확정하지 않은 것

- 회계 매출·매입전표 POST의 정확한 상대 계정과 VAT 계정.
- 독립 세금계산서의 `invoiceType`/`direction` 조합별 채권·채무 의미.
- ISSUED 무분개 8건의 실제 생성 경로. DB에는 provenance가 없다.
- 기존 세금계산서 110 순액 4,259,999원과 OUTBOUND 359,003,920원의 거래별 중복 여부.
- INBOUND 정본 상태가 OUTBOUND의 5개 상태와 영구히 같은지. 이번 수치는 선행 분석과 동일 조건으로만 재현했다.
- 연결 세금계산서가 있는 회계전표의 삭제·재생성 업무 순서.

이 항목은 구현자가 추론하지 않는다.

## 9. 신규 파일 목록

이번 작업에서 실제 생성한 파일은 하나다.

- `docs/dev-reports/2026-08-09-1144-p0cd-source-identity-design.md`

§5.3의 gate 파일들은 구현 시 제안이며 이번에는 생성하지 않았다.
