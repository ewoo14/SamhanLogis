# #1144 P0-D — 분개 인과 진단

> 진단일: 2026-08-09 KST  
> 범위: 진단만 수행. 코드·마이그레이션·실 DB 데이터 변경 없음. 모든 DB 명령은 `SELECT`만 실행.  
> 코드 기준: `origin/main` `103e229a651ed04c4bb5f66c3040f6e58b035656`  
> 빌린 작업트리 HEAD: `f3cb1ffb43869a02bdd9bc396d7aadcf2671e907` (`fix/1064-inbound-lifecycle`)  
> 시작 시 `git rev-list --count HEAD..origin/main`: **54**. 브랜치 전환·pull·merge 없음.

## 결론부터

계획서의 문장 **“세금계산서 발행 → 채권 분개”는 일부 경로에서 지금도 재현되지만 현행 전체를 설명하는 보편 명제는 아니다.** 정확한 현행은 다음 세 갈래다.

1. 매출·매입 **회계전표 POST**는 상태만 바꾸고 분개를 만들지 않는다.
2. 사용자가 직접 만든 세금계산서의 **개별 발행**은 110 채권 분개를 만든다.
3. POSTED 매출 회계전표를 선택하는 **묶음 발행**은 세금계산서를 `ISSUED`로 바꾸지만 분개를 만들지 않는다.

따라서 “회계전표 POST가 아니라 세금계산서 개별 발행이 채권 분개의 원인”이라는 계획서의 핵심 문제는 재현된다. 다만 “모든 세금계산서 발행이 채권 분개를 만든다”는 전제는 틀렸다. 실 DB도 ISSUED 12건 중 분개 있음 4건, 없음 8건으로 이 분기를 재현한다.

또한 개발책임자 명세의 **거래처별 채권 원장 즉시 반영**은 이미 OUTBOUND 문서원장에서 구현돼 있다. 현재 금액 결함은 그 절반인 **INBOUND 채무 문서원장이 없음**으로 인해 20건/116,747,400원이 빠진 P0-C이다. 반면 채권채무 현황·총계정원장은 분개만 읽으므로 별도 시점 계약 결정이 필요하다.

---

## 1. 재현 결과 — 코드 및 조회 원문

### 1.1 기준 확인 원문

```text
git rev-list --count HEAD..origin/main
54

git rev-parse HEAD
f3cb1ffb43869a02bdd9bc396d7aadcf2671e907

git rev-parse origin/main
103e229a651ed04c4bb5f66c3040f6e58b035656
```

판단은 모두 `git show origin/main:<경로>`로 읽은 코드에 근거한다.

### 1.2 회계 매출·매입전표 POST는 분개를 만들지 않는다

`SalesAccountingSlipService.java:71-82`의 실제 본문은 조회 후 `slip.post(actorUserId)`뿐이다.

```java
// services/accounting-service/.../service/SalesAccountingSlipService.java:71-82
/** 매출전표를 DRAFT 에서 POSTED 로 전이한다. */
@Transactional
public void post(String slipNo, String actorUserId) {
    SalesAccountingSlip slip = slipRepository.findBySlipNo(slipNo)
            .orElseThrow(...);
    slip.post(actorUserId);
}
```

매입도 동일하다.

```java
// services/accounting-service/.../service/PurchaseAccountingSlipService.java:71-82
/** 매입전표를 DRAFT 에서 POSTED 로 전이한다. */
@Transactional
public void post(String slipNo, String actorUserId) {
    PurchaseAccountingSlip slip = slipRepository.findBySlipNo(slipNo)
            .orElseThrow(...);
    slip.post(actorUserId);
}
```

두 클래스에는 `JournalService`, `JournalRepository`, `journalId` 의존성이 없다. 실 DB에서도 활성 회계 매출·매입전표를 source로 연결한 POSTED/REVERSED journal은 각각 0건이었다.

