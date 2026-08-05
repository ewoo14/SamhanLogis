# S21 라이브QA — PR #1045 · 이슈 #1039 가배차

실행일: 2026-08-05 (KST)

## 환경 확인

- 작업 디렉토리: `C:\dev\Samhan-Public\.claude\worktrees\t1039`
- 브라우저: 내장 브라우저 미사용. `clients/desktop`의 `import { chromium } from '@playwright/test'` Node 드라이버 사용.
- 렌더러: 기존 실행 중인 Vite PID 12380을 읽기 전용 확인 후 사용. 명령줄은 `vite ... --host localhost --port 5179 --strictPort`.
- API: `http://localhost:8080/actuator/health` HTTP 200, 응답 상태 `UP`.
- API base URL: `http://localhost:8080` 실 API 응답 확인.
- mock: mock route를 사용하지 않았고, 실 API의 전표·창고 응답을 수신했다(mock OFF).
- 서비스 재빌드·재배포·중지 없음. DB 직접 쓰기 없음. 기존 창고·문서 삭제 없음.

## 표본 생성 시도와 차단 원문

배송주소를 거래처 선택으로 대체하지 않고 폼에 직접 입력하여 다음 두 전표를 만들려고 했다.

| 시도 | 창고 | 배송주소 | `delivery_tag` | 결과 |
|---|---|---|---|---|
| 1 | 상일 코드 `2` | 부산 해운대구 해운대해변로 300 | `REGION` | 저장 차단 |
| 2 | 초월 코드 `00003` | 서울 중구 을지로 100 | `STACK` | 저장 차단 |

실 화면 원문:

```text
지방 당일 마감(12:00) 초과 — 익일 출고로 생성하세요
야적 당일 마감(14:00) 초과 — 익일 출고로 생성하세요
```

두 시도 모두 저장 후 `/sales/new`에 남았고 전표번호가 발급되지 않았다. 따라서 S21에서 새 REGION/STACK 표본은 생성되지 않았다. 이 라운드에서는 마감 조건을 우회하거나 전표를 수정하지 않았다.

캡처: [`create-REGION-2.png`](screenshots/create-REGION-2.png), [`create-STACK-00003.png`](screenshots/create-STACK-00003.png)

## 기존 활성 REGION/STACK 표본의 창고 분포

로그인 후 판매전표 배송태그 필터와 실 API `GET /slips?slipType=OUTBOUND&deliveryTag=...&includeDeleted=true`를 Playwright 세션으로 조회했다.

| `delivery_tag` | 활성 건수 | `source_warehouse_code` 분포 |
|---|---:|---|
| `REGION` | 12 | `HQ-001` 7건, `CS-001` 5건 |
| `STACK` | 11 | `HQ-001` 11건 |

창고 API 응답에서 `HQ-001`은 본사창고, `CS-001`은 거래처 위탁창고로 확인됐다. 기존 REGION/STACK 중 `source_warehouse_code=2` 또는 `00003`인 건은 **0건**이다. 따라서 이 23건은 상일·초월 창고 축의 양성 표본으로 사용할 수 없다.

캡처: [`inventory-REGION.png`](screenshots/inventory-REGION.png), [`inventory-STACK.png`](screenshots/inventory-STACK.png)

## 8모드 대조표

판정 기준:

- 지방 포함/제외: `delivery_tag == 'REGION'` 여부
- 야적 only: `delivery_tag == 'STACK'` 여부
- 창고 축: `source_warehouse_code`가 `2` 또는 `00003`인지
- 권역 버킷: 전표 배송주소 기준. 배송주소가 비어 있으면 미분류가 정상

이번 조회에서 상일·초월 축을 통과한 기존 전표는 S20에서 이미 만들어진 `RETURN_RENTAL` 전표 4건(상일 2건·초월 2건)뿐이며, REGION/STACK 양성 전표는 0건이다.

