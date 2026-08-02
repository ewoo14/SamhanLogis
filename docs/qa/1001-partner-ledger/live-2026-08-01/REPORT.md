# PR #1003 / Issue #1001 라이브 QA 보고서

- 일자: 2026-08-01
- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1001`
- 브랜치/HEAD: `feat/1001-partner-ledger-spec` / `d6ef049de`
- 범위: 실제 서버 라이브 QA. 코드 수정 및 Git 쓰기 없음.

## 진행 로그

### 시작

- 보고서 선생성 완료. 이후 각 단계의 명령, 결과, 판정을 이 문서에 append한다.

## 배포 확인

### 배포 전 상태

명령:

```powershell
git status --short
git branch --show-current
git rev-parse --short=12 HEAD
docker inspect -f '{{.Created}}' infrastructure-slip-service infrastructure-partner-order-service
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml ps slip-service partner-order-service
```

결과:

- 브랜치: `feat/1001-partner-ledger-spec`
- HEAD: `d6ef049de7fb`
- 작업 트리에는 본 보고서 디렉터리만 신규 미추적 상태로 표시됨.
- 요청된 이름 `infrastructure-slip-service`, `infrastructure-partner-order-service`는 존재하지 않아 `docker inspect` 템플릿 오류가 발생함.
- 실제 compose 컨테이너는 `samhan-slip-service`(약 1시간 전 생성, healthy), `samhan-partner-order-service`(2일 전 생성, healthy)로 확인됨.

판정: 재배포 전에는 두 서비스 모두 이번 QA용 생성 시각이 아님. 지정 inspect 이름과 실제 컨테이너 이름이 불일치한다.

### 허용 서비스 재배포

명령:

```powershell
.\gradlew.bat :services:slip-service:bootJar :services:partner-order-service:bootJar -x test
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps slip-service partner-order-service
```

결과:

- Gradle `BUILD SUCCESSFUL`.
- 기본 host publish는 `influxd.exe` PID `9144`가 `8086`과 `8088`을 모두 점유하여 실패.
- 다른 서비스는 재빌드·재기동하지 않음.
- stdin compose override로 host 포트를 `18086 -> 8086`, `18088 -> 8088`로 우회하여 두 서비스 기동 성공.
- 컨테이너: `samhan-slip-service`, `samhan-partner-order-service`; 둘 다 `healthy`.
- 실제 생성 시각: 각각 `2026-07-31T15:51:50.533215807Z`, `2026-07-31T15:51:50.533560637Z` (현재 날짜 기준 방금 재배포).
- 사용자가 지정한 `docker inspect -f '{{.Created}}' infrastructure-slip-service infrastructure-partner-order-service`는 해당 컨테이너명이 없어 실패했고, 실제 컨테이너명으로 대체 확인함.

판정: 배포 PASS(단, `influxd.exe` 충돌로 host publish 우회 사실 기록).

## ① 신설 read 계약

명령:

```powershell
Invoke-RestMethod 'http://127.0.0.1:18086/internal/slips/partner-ledger-sales?from=2020-01-01&to=2026-12-31' -Headers @{ 'X-Internal-Token'='dev-internal-token-change-me' }
```

결과: HTTP `200`, 응답 `success=true`. 원문 응답에는 `slipNo`, `slipDate`, `status`, `deliveryAddress`, `lines[].productName`, `lines[].modelName`, `lines[].quantity`, `lines[].unitPriceWithVat`, `lines[].lineAmount`가 포함됨.

응답 집계:

```text
documents=21 lines=62
statuses=COMPLETED=7, CONFIRMED=4, DELIVERED=10
nonBlankDeliveryAddress=0
uuidPatternMatches=0
```

판정: PASS. 기대치 21건/62라인, 상태 3종, 배송주소 0건, UUID 미노출 모두 일치.

## ② 배송주소 발행 경로

### QA throwaway 준비

기존 실주문을 건드리지 않기 위해 `partner_order_db`에 `QA-1001-S-20260801`, `QA-1001-M1-20260801`, `QA-1001-M2-20260801` 주문 3건과 각 1라인을 생성했다. 모두 `P-2026-0002`, `HQ-001`, `created_by=live-qa`로 표시했으며, 배송주소는 단건/병합 각각 별도 QA 문자열을 사용했다.

### 단건 발행

명령:

```powershell
POST http://127.0.0.1:18088/api/v1/partner-orders/QA-1001-S-20260801/convert-to-slip
X-Internal-Token: dev-internal-token-change-me
X-Is-System-Master: true
body: {"items":[{"orderLineId":"10010000-0000-0000-0001-000000000001","quantity":1}],"warehouseCode":"HQ-001"}
```

결과: 권한 헤더 적용 후에도 HTTP `400 INVALID_INPUT` (`요청 본문이 유효하지 않습니다`). `partner_orders`는 발행 전 상태 `DRAFT`, `slip_no` 공란으로 남았고, 전표는 생성되지 않았다.

판정: FAIL/미완료. 배송주소가 전표까지 저장되는 성공 경로는 확인하지 못했다. 제품 결함으로 단정하지 않고 라이브 환경의 발행 입력/내부 계약 실패로 기록한다.

### 병합 발행

명령:

```powershell
POST http://127.0.0.1:18088/api/v1/partner-orders/convert-to-slip-merge
X-Internal-Token: dev-internal-token-change-me
X-Is-System-Master: true
body: orders=[QA-1001-M1-20260801, QA-1001-M2-20260801], warehouseCode=HQ-001,
      shippingInfo.deliveryAddress=QA 병합 배송주소 2026-08-01
