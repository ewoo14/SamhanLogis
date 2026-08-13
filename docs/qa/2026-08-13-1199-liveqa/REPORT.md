# PR #1199 시리얼 재고 수불 라이브 QA

- 대상: PR #1199 `fix/serial-stock-movement-gap`, 요청 HEAD `b244bd901`
- 일시: 2026-08-13 (Asia/Seoul)
- 판정: **도달 가능한 결함 1건 / 머지 보류 권고**
- 실행: 실 Docker 서비스, mock OFF, `dev_master` 실 로그인, Playwright Chromium 실 화면

## 1. 환경 확인 원문

### 1.1 원래 공유 스택

명령:

```powershell
docker ps -a --filter 'name=samhan-' --format '{{.Names}}|{{.Status}}'
docker inspect --format '{{.Name}}|{{.Created}}' $(docker ps -aq --filter 'name=samhan-')
```

원문:

```text
samhan-slip-service|Up 2 hours (healthy)
samhan-api-gateway|Up 2 hours (healthy)
samhan-partner-order-service|Up 2 hours (healthy)
samhan-auth-service|Up 2 hours (healthy)
samhan-product-service|Up 2 hours (healthy)
samhan-eureka|Up 2 hours (healthy)
samhan-postgres|Up 2 hours (healthy)
samhan-user-service|Up 2 hours (healthy)
samhan-arologis-service|Up 2 hours (healthy)
samhan-accounting-service|Up 2 hours (healthy)
samhan-groupware-service|Up 2 hours (healthy)
samhan-dc-config-service|Up 2 hours (healthy)
samhan-inventory-service|Up 2 hours (healthy)
samhan-partner-service|Up 2 hours (healthy)
samhan-dashboard-service|Up 2 hours (healthy)
samhan-partner-auth-service|Up 2 hours (healthy)
samhan-notification-service|Up 2 hours (healthy)
samhan-grafana|Up 2 hours (healthy)
samhan-prometheus|Exited (127) 2 hours ago
samhan-nginx|Exited (127) 2 hours ago
samhan-minio|Up 2 hours (healthy)
samhan-elasticsearch|Up 2 hours (healthy)
samhan-rabbitmq|Up 2 hours (healthy)
samhan-redis|Up 2 hours (healthy)
```

- 컨테이너: **24/24, 없는 것 0개**.
- 알려진 예외: `samhan-prometheus`, `samhan-nginx`만 `Exited (127)`.
- 원래 inventory 컨테이너:

```text
/samhan-inventory-service|2026-08-11T17:59:58.933815104Z
image infrastructure-inventory-service
sha256:e3ef3bc82e8cabb0566a810db8d4f27f7cff6b3b22beddb6651838fe2a8cbe25
```

이 이미지는 요청 HEAD보다 오래되어 그대로는 PR 판정이 불가능했다.

### 1.2 RAM

```text
FreePhysicalMemoryKB : 19214664
FreeRAMGB            : 18.325
TotalRAMGB           : 61.613
PRE_SWITCH_FREE_RAM_GB=23.007
FINAL_PRE_CLEANUP_FREE_RAM_GB=15.678
```

전 구간에서 중단 기준 1.0GB를 넘었다.

### 1.3 마이그레이션 격리

공유 `inventory_db` 원문:

```text
max installed_rank = 25
max version        = 25
```

워크트리에는 `V26__add_stock_instance_serial_key_and_quality.sql`,
`V27__add_stock_instance_s2a_indexes.sql`가 있었다. 따라서 신선 서비스를 공유 DB에 연결하지 않았다.
`inventory_qa_1199_20260813`을 복제 생성하고 QA DB에만 V26·V27을 적용했다.

신선 빌드/컨테이너 원문:

```text
BUILD SUCCESSFUL in 15s
/samhan-inventory-service|2026-08-13T12:04:57.593016072Z|samhan-inventory-1199-liveqa:b244bd901|healthy
26 | add stock instance serial key and quality | t
27 | add stock instance s2a indexes            | t
```

### 1.4 Playwright 환경

```text
POST http://localhost:8080/auth/login -> 200
Chromium 147.0.7727.15
renderer http://localhost:5210 -> 200
VITE_MOCK_MODE 미설정
```

초기 Vite 인자 오류는 다음과 같았고 허용 버전 `2026/08/13-1199`로 재기동했다.

```text
failed to load config from .../clients/desktop/vite.web.config.ts
Error: VITE_APP_VERSION은 YYYY/MM/DD-{번호} 형식이어야 합니다: 2026/08/13-1199-LIVEQA
HTTP_ERROR=원격 서버에 연결할 수 없습니다.
```

인앱 브라우저 런타임 원문은 아래와 같았다. 이것으로 포기하지 않고 설치된 Playwright Chromium을 직접 실행했다.

```text
No browser is available
[]
```

로그인 및 앱셸: [01-login.png](01-login.png), [02-dashboard-after-login.png](02-dashboard-after-login.png)

### 1.5 종료 시 환경 전제 차이 — 수정하지 않고 중단

라이브 QA 시작 시에는 §1.1 원문처럼 24/24였으나, 종료 정리 후 재검증에서는 다음과 같이 바뀌었다.

```text
CONTAINERS=22/24|MISSING=2|RUNNING=22
INVENTORY=/samhan-inventory-service|2026-08-13T12:30:15.702773961Z|running|healthy|infrastructure-inventory-service
ACTUATOR=UP
SHARED_FLYWAY_MAX=25|QA_DB_COUNT=0|QA_IMAGE_COUNT=0
VITE_LISTENERS=0|JUNCTION_EXISTS=False|FREE_RAM_GB=17.235
PNG_COUNT=27|REPORT_BYTES=16214|UNEXPECTED_FILES=0|MISSING_SECTIONS=0
```

없는 두 컨테이너는 시작 때 `Exited (127)`이었던 기존 알려진 예외 `samhan-prometheus`, `samhan-nginx`다. 이 둘을 재생성하지 않았고, 전제가 실측과 어긋난 시점부터 환경 수정 작업을 중단했다. 제품 시나리오 실행과 판정은 이 차이가 생기기 전에 완료됐다.

