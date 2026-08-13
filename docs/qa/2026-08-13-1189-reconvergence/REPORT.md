# PR #1189 재수렴 라운드 보고서

- 대상: `feat/1142-completed-slip-revert`, HEAD `1a894124c962cdb6b13cd9bec2497a3d30e1e729`
- 수행: 2026-08-13 19:29~19:49 KST
- 질문: **직전 sweep fix가 새 표면을 만들었는가?**
- 결론: 직접 관측 가능한 2곳(판매·입고전표 생성, 창고 수정)은 fix와 정상 저장 경로 모두 PASS. 회계 2곳은 고정 거래처의 확정 원천 전표가 없어 저장 단계가 관측 불가. 도달 가능한 신규 결함은 0건이나, 4/4 실저장 증거가 아니므로 **머지 보류**.

## 1. 환경 확인

### ① 띄운 백엔드 스택이 어느 커밋 빌드인가

Git 명령은 사용하지 않았다. `.git` worktree metadata의 `HEAD`와 ref 파일을 직접 읽은 원문이다.

```text
HEAD_RAW=ref: refs/heads/feat/1142-completed-slip-revert
HEAD_SHA=1a894124c962cdb6b13cd9bec2497a3d30e1e729
```

컨테이너에는 commit label이 없으므로 `docker inspect ... .Created`로 생성 시각을 확인했다. 관련 서비스 원문:

```text
/samhan-slip-service       2026-08-12T17:53:07.461758521Z running
/samhan-accounting-service 2026-08-11T17:59:58.936343007Z running
/samhan-inventory-service  2026-08-11T17:59:58.933815104Z running
/samhan-api-gateway        2026-08-12T15:39:17.991855852Z running
/samhan-auth-service       2026-08-12T00:03:23.288496844Z running
```

이미지 생성 시각 원문:

```text
samhan-slip-service       2026-08-12T17:52:59.907441518Z
samhan-accounting-service 2026-08-11T04:31:45.373083397Z
samhan-inventory-service  2026-08-11T15:02:52.72173765Z
samhan-api-gateway        2026-08-12T15:39:14.976509948Z
samhan-auth-service       2026-08-12T00:03:20.533978097Z
```

따라서 “현재 스택은 2026-08-12T17:53 빌드”는 전체 스택 설명으로는 재현되지 않았다. 정확히 그 시각인 것은 slip-service뿐이고 accounting/inventory는 더 오래됐다. 컨테이너에서 commit SHA는 식별할 수 없어 백엔드 commit 자체는 관측 불가다. 오늘 머지분 #1187·#1196 반영 여부를 추정해 판정하지 않았다.

### ② 컨테이너 24개 중 살아 있는 것과 없는 것

명령:

```powershell
docker ps -a --filter "name=samhan-" --format "{{.Names}}`t{{.Status}}`t{{.Image}}"
```

원문:

```text
samhan-slip-service           Up 27 minutes (healthy)
samhan-api-gateway            Up 27 minutes (healthy)
samhan-partner-order-service  Up 27 minutes (healthy)
samhan-auth-service           Up 27 minutes (healthy)
samhan-product-service        Up 27 minutes (healthy)
samhan-eureka                 Up 27 minutes (healthy)
samhan-postgres               Up 27 minutes (healthy)
samhan-user-service           Up 27 minutes (healthy)
samhan-arologis-service       Up 27 minutes (healthy)
samhan-accounting-service     Up 27 minutes (healthy)
samhan-groupware-service      Up 27 minutes (healthy)
samhan-dc-config-service      Up 27 minutes (healthy)
samhan-inventory-service      Up 27 minutes (healthy)
samhan-partner-service        Up 27 minutes (healthy)
samhan-dashboard-service      Up 27 minutes (healthy)
samhan-partner-auth-service   Up 27 minutes (healthy)
samhan-notification-service   Up 27 minutes (healthy)
samhan-grafana                Up 27 minutes (healthy)
samhan-prometheus             Exited (127) 27 minutes ago
samhan-nginx                  Exited (127) 27 minutes ago
samhan-minio                  Up 27 minutes (healthy)
samhan-elasticsearch          Up 27 minutes (healthy)
samhan-rabbitmq               Up 27 minutes (healthy)
samhan-redis                  Up 27 minutes (healthy)
DOCKER_COUNT=24
RUNNING_COUNT=22
```