```sql
SELECT 'sales_accounting_source' AS source_kind, COUNT(*) AS journal_count
FROM journals j
JOIN sales_accounting_slips s
  ON s.id = j.source_ref_id AND s.is_deleted = false
WHERE j.is_deleted = false AND j.status IN ('POSTED','REVERSED')
UNION ALL
SELECT 'purchase_accounting_source', COUNT(*)
FROM journals j
JOIN purchase_accounting_slips s
  ON s.id = j.source_ref_id AND s.is_deleted = false
WHERE j.is_deleted = false AND j.status IN ('POSTED','REVERSED');
```

```text
source_kind                journal_count
sales_accounting_source                0
purchase_accounting_source             0
```

### 1.3 개별 세금계산서 발행은 채권 분개를 만든다 — 재현됨

개별 발행 endpoint는 `TaxInvoiceController.java:119-132`에서 `taxInvoiceService.issue()`를 호출한다.

```java
// services/accounting-service/.../web/TaxInvoiceController.java:119-132
/** ISSUED 전이 + tax_invoice_no 발급 + 자동 분개 (110/255/400). */
@PostMapping("/{id}/issue")
public ApiResponse<TaxInvoiceDetailResponse> issue(...) {
    return ApiResponse.ok(taxInvoiceService.issue(id, callerOrSystem(callerHeader)));
}
```

그 서비스는 먼저 세금계산서를 발행한 뒤 110 차변, 255·401 대변을 만들고 journal을 세금계산서에 연결한다.

```java
// services/accounting-service/.../service/TaxInvoiceService.java:223-265
/** 발행 — DRAFT → ISSUED. 발행번호 채번 + 자동 분개 게시 + journalId 연결. */
public TaxInvoiceDetailResponse issue(UUID id, String actorUserId) {
    TaxInvoice ti = findOrThrow(id);
    String taxInvoiceNo = taxInvoiceNumberService.next(ti.getSupplyDate());
    ti.issue(taxInvoiceNo, actorUserId);                         // :232
    ...
    lineSpecs.add(new AutoJournalLineSpec(ACCOUNT_RECEIVABLES,
            ti.getTotalAmount(), ZERO, ti.getPartnerId(), ...)); // :236-241
    ...
    Journal journal = journalService.postAutoJournal(...,
            JournalSourceType.SLIP, ti.getId(), ..., lineSpecs); // :257-263
    ti.linkJournal(journal.getId());                             // :264
}
```

이 인과는 커밋 `f8b8b49be203434a99b267d6637dd812c69ca700`에서 들어왔다. 커밋 제목은 `feat(accounting-service): P0-4 세금계산서 발행 + P2-4 매출 마감`이며 본문도 “자동 분개 (110/255/401)”를 명시한다.

### 1.4 셋째 가능성 — 묶음 발행은 ISSUED지만 분개 없음

매출 회계전표 묶음 경로는 `TaxInvoiceBatchController.java:80-99`이며 POSTED·미연결 회계전표만 후보로 조회한다. 그러나 실제 발행 서비스는 `TaxInvoiceService.issue()`를 호출하지 않는다.

```java
// services/accounting-service/.../service/TaxInvoiceBatchFromSalesSlipsService.java:104-113
TaxInvoice saved = taxInvoiceRepository.save(taxInvoice);
UUID taxInvoiceId = saved.getId();
for (SalesAccountingSlip slip : slips) {
    slip.linkTaxInvoice(taxInvoiceId);
}
saved.issue(saved.getTaxInvoiceNo(), actorUserId); // 상태 전이만
```

이 경로에는 `journalService.postAutoJournal()` 또는 `linkJournal()` 호출이 없다. 이 코드는 PR **#267**, 커밋 `f5722ca9176c29f877f9592b2bbf1fdf44847ef2`에서 들어왔다.

실 DB 원문은 코드 분기를 그대로 보인다.