Docker destroy event를 읽기 전용으로 확인하려 한 명령은 시간 범위 대기 때문에 원문 없이 timeout됐다.

```text
docker events --since '2026-08-13T12:20:00+09:00' --until '2026-08-13T21:40:00+09:00' --filter type=container --filter event=destroy --format '{{.Time}}|{{.Actor.Attributes.name}}|{{.Actor.Attributes.image}}'
command timed out after 14028 milliseconds
```

## 2. 시나리오 1 — 시리얼 품목 입고 후 수불부 입고행

### 절차

1. 구매 → 구매관리 → 신규 입고전표.
2. 본사창고, `(주)서울에어컨`, 시리얼 품목 `ACL-KORGHP07`, 수량 2 입력.
3. 저장 → 전송 → 수락 → 처리 시작 → 재고 반영 → 검수 → 확정.
4. 창고 운영 → 재고 현황 → 본사창고의 3페이지를 모두 확인.
5. 동일 로그인 세션에서 `GET /inventory/ledger?productCode=ACL-KORGHP07` 호출.

### 스크린샷

- [03-serial-inbound-form-before-save.png](03-serial-inbound-form-before-save.png)
- [10-serial-inbound-before-stock-apply.png](10-serial-inbound-before-stock-apply.png)
- [11-serial-inbound-stock-applied.png](11-serial-inbound-stock-applied.png)
- [13-serial-inbound-confirmed.png](13-serial-inbound-confirmed.png)
- 수불부 진입점 전수: [25-page-1.png](25-serial-ledger-entry-missing-page-1.png), [26-page-2.png](26-serial-ledger-entry-missing-page-2.png), [27-page-3.png](27-serial-ledger-entry-missing-page-3.png)

### 응답·쿼리 원문

```text
POST /slips                                  -> 201 (2026/08/13-2)
POST /slips/{id}/save                        -> 200
POST /slips/{id}/send                        -> 200
POST /slips/{id}/accept                      -> 200
POST /slips/{id}/process                     -> 200
POST /slips/{id}/complete                    -> 200
POST /slips/{id}/inspect                     -> 200
POST /slips/{id}/confirm                     -> 200
```

```text
status    | count
AVAILABLE | 2

movement_type | quantity_delta | reference_type | count
INBOUND       | 1              | INBOUND        | 2
```

수불부 API 원문 핵심:

```json
{"productCode":"ACL-KORGHP07","openingBalance":0,"totalInbound":2,"totalOutbound":1,"closingBalance":1,
 "rows":[
  {"description":"2026/08/13-2","inboundQuantity":1,"outboundQuantity":0,"balance":1},
  {"description":"2026/08/13-2","inboundQuantity":1,"outboundQuantity":0,"balance":2},
  {"description":"2026/08/13-4","inboundQuantity":0,"outboundQuantity":1,"balance":1}
 ]}
```

재고 현황 3페이지 Playwright 원문:

```text
page 1 | hasTarget=false | 1 / 3
page 2 | hasTarget=false | 2 / 3
page 3 | hasTarget=false | 3 / 3
```

### 결과

- 백엔드 movement와 수불부 API: **PASS**.
- 실 사용자 화면: **FAIL**. 시리얼 품목은 재고 현황에 행이 없어서 `수불부` 버튼 자체가 없다.
- 도달 결함 D1로 집계한다.

## 3. 시나리오 2 — 시리얼 품목 출고 후 수불부 출고행

### 절차

1. 판매 → 판매관리 → 신규 판매전표.
2. 본사창고, `(주)서울에어컨`, `ACL-KORGHP07`, 수량 1 입력.
3. 저장 → 전송 → 수락 → 처리 시작 → 출고 재고 반영.
4. 인스턴스 상태와 movement를 DB에서 대조하고 수불부 API를 재조회.

### 스크린샷

- [15-serial-outbound-form-before-save.png](15-serial-outbound-form-before-save.png)
- [18-serial-outbound-accepted.png](18-serial-outbound-accepted.png)
- [19-serial-outbound-before-stock-deduct.png](19-serial-outbound-before-stock-deduct.png)
- [20-serial-outbound-after-stock-deduct.png](20-serial-outbound-after-stock-deduct.png)

### 응답·쿼리 원문

```text
POST /slips                                  -> 201 (2026/08/13-4)
POST /slips/{id}/save                        -> 200
POST /slips/{id}/send                        -> 200
POST /slips/{id}/accept                      -> 200
POST /slips/{id}/process                     -> 200
POST /slips/{id}/complete                    -> 200
```

```text
status    | count
AVAILABLE | 1
SHIPPED   | 1

movement_type | quantity_delta | reference_type | count
DEDUCT        | -1             | SLIP           | 1
INBOUND       |  1             | INBOUND        | 2
```

### 결과

- `RESERVED → SHIPPED`, `DEDUCT -1`, 수불부 API 출고행: **PASS**.
- 화면 수불부: 시나리오 1과 같은 진입점 부재로 **FAIL**. D1의 동일 증상으로 1건만 집계한다.
- 판매전표는 movement가 생기는 `/complete`까지 정상 실행됐고 최종 공유 DB 상태는 `INSPECTING`이다.

## 4. 시나리오 3 — 수불부 누적 잔량 vs 실제 재고

| 항목 | 실측 |
|---|---:|
| 시리얼 INBOUND 합계 | +2 |
| 시리얼 DEDUCT 합계 | -1 |
| 수불부 누적 잔량 | **1** |
| AVAILABLE 인스턴스 | **1** |
| RESERVED 인스턴스 | 0 |
| SHIPPED 인스턴스 | 1 |
| 실제 재고(AVAILABLE+RESERVED) | **1** |

원문:

```text
ledger_balance
--------------
1

active_instances
----------------
1
```

결과: **PASS — 1 = 1**. 단, 이 일치값을 실 사용자가 재고수불부 화면으로 열 수 없는 D1은 별도다.

## 5. 시나리오 4 — 기존 수량 관리 품목 회귀

대상은 기존 수량 관리 품목 `0000098`(한경희 선풍기), 본사창고이다.