없는 것(실행 중 목록에서 빠진 것)은 정확히 2개다: `samhan-prometheus`, `samhan-nginx`. 24개 자체는 모두 존재한다.

### ③ 프론트엔드는 이 워크트리(1a894124c)에서 빌드

명령과 원문:

```text
PS clients/desktop> npm run build
> @samhan/desktop@0.1.0 build
> npm run build:legacy && electron-vite build
...
✓ 7 modules transformed.
✓ built in 81ms
✓ 3 modules transformed.
✓ built in 23ms
✓ 748 modules transformed.
✓ built in 4.90s
Exit code: 0
```

이 빌드의 renderer를 Vite `http://127.0.0.1:5189`에서 띄워 실제 gateway/service/공유 DB와 연결했다. mock/fixture는 사용하지 않았다.

### Playwright와 RAM

- Playwright package의 Chromium을 headless 단일 browser/context/page로 순차 실행했다.
- 인앱 브라우저 연결 시도 원문은 `No browser is available`이었으나, 저장소 설치 Playwright의 Chromium 실행은 정상 성공했다.
- 가용 RAM: 시작 29.156GB, Chromium 실행 중 관측값 28GB대, 종료 직전 28GB대. 1.0GB 중단선에 접근하지 않았다.
- 고정 거래처: `P-2026-0017 · 원주에어컨공업`.
- 최종 종료 검증: 포트 5189 listener 0개, Playwright Chromium 0개, 이 QA가 띄운 w1142 Vite/Node 0개. 최종 확인 시 가용 RAM 24.141GB.

## 2. 네 곳 실측

### 2.1 판매·입고전표 생성 — `['slips','query',mode]`

#### 판매전표

시나리오: 판매관리 목록을 먼저 열어 query를 warm 상태로 만들고, 새 판매전표에서 `HQ-001 · 본사창고`, 고정 거래처, `AM100ANHDBH1` 1개를 선택해 저장했다. POST 201 뒤 상세에서 실제 사용자 동선인 `목록으로`를 눌렀고, document reload 없이 목록 GET이 발생해 신규 번호가 표시됐다.

- 생성: `2026/08/13-3`, DRAFT, 고정 거래처
- 정상 경로: **PASS** — POST `/slips` 201
- 목록 즉시 갱신: **PASS** — GET `/slips/query?...slipType=OUTBOUND...` 200, `2026/08/13-3` 표시
- 스크린샷: `01-sales-slip-before-list.png`, `02-sales-slip-ready.png`, `03-sales-slip-after-list.png`

#### 입고전표

시나리오: 구매관리 목록을 먼저 열고, 새 입고전표에서 같은 창고·거래처·제품 1개를 저장했다. 이 화면은 저장 성공 시 곧바로 목록으로 이동했다.

- 생성: `2026/08/13-1`, DRAFT, 고정 거래처
- 정상 경로: **PASS** — POST `/slips` 201
- 목록 즉시 갱신: **PASS** — POST 직후 GET `/slips/query?...slipType=INBOUND...` 200, 새로고침 없이 `2026/08/13-1` 첫 행 표시
- 스크린샷: `04-purchase-slip-before-list.png`, `05-purchase-slip-ready.png`, `06-purchase-slip-after-list.png`

### 2.2 매출 회계전표 생성 — `['sales-accounting-slips']`

시나리오: 매출전표 목록을 warm 상태로 만든 후 신규 작성 화면에서 고정 거래처의 당일 판매전표 `2026/08/13-3`을 100% 배분하고 임시저장을 눌렀다.