```sql
SELECT ti.status,
       CASE WHEN ti.journal_id IS NULL THEN 'NO_JOURNAL' ELSE 'WITH_JOURNAL' END AS journal_state,
       COUNT(*) AS invoice_count,
       COALESCE(SUM(ti.total_amount),0) AS amount
FROM tax_invoices ti
WHERE ti.is_deleted=false
GROUP BY ti.status,
         CASE WHEN ti.journal_id IS NULL THEN 'NO_JOURNAL' ELSE 'WITH_JOURNAL' END
ORDER BY ti.status,journal_state;
```

측정: **2026-08-09 04:48:19.998044 KST**

| 상태 | 분개 | 건수 | 금액 |
|---|---|---:|---:|
| CANCELLED | 없음 | 2 | 4,730,000원 |
| CANCELLED | 있음 | 1 | 330,000원 |
| DRAFT | 없음 | 4 | 341,000원 |
| ISSUED | 없음 | **8** | **23,100,000원** |
| ISSUED | 있음 | **4** | **4,259,999원** |

취소 역분개까지 포함한 세금계산서 관련 110 순액은 4,259,999원이다.

```text
related_journals  ar_debit     ar_credit   ar_net
6                 4,589,999    330,000     4,259,999
```

### 1.5 재현 판정

- **이미 해결됐다:** 아님. `origin/main`에서도 회계전표 POST는 분개를 만들지 않고 개별 세금계산서 발행이 110을 만든다.
- **표본이 없다:** 회계전표 POST→분개 표본은 활성 회계전표 자체가 0건이라 실 DB 실행 표본은 없다. 다만 코드가 분개 호출을 전혀 하지 않으므로 현행 동작은 판정 가능하다.
- **계획서가 틀렸다:** “모든 세금계산서 발행이 채권 분개를 만든다”는 넓은 표현은 틀렸다. 개별 발행만 만들고 묶음 발행은 만들지 않는다.
- **정확한 판정:** 계획서의 핵심 인과 역전은 **부분 재현**, 보편화는 **반증**이다.

---

## 2. 개발책임자 명세 ↔ 현행 차이

개발책임자 명세 원문:

> 거래처별 채권 또는 채무원장에는 생성된 매출전표와 매입전표와 동시에 매출액 및 매입액이 반영이 되지. (회계전표 생성 전에도 반영은 되어야하며, 회계전표 생성 및 연결의 이유는 세금계산서 발행 및 다른 회계메뉴에서 확인하기 위함)
>
> 회계전표를 생성하여 연결하지 않으면 세금계산서 메뉴에 나오지 않으므로 계산서 발행은 불가하지.

| 단계 | 명세 | `origin/main` 현행 | 코드 근거 | 판정 |
|---|---|---|---|---|
| OUTBOUND 판매전표 생성 | 거래처별 채권 원장에 회계전표 전 즉시 반영 | slip-service 원천 판매전표를 직접 읽어 SALE로 fold | `SlipInternalController.java:381-428`, `SlipRepository.java:256-273`, `PartnerLedgerReadModelService.java:131-170,350-368` | **명세대로 이미 구현** |
| INBOUND 구매전표 생성 | 거래처별 채무 원장에 회계전표 전 즉시 반영 | 조회가 `SlipType.OUTBOUND`로 고정되고 purchase/payable projection 없음 | `SlipRepository.java:256-273` 특히 `:260`, `PartnerLedgerReadModelService.java:49,131-170` | **미구현(P0-C)** |
| 회계 매출전표 POST | 다른 회계메뉴에서 볼 채권 분개 생성 | DRAFT→POSTED 상태 전이만 수행 | `SalesAccountingSlipService.java:71-82` | **분개 없음** |
| 회계 매입전표 POST | 다른 회계메뉴에서 볼 채무 분개 생성 | DRAFT→POSTED 상태 전이만 수행 | `PurchaseAccountingSlipService.java:71-82` | **분개 없음** |
| 채권채무 현황 | 업무 범위가 명세에서 불명확 | 110/120·201/210 journal line만 읽음 | `ReceivablesPayablesService.java:45-47,153-166` | 문서원장과 시점 다름. 업무 판단 필요 |
| 총계정원장 | 업무 범위가 명세에서 불명확 | POSTED/REVERSED journal line만 읽음 | `LedgerService.java:101-107`, `JournalLineRepository.java:99-110` | 문서원장과 시점 다름. 업무 판단 필요 |
| 회계전표 연결 후 세금계산서 후보 | 연결된 회계전표만 세금계산서 메뉴에 노출 | 묶음 후보는 POSTED + `taxInvoiceId IS NULL` 회계 매출전표만 조회 | `SalesAccountingSlipRepository.java:65-77`, `TaxInvoiceBatchFromSalesSlipsService.java:40-66` | 이 전용 메뉴는 게이트 있음 |
| 일반 세금계산서 생성·목록 | 미연결이면 메뉴 노출·발행 불가 | 회계전표 없이 DRAFT 생성 가능; history 목록에 회계전표 연결 조건 없음; 개별 발행 가능 | `TaxInvoiceController.java:86-99,119-132,180-207`, `TaxInvoiceRepository.java:69-83`, `TaxInvoiceService.java:100-111` | **명세와 다름** |
| 개별 세금계산서 발행 | 연결은 노출·발행을 위한 것 | 발행 자체가 110/255/401 분개를 생성 | `TaxInvoiceService.java:223-265` | **핵심 인과 역전 재현** |
| 회계전표 묶음 세금계산서 발행 | 동일한 발행 인과 기대 여부는 명세에 없음 | ISSUED 전이·연결은 하지만 분개 없음 | `TaxInvoiceBatchFromSalesSlipsService.java:104-113` | **발행 경로끼리 불일치** |

