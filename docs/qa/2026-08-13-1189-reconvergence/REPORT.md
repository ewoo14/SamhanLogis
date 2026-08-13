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
