# R63 라이브QA 보고서 — PR #1057 · 이슈 #874

- 실행일: 2026-08-06 (KST)
- HEAD: `ba3634960`
- 환경: `clients/desktop` Playwright `chromium`, mock OFF, renderer `localhost:5299`, API `http://localhost:8080`
- 계정: `dev_manager`
- 출고창고: `2 · 상일창고 S18`
- 저장 상태: 두 건 모두 `201 Created`, `OUTBOUND / DRAFT`
- 결론: **FAIL** — 거래처별 전역DC와 품목별 고정DC가 화면·저장 응답에 반영되지 않음

## 사전 API 대조

| 거래처 | 확인 결과 |
|---|---|
| `4348703365 주식회사 엠엠시스템에어(고영현)` | 전역DC: 홈멀티 `48%`, 상업멀티 `49%` |
| `000011111111 한울냉열시스템` | 전역DC 설정 행 없음 |

품목 좌표의 판매가는 AR09 `1,080,000원`, MCU `1,617,000원`으로 API에서 확인했다. AR09는 고정DC 없음, MCU는 고정DC `40%` 좌표다.

## 항목별 판정

### ① 고정DC 없는 품목 + 전역DC 반영 — FAIL

- 캡처: [04-mixed-fixed-and-global-dc-lines.png](04-mixed-fixed-and-global-dc-lines.png), [04-mixed-fixed-and-global-dc-lines.txt](04-mixed-fixed-and-global-dc-lines.txt)
- 실제 화면: `AR09TXEAAWKNEU-04` 단가 `1,080,000원`, `판매가` 표시. `48%` 또는 할인 단가가 보이지 않음.
- 기대: 홈멀티 전역DC `48%` 반영, 단가 `561,600원`(1,080,000 × 52%).
- 저장 응답: [05-mixed-lines-save-result-save-response.txt](05-mixed-lines-save-result-save-response.txt)
  - `unitPriceWithVat: 1080000.00`
  - `unitPrice: 981818.00`
  - `discountInfo: null`

### ② 고정DC 있음 + 고정DC 우선 — FAIL

- 캡처: [04-mixed-fixed-and-global-dc-lines.png](04-mixed-fixed-and-global-dc-lines.png), [04-mixed-fixed-and-global-dc-lines.txt](04-mixed-fixed-and-global-dc-lines.txt)
- 실제 화면: `MCU-S6NDB1N` 단가 `1,617,000원`, `판매가` 표시. 고정DC `40%`도, 상업멀티 전역DC `49%`도 표시되지 않음.
- 기대: `fixedDc ?? globalRate`에 따라 고정DC `40%` 우선, 단가 `970,200원`(1,617,000 × 60%).
- 저장 응답: [05-mixed-lines-save-result-save-response.txt](05-mixed-lines-save-result-save-response.txt)
  - `unitPriceWithVat: 1617000.00`
  - `unitPrice: 1470000.00`
  - `discountInfo: null`

### ③ 한 전표 혼합 라인별 할인 + `discountInfo`/`unitPrice` — FAIL

- 캡처: [04-mixed-fixed-and-global-dc-lines.png](04-mixed-fixed-and-global-dc-lines.png)
- 저장 전 실제 화면: AR09 `1,080,000원`, MCU `1,617,000원`; 두 라인 모두 정가이고 라인별 할인율이 없음.
- 기대: AR09 `48%`/`561,600원`, MCU 고정 `40%`/`970,200원`으로 라인별 상이한 할인 적용.
- 저장 응답 실제:
  - 전표 `2026/08/06-5`, `discountInfo: null`
  - AR09 `unitPrice: 981818.00`, `unitPriceWithVat: 1080000.00`
  - MCU `unitPrice: 1470000.00`, `unitPriceWithVat: 1617000.00`
- 원문: [05-mixed-lines-save-result-save-response.txt](05-mixed-lines-save-result-save-response.txt)

### ④ 전역DC 미설정 거래처 대조 — PASS

- 캡처: [06-no-global-dc-partner-line.png](06-no-global-dc-partner-line.png), [07-no-global-dc-save-result.png](07-no-global-dc-save-result.png)
- 비교 거래처: `000011111111 한울냉열시스템` (전역DC 설정 행 없음)
- 실제: AR09 단가 `1,080,000원`, `판매가` 표시; 저장 `201 Created`.
- 저장 전표: `2026/08/06-6`
- 응답 원문: [07-no-global-dc-save-result-save-response.txt](07-no-global-dc-save-result-save-response.txt)
- 대조 결과: 전역DC 미설정 시 정가로 저장되는 동작은 확인됨. 다만 ①의 전역DC 반영 실패와 함께 보면 대상 거래처와 비교 거래처의 화면·저장값이 동일하다.

### ⑤ 저장 차단·값 소실 여부 — PASS (단, 별도 503 알림 관찰)

- 두 시나리오 모두 저장 버튼이 동작했고 `201 Created`를 받았다.
- 혼합 전표는 2개 라인이 모두 저장 응답에 남았다. 비교 전표도 AR09 라인과 수량 1이 남았다.
- 따라서 이번 과정에서 저장 자체가 차단되거나 선택 품목·수량이 소실되지는 않았다.
- 단, 화면 상단에 `업데이트 실패: 업데이트에 실패했습니다...` 알림이 표시되었고 콘솔에 503 응답 3건이 관찰되었다. 이 알림은 저장 응답 실패가 아니며, 할인 FAIL의 근거는 별도로 저장 응답의 `discountInfo: null`과 정가 `unitPriceWithVat`이다.

## 실행 산출물

- 드라이버: `clients/desktop/r63-live-qa-driver.mjs` (신규; 지정된 금지 spec은 수정하지 않음)
- 보고서: `docs/qa/874-riusage-r63-real-qa/qa-report.md` (신규)
- 캡처/텍스트: `01-*` ~ `07-*` PNG·TXT 및 두 저장 응답 TXT

이번 라운드에서는 지시대로 `SENT → CONFIRMED`, 회계 배분, `riUsage` 후속 사슬을 실행하지 않았다.