- 정상 경로: **관측 불가** — 실서버가 확정 원천 전표만 허용한다. QA 생성 원천은 DRAFT라 POST가 422로 거부됐다.
- 목록 즉시 갱신: **관측 불가** — 성공 mutation이 없어 `onSuccess`에 도달하지 않았다.
- 실패 원문:

```text
POST /admin/sales-slips 422
{"success":false,"code":"SAS_SOURCE_SLIP_NOT_CONFIRMED","message":"원천 전표가 확정 상태가 아닙니다 (전표=2026/08/13-3, 상태=작성중)","data":null,...}
```

- 고정 거래처의 2026-01-01~2026-08-13 CONFIRMED OUTBOUND 원천 실측: `0`
- 스크린샷: `07-sales-accounting-before-list.png`, `08-sales-accounting-ready.png`, `09-sales-accounting-blocked.png`

### 2.3 매입 회계전표 생성 — `['purchase-accounting-slips']`

시나리오: 매입전표 목록을 warm 상태로 만든 뒤 신규 작성 화면에서 고정 거래처의 당일 입고전표 `2026/08/13-1`을 100% 배분하고 임시저장을 눌렀다.

- 정상 경로: **관측 불가** — 실서버가 확정 원천 전표만 허용한다. QA 생성 원천은 DRAFT라 POST가 422로 거부됐다.
- 목록 즉시 갱신: **관측 불가** — 성공 mutation이 없어 `onSuccess`에 도달하지 않았다.
- 실패/차단 명령 원문:

```text
POST /admin/purchase-slips 422
{"success":false,"code":"SAS_SOURCE_SLIP_NOT_CONFIRMED","message":"원천 전표가 확정 상태가 아닙니다 (전표=2026/08/13-1, 상태=작성중)","data":null,...}
```

- 고정 거래처의 2026-01-01~2026-08-13 CONFIRMED INBOUND 원천 실측: `0`
- 스크린샷: `10-purchase-accounting-before-list.png`, `11-purchase-accounting-ready.png`, `12-purchase-accounting-blocked.png`

### 2.4 창고 수정 — `['warehouses']` 추가 무효화

시나리오: 일반 창고 목록 query를 warm 상태로 만든 뒤 QA 창고를 생성했다. 관리자 창고 화면에서 이름을 `QA1189-RC-1935-창고-전`에서 `QA1189-RC-1935-창고-후`로 PATCH하고, SPA 사이드바 `창고관리`로 돌아갔다.

- 정상 경로: **PASS** — POST `/inventory/warehouses` 201, PATCH `/inventory/warehouses/{id}` 200
- 목록 즉시 갱신: **PASS** — PATCH 뒤 GET `/inventory/warehouses` 200, document reload 없이 일반 목록에서 수정명이 표시됨
- 스크린샷: `13-warehouse-before-edit-list.png`, `14-warehouse-edit-ready.png`, `15-warehouse-after-edit-list.png`

## 3. 도달 가능한 결함

**0건.**

판매·입고 생성 및 창고 수정에서 sweep fix가 정상 저장을 막거나 목록을 stale하게 만드는 현상은 재현되지 않았다. 회계 2곳의 422/원천 0건은 정상 업무 선행조건이므로 제품 결함으로 세지 않았다.

## 4. 증거 무결성 정정

2건이다.

- 브리핑의 “현재 스택은 2026-08-12T17:53 빌드”는 전체 스택 수치로 재현되지 않았다.
- 실측은 slip-service만 `2026-08-12T17:53:07.461758521Z`, accounting/inventory는 각각 `2026-08-11T17:59:58...Z`다.
- 따라서 이 보고서는 해당 문장을 **slip-service에 한정**해 정정하고, 오래된 backend 의존 항목을 통과로 만들지 않았다.

보고서 작성 중 회계 준비 캡처가 폼 기본 거래처를 보여 고정 레인 증거로 부적합한 것도 발견했다. 이를 최종 산출물에 남기지 않고, 판매·입고 원천을 각각 100% 배분해 `P-2026-0017 · 원주에어컨공업`이 실제 헤더에 채워진 상태와 POST 422 직후 상태로 `08`·`09`·`11`·`12`를 다시 캡처했다.

