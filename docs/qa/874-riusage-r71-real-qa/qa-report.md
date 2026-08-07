# R71 라이브QA 보고서 — PR #1057 · 이슈 #874

## 0. 환경 상태

재빌드·재배포·중지 없이 확인했다.

- `samhan-slip-service`: `running`, `healthy`
- created: `2026-08-05T16:49:51.021661189Z` (KST `2026-08-06 01:49:51`)
- started: `2026-08-05T16:49:51.260586535Z` (KST `2026-08-06 01:49:51`)
- 기동 로그: `Started SlipServiceApplication in 9.245 seconds`
- QA renderer: `http://localhost:5311`, `VITE_API_BASE_URL=http://localhost:8080`, mock OFF
- 계정: `dev_manager / ${QA_DEV_DEFAULT_PASSWORD}`
- 대상: 거래처 `4348703365 주식회사 엠엠시스템에어(고영현)`, 출고창고 `2 · 상일창고 S18`

## 1. 판정 요약

| 항목 | 판정 | 근거 |
|---|---|---|
| ① 끝까지 저장 | **PASS** | 혼합 전표·대조 전표 모두 HTTP `201` |
| ② 전역DC 품목 | **FAIL** | 화면 `1,080,000` / 기대 `561,600`; 저장 `unitPriceWithVat=1,080,000` |
| ③ 고정DC 품목 | **FAIL** | 화면 `970,200` / 기대 `970,200`, 저장 `unitPriceWithVat=494,802` / 기대 `970,200` |
| ④ 한 전표 혼합 라인 | **FAIL** | 2라인 한 전표 저장은 되지만 라인별 기대 규칙·저장값이 보존되지 않음 |
| ⑤ 전역DC 없는 거래처 | **PASS** | 화면 `1,080,000` / 기대 `1,080,000`, 저장 `unitPriceWithVat=1,080,000` |
| ⑥ discountInfo 규칙·UUID 비노출 | **PASS** | `DC 없음, 품목 고정DC 40% 적용`; UUID 없음. 단 전역DC 문구는 없음 |

## 2. 캡처 및 응답 증거

### 2.1 혼합 2라인 — FAIL

화면 캡처: [02-mixed-lines-before-save.png](screenshots/02-mixed-lines-before-save.png)

- `AR09TXEAAWKNEU-04`: 화면 `1,080,000` / 기대 `561,600` → **FAIL**
- `MCU-S6NDB1N`: 화면 `970,200` / 기대 `970,200` → 화면 기준 **PASS**
- 저장: [03-mixed-lines-after-save-save-response.txt](03-mixed-lines-after-save-save-response.txt)
- 저장 HTTP: `201 http://localhost:8080/slips`
- 저장 응답 원문 핵심:
  - `discountInfo`: `DC 없음, 품목 고정DC 40% 적용`
  - AR09: `unitPrice=981818.00`, `unitPriceWithVat=1080000.00` / 기대 `561600`
  - MCU: `unitPrice=449820.00`, `unitPriceWithVat=494802.00` / 기대 `970200`

### 2.2 전역DC 없는 거래처 — PASS

화면 캡처: [04-no-global-before-save.png](screenshots/04-no-global-before-save.png)

- 거래처: `한울냉열시스템` (`000011111111`)
- AR09 화면 `1,080,000` / 기대 정가 `1,080,000`
- 저장: [05-no-global-after-save-save-response.txt](05-no-global-after-save-save-response.txt)
- 저장 응답 원문: HTTP `201`, `discountInfo="DC 없음"`, `unitPriceWithVat=1080000.00`

### 2.3 저장 버튼 및 결과

- 혼합 전표 저장 버튼 활성화 후 클릭: HTTP `201`, 전표 `2026/08/06-9`
- 대조 전표 저장 버튼 활성화 후 클릭: HTTP `201`, 전표 `2026/08/06-10`
- 저장 후 목록 이동 캡처: [03-mixed-lines-after-save.png](screenshots/03-mixed-lines-after-save.png), [05-no-global-after-save.png](screenshots/05-no-global-after-save.png)

## 3. 부가 관찰

초기 화면에서 업데이트 실패 배너가 표시되었고 브라우저 콘솔에 503/500 응답이 기록되었으나, 품목·거래처 조회와 전표 저장은 진행되었다. 상세 오류 목록은 [driver-summary.json](driver-summary.json)에 남겼다.

요청한 `SENT → CONFIRMED`, 회계 배분, riUsage 사슬은 실시하지 않았다.

## 4. 신규 산출물

- `docs/qa/874-riusage-r71-real-qa/qa-report.md`
- `docs/qa/874-riusage-r71-real-qa/` 내 캡처 5장, 화면 텍스트 5개, 저장 응답 2개, 로그인 응답, driver summary
- `clients/desktop/r71-riusage-live-qa-driver.mjs` (실행 드라이버)
