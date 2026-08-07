# R73 라이브QA 보고서 — PR #1057 · 이슈 #874

## 배포 상태

`samhan-slip-service Up (healthy)` — 생성 `2026-08-05T17:08:04Z`, 시작 `2026-08-05T17:08:07Z`.

재빌드·재배포·중지 없이 검증했다. 렌더러는 `localhost:5311`, `VITE_API_BASE_URL=http://localhost:8080`, mock OFF로 실행했고 `dev_manager / ${QA_DEV_DEFAULT_PASSWORD}`로 로그인했다.

## 판정 요약

**FAIL** — 전역DC 품목의 화면·저장값이 기대값 `561,600`이 아니다. 고정DC 품목은 `970,200`으로 정합하고, HTTP 201 저장은 유지됐다.

| 검증 항목 | 판정 | 결과 및 증거 |
|---|---|---|
| 화면값과 저장값 일치 | FAIL | 전역DC 라인 화면 `1,080,000` / 저장 `unitPriceWithVat=1,080,000` / 기대 `561,600`. 고정DC 라인 화면 `970,200` / 저장 `unitPriceWithVat=970,200` / 기대 `970,200`. [혼합 전표 캡처](screenshots/02-mixed-lines-before-save.png), [저장 원문](03-mixed-lines-save-response.txt) |
| 전역DC 품목 `AR09TXEAAWKNEU-04` | FAIL | 화면 `1,080,000` / 저장 `unitPrice=981,818`, `unitPriceWithVat=1,080,000` / 기대 `561,600`. `494,802`는 이번 응답에 없음. |
| 고정DC 품목 `MCU-S6NDB1N` | PASS | 화면 `970,200` / 저장 `unitPrice=882,000`, `unitPriceWithVat=970,200` / 기대 `970,200`. |
| 한 전표 내 라인별 규칙 | PASS(부분) | 한 전표 `2026/08/06-11`에 두 품목을 함께 저장했다. 고정DC 40%는 적용됐으나 전역DC 라인은 미적용되어 전체 축은 FAIL이다. |
| 전역DC 없는 거래처 대조 | PASS | 대조 거래처 `000011111111`에서 화면 `1,080,000` / 저장 `unitPriceWithVat=1,080,000` / 기대 정가 `1,080,000`, `discountInfo=DC 없음`. [대조 캡처](screenshots/04-no-global-before-save.png), [저장 원문](05-no-global-save-response.txt) |
| 저장 HTTP 201 | PASS | 혼합 전표와 대조 전표 모두 POST `/slips` HTTP `201`. |
| `discountInfo` 규칙·할인율·UUID | PASS(부분) | 혼합 응답에 `DC 없음, 품목 고정DC 40% 적용`이 포함되고 UUID는 없다. 다만 전역DC 48%/49% 정보가 응답 `discountInfo`에 나타나지 않아 전역DC 판정은 FAIL이다. |
| SENT→CONFIRMED·회계 배분·riUsage 사슬 | 미실시 | 이번 라운드 범위 밖 지시에 따라 건너뛰었다. |

## 상세 원문 대조

### 혼합 전표

- 거래처: 사업자번호 `4348703365`, 주식회사 엠엠시스템에어(고영현)
- 출고창고: `2 · 상일창고 S18`
- 전표: `2026/08/06-11`, 상태 `DRAFT`
- 응답 원문: [03-mixed-lines-save-response.txt](03-mixed-lines-save-response.txt)

| 모델 | 화면 단가 | 저장 `unitPrice` | 저장 `unitPriceWithVat` | 저장 `discountInfo` | 기대 | 판정 |
|---|---:|---:|---:|---|---:|---|
| `AR09TXEAAWKNEU-04` | 1,080,000 | 981,818 | 1,080,000 | `DC 없음, 품목 고정DC 40% 적용` | 561,600 | FAIL |
| `MCU-S6NDB1N` | 970,200 | 882,000 | 970,200 | `DC 없음, 품목 고정DC 40% 적용` | 970,200 | PASS |

화면에는 첫 라인이 `거래처 최근단가`, 두 번째 라인이 `판매가`로 표시됐다. 거래처 선택은 캡처와 POST 응답의 `partnerCode=4348703365`로 확인되어 선택 오류가 아니다.

## 부가 관찰(이번 판정 축 제외)

화면 상단에 업데이트 실패 안내가 표시됐고 실행 로그에 503 및 500 응답이 관찰됐다. 판매전표 조회·품목 가격 조회·저장 POST는 검증을 진행할 수 있었으며, 이 현상은 이번 DC 계산 판정과 분리해 기록한다.

### 전역DC 없는 거래처

- 거래처 코드: `000011111111`
- 전표: `2026/08/06-12`, 상태 `DRAFT`
- `AR09TXEAAWKNEU-04`: 화면 `1,080,000`, 저장 `unitPrice=981,818`, `unitPriceWithVat=1,080,000`, `discountInfo=DC 없음`

## 결론

R73의 핵심 불변식인 “화면이 DC 계산의 권위이며 화면값=저장값”은 고정DC 품목에서는 확인됐지만, 전역DC 품목에서 기대 `561,600` 대신 정가 `1,080,000`이 화면·저장에 함께 남아 **PASS로 종료할 수 없다**. `494,802` 이중 적용은 재발하지 않았다.

## 새로 생성한 증거 파일

`docs/qa/874-riusage-r73-real-qa/` 아래에 보고서, 화면 캡처 5장, 화면 텍스트 5개, 저장 응답 원문 2개, `driver-summary.json`을 생성했다.
