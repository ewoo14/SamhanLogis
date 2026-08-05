# R68 라이브QA 보고서 — PR #1057 · 이슈 #874

## 배포 식별

`slip-service`만 재배포했습니다.

```text
docker inspect Created:     2026-08-05T16:13:40.608703372Z
docker inspect StartedAt:   2026-08-05T16:13:44.291972625Z
container: samhan-slip-service
port: 127.0.0.1:18086 -> 8086
health: healthy
```

Gradle `:services:slip-service:bootJar` 성공, slip-service 이미지 빌드 성공, `up -d --no-deps` 성공.
다른 서비스는 재빌드·재배포·중지하지 않았다.

## 실행 조건

- HEAD: `d242f3769`
- 계정: `dev_manager / dev_p05_pass!`
- mock: OFF
- renderer: `http://localhost:5299`, `VITE_API_BASE_URL=http://localhost:8080`
- 거래처: `4348703365 주식회사 엠엠시스템에어(고영현)`
- 대조 거래처: `000011111111 한울냉열시스템`
- 출고창고: `2 · 상일창고 S18`
- 날짜/상태 변경: 없음. `SENT → CONFIRMED`, 회계 배분, riUsage 사슬은 실시하지 않음.

## 판정 요약

| 항목 | 판정 | 결과 |
|---|---|---|
| ① 고정DC 없는 품목 | **FAIL** | 기대 `561,600`, 화면 `1,080,000` |
| ② 고정DC 있는 품목 | **PASS(화면)** / **미실시(저장)** | 기대·화면 `970,200`; 저장 응답 없음 |
| ③ `discountInfo` 및 적용 규칙 | **FAIL** | 화면에는 2행 `고정DC 40% 적용`만 표시. 1행 전역DC 48% 표시 없음. 저장 `discountInfo` 원문 미확보 |
| ④ 한 전표 혼합 라인 | **FAIL** | 2행은 맞지만 1행 전역DC가 누락됨 |
| ⑤ 전역DC 없는 거래처 | **PASS(화면)** / **미실시(저장)** | `DC 없음`, 화면 `1,080,000` |
| ⑥ 저장 차단·값 소실 | **FAIL** | 저장 버튼이 `최근단가 확인 중…` 상태로 비활성, HTTP 201 미도달 |

## 상세 증거

### ①~④ 전역DC 거래처 혼합 전표

화면 결과:

| 라인 | 품목 | 기대 | 화면 실측 | 적용 표시 |
|---|---|---:|---:|---|
| 1 | `AR09TXEAAWKNEU-04` | 561,600 | **1,080,000** | 전역DC 48% 표시 없음 |
| 2 | `MCU-S6NDB1N` | 970,200 | **970,200** | `라인 2 품목 고정DC 40% 적용` |

따라서 혼합 전표의 라인별 적용은 부분 성공이며, 1행 전역DC 누락으로 ①·③·④는 FAIL이다. 화면에는 UUID가 표시되지 않았다.

캡처: [04-mixed-lines-before-save.png](screenshots/04-mixed-lines-before-save.png), [05-mixed-lines-after-save.png](screenshots/05-mixed-lines-after-save.png)

관찰 원문: [04-mixed-lines-before-save.txt](04-mixed-lines-before-save.txt)

### ⑤ 전역DC 없는 거래처 대조

`한울냉열시스템`에서 `AR09TXEAAWKNEU-04`를 선택한 결과 화면에 `라인 1 DC 없음`, 단가 `1,080,000`이 표시됐다. 정가 유지 기대와 일치한다. 이 시나리오도 저장 버튼이 비활성이라 저장값은 미실시다.

캡처: [06-no-global-before-save.png](screenshots/06-no-global-before-save.png), [07-no-global-after-save.png](screenshots/07-no-global-after-save.png)

관찰 원문: [06-no-global-before-save.txt](06-no-global-before-save.txt)

### ⑥ 저장 차단 및 응답

두 시나리오 모두 화면 하단에 `최근단가 확인 중…`이 남고 저장 버튼이 disabled 상태였다. 30초 대기 후에도 활성화되지 않아 POST를 보낼 수 없었다.

화면 숫자와 기대값은 다음과 같다.

| 시나리오 | 기대 화면 | 실제 화면 | 저장 응답 |
|---|---:|---:|---|
| 혼합 1행 전역DC | 561,600 | **1,080,000** | `NO_POST_RESPONSE` |
| 혼합 2행 고정DC | 970,200 | **970,200** | `NO_POST_RESPONSE` |
| 무전역DC 대조 | 1,080,000 | **1,080,000** | `NO_POST_RESPONSE` |

저장 응답 원문(두 건 모두):

- [05-mixed-lines-after-save-save-response.txt](05-mixed-lines-after-save-save-response.txt)
- [07-no-global-after-save-save-response.txt](07-no-global-after-save-save-response.txt)

원문에는 다음이 기록되어 있다.

```text
NO_POST_RESPONSE
저장 버튼 비활성: 최근단가 확인 중…
```

따라서 `unitPrice`, `unitPriceWithVat`, `discountInfo`의 저장 응답과 HTTP 201은 확인할 수 없으며, 값 소실 여부도 저장 단계에서는 판정 불가하다. 저장 차단 자체는 FAIL이다.

## 부가 관찰

페이지 상단에 `업데이트 실패` 배너가 나타났고 일부 앱 공통 요청에서 503/500이 관찰됐다. 이번 QA의 직접 결함 증거는 저장 버튼을 계속 비활성화한 `최근단가 확인 중…` 상태와 전역DC 1행 단가 누락이다.

## 새 파일 목록

- `docs/qa/874-riusage-r68-real-qa/qa-report.md`
- `docs/qa/874-riusage-r68-real-qa/` 캡처 PNG 7개, 관찰 TXT 7개, 저장 응답 TXT 2개, 로그인·드라이버 요약 TXT 2개
- `clients/desktop/r68-live-qa-driver.mjs` — 실 QA 실행 드라이버