## 5. 관측 불가와 이유

### 매출 회계전표 onSuccess

실패 명령 구간:

```text
POST http://localhost:8080/admin/sales-slips
HTTP 422
code=SAS_SOURCE_SLIP_NOT_CONFIRMED
message=원천 전표가 확정 상태가 아닙니다 (전표=2026/08/13-3, 상태=작성중)
```

고정 거래처 확정 OUTBOUND 원천이 0건이라 성공 저장과 후속 목록 갱신은 관측 불가다.

### 매입 회계전표 onSuccess

실패 명령 구간:

```text
POST http://localhost:8080/admin/purchase-slips
HTTP 422
code=SAS_SOURCE_SLIP_NOT_CONFIRMED
message=원천 전표가 확정 상태가 아닙니다 (전표=2026/08/13-1, 상태=작성중)
```

고정 거래처 확정 INBOUND 원천이 0건이다. 정상 계약을 우회하는 DB 조작이나 다른 거래처 혼용을 하지 않았으므로 성공 저장과 후속 목록 갱신은 관측 불가다.

### 백엔드 commit SHA

`docker inspect`에 commit label이 없어 생성 시각만 재현 가능하다. 현재 branch backend라고 간주하지 않았다.

## 6. 공유 DB에 남긴 데이터

고정 거래처는 전부 `P-2026-0017 · 원주에어컨공업`이다.

| 유형 | 번호/코드 | 최종 값 |
|---|---|---|
| 판매전표 | `2026/08/13-1` | DRAFT, 자동화 동선 보정 전 첫 실저장 |
| 판매전표 | `2026/08/13-2` | DRAFT, 자동화 동선 보정 중 두 번째 실저장 |
| 판매전표 | `2026/08/13-3` | DRAFT, 최종 판매 생성·목록 PASS 및 매출 회계 원천 시도 |
| 입고전표 | `2026/08/13-1` | DRAFT, 최종 입고 생성·목록 PASS |
| 창고 | `WH-D9957V` | `QA1189-RC-1935-창고-후` |
| 창고 | `WH-F8D5PU` | `QA1189-RC-1935-창고-후` |
| 창고 | `WH-HCP5WG` | `QA1189-RC-1935-창고-후` |
| 창고 | `WH-Q4YVWF` | `QA1189-RC-1935-창고-후` |

회계전표 생성 성공은 0건이다. 사용자 지시가 실제 저장 검증이므로 위 전표·창고는 삭제하지 않았다.

## 7. 머지 권고

**머지 보류.**

도달 결함은 0건이고 직접 관측한 두 surface는 통과했다. 그러나 질문이 지정한 네 곳 중 매출·매입 회계전표의 성공 `onSuccess`가 실제로 실행되지 않아 “4곳 모두 고쳐졌고 정상 경로도 온전하다”는 머지 게이트를 충족하지 못했다. accounting/inventory backend를 HEAD 대응 빌드로 올리고, 고정 거래처에 CONFIRMED OUTBOUND/INBOUND 원천 각 1건을 준비한 뒤 두 회계 저장을 재실행해야 한다.

## 라운드 2

- 대상: `feat/1142-completed-slip-revert`, HEAD `bfa5c4af8b35f86c85cb81aeadc68a77722869e8`
- 수행: 2026-08-13 20:04~20:16 KST
- 고정 레인: `P-2026-0017 · 원주에어컨공업`
- 결론: 판매·입고 원천을 모두 실제 화면에서 `CONFIRMED`로 전환한 뒤 매출·매입 회계전표 성공 `onSuccess`를 실제 실행했다. 두 저장 모두 HTTP 200, 직후 목록 GET 200, document reload 0회, 신규 행 즉시 표시로 PASS다. 도달 가능한 결함은 0건이며 **머지 권고**한다.

### 1. 환경 확인 원문

Git 명령은 사용하지 않았다. worktree metadata를 직접 읽은 원문이다.

