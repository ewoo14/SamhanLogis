# PR #1156 / Issue #1155 — INBOUND partner_code 보정 구현 보고

## 결론

- 신규 생성 경로는 `OUTBOUND`와 동일하게 `partnerId → partner-service resolvePartnerCode → partnerCode snapshot`을 `INBOUND`에도 적용했다.
- 기존 보정 endpoint는 두 방향을 지원한다. `partner_code → partner_id` 기존 경로는 유지하고, `partner_id → partner_code`를 추가했다.
- 저장 시 lookup 실패는 빈 `partner_code`만 남기며 전표 생성 실패로 전파하지 않는다.
- DB 직접 INSERT/UPDATE는 하지 않았다. 실제 PostgreSQL 조회와 HTTP dry-run만 수행했다.
- 실제 공유 DB의 47건 소급 보정은 partner-service load-balancer 환경 문제로 실행하지 못했다. 직접 partner API는 정상이나 새 slip-service가 Eureka에서 선택한 partner 인스턴스는 88건 모두 resolve 실패를 반환했다.

## 실측

읽기 전용 SQL:

```text
SELECT count(*) AS active_inbound,
       count(*) FILTER (WHERE partner_code IS NOT NULL AND btrim(partner_code) <> '') AS code_present,
       count(*) FILTER (WHERE partner_id IS NOT NULL AND (partner_code IS NULL OR btrim(partner_code)='')) AS id_only,
       count(*) FILTER (WHERE partner_id IS NULL AND (partner_code IS NULL OR btrim(partner_code)='')) AS no_partner
FROM slips WHERE is_deleted=false AND slip_type='INBOUND';

 active_inbound | code_present | id_only | no_partner
----------------+--------------+---------+------------
             61 |           12 |      47 |          2
```

정당한 `no_partner=2`는 거래처가 없는 전표이므로 임의 코드 보정 대상에서 제외했다.

Flyway 실측 최대 버전은 `V118`; 열린 PR 중 slip-service migration 충돌은 없었다. 이번 방식은 migration이 아니라 기존 internal batch API 확장이다. 이유는 partner-service 정본을 실행 시점에 조회해야 하고, `partner_code`만 변경하며 다른 전표 필드와 금액을 건드리지 않기 때문이다. 실패한 partner는 재실행 가능한 멱등 batch로 남긴다.

## 코드 변경

- `SlipService.create`: INBOUND/OUTBOUND 공통으로 `resolvePartnerCode(req.partnerId())` 호출.
- `SlipRepository`: `partner_id`만 있고 `partner_code`가 NULL/공백인 커밋 활성 전표 조회 및 양쪽 컬럼 누락 잔여 count 추가.
- `SlipPartnerBackfillService`: 기존 역방향 보정 보존 + `partnerId → partnerCode` 보정 추가.
- `SlipInternalController`: 양방향 보정 계약 Javadoc 갱신.
- 회귀 테스트: INBOUND 저장 응답에서 `partnerId`와 `partnerCode` 동시 단언, 실제 PostgreSQL backfill IT 추가.

## 계열 sweep

축: `partner_id`를 저장/사용하면서 `partner_code`를 저장/사용하지 않는 지점.

실행한 grep 원문:

```powershell
rg -n --glob 'services/**/src/main/**/*.java' -S "partnerId"
$files = rg -l --glob 'services/**/src/main/**/*.java' -S 'partnerId' services
foreach($f in $files){$content=Get-Content $f -Raw; if($content -match 'partnerCode|partner_code'){ $f }}
```

차집합 raw 결과는 140개 파일이다. 아래 명령이 grep 원문이며, 토큰 공존을 찾는 1차 sweep이라 DTO/조회/외부계약도 포함한다. 아래 경로는 그중 저장 지점 검토 대상 핵심 목록이다.

```text
services/arologis-service/.../SlipResolver.java
services/arologis-service/.../SlipClient.java
services/arologis-service/.../PartnerClient.java
services/dc-config-service/.../DcConfigRepository.java
services/dc-config-service/.../PartnerInternalResponse.java
services/dc-config-service/.../PartnerPublicResponse.java
services/dashboard-service/.../PartnerCodeResolver.java
services/dashboard-service/.../DashboardSnapshotSeeder.java
services/partner-service/.../Partner4TabService.java
services/partner-service/.../PartnerService.java
services/partner-service/.../EcountPartnerImporter.java
services/slip-service/.../Slip.java
services/slip-service/.../SlipService.java
services/slip-service/.../SlipUpdateService.java
services/slip-service/.../SlipDuplicateService.java
services/slip-service/.../SlipPartnerBackfillService.java
services/slip-service/.../SalesSlipUpdateService.java
services/slip-service/.../SlipRepository.java
services/accounting-service/.../PurchaseAccountingSlipCreateAttemptService.java
services/accounting-service/.../TaxInvoiceInboundService.java
services/accounting-service/.../PartnerLedgerReadService.java
services/partner-order-service/.../PartnerOrderConfirmService.java
services/partner-order-service/.../PartnerOrderUpdateService.java
services/notification-service/.../RestClientPartnerLookupClient.java
```

