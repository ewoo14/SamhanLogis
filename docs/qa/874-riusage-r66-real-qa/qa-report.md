# R66 라이브QA 보고서 — PR #1057 · 이슈 #874

## 배포 확인

`samhan-slip-service`만 재빌드·재배포했다.

```text
docker inspect -f '{{.Created}} {{.State.StartedAt}}' samhan-slip-service
2026-08-05T15:52:45.371598355Z 2026-08-05T15:52:49.068927692Z
```

- 상태: `running`, health: `healthy`
- 이미지: `infrastructure-slip-service`
- 실행 JAR 확인: `DiscountPriceClient.class`, `SlipDiscountCalculator.class` 포함
- 빌드: `:services:slip-service:bootJar` 성공, Docker image build 성공
- 다른 서비스의 재빌드·재배포·중지는 수행하지 않음

## 테스트 환경

- 렌더러: `localhost:5299`, `--host localhost --port 5299 --strictPort`
- API: `VITE_API_BASE_URL=http://localhost:8080`, mock OFF
- 계정: `dev_manager / ${QA_DEV_DEFAULT_PASSWORD}`
- 거래처: `4348703365 주식회사 엠엠시스템에어(고영현)` — `homeMultiDc=48%`, `commercialMultiDc=49%`
- 대조 거래처: `000011111111 한울냉열시스템` — DC 조회 결과 0건
- 출고창고: `2 / 상일창고 S18`
- 저장 전표: `2026/08/06-7`(혼합 라인), `2026/08/06-8`(대조 라인)

## 판정

| 항목 | 판정 | 실측 | 기대 | 캡처/원문 |
|---|---|---|---|---|
| ① 고정DC 없는 AR09TXEAAWKNEU-04에 전역DC 48% 반영 | **FAIL** | 화면 `1,080,000`; 저장 `unitPrice=981,818`, `unitPriceWithVat=1,080,000`, `discountInfo=null` | 화면 단가 및 저장 VAT 포함 단가 `561,600` | [04 혼합 라인 캡처](screenshots/04-mixed-fixed-and-global-dc-lines.png), [저장 응답 원문](05-mixed-lines-save-result-save-response.txt) |
| ② 고정DC 40%인 MCU-S6NDB1N이 전역DC보다 우선 | **FAIL (화면) / PASS (저장 계산)** | 화면 `1,617,000`; 저장 `unitPrice=882,000`, `unitPriceWithVat=970,200` | 화면·저장 단가 `970,200` | [04 혼합 라인 캡처](screenshots/04-mixed-fixed-and-global-dc-lines.png), [저장 응답 원문](05-mixed-lines-save-result-save-response.txt) |
| ③ 두 품목 한 전표에서 라인별 규칙 적용 | **FAIL** | 같은 전표에서 MCU는 저장 `970,200`, AR09는 `1,080,000`으로 저장됨 | AR09 `561,600`, MCU `970,200` | [05 저장 결과 캡처](screenshots/05-mixed-lines-save-result.png), [저장 응답 원문](05-mixed-lines-save-result-save-response.txt) |
| ④ 전역DC 없는 거래처 대조 | **PASS** | 화면 `1,080,000`; 저장 `unitPrice=981,818`, `unitPriceWithVat=1,080,000`, `discountInfo=null`; 저장 HTTP `201` | 정가 `1,080,000` 유지 | [06 대조 캡처](screenshots/06-no-global-dc-partner-line.png), [저장 응답 원문](07-no-global-dc-save-result-save-response.txt) |
| ⑤ 저장 차단·값 소실 방지 | **PASS (무설정 대조) / 미실시 (강제 장애)** | DC 설정 0건 거래처 저장 HTTP `201`, DRAFT, 단가 보존 | DC 미적용/조회 실패에도 저장 | [07 저장 결과 캡처](screenshots/07-no-global-dc-save-result.png), [저장 응답 원문](07-no-global-dc-save-result-save-response.txt) |

## 결론

**R66 최종 판정: FAIL.** R65 코드가 실행 JAR에 포함되고 저장 경로도 동작했으며, 고정DC의 저장 계산과 DC 미설정 거래처의 `201` 저장은 확인했다. 그러나 전역DC 48%가 AR09 라인에 반영되지 않았고, 고정DC 라인도 화면에는 반영되지 않았다. `discountInfo`는 두 저장 응답 모두 `null`이었다.

dc-config-service를 중지하거나 다른 서비스를 재배포하지 않는 가드레일 때문에 강제 네트워크 장애 시나리오는 실시하지 못했다. 따라서 ⑤의 강제 장애 부분은 **미실시**로 남긴다.

## 생성 파일 목록

- `docs/qa/874-riusage-r66-real-qa/qa-report.md`
- `docs/qa/874-riusage-r66-real-qa/*.txt` — 화면 본문, DC 조회 원문, 저장 응답 원문
- `docs/qa/874-riusage-r66-real-qa/screenshots/*.png` — 실 브라우저 캡처 7장
- `clients/desktop/r66-live-qa-driver.mjs` — R66 실행 드라이버

요청된 `clients/desktop/playwright/874-riusage-real-qa.spec.ts`는 수정하지 않았다.