```text
HEAD_RAW=ref: refs/heads/feat/1142-completed-slip-revert
HEAD_SHA=bfa5c4af8b35f86c85cb81aeadc68a77722869e8
```

시작 RAM과 컨테이너 생성시각 원문:

```text
AVAILABLE_RAM_GB=22.416
/samhan-slip-service       2026-08-12T17:53:07.461758521Z running
/samhan-accounting-service 2026-08-11T17:59:58.936343007Z running
/samhan-inventory-service  2026-08-11T17:59:58.933815104Z running
```

이미지 생성시각 원문:

```text
samhan-slip-service       2026-08-12T17:52:59.907441518Z
samhan-accounting-service 2026-08-11T04:31:45.373083397Z
samhan-inventory-service  2026-08-11T15:02:52.72173765Z
```

즉 slip-service만 2026-08-12 빌드이고 accounting/inventory는 2026-08-11 혼합 이미지다. backend commit label은 없어 SHA는 관측 불가로 유지했다. 프론트는 위 HEAD의 desktop renderer를 `http://127.0.0.1:5189`에 띄웠고 mock/fixture는 사용하지 않았다. Playwright Chromium 단일 브라우저의 context를 계정별로 분리해 사용했다. 실행 중 재확인 RAM은 23.439GB, 산출물 작성 직전은 21.770GB로 1.0GB 중단선에 접근하지 않았다.

종료 정리 원문:

```text
ACTUAL_PLAYWRIGHT_BROWSER_COUNT=0
ACTUAL_W1142_VITE_NODE_COUNT=0
PORT_5189_LISTENER_COUNT=0
FINAL_AVAILABLE_RAM_GB=21.376
```

### 2. 원천 전표 확정 — 화면 동선과 응답 원문

#### 입고전표 `2026/08/13-1`

구매관리 목록의 `상세`로 들어가 입고전표 상세 하단의 정상 버튼을 순서대로 눌렀다.

```text
완료 (저장)                                      POST /slips/{id}/save     200 SAVED
완료 (전송)                                      POST /slips/{id}/send     200 SENT
완료 (수락)                                      POST /slips/{id}/accept   200 ACCEPTED
완료 (처리 시작)                                 POST /slips/{id}/process  200 PROCESSING
완료 (재고 반영 후 검수 대기 (입고 완료))        POST /slips/{id}/complete 200 INSPECTING
완료 (처리 완료)                                 POST /slips/{id}/inspect  200 COMPLETED
완료 (확정)                                      POST /slips/{id}/confirm  200 CONFIRMED
```

최종 확정 응답 원문:

```json
{"success":true,"code":"OK","message":"성공","data":{"id":"0abaf821-fe34-49d2-bb8e-e856d17a3f77","slipType":"INBOUND","slipNo":"2026/08/13-1","slipDate":"2026-08-13","seqNo":1,"status":"CONFIRMED","partnerName":"원주에어컨공업","partnerCode":"P-2026-0017","confirmedAt":"2026-08-13T20:09:05.281377873","version":6}}
```

스크린샷:

- `round2-purchase-source-before-confirm.png`
- `round2-purchase-source-confirm-ready.png`
- `round2-purchase-source-after-confirm.png`

#### 판매전표 `2026/08/13-3`

판매관리 목록의 `상세`로 들어가 같은 하단 정상 버튼을 밟았다. 처음에는 `DRAFT→SAVED→SENT` 후 재고 부족으로 `accept`가 409였다. 같은 고정 거래처 입고전표를 위 정상 화면 동선으로 입고·확정한 다음 재시도해 `ACCEPTED→PROCESSING→INSPECTING`까지 진행했다.

`INSPECTING`에서 `dev_master`의 버튼은 결재라인 자격 때문에 비활성이었다. 화면 밖 우회를 하지 않고 실제 결재라인 조회에서 지정된 `김은지(kimeunji) · ACCOUNTANT` 정상 계정으로 로그인했다. 해당 계정 화면은 `canInspect=true`, `완료 (처리 완료)` 활성 상태였고 이후 전이를 끝까지 실행했다.