검토 결과 이번 결함의 저장 지점은 `slip-service SlipService.create` 하나다. 나머지는 DTO/조회/lookup/집계/외부 계약이거나 이미 partnerCode를 함께 다루는 지점이다. 전 서비스 차집합을 일괄 수정하지 않았다.

## RED / GREEN 원문

### RED-A

추가한 테스트를 수정 전 실행:

```text
SlipServiceTest > create_inbound_resolvesPartnerCode_andPersistsBothPartnerColumns() FAILED
expected: "P-INBOUND-0001"
 but was: null
```

### GREEN-A / 회귀

```text
.\gradlew :services:slip-service:test --tests 'com.samhanair.logis.slip.service.SlipServiceTest.create_inbound_resolvesPartnerCode_andPersistsBothPartnerColumns' --no-daemon
BUILD SUCCESSFUL

.\gradlew :services:slip-service:test --tests 'com.samhanair.logis.slip.service.SlipServiceTest' --no-daemon
BUILD SUCCESSFUL

.\gradlew :services:slip-service:test --tests 'com.samhanair.logis.slip.it.SlipPartnerBackfillIT' --no-daemon
BUILD SUCCESSFUL
```

`SlipPartnerBackfillIT`는 Testcontainers PostgreSQL에서 기존 역방향과 신규 `partner_id → partner_code`를 실제 repository 저장으로 검증하고, `partner_id` 보존을 단언한다.

### RED-B

실 공유 DB의 보정 전 count는 다음과 같다.

```text
active_inbound=61, code_present=12, id_only=47, no_partner=2
```

새 jar의 실제 HTTP dry-run:

```text
POST http://localhost:18106/internal/slips/backfill-committed-partners?dryRun=true
candidateCount=88, processedCount=0, unresolvedCount=88, remainingCount=88
```

88건은 공유 DB의 모든 커밋 상태 누락 행이다. INBOUND 47건만의 보정 후 0 검증은 partner lookup 환경 문제로 실행하지 못했다.

### RED-C

OUTBOUND 생성 경로를 포함한 `SlipServiceTest` 전체와 backfill IT가 `BUILD SUCCESSFUL`이다. OUTBOUND 경로의 동작 코드는 변경하지 않았다.

### RED-D

`slip.setPartnerCode(resolvedPartnerCode)` 한 줄을 임시 제거한 mutation 실행:

```text
SlipServiceTest > create_inbound_resolvesPartnerCode_andPersistsBothPartnerColumns() FAILED
expected: "P-INBOUND-0001"
 but was: null
```

mutation은 즉시 원복했다. 테스트가 두 컬럼 중 한쪽만 채운 구현을 실패시킨다.

## 실 API 증적 및 차단 사항

직접 partner-service API는 성공했다.

```text
GET http://localhost:8095/internal/partners/a1b2c3d4-0001-0001-0001-000000000001/summary
HTTP 200
partnerId=a1b2c3d4-0001-0001-0001-000000000001
partnerCode=P0-6-C001
```

같은 토큰으로 새 slip-service가 사용하는 load-balanced client를 통한 resolve는 88/88 실패했다. Eureka에 여러 partner 인스턴스가 등록되어 있고, 직접 호출 인스턴스와 선택 인스턴스의 데이터가 다르거나 endpoint가 없는 셋째 가능성이다. 따라서 실 DB에 직접 UPDATE하지 않았고 B를 GREEN이라고 주장하지 않는다.

INBOUND 실 생성 HTTP도 product-service load-balanced lookup에서 `product-service 호출 실패(500)`로 차단되어 저장 표본을 만들지 않았다. 이는 이번 변경 전제의 partner lookup 결함과 별개인 실행환경 장애다.

## 신규 파일

- `docs/dev-reports/2026-08-09-1155-inbound-partner-code.md` (본 보고서)

## 못 한 것

- 공유 `slip_db` 47건의 실 API 소급 보정 및 RED-B=0: partner-service Eureka/load-balancer 인스턴스 불일치로 보류.
- 실 INBOUND 생성 저장 표본: product-service load-balanced lookup 500으로 보류.
- OUTBOUND 실 API 생성/조회: 위 product-service 실행환경 장애로 이번 라운드에서 추가 표본 생성 불가.

커밋과 push는 하지 않았다.