### 절차

1. 변경 전 balance `총 5 / 예약 1 / 가용 4`, movement 6행 확인.
2. MASTER 인증 세션에서 실 서버 `POST /inventory/lots/inbound` 수량 2 실행.
3. 같은 세션에서 `POST /inventory/deduct` 수량 1 실행.
4. 재고 현황과 수불부 모달을 Playwright로 재조회.

### 스크린샷

- [23-batch-stock-balance-after-inout.png](23-batch-stock-balance-after-inout.png)
- [24-batch-stock-ledger-inout.png](24-batch-stock-ledger-inout.png)
- 전표 UI 전제: [28-batch-slip-ui-search-unreachable.png](28-batch-slip-ui-search-unreachable.png)

### 응답·쿼리 원문

```text
POST /inventory/lots/inbound -> 201
quantity=2, lotNo=QA1199-BATCH-20260813

POST /inventory/deduct -> 200
requestedQuantity=1, deductedQuantity=1
availableQty=5, reservedQty=1, totalQty=6
```

```text
before: total=5 reserved=1 available=4, movement rows=6
after : total=6 reserved=1 available=5, movement rows=8

신규 movement:
INBOUND +2  1행
DEDUCT  -1  1행
```

수불부 화면 원문:

```text
2026/08/13 한경희 선풍기 ... QA1199 수량품목 입고 회귀  입고 2  잔량 7
2026/08/13 한경희 선풍기 ... QA1199 수량품목 출고 회귀  출고 1  잔량 6
2026/08 계  입고 7  출고 1  잔량 6
```

결과: 수량 경로의 기존 1요청=1 movement 행 계약과 잔량 계산은 **PASS**.

다만 이 DB의 수량 관리 품목 1,963건은 모두 `usage_scope=NONE`이라 전표 UI의
`usageScope=PARTNER_ORDER` 검색으로는 선택할 수 없었다. 실패 원문:

```text
GET /api/products?q=0000098&size=20&usageScope=PARTNER_ORDER -> 200
content=[]
totalElements=0
UI: 검색 결과 없음
```

따라서 전표 UI mutation은 관측 불가이고, 권한이 적용되는 실 inventory API mutation + 실 수불부 UI로 회귀를 판정했다.
이 데이터 전제는 PR 수정이 만든 변화라는 근거가 없어 PR 결함으로 세지 않는다.

## 6. 시나리오 5 — 시리얼 정상 경로와 movement 실패 롤백

### 정상 경로

시나리오 1·2에서 시리얼 입고 2개와 출고 1개가 모두 실 UI로 성공했다. movement 추가 때문에 정상 입출고가 막히지 않았다.

### 실패 조건 실측

QA 전용 DB에만 `BEFORE INSERT ON stock_movements` 실패 트리거를 잠시 설치했다.

입고 실패 원문:

```text
POST /inventory/instances/batch -> 500
{"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다."}

ERROR: QA1199 forced movement insert failure: serial inbound
Where: PL/pgSQL function qa1199_fail_serial_movement() line 4 at RAISE

rollback_in_instances = 0
rollback_in_movements = 0
```

출고 실패 원문:

```text
POST /inventory/instances/reserve-batch -> 200
POST /inventory/instances/ship-batch    -> 500
{"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다."}

ERROR: QA1199 forced movement insert failure: serial outbound
Where: PL/pgSQL function qa1199_fail_serial_movement() line 4 at RAISE

status=RESERVED count=1
rollback_out_movements=0
```

즉 movement INSERT 실패 시 입고 인스턴스 생성은 0으로 롤백되고, 출고는 `SHIPPED`로 넘어가지 않고 `RESERVED`에 남았다.
트리거 제거 후 예약 해제 API가 200이었고 최종 정리 원문은 다음과 같다.

```text
rollback_in_instances=0
rollback_out_markers=0
qa_failure_triggers=0
```

결과: **PASS — 같은 트랜잭션 롤백이 실 DB 오류에서 동작한다.**

## 7. 도달 가능한 결함

### D1 — 시리얼 품목 수불부 API는 정상이나 화면 진입점이 없음

- 재현: 시리얼 입고·출고 완료 → 창고 운영 → 재고 현황 → 본사창고 1~3페이지.
- 기대: `ACL-KORGHP07` 행과 `수불부` 버튼이 보이고, 입고 2행·출고 1행을 열 수 있어야 한다.
- 실제: 세 페이지 모두 대상 품목 없음. API에는 세 행과 잔량 1이 존재한다.
- 사용자 영향: 일반 사용자는 PR이 생성한 시리얼 movement를 재고수불부 화면에서 확인할 수 없다.
- 결함 수: **1건**.

## 8. 증거 무결성 정정

구현 보고서는 다음과 같이 적었다.

```text
전표 source context가 있으면 기존 전표 참조인 SLIP과 slipId를 기록
```

실 입고전표 `2026/08/13-2`에는 source context가 있었지만 실제 DB는 다음이었다.

```text
INBOUND | +1 | reference_type=INBOUND | 2행
```

출고는 보고서 설명대로 `DEDUCT | -1 | reference_type=SLIP | 1행`이었다.
따라서 보고서의 공통 설명은 **입고는 `INBOUND`, 출고는 `SLIP`**로 정정해야 한다.
수불부 API의 전표번호 연결과 잔량 자체는 정상이라 별도 도달 결함으로 세지 않는다.

## 9. 관측 불가와 실패 명령 원문

1. 수량 관리 품목의 전표 UI 입출고: `usageScope=PARTNER_ORDER` 검색 결과 0건이라 UI 저장 단계에 도달하지 못했다. §5 원문과 28번 캡처 참조.
2. 인앱 브라우저: `No browser is available`, 목록 `[]`. 설치 Playwright Chromium 직접 실행으로 전체 QA를 계속했으므로 대상 시나리오는 관측 불가가 아니다.
3. Vite 최초 기동: 잘못된 QA 버전 문자열로 실패. §1.4 원문처럼 수정 후 HTTP 200.
4. 출고전표의 movement 이후 최종 검수 완료 버튼 자동 클릭은 두 차례 Playwright 30초 타임아웃이었다. movement가 발생하는 `/complete`, `SHIPPED`, `DEDUCT -1`까지는 실측했으며 최종 전표 상태는 `INSPECTING`으로 기록했다.