| 모드 | 올바른 기대값(이번 표본) | 실제 건수 | 판정 | 캡처 |
|---|---|---:|---|---|
| 상일+초월 · 지방 제외 | REGION이 아닌 eligible 전표 4건 | 4 | **PASS** | [`mode-01-SANGIL_AND_CHOWOL_REGION_EXCLUDED.png`](screenshots/mode-01-SANGIL_AND_CHOWOL_REGION_EXCLUDED.png) |
| 초월 · 지방 제외 | 초월 eligible 전표 2건 | 2 | **PASS** | [`mode-02-CHOWOL_REGION_EXCLUDED.png`](screenshots/mode-02-CHOWOL_REGION_EXCLUDED.png) |
| 상일 · 지방 제외 | 상일 eligible 전표 2건 | 2 | **PASS** | [`mode-03-SANGIL_REGION_EXCLUDED.png`](screenshots/mode-03-SANGIL_REGION_EXCLUDED.png) |
| 야적 only | 상일·초월 중 STACK 양성 표본 필요 | 0 | **미실시** | [`mode-04-STACK_ONLY.png`](screenshots/mode-04-STACK_ONLY.png) |
| 지방 only | 상일·초월 중 REGION 양성 표본 필요 | 0 | **미실시** | [`mode-05-REGION_ONLY.png`](screenshots/mode-05-REGION_ONLY.png) |
| 상일+초월 · 지방 포함 | eligible 전표 4건 | 4 | **PASS** | [`mode-06-SANGIL_AND_CHOWOL_REGION_INCLUDED.png`](screenshots/mode-06-SANGIL_AND_CHOWOL_REGION_INCLUDED.png) |
| 초월 · 지방 포함 | 초월 eligible 전표 2건 | 2 | **PASS** | [`mode-07-CHOWOL_REGION_INCLUDED.png`](screenshots/mode-07-CHOWOL_REGION_INCLUDED.png) |
| 상일 · 지방 포함 | 상일 eligible 전표 2건 | 2 | **PASS** | [`mode-08-SANGIL_REGION_INCLUDED.png`](screenshots/mode-08-SANGIL_REGION_INCLUDED.png) |

초기 화면 및 8모드 실행 캡처에는 상일·초월 외 창고 2건이 제외되었다는 안내가 표시됐다. 이는 `source_warehouse_code` 축 밖의 전표 제외 안내이며, 상일 코드 `2`·초월 코드 `00003`인 4건의 통째 소실은 아니었다.

## 차단/소실 점검

- 정상 eligible 전표 통째 소실: **0건**
- 상일 eligible: 2건이 상일 모드 3·8에 유지됨
- 초월 eligible: 2건이 초월 모드 2·7에 유지됨
- 지방 제외/포함 전환에서 `RETURN_RENTAL` 전표가 REGION으로 오인되지 않음
- REGION_ONLY·STACK_ONLY는 해당 창고 축의 양성 표본이 0건이므로 동작 PASS로 승격하지 않음

## 결론

S21은 **조건부 PASS**다. 창고·태그 축이 모두 유효한 기존 `RETURN_RENTAL` 4건에 대해서는 6개 모드가 기대값과 일치했고, 정상 전표 소실도 없었다. 다만 당일 마감으로 새 `REGION`·`STACK` 전표가 생성되지 않았고 기존 REGION 12건·STACK 11건도 `2`·`00003` 창고가 아니므로, `REGION_ONLY`와 `STACK_ONLY`의 양성 경로는 **미실시**다.

마감 조건을 우회하지 않는 다음 라운드에서 상일/초월 각각 `REGION`·`STACK` 전표를 직접 생성한 뒤 두 미실시 모드를 재검증해야 한다.

## 실행 로그 및 새 파일

- 드라이버 로그: [`s21-provisional-dispatch-real-qa.log`](../../../clients/desktop/s21-provisional-dispatch-real-qa.log)
- 기존 표본 수집 로그: [`s21-existing-slip-inventory.log`](../../../clients/desktop/s21-existing-slip-inventory.log)
- 신규 드라이버: [`s21-provisional-dispatch-real-qa.mjs`](../../../clients/desktop/s21-provisional-dispatch-real-qa.mjs)
- 기존 표본 수집 드라이버: [`s21-existing-slip-inventory.mjs`](../../../clients/desktop/s21-existing-slip-inventory.mjs)
- 새 QA 보고서: `docs/qa/1039-provisional-dispatch-s21-real-qa/qa-report.md`
- 새 캡처: `docs/qa/1039-provisional-dispatch-s21-real-qa/screenshots/` 내 13개 PNG
