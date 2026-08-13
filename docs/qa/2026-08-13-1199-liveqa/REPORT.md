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