```text
김은지 화면  완료 (처리 완료)  POST /slips/{id}/inspect  200 COMPLETED
김은지 화면  완료 (배송 시작)  POST /slips/{id}/ship     200 SHIPPING
김은지 화면  완료 (배송 완료)  POST /slips/{id}/deliver  200 DELIVERED
김은지 화면  완료 (확정)       POST /slips/{id}/confirm  200 CONFIRMED
```

최종 확정 응답 원문:

```json
{"success":true,"code":"OK","message":"성공","data":{"id":"978b7588-0920-4a85-8722-462acc4eaa6a","slipType":"OUTBOUND","slipNo":"2026/08/13-3","slipDate":"2026-08-13","seqNo":3,"status":"CONFIRMED","partnerName":"원주에어컨공업","partnerCode":"P-2026-0017","confirmedAt":"2026-08-13T20:14:57.77414307","inspectorUserId":"c5af1500-ffa1-493d-b57e-3907c0c5f9c7","version":8}}
```

스크린샷:

- `round2-sales-source-before-confirm.png`
- `round2-sales-source-confirm-ready.png`
- `round2-sales-source-after-confirm.png`

### 3. 매출 회계전표 — 저장 원문과 즉시 목록 갱신

매출전표 목록을 먼저 열어 `GET /admin/sales-slips?...` query를 warm했다. SPA의 `작성` 버튼으로 진입해 확정 원천 `2026/08/13-3`만 100% 배분했다. 헤더가 `P-2026-0017 · 원주에어컨공업`으로 바뀐 것을 화면에서 확인한 뒤 `임시저장`을 눌렀다.

저장 원문:

```text
POST /admin/sales-slips 200
{"id":"346719c9-538c-4353-a0ee-952b7b040cc9","slipNo":"2026/08/13-5591","slipDate":"2026-08-13","partnerCode":"P-2026-0017","partnerName":"원주에어컨공업","taxType":"TAXABLE","status":"DRAFT","totalSupplyAmount":910000,"totalVatAmount":91000,"totalAmount":1001000,"memo":null,"lines":[{"lineNo":1,"productCode":"실내기 DUCT(고정압) 28평형","productName":"실내기 DUCT(고정압) 28평형","qty":1,"unitPrice":1001000,"supplyAmount":910000,"vatAmount":91000,"lineTotal":1001000,"allocations":[{"sourceSlipNo":"2026/08/13-3","sourceLineNo":1,"allocatedQty":1,"allocatedAmount":1001000}]}]}
```

`onSuccess` 직후 원문과 화면 결과:

```text
GET /admin/sales-slips?from=2026-08-01&to=2026-08-13 200
[{"id":"346719c9-538c-4353-a0ee-952b7b040cc9","slipNo":"2026/08/13-5591","slipDate":"2026-08-13","partnerCode":"P-2026-0017","partnerName":"원주에어컨공업","taxType":"TAXABLE","status":"DRAFT","totalSupplyAmount":910000.00,"totalVatAmount":91000.00,"totalAmount":1001000.00,"memo":null,"lines":[{"lineNo":1,"productCode":"실내기 DUCT(고정압) 28평형","productName":"실내기 DUCT(고정압) 28평형","qty":1.000,"unitPrice":1001000.00,"supplyAmount":910000.00,"vatAmount":91000.00,"lineTotal":1001000.00,"allocations":[{"sourceSlipNo":"2026/08/13-3","sourceLineNo":1,"allocatedQty":1.000,"allocatedAmount":1001000.00}]}]}]
documentRequestsAfterSave=0
화면 첫 행=2026/08/13-5591 · 원주에어컨공업 · 임시저장 · 1,001,000
```

- 정상 저장: **PASS**
- document reload 없는 목록 즉시 갱신: **PASS**
- 스크린샷: `round2-sales-accounting-before-save.png`, `round2-sales-accounting-save-ready.png`, `round2-sales-accounting-after-save-list.png`

### 4. 매입 회계전표 — 저장 원문과 즉시 목록 갱신