## 10. 공유 DB 및 QA DB에 만든 것

### 공유 `slip_db`에 남긴 것

```text
INBOUND  | 2026/08/13-2 | CONFIRMED  | QA1199 시리얼 입고 수불 검증
OUTBOUND | 2026/08/13-4 | INSPECTING | QA1199 시리얼 출고 수불 검증
```

기존 안내 잔재 `2026/08/13-1`, 판매전표 `-1/-2/-3`, 회계전표, QA 창고, `P-2026-0017`은 결함 근거로 사용하지 않았다.

### QA 전용 `inventory_qa_1199_20260813`에 만든 것

- `ACL-KORGHP07`: 인스턴스 2개(AVAILABLE 1, SHIPPED 1), INBOUND 2행, DEDUCT 1행.
- `0000098`: lot `QA1199-BATCH-20260813` 수량 2, INBOUND 1행, DEDUCT 1행.
- 실패 유도 트리거/함수: 생성 후 삭제, 최종 0개.
- 실패 유도 입고/출고: 롤백 또는 예약 해제로 최종 잔재 0개.
- QA DB 자체는 검증 종료 정리 단계에서 삭제했다.

### 종료 정리 원문

```text
QA_DB_DROPPED=1
QA_IMAGE_REMOVED=1
JUNCTION_REMOVED=1
INVENTORY=running|healthy|infrastructure-inventory-service|2026-08-13T12:30:15.702773961Z
SHARED_FLYWAY_MAX=25
```

Playwright 브라우저와 Vite(5210)는 종료했다. 기존 컨테이너는 삭제된 `w1161` 경로의 bind mount 때문에 재시작할 수 없어서, **동일한 기존 이미지** `infrastructure-inventory-service`, 동일한 공유 DB `inventory_db`, 기존 환경·리소스 한도와 현재 유효한 로그/raw 경로로 재생성했다. PR QA 이미지나 V26/V27은 공유 DB에 적용하지 않았다.

### 파일

- 이 보고서와 PNG 27장(01~20, 22~28).
- 캡처 스크립트는 `docs/qa` 안에 만들지 않았다.

## 11. 머지 권고

**머지 보류 권고.**

근거:

1. 백엔드 원자성, 시리얼 movement, 잔량 불변식, 수량 경로 회귀는 통과했다.
2. 그러나 사용자 질문의 핵심인 “재고수불부 화면에 행이 보이는가”는 D1 때문에 실패한다.
3. 구현 보고서의 source reference 설명도 실측과 달라 정정이 필요하다.

시리얼 품목도 재고 현황에서 수불부를 열 수 있는 사용자 진입점을 제공하고, 입고 reference 설명을 정정한 뒤 재검증하는 것이 안전하다.

## 라운드 2

> 대상: PR #1199 `fix/serial-stock-movement-gap`, 요청 HEAD `b028263bb`.
> 이 절의 재수렴 판정이 위 라운드 1의 `도달 가능한 결함 1건 / 머지 보류` 판정을 대체한다.

- 판정: **도달 가능한 결함 0건 / 머지 권고**.
- 질문의 답: **라운드 1의 D1은 닫혔고, 이번 fix에서 새 도달 표면은 발견되지 않았다.**
- 실행: 요청 HEAD로 신선 빌드한 inventory-service, UTF-8 격리 DB, mock OFF, `dev_master` 실 로그인, 로컬 Playwright Chromium, HashRouter 실 화면.
- 범위 제외: 이미 `SHIPPED`인 건의 소급 생성, 재고이동 축, QR 스캔은 검증·결함 집계에서 제외했다.

### R2-1. 환경 확인 원문

#### 요청 HEAD — git 명령 없이 ref 원문 확인

사용자 지시대로 git 명령은 실행하지 않았다. 작업트리 `.git` 포인터와 loose ref를 파일로 직접 읽었다.

```text
GITDIR=C:/dev/Samhan-Public/.git/worktrees/wledger
HEAD=ref: refs/heads/fix/serial-stock-movement-gap
refs/heads/fix/serial-stock-movement-gap=
b028263bbdb1dbb63c4b99498b834eb8a0a9f09a
```

#### 시작 RAM

```text
FreePhysicalMemoryKB : 18756784
FreePhysicalMemoryGB : 17.888
TotalVisibleMemoryGB : 61.613
```

Playwright 직전 `16.774GB`, 종료 후 `21.935GB`였다. 전 구간에서 즉시 중단 기준 `1.0GB`를 넘었다.

#### 시작 컨테이너 원문

명령:

```powershell
docker ps -a --filter 'name=samhan-' --format '{{.Names}}|{{.Status}}|{{.Image}}'
docker inspect --format '{{.Name}}|{{.Created}}' $(docker ps -aq --filter 'name=samhan-')
```

원문:

```text
samhan-inventory-service|Up 27 minutes (healthy)|infrastructure-inventory-service
samhan-slip-service|Up 3 hours (healthy)|infrastructure-slip-service
samhan-api-gateway|Up 3 hours (healthy)|infrastructure-api-gateway
samhan-partner-order-service|Up 3 hours (healthy)|infrastructure-partner-order-service
samhan-auth-service|Up 3 hours (healthy)|infrastructure-auth-service
samhan-product-service|Up 3 hours (healthy)|infrastructure-product-service
samhan-eureka|Up 3 hours (healthy)|infrastructure-eureka-server
samhan-postgres|Up 3 hours (healthy)|postgres:16-alpine
samhan-user-service|Up 3 hours (healthy)|infrastructure-user-service
samhan-arologis-service|Up 3 hours (healthy)|infrastructure-arologis-service
samhan-accounting-service|Up 3 hours (healthy)|infrastructure-accounting-service
samhan-groupware-service|Up 3 hours (healthy)|infrastructure-groupware-service
samhan-dc-config-service|Up 3 hours (healthy)|infrastructure-dc-config-service
samhan-partner-service|Up 3 hours (healthy)|infrastructure-partner-service
samhan-dashboard-service|Up 3 hours (healthy)|infrastructure-dashboard-service
samhan-partner-auth-service|Up 3 hours (healthy)|infrastructure-partner-auth-service
samhan-notification-service|Up 3 hours (healthy)|infrastructure-notification-service
samhan-grafana|Up 3 hours (healthy)|grafana/grafana:11.3.1
samhan-minio|Up 3 hours (healthy)|minio/minio:latest
samhan-elasticsearch|Up 3 hours (healthy)|docker.elastic.co/elasticsearch/elasticsearch:8.15.3
samhan-rabbitmq|Up 3 hours (healthy)|rabbitmq:3.13-management-alpine
samhan-redis|Up 3 hours (healthy)|redis:7-alpine

/samhan-inventory-service|2026-08-13T12:30:15.702773961Z
/samhan-slip-service|2026-08-12T17:53:07.461758521Z
/samhan-api-gateway|2026-08-12T15:39:17.991855852Z
/samhan-partner-order-service|2026-08-12T15:02:01.069557636Z
/samhan-auth-service|2026-08-12T00:03:23.288496844Z
/samhan-product-service|2026-08-11T18:10:22.372262338Z
/samhan-eureka|2026-08-11T18:10:15.05691594Z
/samhan-postgres|2026-08-11T18:10:14.478346436Z
/samhan-user-service|2026-08-11T17:59:58.945181532Z
/samhan-arologis-service|2026-08-11T17:59:58.944887609Z
/samhan-accounting-service|2026-08-11T17:59:58.936343007Z
/samhan-groupware-service|2026-08-11T17:59:58.936253267Z
/samhan-dc-config-service|2026-08-11T17:59:58.935668218Z
/samhan-partner-service|2026-08-11T17:59:58.92548763Z
/samhan-dashboard-service|2026-08-11T17:59:58.903286495Z
/samhan-partner-auth-service|2026-08-11T17:59:58.888219639Z
/samhan-notification-service|2026-08-11T17:59:58.884122215Z
/samhan-grafana|2026-08-11T17:59:50.780292025Z
/samhan-minio|2026-08-07T17:15:59.685930284Z
/samhan-elasticsearch|2026-06-28T09:49:33.830104726Z
/samhan-rabbitmq|2026-06-22T14:54:01.201891168Z
/samhan-redis|2026-06-22T14:54:01.200390069Z
```

기준 compose의 컨테이너 이름은 25개이고 실재는 22개였다.

```text
EXPECTED_COUNT=25
PRESENT_COUNT=22
MISSING_COUNT=3
MISSING=samhan-logging-service
MISSING=samhan-nginx
MISSING=samhan-prometheus
```

없는 세 컨테이너를 만들거나 고치지 않았다.

#### 요청 HEAD 신선 빌드와 DB 격리

기존 inventory 이미지는 요청 HEAD 빌드가 아니므로 그대로 판정하지 않았다.

```text
.\gradlew.bat :services:inventory-service:bootJar --no-daemon
BUILD SUCCESSFUL in 15s

docker build -t samhan-inventory-1199-liveqa:b028263bb \
  -f services/inventory-service/Dockerfile services/inventory-service
DONE 2.9s
```

공유 `inventory_db`의 Flyway 최대값은 25였다. 브랜치에 이미 있던 V26·V27 때문에 공유 DB를 사용하지 않고 `inventory_qa_1199_r2_b028263`을 복제했다.

```text
QA_DB_EXISTS_BEFORE=0
ENCODING=UTF8|COLLATE=en_US.utf8
FLYWAY_MAX=25

/samhan-inventory-service|2026-08-13T13:01:52.933721425Z|samhan-inventory-1199-liveqa:b028263bb
QA_INVENTORY_STATE=running|healthy
FLYWAY_MAX=27
```

라운드 2 코드에는 새 마이그레이션이 없으며 공유 DB는 끝까지 25에 머물렀다.

#### Playwright 환경

```text
C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
CHROMIUM_VERSION=147.0.7727.15
PW_VERSION=Version 1.59.1
VITE_HTTP=200
VITE_MOCK_MODE 미설정
LOGIN_HTTP=200|ROLE=MASTER
```

렌더러는 `clients/desktop` 패키지 안에서 실행했다. 캡처 전마다 `about:blank`에서 새 문서를 연 뒤
`http://127.0.0.1:5210/#/inventory/stock-balance`로 이동했고, 페이지 전용 제목
`data-testid=header-page-title → 재고 현황`을 단정했다. 임시 스펙은 `1199-r2-real-qa` 경로에 두고 실행 후 삭제했으며 `docs/qa` 안에는 캡처 스크립트를 두지 않았다.

#### 직전 라운드 공유 데이터 확인

사용자가 알려준 두 전표는 그대로 있었다. 같은 번호의 타 QA 전표와 구분해 `slip_type + memo`까지 확인했다.

```text
slip_type | slip_no      | status     | memo
INBOUND   | 2026/08/13-2 | CONFIRMED  | QA1199 시리얼 입고 수불 검증
OUTBOUND  | 2026/08/13-4 | INSPECTING | QA1199 시리얼 출고 수불 검증
```

이 전표 행은 읽기와 source reference 연결에만 사용했으며 이번 라운드가 공유 `slip_db`에 새 행을 만들거나 상태를 바꾸지 않았다.

### R2-2. 시나리오 1 — 시리얼 품목 표시와 수불부 도달

#### 절차

1. 실제 `dev_master` JWT로 요청 HEAD inventory의 `POST /inventory/instances/batch`를 호출해 `ACL-KORGHP07` 3개를 본사창고에 입고했다.
2. 로컬 Playwright Chromium으로 `/#/inventory/stock-balance`에 진입했다.
3. 페이지 전용 제목 `재고 현황`을 단정하고 본사창고를 선택해 조회했다.
4. `ACL-KORGHP07` 행과 `수불부` 버튼을 단정하고 실제 버튼을 눌러 수불부 모달을 열었다.

#### 스크린샷