거래처별 채권 원장 즉시 반영 의도는 코드 주석에도 명시돼 있다.

```java
// SlipInternalController.java:381-386
/** 거래처별 원장용 판매전표 read projection 조회.
 * 원장은 회계 반영 완료 목록이 아니라 거래 사실 문서이므로 ... 포함한다.
 */
```

즉 계획서가 “거래처별 채권 원장도 세금계산서 전에는 안 보인다”고 읽혔다면 그 부분은 틀렸다. 문서원장의 채권 절반은 이미 명세대로다.

---

## 3. 현재 건수와 금액

### 3.1 측정 조건과 SQL 원문

공유 DB이므로 수치는 측정 시각의 스냅샷이다. accounting_db 측정은 **2026-08-09 04:46:34.610430 KST**, slip_db 측정은 **2026-08-09 04:46:34.798303 KST**로 0.188초 차이다.

원천 전표 금액 산식은 현재 `PartnerLedgerSalesResponse.lineAmount()`와 P0-C가 사용한 우선순위와 같다.

```sql
WITH canonical AS (
    SELECT s.id, s.slip_type, s.partner_id
    FROM slips s
    WHERE s.is_deleted=false
      AND s.slip_type IN ('OUTBOUND','INBOUND')
      AND s.status IN ('CONFIRMED','DELIVERED','COMPLETED','INSPECTING','SHIPPING')
), amounts AS (
    SELECT c.id, c.slip_type, c.partner_id,
           COALESCE(SUM(
               CASE
                 WHEN l.supply_amount IS NOT NULL AND l.vat_amount IS NOT NULL
                   THEN l.supply_amount + l.vat_amount
                 WHEN l.unit_price_with_vat IS NOT NULL
                   THEN l.unit_price_with_vat * l.quantity
                 WHEN l.line_total IS NOT NULL
                   THEN l.line_total + COALESCE(l.vat_amount,0)
                 ELSE 0
               END
           ) FILTER (WHERE l.is_deleted=false),0) AS amount
    FROM canonical c
    LEFT JOIN slip_lines l ON l.slip_id=c.id
    GROUP BY c.id,c.slip_type,c.partner_id
)
SELECT slip_type,COUNT(*) AS slip_count,
       COUNT(DISTINCT partner_id) AS partner_count,SUM(amount) AS amount
FROM amounts
GROUP BY slip_type
ORDER BY slip_type;
```

회계전표와 세금계산서 연결 집계 원문:

```sql
SELECT 'sales_accounting_slips' AS kind, status, COUNT(*),
       COALESCE(SUM(total_amount),0),
       COUNT(*) FILTER (WHERE tax_invoice_id IS NOT NULL)
FROM sales_accounting_slips
WHERE is_deleted=false
GROUP BY status
UNION ALL
SELECT 'purchase_accounting_slips', status, COUNT(*),
       COALESCE(SUM(total_amount),0),
       COUNT(*) FILTER (WHERE tax_invoice_id IS NOT NULL)
FROM purchase_accounting_slips
WHERE is_deleted=false
GROUP BY status;

SELECT COUNT(*) AS tax_total,
       COUNT(*) FILTER (WHERE status='ISSUED') AS issued,
       COUNT(*) FILTER (WHERE status='DRAFT') AS draft,
       COUNT(*) FILTER (WHERE status='CANCELLED') AS cancelled,
       COUNT(*) FILTER (WHERE journal_id IS NOT NULL) AS with_journal,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM sales_accounting_slips s
                       WHERE s.is_deleted=false AND s.tax_invoice_id=tax_invoices.id)
            OR EXISTS (SELECT 1 FROM purchase_accounting_slips p
                       WHERE p.is_deleted=false AND p.tax_invoice_id=tax_invoices.id)
       ) AS linked_from_accounting_slip
FROM tax_invoices
WHERE is_deleted=false;
```

### 3.2 결과

| 항목 | 건수 | 거래처 | 금액 | 회계전표/원장 상태 |
|---|---:|---:|---:|---|
| 활성 OUTBOUND 원천 전표 | **40** | **34** | **359,003,920원** | 활성 회계 매출전표 0건. 거래처별 채권 문서원장에는 직접 반영 |
| 활성 INBOUND 원천 전표 | **20** | **12** | **116,747,400원** | 활성 회계 매입전표 0건. 거래처별 채무 문서원장 경로가 없어 전액 누락 |
| 활성 매출 회계전표 | **0** | - | **0원** | POSTED 후보 0 |
| 활성 매입 회계전표 | **0** | - | **0원** | POSTED 후보 0 |
| 활성 세금계산서 | **19** | - | **32,760,999원** | 회계전표 연결 0건 |
| ISSUED 세금계산서 | **12** | - | **27,359,999원** | 분개 있음 4건/4,259,999원, 없음 8건/23,100,000원 |

활성 accounting slip은 0건이므로 위 60건은 모두 **활성 회계전표가 없는 원천 전표**다. 과거 soft-delete된 매출 회계전표 1건/330,000원과 active allocation 1행이 남아 있으나 원천 전표 `2026/07/27-64`도 `REJECTED`, soft-delete 상태이므로 위 활성 40건 cohort에는 포함되지 않는다.

### 3.3 “원장에 반영돼 있는가”의 정확한 답

원장이라는 이름의 표면이 서로 다른 데이터를 읽으므로 나눠야 한다.

1. **거래처별 문서원장**
   - OUTBOUND 40건/359,003,920원: 반영됨. 회계전표가 없어도 slip-service projection을 직접 읽는다.
   - INBOUND 20건/116,747,400원: 반영 안 됨. 이 금액이 P0-C의 누락 금액이며 P0-C의 **20건/12거래처**가 동일하게 재현됐다.
2. **채권채무 현황·총계정원장**
   - 60건을 회계전표 source로 연결한 journal은 0건이다. 따라서 이 60건이 회계전표를 통해 반영된 금액은 0원이다.
   - 기존 DB에는 다른 원천의 110·201·210 분개가 있으나 이를 위 60건의 반영으로 간주할 source 연결 근거가 없다.
3. **세금계산서 개별 발행 분개**
   - 세금계산서 관련 110 순액은 4,259,999원이다.
   - 모든 활성 세금계산서는 회계전표 연결이 0건이므로 이 금액이 어느 OUTBOUND 원천 문서와 같은 거래인지 코드·DB 연결로 판정할 수 없다. 중복이라고 단정하지 않는다.

