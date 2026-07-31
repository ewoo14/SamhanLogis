# PR #991 라이브 QA — 전환 재시도 · 전표 금액 표시 (GUI)

**실행**: 2026-08-01 · **대상 SHA**: `94bfedf73` 이후 브랜치 최신 · **수행**: PM (Codex 샌드박스에 브라우저가 없어 직접 수행)

## 실행 환경

| | |
|---|---|
| `slip-service` 컨테이너 | 이 워크트리 코드로 재빌드, 기동 후 `healthy` |
| 게이트웨이 | `http://localhost:8080` (mock OFF) |
| 렌더러 | `vite src/renderer --config vite.renderer.dev.config.ts --port 5931` (HashRouter) |
| 계정 | `dev_manager` (MANAGER) |
| 대상 주문 | `2026/06/08-1981` — QA 시드 계열, 실 거래처 실 주문 아님 |

## 확인한 것

이 PR 의 fix 가 바꾼 표면은 **"같은 멱등 키 재시도 판정"** 이며, 실 사용자가 그것을 만드는 조작은 **전환 버튼 더블클릭 · 네트워크 재시도**다.

| # | 캡처 | 확인 |
|---|---|---|
| 01 | `01-order-detail-before-convert.png` | 전환 전 주문 상세 |
| 02 | `02-convert-modal-ready.png` | 전환 모달 · 출고 창고 `HQ-001` 선택 |
| 03 | `03-convert-result-after-doubleclick.png` | **더블클릭** 제출 직후 |
| 04 | `04-order-detail-after-convert.png` | 전환완료 · **전환됨 1 · 잔여 0** — 전표가 하나만 생김 |
| 05 | `05-slip-detail-amounts.png` | 발행된 전표 상세 금액 |

## 결과

### ① 더블클릭에도 전표가 하나만 생겼다

```text
HTTP 200 :: {"success":true,"code":"OK","data":{"slipNo":"2026/08/01-8",
             "orderStatus":"CONVERTED","fullyConverted":true}}
```

DB 대조 — 이 주문으로 생긴 전표:

```text
slip_no      | source_type   | has_idem
2026/08/01-8 | PARTNER_ORDER | t
```

**1건.** 화면에서도 `전환됨 1 · 잔여 0` 으로 표시된다(캡처 04).

### ② 금액이 화면에 올바로 표시된다

캡처 05 의 전표 라인:

| 모델명 | 수량 | 단가(VAT포함) | 공급가액 | 부가세 | 합계(VAT포함) |
|---|---:|---:|---:|---:|---:|
| AR15TXEAAWKNEU-07 | 1 | **1,800,000** | **1,636,364** | **163,636** | **1,800,000** |

`1,636,364 + 163,636 = 1,800,000` — **부가세 포함 단가에 부가세를 다시 더하지 않는다.** 이 PR 의 주제가 화면에서 확인된다.

DB 저장값도 일치:

```text
product_name        | qty | unit_price  | unit_price_with_vat | supply_amount | vat_amount | unit_price_domain
삼성 윈드프리 15평형 |   1 | 1636364.00  | 1800000.00          | 1636364.00    | 163636.00  | VAT_INCLUSIVE
```

## 이 QA 가 보지 않은 것

- **구 저장 규약 라인의 재시도** — 이 QA 는 새로 발행한 라인만 만들므로 과거 데이터와의 호환을 원리적으로 검사하지 못한다. 그 축은 `docs/dev-reports/2026-08-01-991-sol-review.md` · `-r2.md` 가 실 DB 전표 `2026/05/31-5` 로 별도 확인했다.
- 화면 상단의 `업데이트 실패` 배너는 데스크톱 자동 업데이트 피드 부재로 나오는 것이며 이 PR 과 무관하다.