- [29-r2-serial-balance-after-inbound.png](29-r2-serial-balance-after-inbound.png)
- [30-r2-serial-ledger-after-inbound.png](30-r2-serial-ledger-after-inbound.png)

#### 응답·쿼리 원문

```text
POST /inventory/instances/batch
INBOUND_HTTP=201|INSTANCE_COUNT=3

SERIAL_AFTER_INBOUND_PAGE=1
SERIAL_AFTER_INBOUND_ROW=ACL-KORGHP07 수불부 GHP 저감장치 HQ-001 본사창고 본사 3 0 3
```

수불부 화면 원문 핵심:

```text
2026/08/13-2  입고 1  잔량 1
2026/08/13-2  입고 1  잔량 2
2026/08/13-2  입고 1  잔량 3
2026/08 계     입고 3  출고 0  잔량 3
```

#### 결과

**PASS.** 라운드 1의 D1이 닫혔다. 시리얼 품목이 재고 현황 1페이지에 실제 표시됐고, 사용자가 그 행의 `수불부` 버튼으로 재고수불부 화면에 도달했다.

### R2-3. 시나리오 2 — 표시 수량과 활성 인스턴스 수

#### 절차

1. 입고 직후 `AVAILABLE 3` 화면을 확인했다.
2. `POST /inventory/instances/reserve-batch`로 1개를 예약하고 화면을 새 문서로 다시 열었다.
3. `POST /inventory/instances/ship-batch`로 그 1개를 출고하고 화면과 API를 다시 조회했다.
4. 화면의 가용·예약·실재고 수량을 DB의 `AVAILABLE`·`RESERVED` 활성 인스턴스 수와 대조했다.

#### 스크린샷

- 입고: [29-r2-serial-balance-after-inbound.png](29-r2-serial-balance-after-inbound.png)
- 예약: [31-r2-serial-balance-after-reserve.png](31-r2-serial-balance-after-reserve.png)
- 출고: [32-r2-serial-balance-after-ship.png](32-r2-serial-balance-after-ship.png)

#### 응답·쿼리 원문

```text
RESERVE_HTTP=200|INSTANCE_COUNT=1
SERIAL_AFTER_RESERVE_ROW=ACL-KORGHP07 수불부 GHP 저감장치 HQ-001 본사창고 본사 2 1 3

SHIP_HTTP=200|INSTANCE_COUNT=1
SERIAL_AFTER_SHIP_ROW=ACL-KORGHP07 수불부 GHP 저감장치 HQ-001 본사창고 본사 2 0 2
```

```text
status    | count
----------+------
AVAILABLE | 2
SHIPPED   | 1

active_instances | available_instances | reserved_instances
-----------------+---------------------+-------------------
2                | 2                   | 0
```

API 원문:

```json
{"productCode":"ACL-KORGHP07","productName":"GHP 저감장치","warehouseCode":"HQ-001","warehouseName":"본사창고","warehouseType":"HEADQUARTERS","availableQty":2,"reservedQty":0,"totalQty":2,"version":null}
```

#### 재고 현황 표시 수량 vs 활성 인스턴스 수 대조

| 시점 | 화면 가용 | 화면 예약 | 화면 실재고 | DB AVAILABLE | DB RESERVED | DB 활성 합계 | 판정 |
|---|---:|---:|---:|---:|---:|---:|---|
| 입고 직후 | 3 | 0 | 3 | 3 | 0 | 3 | 일치 |
| 1개 예약 | 2 | 1 | 3 | 2 | 1 | 3 | 일치 |
| 1개 출고 | 2 | 0 | 2 | 2 | 0 | 2 | 일치 |

#### 결과

**PASS.** 표시 수량은 `AVAILABLE + RESERVED` 활성 인스턴스 수와 전 단계에서 정확히 일치했고 `SHIPPED`는 실재고에서 제외됐다.

### R2-4. 시나리오 3 — movement와 수불부 누적 잔량

#### 절차

1. 입고 3개와 출고 1개 후 `stock_movements`를 발생 순서로 조회했다.
2. `quantity_delta` 누적합과 활성 인스턴스 수를 대조했다.
3. 사용자 화면에서 수불부 모달을 다시 열어 입고 3행·출고 1행·최종 잔량을 확인했다.

#### 스크린샷

- [33-r2-serial-ledger-after-inout.png](33-r2-serial-ledger-after-inout.png)

#### 쿼리·응답 원문

```text
movement_type | quantity_delta | running_balance
--------------+----------------+----------------
INBOUND       |  1             | 1
INBOUND       |  1             | 2
INBOUND       |  1             | 3
DEDUCT        | -1             | 2
```

```json
{"success":true,"code":"OK","message":"재고수불부 조회 완료","data":{"productCode":"ACL-KORGHP07","openingBalance":0,"totalInbound":3,"totalOutbound":1,"closingBalance":2,"rows":[{"description":"2026/08/13-2","inboundQuantity":1,"outboundQuantity":0,"balance":1},{"description":"2026/08/13-2","inboundQuantity":1,"outboundQuantity":0,"balance":2},{"description":"2026/08/13-2","inboundQuantity":1,"outboundQuantity":0,"balance":3},{"description":"2026/08/13-4","inboundQuantity":0,"outboundQuantity":1,"balance":2}]}}
```

```text
movement 누적 잔량 = 3 - 1 = 2
수불부 closingBalance = 2
활성 인스턴스 = AVAILABLE 2 + RESERVED 0 = 2
```

#### 결과

**PASS — 2 = 2 = 2.** 라운드 1의 입출고 movement와 누적 잔량 불변식이 유지된다.

### R2-5. 시나리오 4 — 기존 수량 관리 품목 행 수·수량 불변

대상은 `0000098`(한경희 선풍기), 본사창고이다.

#### 절차

1. 시리얼 입출고 전 `GET /inventory/balances`에서 대상 행을 저장했다.
2. 시리얼 입고·예약·출고를 수행했다.
3. 같은 API와 화면에서 대상 행을 다시 조회했다.
4. 격리 DB와 원본 공유 DB의 활성 `stock_balances` 총 행 수도 비교했다.