참고로 전체 분개 기반 잔액은 다음과 같지만, 위 60건과의 인과 연결값은 아니다.

| 계정 | 차변 | 대변 | 차변 정상 순액 |
|---|---:|---:|---:|
| 110 | 526,330,034원 | 13,647,034원 | 512,683,000원 |
| 201 | 800,000원 | 4,070,000원 | -3,270,000원 |
| 210 | 0원 | 700,000원 | -700,000원 |

### 3.4 세금계산서 메뉴의 과다·과소 노출

“세금계산서 메뉴”는 코드상 일반 history와 회계전표 묶음 후보 메뉴가 다르므로 분리한다.

- **일반 history 메뉴:** `TaxInvoiceRepository.java:69-83`에는 회계전표 연결 조건이 없다. 활성 19건 전부 회계전표 미연결인데 목록 대상이다. 개발책임자 명세를 이 메뉴에 적용하면 **나오면 안 되는 19건**이며, 그중 실제 ISSUED는 12건/27,359,999원이다.
- **묶음 발행 후보 메뉴:** `SalesAccountingSlipRepository.java:65-77`이 POSTED·미연결 회계 매출전표만 조회한다. 현재 후보는 **0건/0원**이다. 활성 회계전표가 0건이므로 이 전용 메뉴에서 “나와야 하는데 안 나오는” 회계전표 표본은 **0건**이다.
- 일반 history의 19건을 어떤 정책으로 처리해야 하는지는 명세의 메뉴 범위가 확정되지 않아 업무 판단이 필요하다. 코드만으로 조용히 숨길 수 없다.

---

## 4. 고치는 순서와 소급 위험

### 4.1 기존 원장 값이 달라지는가

- **P0-C만 구현:** 거래처별 문서원장에 INBOUND 20건/116,747,400원이 새로 보이므로 기존 표시값이 달라진다. 원본을 읽는 projection이면 회계 DB write나 소급 migration은 필요 없지만, 저장된 snapshot이 있다면 schema/호환 정책이 별도 필요하다.
- **P0-D를 미래 POST에만 적용:** 기존 분개는 바뀌지 않는다. 이후 회계전표 POST부터 채권·채무 분개가 생기므로 채권채무 현황·총계정원장 값이 그 시점부터 달라진다.
- **P0-D를 과거 원천 전표에 소급:** 기존 원장 값이 크게 달라진다. 단순 후보 총액은 OUTBOUND 359,003,920원, INBOUND 116,747,400원이지만 이것을 그대로 게시하면 안 된다. 활성 회계전표가 0건이고 세금계산서 19건도 모두 회계전표 미연결이라 원천↔회계전표↔세금계산서 매칭 근거가 없다. 특히 이미 존재하는 세금계산서 110 순액 4,259,999원과의 중복 여부를 판정할 수 없다.

따라서 **과거 분개 소급 게시, 과거 회계전표 생성, 기존 세금계산서 연결은 모두 개발책임자 판단 사항**이다. 실행하면 코드 롤백으로 금액이 돌아오지 않으며, hard delete/UPDATE가 아니라 역분개와 감사 이력으로 되돌려야 한다.

### 4.2 권장 실행 순서와 위험

이 절은 해법 제안이며 실행하지 않았다.

