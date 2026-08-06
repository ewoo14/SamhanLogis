# R76 라이브QA 보고서 — PR #1057 · 이슈 #874

## 배포 상태 — 보고서 시작 시점 확인

재빌드·재배포·중지 없이 확인했다. 세 컨테이너 모두 `running / healthy`였다.

| 컨테이너 | created | started | 상태 |
|---|---|---|---|
| `samhan-product-service` | `2026-08-05T17:31:13.740980474Z` | `2026-08-05T17:31:17.851067885Z` | running / healthy |
| `samhan-dc-config-service` | `2026-08-05T17:31:13.741878120Z` | `2026-08-05T17:31:17.849602051Z` | running / healthy |
| `samhan-slip-service` | `2026-08-05T17:08:04.170798592Z` | `2026-08-05T17:08:07.824567301Z` | running / healthy |

- 실행일시: 2026-08-06 (KST)
- 작업 HEAD: `d914c976a`
- 실행 방식: `clients/desktop` Vite renderer (`--host localhost --port 5321 --strictPort`), mock OFF, `VITE_API_BASE_URL=http://localhost:8080`, Playwright Chromium 실브라우저
- 계정: `dev_manager`
- 출고창고: `2 · 상일창고 S18`

## 판정

| 항목 | 기대값 | 실측 | 판정 | 증적 |
|---|---:|---:|---|---|
| 전역DC 품목 `AR09TXEAAWKNEU-04` 화면 | 561,600 | 561,600 | PASS | [혼합 전 저장 화면](screenshots/02-mixed-lines-before-save.png) |
| 전역DC 품목 저장 | 561,600 | `unitPriceWithVat=561600.00` | PASS | [혼합 저장 HTTP 201 원문](03-mixed-lines-after-save-save-response.txt) |
| 고정DC 품목 `MCU-S6NDB1N` 화면 | 970,200 | 970,200 | PASS | [혼합 전 저장 화면](screenshots/02-mixed-lines-before-save.png) |
| 고정DC 품목 저장 | 970,200 | `unitPriceWithVat=970200.00` | PASS | [혼합 저장 HTTP 201 원문](03-mixed-lines-after-save-save-response.txt) |
| 두 품목 한 전표에서 라인별 규칙 적용 | 전역 48% + 고정 40% | 두 라인 각각 561,600 / 970,200 | PASS | [혼합 전 저장 화면](screenshots/02-mixed-lines-before-save.png) · [POST 원문](03-mixed-lines-after-save-save-response.txt) |
| 전역DC 없는 거래처 대조 | 정가 1,080,000 | 화면 1,080,000, 저장 `unitPriceWithVat=1080000.00` | PASS | [무전역DC 전 저장 화면](screenshots/04-no-global-before-save.png) · [POST 원문](05-no-global-after-save-save-response.txt) |
| 저장 응답 | HTTP 201 | 두 저장 모두 HTTP 201 | PASS | [혼합 POST](03-mixed-lines-after-save-save-response.txt) · [무전역DC POST](05-no-global-after-save-save-response.txt) |
| `discountInfo` 규칙·할인율·UUID 없음 | 규칙과 할인율 표시, UUID 미포함 | `거래처 전역DC 48% 적용, 품목 고정DC 40% 적용`; UUID 없음 | PASS | [혼합 POST](03-mixed-lines-after-save-save-response.txt) |
| 전역DC 단건 조회 | HTTP 200 | HTTP 200 | PASS | [네트워크 원문](network-responses.json) |

## 전역DC 단건 조회 원문

호출: `GET http://localhost:8080/api/v1/partner-dc-configs/4348703365`

```text
HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"partnerCode":"4348703365","companyName":"주식회사 엠엠시스템에어(고영현)","homeMultiDc":"48%","commercialMultiDc":"49%","flexibleHoseTypeI":"Yes","threeSixty":null,"fourWay":null,"oneWay":null,"stand":null,"deluxe":null,"firstGrade":null,"unitProcess":"No","remark":null},"timestamp":"2026-08-05T17:34:21.478964498Z"}
```

동일 거래처의 단건 조회가 네트워크 로그에 200으로 1회 확인됐다. 대조 거래처 `000011111111`은 `404 NOT_FOUND`였고 화면과 저장 모두 `DC 없음`/정가로 처리됐다.

## 저장 응답 핵심

혼합 전표 `2026/08/06-13`:

```text
HTTP 201 POST /slips
discountInfo: 거래처 전역DC 48% 적용, 품목 고정DC 40% 적용
AR09TXEAAWKNEU-04: unitPriceWithVat=561600.00
MCU-S6NDB1N: unitPriceWithVat=970200.00
```

무전역DC 대조 전표 `2026/08/06-14`:

```text
HTTP 201 POST /slips
discountInfo: DC 없음
AR09TXEAAWKNEU-04: unitPriceWithVat=1080000.00
```

응답의 엔티티 식별자 필드는 API 계약상 존재하지만, `discountInfo` 값과 화면에는 UUID가 노출되지 않았다.

## 비고

페이지 상단에 기존 `업데이트 실패` 알림이 표시됐고 콘솔에 503 3건이 기록됐다. 이번 판정 대상인 품목 조회·DC 조회·전표 저장은 정상 완료됐으며, 해당 알림은 R76 할인 계산/저장 결과와 별도 상태로 기록한다.

요청 범위에 따라 `SENT → CONFIRMED`, 회계 배분, riUsage 사슬은 실시하지 않았다.

## 산출물

- `qa-report.md`
- `driver-summary.json`
- `network-responses.json`
- `login-response.txt`
- `01-initial.txt` ~ `05-no-global-after-save.txt`
- `03-mixed-lines-after-save-save-response.txt`
- `05-no-global-after-save-save-response.txt`
- `screenshots/` 캡처 5장
