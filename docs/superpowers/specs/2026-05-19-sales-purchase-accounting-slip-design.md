# SAS (Sales/Purchase Accounting Slip) — 출고→매출 / 입고→매입 + 홈택스 발행 자동화 디자인

> 작성일: 2026-05-19
> 작성자: PM (Claude) + 개발책임자 brainstorming
> 슬라이스 ID: SP-SAS (Sales/Purchase Accounting Slip)
> 상태: **brainstorming 진행 중** — sections §1~§N 누적 작성 중
> 후속 단계: BR-6 spec self-review → BR-8 사용자 리뷰 → writing-plans → implementation
>
> **본 spec 의 결정사항은 git tracked 의무** (사용자 명시 2026-05-19): 매 결정 후 즉시 본 문서 갱신 + commit.

---

## 0. 배경 / 동기

기존 흐름 (검증 완료):
- `slip-service` — 출고/입고 전표 (Slip, SlipType.OUTBOUND/INBOUND) + line items, state machine
- `accounting-service` — TaxInvoice (세금계산서) 도메인 + ETaxClient (NTS 홈택스 실 발행, **SP-09-1**)
- TaxInvoiceBatchService — 홈택스 일괄 업로드 양식 (.xlsx 59컬럼)

**누락된 다리** (`docs/qa/sp-09-1-nts-etax-emit-shell/claude-qa-cycle1.md:213` 인용):
> "emit-nts 엔드포인트는 slip-service 와 직접 연결되지 않는다... 'ISSUED 세금계산서 → NTS 발행' 흐름은 slip-service 의 slip 상태와 직접 연동되지 않는 설계"

→ 본 슬라이스는 **출고전표 → 매출전표(회계분개) → 세금계산서 → 홈택스 발행** 의 자동화 다리 + **입고전표 → 매입전표 → 세금계산서 수신** 대칭 패턴을 신설.

---

## 1. 핵심 결정 (D-SAS-01 ~ D-SAS-07 + VAT 추가) — 사용자 확정 2026-05-19

| # | 결정 | 근거 / 영향 |
|---|---|---|
| D-SAS-01 | **매출전표 / 매입전표 = 회계 분개 전표 (별도 도메인)** — 세금계산서와 분리. SalesAccountingSlip / PurchaseAccountingSlip 신규 엔티티 | 한국 회계 관례: 분개(차변/대변) 단위와 세금계산서 발행 단위 분리. 면세 거래도 매출/매입전표는 필요하나 세금계산서는 X |
| D-SAS-02 | **도메인 위치 = `accounting-service` 내부 신규** | cross-DB 최소, TaxInvoice 와 결합도 높음. slip-service 는 read-only 호출 대상 |
| D-SAS-03 | **트리거 = 관리자 수동** (자동 X) | 회계 정확성 우선. CONFIRMED 시 자동 생성은 검증 후 별도 슬라이스로 분리 가능 |
| D-SAS-04 | **매핑 단위 = N:M flexible — Line + Sub-amount 분할** | N 출고전표 → M 매출전표 (묶음/분할 자유). line 단위 + line 내 금액 일부 분할까지 허용 |
| D-SAS-05 | **합계 검증 = partial 허용 + 잔여 표시 + over-allocation 차단** | 출고전표 잔여 (미분할) 가시화 (UI alert/badge). 단 allocated > total 절대 차단 |
| D-SAS-06 | **세금계산서 = 매출전표 N:1 묶음 발행** (동일 거래처·동일월 기준) | 한국 일괄 발행 관례. 기존 TaxInvoiceBatchService 확장 |
| D-SAS-07 | **입고 측 100% 대칭** — PurchaseAccountingSlip + 세금계산서 수신 (NTS API 수신 또는 수동 등록) | 매출 패턴 미러 |
| **VAT** | **출고/입고전표 단가 = 부가세 포함 (VAT-inclusive)** → 매출/매입전표 변환 시 `공급가액 = 단가 / 1.1` + `부가세 = 단가 - 공급가액` 분리 | 한국 세법 요구. 면세 거래는 1.0 / 영세는 0% (D-SAS-08+ 결정 예정) |

---

## 2. Architecture Overview (디자인 §1)