매입전표 목록을 먼저 열어 `GET /admin/purchase-slips?...` query를 warm했다. SPA의 `작성` 버튼으로 진입해 확정 원천 `2026/08/13-1`을 100% 배분하고, 헤더의 고정 거래처를 확인한 뒤 `임시저장`을 눌렀다.

저장 원문:

```text
POST /admin/purchase-slips 200
{"id":"d6348798-1586-44b0-8d8c-9e369a996194","slipNo":"2026/08/13-6831","slipDate":"2026-08-13","partnerCode":"P-2026-0017","partnerName":"원주에어컨공업","taxType":"TAXABLE","status":"DRAFT","totalSupplyAmount":546000,"totalVatAmount":54600,"totalAmount":600600,"memo":null,"lines":[{"lineNo":1,"productCode":"실내기 DUCT(고정압) 28평형","productName":"실내기 DUCT(고정압) 28평형","qty":1,"unitPrice":600600,"supplyAmount":546000,"vatAmount":54600,"lineTotal":600600,"allocations":[{"sourceSlipNo":"2026/08/13-1","sourceLineNo":1,"allocatedQty":1,"allocatedAmount":600600}]}]}
```

`onSuccess` 직후 원문과 화면 결과:

```text
GET /admin/purchase-slips?from=2026-08-01&to=2026-08-13 200
[{"id":"d6348798-1586-44b0-8d8c-9e369a996194","slipNo":"2026/08/13-6831","slipDate":"2026-08-13","partnerCode":"P-2026-0017","partnerName":"원주에어컨공업","taxType":"TAXABLE","status":"DRAFT","totalSupplyAmount":546000.00,"totalVatAmount":54600.00,"totalAmount":600600.00,"memo":null,"lines":[{"lineNo":1,"productCode":"실내기 DUCT(고정압) 28평형","productName":"실내기 DUCT(고정압) 28평형","qty":1.000,"unitPrice":600600.00,"supplyAmount":546000.00,"vatAmount":54600.00,"lineTotal":600600.00,"allocations":[{"sourceSlipNo":"2026/08/13-1","sourceLineNo":1,"allocatedQty":1.000,"allocatedAmount":600600.00}]}]}]
documentRequestsAfterSave=0
화면 첫 행=2026/08/13-6831 · 원주에어컨공업 · 임시저장 · 600,600
```

- 정상 저장: **PASS**
- document reload 없는 목록 즉시 갱신: **PASS**
- 스크린샷: `round2-purchase-accounting-before-save.png`, `round2-purchase-accounting-save-ready.png`, `round2-purchase-accounting-after-save-list.png`

### 5. 도달 가능한 결함

**0건.**

매출·매입 회계전표 모두 성공 mutation 뒤 해당 coarse query가 즉시 재조회됐고, 새 행이 document reload 없이 목록에 나타났다. 저장 자체도 정상 동작했다.

### 6. 증거 무결성 정정

- 라운드 1 대상 HEAD `1a894124…`와 달리 이번 실측 HEAD는 사용자 브리핑대로 `bfa5c4af8…`다. Git 명령 없이 worktree metadata로 확인했다.
- 컨테이너 혼합 이미지 상태는 재현됐다. accounting/inventory를 HEAD 대응 backend라고 간주하지 않았다.
- 처음 `vite.web.config.ts`로 띄운 세션은 cross-origin web-cookie 세션이 reload 후 유지되지 않아 증거로 사용하지 않았다. 직전 라운드와 같은 `vite.renderer.dev.config.ts` + 실 로그인 토큰의 Electron 인증 브리지로 재기동한 뒤 모든 판정을 다시 수집했다.
- 판매 상세 캡처의 진행 막대 최종 문구는 `배송완료`지만, CONFIRMED 판정은 추정하지 않고 `POST .../confirm 200`의 `status=CONFIRMED` 원문으로 고정했다.

### 7. 관측 불가로 남긴 것과 실패 명령 원문