```

결과: HTTP `400`.

판정: FAIL/미완료. 병합 전표도 생성되지 않아 `slips.delivery_address` 도달 여부를 확인하지 못했다.

## ③ 멱등 재시도

단건·병합 모두 최초 발행이 HTTP 400으로 종료되어 성공 응답을 동일 요청으로 두 번 비교할 수 없었다. 따라서 기존 결과 반환과 배송주소만 다른 요청 구분은 확인하지 못함.

## 정리 후 행 수 대조

정리 명령은 QA 식별자에 한정했다:

```powershell
docker exec samhan-postgres psql -U samhan -d partner_order_db -c "DELETE FROM partner_order_lines WHERE partner_order_id IN (SELECT id FROM partner_orders WHERE order_no LIKE 'QA-1001-%'); DELETE FROM partner_orders WHERE order_no LIKE 'QA-1001-%'; SELECT count(*) ..."
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT count(*) ... QA ..."
docker exec samhan-postgres psql -U samhan -d inventory_db -c "SELECT count(*) ... QA ..."
```

결과:

```text
partner_order QA rows: 0
partner_order_line QA rows: 0
slip QA rows (source_id): 0
slip QA rows (delivery_address): 0
slip_publish_audit QA rows: 0
inventory QA movements: 0
reserved_qty: 0 (확인한 두 품목/창고 행 모두)
```

판정: PASS. throwaway 주문·라인·전표·감사행은 남지 않았고 예약 수량도 0이다.

## ④ 실제 화면 캡처

UI 미변경이라 캡처 대상 없음. 합성/목업 캡처는 만들지 않았으며, 실제 API HTTP 응답과 DB 조회 결과로 대체했다.

## 확인하지 못한 것

- 단건/병합 발행 성공 후 `slips.delivery_address` 저장.
- 성공 요청의 멱등 재시도 200 및 동일 slip 결과.
- 배송주소만 다른 요청의 멱등 지문 분리.
- 화면 캡처(UI 미변경).

## 최종 판정

- ① 신설 read 계약: PASS.
- ② 배송주소 발행 경로: HTTP 400으로 성공 검증 불가.
- ③ 멱등 재시도: 검증 불가(선행 발행 실패).
- 배포: 두 허용 서비스만 재빌드·재기동 완료. `influxd.exe`가 8086/8088을 점유하여 18086/18088 host publish 우회.

최종 컨테이너 확인:

```text
/samhan-slip-service 2026-07-31T15:51:50.533215807Z healthy
/samhan-partner-order-service 2026-07-31T15:51:50.533560637Z healthy
host ports: 127.0.0.1:18086->8086, 127.0.0.1:18088->8088
```

최종 `git status --short`는 본 보고서 디렉터리만 미추적 상태이며, 코드 파일 변경은 없다.