1. **업무 계약 확정:** “거래처별 원장”이 문서원장만인지, 채권채무 현황·총계정원장까지인지 확정한다. 매출·매입 POST의 상대 계정과 VAT 계정을 확정한다.
2. **기준선 보존:** 110/120/201/210 잔액, 세금계산서 19건의 상태·금액·journal 연결, 저장 snapshot을 별도 검증 산출물로 고정한다.
3. **P0-C read 경로:** INBOUND 전용 projection과 payable fold를 먼저 만들되 OUTBOUND DTO를 억지로 재사용하지 않는다. DB write 없이 20건/116,747,400원이 정확히 한 번 보이는지 검증한다.
4. **P0-D source 계약:** 회계전표↔journal의 안정적인 source/idempotency 키를 먼저 정한다. 현재 `PartnerLedgerReadModelService.java:172-180`은 `canonicalSlipKeys = Set.of()`이므로 분개를 추가하기 전에 원천 문서와 journal 중복제거 규칙이 필요하다.
5. **POST와 분개를 한 트랜잭션으로:** 상태 전이·분개 게시·연결을 원자적이고 멱등하게 만든다. 실패 시 POSTED만 남지 않아야 한다.
6. **세금계산서 발행 책임 통합:** 개별 발행과 묶음 발행의 분개 책임을 하나로 정한다. 이미 POST 분개가 있으면 세금계산서 발행에서 110/201/210 델타가 0이어야 한다.
7. **미래 데이터로 먼저 검증:** feature flag 또는 제한된 날짜 이후 데이터로 시작한다. POST 전후 문서원장 금액이 한 번만 보이는지, journal 표면만 정확히 변하는지 확인한다.
8. **소급은 별도 승인 후:** 자동 backfill하지 않는다. 연결 가능한 cohort, 예외, 역분개 절차, 롤백 비용을 제시하고 개발책임자 승인 후 별도 실행한다.

가장 큰 위험은 (a) 원천 문서와 신규 journal의 이중계상, (b) 기존 세금계산서 journal과 신규 POST journal의 중복, (c) 묶음·개별 발행 경로 불일치, (d) 소급 후 코드 롤백만으로 복구할 수 없다는 점이다.

---

## 5. P0-C와 같은 뿌리인가

**직접 원인은 다르다.**

- P0-C 직접 원인: `SlipRepository.java:260`의 `SlipType.OUTBOUND` 고정과 INBOUND/payable DTO·fold·UI 부재. 읽기 projection 문제다.
- P0-D 직접 원인: `SalesAccountingSlipService.java:77-82`와 `PurchaseAccountingSlipService.java:77-82`가 상태만 바꾸고 journal을 만들지 않는 것, 그리고 `TaxInvoiceService.issue()`와 묶음 발행 서비스의 분개 책임이 서로 다른 것. 쓰기 인과·멱등성 문제다.

그러므로 “같은 root cause라 한 구현 슬라이스로 반드시 묶어야 한다”는 판정은 아니다. **P0-C는 read-only 성격으로 분리 가능**하다.

다만 두 작업의 통합 계약은 함께 설계해야 한다. P0-D가 journal을 만들기 시작하면 현재 비어 있는 `canonicalSlipKeys` 때문에 P0-C/기존 OUTBOUND 원천 문서와 journal이 두 번 fold될 수 있다. 권장은 **한 프로그램 아래 두 하위 슬라이스**다.

1. P0-C: 타입 안전한 INBOUND/payable 문서원장.
2. P0-D: source 연결·중복제거·멱등성·세금계산서 책임 이전을 포함한 분개 인과.

P0-D 배포 전에는 두 슬라이스의 source identity와 “문서원장=전표 즉시 / 총계정원장=POST” 같은 표면별 시점 계약을 하나로 승인해야 한다.

---

## 개발책임자 판단이 필요한 질문

### Q1. 명세의 “거래처별 채권/채무 원장” 범위

- **(a) 거래처별 문서원장만 전표 즉시, 채권채무 현황·총계정원장은 POST 이후**
  - 대가: 회계 audit 표면은 보존되지만 같은 거래가 메뉴별로 다른 시점에 보인다. UI에 `거래 기준`/`게시 기준` 설명이 필요하다.
- **(b) 문서원장+채권채무 현황은 전표 즉시, 총계정원장은 POST 이후**
  - 대가: 운영 잔액은 빨리 보이지만 aging에 미게시 문서 상계 규칙이 추가된다.
- **(c) 세 표면 모두 전표 즉시**
  - 대가: 총계정원장이 순수 journal 원장이 아니게 되고 provisional 계정·대차·POST 치환 계약이 필요하다.