관측 불가로 남긴 것은 backend commit SHA와 현재 HEAD 소스로 빌드됐는지 여부다. 컨테이너 label이 없어 생성시각 이상을 단언하지 않았다. 회계 두 성공 `onSuccess` 자체는 더 이상 관측 불가가 아니다.

인앱 브라우저 공급자 확인 실패 원문(이후 저장소 Playwright Chromium을 사용):

```text
No browser is available
[]
```

첫 Vite 기동의 버전 문자열 오류 원문(유효 문자열로 수정 후 정상 기동):

```text
Error: VITE_APP_VERSION는 YYYY/MM/DD-{번호} 형식이어야 합니다: 2026/08/13-1189-round2
```

판매 원천 최초 재고 선행조건 실패 원문(입고전표 정상 화면 확정 후 해소):

```text
POST /slips/978b7588-0920-4a85-8722-462acc4eaa6a/accept 409
{"success":false,"code":"CONFLICT","message":"inventory-service 호출 실패(409 CONFLICT): {\"success\":false,\"code\":\"CONFLICT\",\"message\":\"재고 부족 — 가용 인스턴스 0 < 필요 1 (productCode=AM100ANHDBH1)\",\"data\":null,...}","data":null,...}
```

Playwright 전이 묶음의 응답 대기 실패 원문(새 세션에서 GET 상세로 `INSPECTING` 실상태를 재확인한 뒤 계정별 단건 실행으로 재수렴):

```text
page.waitForResponse: Timeout 20000ms exceeded while waiting for event "response"
```

원인은 제품 응답 실패가 아니라 `dev_master`의 출고 검수 버튼 비활성이다. 결재라인 조회 원문은 `김기철`, `김은지` 두 사용자만 검수자로 지정돼 있었고, 김은지 화면에서는 같은 버튼이 활성(`canInspect=true`)이었다.

### 8. 이 라운드가 공유 DB에 남긴 것 전부

| 유형 | 번호/식별 | 라운드 2 최종 값 |
|---|---|---|
| 입고 원천 | `2026/08/13-1` | DRAFT → CONFIRMED, 고정 거래처, AM100ANHDBH1 1개 입고 |
| 판매 원천 | `2026/08/13-3` | DRAFT → CONFIRMED, 고정 거래처, AM100ANHDBH1 1개 출고, 검수자 김은지 |
| 매입 회계전표 | `2026/08/13-6831` (`d6348798-1586-44b0-8d8c-9e369a996194`) | DRAFT, 600,600원, 원천 `2026/08/13-1` 100% 배분 |
| 매출 회계전표 | `2026/08/13-5591` (`346719c9-538c-4353-a0ee-952b7b040cc9`) | DRAFT, 1,001,000원, 원천 `2026/08/13-3` 100% 배분 |
| 결재라인 설정 | 조회만 수행 | 변경 없음 |

판매전표 `2026/08/13-1`, `2026/08/13-2`는 DRAFT 그대로 두었고 이 라운드에서 변경하지 않았다. 입고 1개와 출고 1개의 재고 효과는 같은 품목·본사창고에서 발생했다. DB 직접 UPDATE, 다른 거래처 혼용, mock/fixture 사용은 없었다.

### 9. 머지 권고

**머지 권고.**

라운드 1에서 이미 확인한 판매전표 생성, 입고전표 생성, 창고 수정에 더해 이번 라운드에서 남아 있던 매출·매입 회계전표 성공 `onSuccess` 두 곳을 모두 실제로 밟았다. PR sweep fix가 지정한 네 무효화 표면은 이제 전부 실저장으로 확인됐다.

```text
판매전표 생성 목록 갱신       PASS (라운드 1)
입고전표 생성 목록 갱신       PASS (라운드 1)
창고 수정 목록 갱신           PASS (라운드 1)
매출 회계전표 저장 목록 갱신  PASS (라운드 2, POST 200 → GET 200, reload 0)
매입 회계전표 저장 목록 갱신  PASS (라운드 2, POST 200 → GET 200, reload 0)
도달 가능한 결함              0건
```