#### 스크린샷

- [34-r2-batch-balance-unchanged.png](34-r2-batch-balance-unchanged.png)

#### 응답·쿼리 원문

```text
BATCH_BEFORE={"productCode":"0000098","productName":"한경희 선풍기","warehouseCode":"HQ-001","warehouseName":"본사창고","warehouseType":"HEADQUARTERS","availableQty":4,"reservedQty":1,"totalQty":5,"version":6}
BATCH_AFTER ={"productCode":"0000098","productName":"한경희 선풍기","warehouseCode":"HQ-001","warehouseName":"본사창고","warehouseType":"HEADQUARTERS","availableQty":4,"reservedQty":1,"totalQty":5,"version":6}
BATCH_AFTER_UI_ROW=0000098 수불부 한경희 선풍기 HQ-001 본사창고 본사 4 1 5
```

```text
구분                         | 행 수 | 가용 | 예약 | 합계
-----------------------------+------:|-----:|-----:|-----:
요청 전 API 0000098/HQ-001   | 1     | 4    | 1    | 5
요청 후 API 0000098/HQ-001   | 1     | 4    | 1    | 5
격리 DB stock_balances 전체  | 202   |  -   |  -   |  -
공유 DB stock_balances 전체  | 202   |  -   |  -   |  -
```

#### 결과

**PASS.** 기존 수량 관리 품목의 표시 행 수와 세 수량이 모두 바뀌지 않았고, 시리얼 조회 합성이 기존 `stock_balances` 행을 생성·삭제·변경하지 않았다.

### R2-6. 시나리오 5 — 전이와 movement 원자성

#### 절차

1. 정상 입고 3개·출고 1개의 movement와 상태 전이를 먼저 완료했다.
2. 격리 DB에만 `BEFORE INSERT ON stock_movements` 실패 트리거를 설치했다.
3. 실패용 시리얼 입고를 호출하고 인스턴스 생성과 movement 총수를 확인했다.
4. 트리거 제거 → 실패용 출고 1개 예약 → 트리거 재설치 → 출고를 호출했다.
5. `SHIPPED` 전이 여부와 movement 총수를 확인한 뒤 트리거/함수를 제거하고 예약을 해제했다.
6. 사용자 화면을 새 문서로 다시 열어 최종 수량이 `2/0/2`로 유지되는지 확인했다.

#### 스크린샷

- [35-r2-serial-balance-after-rollback.png](35-r2-serial-balance-after-rollback.png)

#### 실패 응답·쿼리 원문

```text
FAIL_IN_HTTP=500
FAIL_IN_INSTANCES=0
MOVEMENTS_AFTER_FAIL_IN=4

FAIL_OUT_RESERVE_HTTP=200
FAIL_OUT_HTTP=500
FAIL_OUT_RESERVED=1
FAIL_OUT_SHIPPED=0
MOVEMENTS_AFTER_FAIL_OUT=4
```

서비스 로그 원문:

```text
ERROR: QA1199 R2 forced movement insert failure
Where: PL/pgSQL function qa1199_r2_fail_movement() line 1 at RAISE
insert into stock_movements (...)
```

정리 원문:

```text
FAIL_OUT_RELEASE_HTTP=200
FINAL_FAIL_TRIGGERS=0
FINAL_FAIL_FUNCTIONS=0
FINAL_FAIL_RESERVED=0
FINAL_ACTIVE=2
POST_ROLLBACK_ROW=ACL-KORGHP07 수불부 GHP 저감장치 HQ-001 본사창고 본사 2 0 2
POST_ROLLBACK_UI_RESULT=PASS
```

#### 결과

**PASS.** movement INSERT가 실패하면 입고 인스턴스 생성은 0으로 롤백되고, 출고 인스턴스는 `SHIPPED`로 넘어가지 않고 `RESERVED`에 남았다. 실패 조건 제거와 예약 해제 후 화면·DB 모두 정상 수량으로 복귀했다.

### R2-7. 증거 무결성

라운드 2 구현 보고서의 정정은 다음과 같다.

```text
입고 movement reference_type = INBOUND
출고 movement reference_type = SLIP
```

실측 원문:

```text
movement_type | quantity_delta | reference_type | reference_id                         | count
INBOUND       |  1             | INBOUND        | 63ad22e4-226f-4906-9947-4b44d071d58b | 3
DEDUCT        | -1             | SLIP           | c2227c12-e0c2-431b-8092-612bab1f51bc | 1
```

reference ID가 가리키는 공유 전표 원문:

```text
INBOUND  | 2026/08/13-2 | 63ad22e4-226f-4906-9947-4b44d071d58b | version 7 | CONFIRMED
OUTBOUND | 2026/08/13-4 | c2227c12-e0c2-431b-8092-612bab1f51bc | version 5 | INSPECTING
```

판정: **PASS.** 구현 보고서의 라운드 2 reference 설명은 실제 DB와 일치한다. 라운드 1에서 지적한 증거 무결성 불일치는 정정됐다.

### R2-8. 도달 가능한 결함

**0건.**

- 라운드 1 D1: 닫힘.
- 시리얼 표시 수량: 활성 인스턴스 수와 일치.
- 기존 수량 관리 품목: 행 수·수량 불변.
- movement·누적 잔량·원자성: 유지.
- 이번 fix가 만든 새 도달 표면: 발견되지 않음.

캡처 상단의 `업데이트 실패: 버전 정책을 확인하지 못했습니다` 배너는 로컬 QA 버전 문자열
`2026/08/13-1199`가 공유 버전 정책 조회 대상이 아닌 렌더러 환경에서 발생했다. 재고 fix의 코드·서비스·데이터 변화와 인과가 없고, 이번 재고 도달성 판정에는 사용하지 않았다.

### R2-9. 관측 불가와 실패 명령 원문

대상 시나리오 1~5의 관측 불가 축은 **0개**다. 아래 하네스 실패는 모두 원인을 교정한 뒤 같은 축을 실제 실행해 최종 PASS 원문을 얻었다.

#### 1) node_modules 연결 전 Vite 기동 실패

명령:

```powershell
npm exec vite -- --config vite.web.config.ts --host 127.0.0.1 --port 5210
```

원문:

```text
Could not resolve 'vite' in vite.web.config.ts
Could not resolve '@vitejs/plugin-react' in vite.web.config.ts
Could not resolve 'vite-plugin-pwa' in vite.web.config.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vite'
```

기존 `C:\dev\Samhan-Public\clients\desktop\node_modules`를 작업트리 패키지에 임시 junction으로 연결해 재기동했고 종료 시 제거했다.

#### 2) 잘못 고른 web config가 HashRouter를 무시

명령:

```powershell
npm exec vite -- --config vite.web.config.ts --host 127.0.0.1 --port 5210
node playwright\1199-r2-real-qa\1199-r2-real-qa.spec.mjs
```

원문:

```text
Error: 목표 화면 제목 불일치: 대시보드
```

`vite.web.config.ts`는 web deploy용 BrowserRouter를 선택하므로 중단했다. `vite.config.ts`로 다시 띄우고 `/#/inventory/stock-balance` 및 전용 제목을 단정해 전체 시나리오를 실행했다.

#### 3) 수불부 단언값과 모달 정리 실패

첫 단언은 QA용 `inboundSlipNo`가 화면에 나올 것으로 잘못 가정했다.

```text
locator.waitFor: Timeout 30000ms exceeded.
waiting for getByText('QA1199-R2-IN-b028263', { exact: true })
```

실제 화면은 source `slipId`를 해석한 `2026/08/13-2`를 표시했다. 실제 전표번호를 단언해 재실행했다.

모달을 닫지 않고 같은 SPA 문서에서 재조회한 시도도 중단됐다.

```text
locator.click: Timeout 30000ms exceeded.
<div data-testid="ds-modal-backdrop"> intercepts pointer events
```

모달 닫힘을 단정하고 단계마다 새 문서를 열어 캐시 없는 최종 실행을 했다.

#### 4) 격리 DB 재생성 직후 Eureka 재등록 대기

```text
Error: 초기 balance HTTP 503
GATEWAY_INVENTORY_HTTP=200|ATTEMPTS=8
```

서비스 자체 health만으로 진행하지 않고 실제 게이트웨이 경로가 200이 될 때까지 조건 기반으로 확인한 뒤 실행했다.

#### 5) 의도한 원자성 실패 응답

```text
POST /inventory/instances/batch    -> 500
POST /inventory/instances/ship-batch -> 500
ERROR: QA1199 R2 forced movement insert failure
```

이는 관측 불가가 아니라 트랜잭션 롤백을 실측하기 위해 QA DB에만 만든 의도된 실패다. 트리거·함수는 최종 0개다.

### R2-10. 만든 데이터와 종료 정리

#### 공유 DB

- 새 전표·인스턴스·movement: **0건**.
- 직전 라운드 전표 `2026/08/13-2`, `2026/08/13-4`: 읽기와 source reference에만 사용, 상태 변경 없음.

#### 격리 `inventory_qa_1199_r2_b028263`

- 정상 데이터: `ACL-KORGHP07` 인스턴스 3개(`AVAILABLE 2`, `SHIPPED 1`), `INBOUND +1` 3행, `DEDUCT -1` 1행.
- 실패 입고 `QA1199-R2-FAIL-IN`: 롤백 후 인스턴스 0개.
- 실패 출고 `QA1199-R2-FAIL-OUT`: 실패 시 RESERVED 1개를 확인한 뒤 예약 해제, 최종 잔재 0개.
- 실패 트리거·함수: 최종 0개.
- 하네스 교정 중 첫 복제 DB에 만든 입고 3개·예약/출고 1개는 격리 DB를 초기화하면서 폐기했다.
- 최종 QA DB 자체도 종료 정리에서 삭제했다.

#### 종료 원문

```text
RESTORED_INVENTORY_STATE=running|healthy
/samhan-inventory-service|2026-08-13T12:30:15.702773961Z|infrastructure-inventory-service
ACTUATOR=UP
QA_DB_COUNT=0
QA_IMAGE_COUNT=0
SHARED_FLYWAY_MAX=25
VITE_LISTENERS=0
PLAYWRIGHT_CHROME=0
JUNCTION_EXISTS=False
FINAL_FREE_RAM_GB=21.935
```

요청 HEAD의 QA 컨테이너는 삭제하고, 시작 시 보존해 둔 원래 inventory 컨테이너를 같은 생성 시각·이미지로 복구했다.

종료 재고에서 다른 트랙이 QA 도중 다음 두 컨테이너를 재생성한 사실을 확인했다.

```text
/samhan-groupware-service|2026-08-13T13:10:23.841805531Z
/samhan-dashboard-service|2026-08-13T13:16:39.426553725Z
```

시작 시 두 컨테이너의 생성 시각은 각각 `2026-08-11T17:59:58.936253267Z`,
`2026-08-11T17:59:58.903286495Z`였다. 이번 재고 QA가 만든 변경이 아니며, 실측 차이를 고치거나 되돌리지 않았다. inventory·slip·auth·product·gateway의 대상 시나리오는 이 두 서비스에 의존하지 않는다.

#### 산출 파일

- 기존 보고서 내용 + 이 `## 라운드 2` 절.
- 신규 실 캡처 7장: `29`~`35`.
- `docs/qa` 안의 신규 캡처 스크립트: 0개.

### R2-11. 머지 권고

**머지 권고.**

근거:

1. 시리얼 품목이 재고 현황에 표시되고 실제 `수불부` 버튼으로 수불부 화면에 도달한다.
2. 화면 수량은 입고·예약·출고 전 단계에서 활성 인스턴스 수와 일치한다.
3. 기존 수량 관리 품목의 행 수와 수량이 모두 보존된다.
4. 입출고 movement, 누적 잔량, 상태 전이와 movement의 원자성이 실 API·DB 실패 조건에서도 유지된다.
5. 구현 보고서의 입고 `INBOUND` / 출고 `SLIP` reference 정정이 실제 DB와 일치한다.
6. 범위 안 도달 가능한 결함은 0건이며 새 도달 표면도 발견되지 않았다.