본 진단은 업무 의미를 추론하지 않으므로 추천을 확정하지 않는다.

### Q2. 분개 생성 시점과 세금계산서 책임

- **(a) 회계전표 POST가 채권·채무 분개를 만들고, 모든 세금계산서 발행 경로는 추가 110/201/210을 만들지 않음**
  - 대가: 인과가 명세 문장과 정렬되지만 개별 발행·묶음 발행·기존자료 호환을 함께 바꿔야 한다.
- **(b) 회계전표 POST는 상태만 유지하고 세금계산서가 분개를 만듦**
  - 대가: 현행 개별 발행과 가깝지만 개발책임자 원문의 “회계전표 생성 전에도 원장 반영”과 분개 기반 표면 사이의 시점 차이를 공식 계약으로 승인해야 하며 묶음 발행 누락도 별도 수정해야 한다.
- **(c) 회계전표 POST는 임시분개, 세금계산서 발행은 확정/치환**
  - 대가: 가장 복잡하다. 임시분개 상태, 치환, 역분개, 실패 복구가 추가된다.

Q2와 함께 매출·매입 상대 계정 및 VAT 계정도 확정해야 한다. 코드만으로 정하지 않는다.

### Q3. 과거 데이터 소급 범위

- **(a) 소급 없음, 결정일 이후만 새 인과 적용**
  - 대가: 안전하고 되돌리기 쉽지만 과거와 미래의 journal 표면 기준이 다르다.
- **(b) 연결이 증명되는 건만 소급**
  - 대가: 보수적이지만 현재 활성 회계전표 0건·세금계산서 연결 0건이라 자동 매칭 가능한 표본이 거의 없거나 없을 수 있다. 수동 검토가 필요하다.
- **(c) 원천 전표 60건을 회계전표·journal로 전면 backfill**
  - 대가: OUTBOUND 359,003,920원·INBOUND 116,747,400원에 접촉한다. 기존 세금계산서 journal과 중복될 수 있고, 오류 시 역분개가 필요하다. **되돌리기 어려운 개발책임자 승인 사항**이다.

### Q4. 기존 미연결 세금계산서 19건

- **(a) 기존자료 예외로 history에 유지**
  - 대가: 감사 이력은 보존되지만 “미연결은 메뉴에 안 나옴”의 예외가 계속 남는다.
- **(b) 증명 가능한 회계전표에만 소급 연결**
  - 대가: 현재 활성 회계전표가 0건이어서 선행 backfill 및 수동 매칭이 필요하다.
- **(c) 취소 후 올바른 경로로 재생성**
  - 대가: 발행·취소·역분개 감사 이력이 늘고 외부 발행 상태까지 확인해야 하므로 가장 위험하다.

일반 history와 묶음 발행 후보 중 어느 화면까지 “세금계산서 메뉴”로 보는지도 함께 확정해야 한다.

---

## 확정하지 않은 것

- 명세의 “거래처별 원장”이 채권채무 현황·총계정원장까지 포함하는지는 코드로 알 수 없다.
- 세금계산서 110 순액 4,259,999원이 OUTBOUND 359,003,920원의 어느 문서와 같은 거래인지는 연결키가 없어 판정할 수 없다. 중복이라고 추론하지 않았다.
- ISSUED 8건/23,100,000원에 journal이 없는 이유가 모두 묶음 발행 때문인지는 provenance 컬럼이 없어 DB만으로 단정할 수 없다. 코드에는 journal 없는 묶음 발행 경로가 존재하고, 데이터는 그 가능한 결과를 재현한다.
- 회계전표 POST의 정확한 상대 계정·VAT 계정은 개발책임자 결정 전에는 정할 수 없다.
- INBOUND 정본 상태를 OUTBOUND의 5개 상태와 완전히 대칭으로 볼지는 확정하지 않았다. P0-C와 동일한 상태 집합으로 수치 재현만 했다.

## 신규 파일 경로

- `docs/dev-reports/2026-08-09-1144-p0d-journal-causality-diagnosis.md`