```
┌──────────────────────────────────────────────────────────────┐
│  slip-service (기존, 무수정)                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Slip(OUTBOUND/INBOUND) + SlipLine                      │ │
│  │  state: DRAFT → CONFIRMED → LOCKED                     │ │
│  │  단가 = 부가세 포함 (VAT-inclusive)                     │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                   ↑ SlipServiceClient (Feign, REST)
                   │ GET /internal/slips/{id}/lines + GET /by-period
                   │ read-only contract (역방향 의존 없음)
┌──────────────────────────────────────────────────────────────┐
│  accounting-service (확장)                                    │
│                                                               │
│  [신규] SalesAccountingSlip     [신규] PurchaseAccountingSlip │
│         + Line + Allocation            + Line + Allocation   │
│         (출고전표 source 매핑)         (입고전표 source 매핑) │
│         status: DRAFT/POSTED/VOIDED                          │
│                                                               │
│  [기존] TaxInvoice ←── N:1 묶음 (동일 거래처·월)              │
│         status: DRAFT → ISSUED → EMITTED (NTS 전송)           │
│         ETaxClient → NTS 홈택스 (SP-09-1 완비)                │
│                                                               │
│  [신규] TaxInvoice 수신 분기 — 매입측                          │
│         NTS 수신 API or 관리자 수동 등록 또는 OCR (Phase 후속) │
└──────────────────────────────────────────────────────────────┘
```

**핵심**:
- accounting-service 가 slip-service 를 **read-only 호출만** (역방향 의존 없음, slip-service 무수정)
- 매출/매입 전표 = 회계 분개 + 출고/입고 line 매핑 + VAT 분리 컬럼
- 세금계산서는 매출전표를 source 로만 사용 — N:1 묶음 (기존 TaxInvoiceBatchService 확장)
- 트랜잭션 경계 = accounting_db 단일 (slip 쪽 변경 무)

---

## 3. 도메인 모델 (디자인 §2 — 작성 예정)

(brainstorming §2 단계에서 작성)

---

## 4. 워크플로우 (디자인 §3 — 작성 예정)

(brainstorming §3 단계에서 작성)

---

## 5. VAT 계산 + 면세/영세 처리 (디자인 §4 — 작성 예정)

(brainstorming §4 단계에서 작성)

---

## 6. 에러 처리 + Audit (디자인 §5 — 작성 예정)

(brainstorming §5 단계에서 작성)

---

## 7. Admin UI (디자인 §6 — 작성 예정)

(brainstorming §6 단계에서 작성)

---

## 8. 테스트 전략 (디자인 §7 — 작성 예정)

(brainstorming §7 단계에서 작성)

---

## 9. 슬라이스 분해 (writing-plans 단계 입력)

전체 spec → implementation plan 단계에서 N개 슬라이스 분해 예정 (각 슬라이스는 [feedback_dual_5agent_review] cycle 1 진행):

- **SP-SAS-1** — SalesAccountingSlip 도메인 + 매출 흐름 (출고→매출, allocation, VAT)
- **SP-SAS-2** — PurchaseAccountingSlip 도메인 + 매입 흐름 (입고→매입)
- **SP-SAS-3** — 매출전표 N:1 묶음 → TaxInvoice 발행 (기존 TaxInvoiceBatchService 확장)
- **SP-SAS-4** — TaxInvoice 수신/등록 + 매입전표 매칭
- **SP-SAS-5** — Admin UI (4 페이지: 매출전표 / 매입전표 / 세금계산서 발행 / 세금계산서 수신)

---

## 10. 후속 메모리 / 핸드오프 갱신 의무

- `migration/decisions/DECISIONS.md` — `D-SAS-00 ~ D-SAS-NN` entry 추가
- `docs/handoff/CURRENT-WORK.md` — 최상단 §A 본 슬라이스 갱신
- `.claude/memory/MEMORY.md` — 본 슬라이스 메모리 entry (`project_sales_purchase_accounting_slip.md`) 추가 검토
- `services/accounting-service/README.md` — 신규 도메인 + endpoint 갱신 (구현 후)
- `clients/desktop/src/renderer/...README.md` — 관련 UI 페이지 갱신 (구현 후)

[feedback_continuous_docs_sync] 준수 — 별도 docs PR 금지, 본 슬라이스 구현 PR 에 일괄 포함.
