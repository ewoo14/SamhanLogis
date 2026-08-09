# PR #1156 / Issue #1155 — SOL 5.6 1차 적대검증

## 0. 환경 확인

### 검증 기준

```text
워크트리  C:\dev\Samhan-Public\.claude\worktrees\t1155
브랜치    fix/1155-inbound-partner-code
HEAD      204790fd69f005daeae1e1d5eadd656065a8f6aa
```

검증 시작 시 tracked 변경은 없었다. 검증 대상 Java 소스를 다시 빌드했다.

```text
.\gradlew.bat :services:slip-service:bootJar --no-daemon
BUILD SUCCESSFUL in 18s

services/slip-service/build/libs/slip-service.jar
SHA-256 8670243E82594B3A34F10008A52837F419AA967A758FC65D650893D9C7F18190
```

다른 트랙의 서비스를 재배포하지 않았다. 위 JAR만 별도 컨테이너 `sol1156-r1-slip`에 read-only mount하여 공유 Docker network에서 실행했다.

```text
mount  ...\t1155\services\slip-service\build\libs\slip-service.jar => /app/app.jar:ro
port   127.0.0.1:18106 -> 8086
health GET http://127.0.0.1:18106/actuator/health
       200 {"status":"UP","groups":["liveness","readiness"]}
```

따라서 아래 `18106` 응답은 검증 HEAD로부터 새로 만든 JAR의 응답이다.

### 포트와 실제 호출 API

```text
gateway         http://127.0.0.1:8080
auth-service    http://127.0.0.1:8081
product-service http://127.0.0.1:8084
partner-service http://127.0.0.1:8095
Eureka          http://127.0.0.1:8761
검증 HEAD slip  http://127.0.0.1:18106
현재 소스 GUI   http://127.0.0.1:5327
```

실제 검증 endpoint:

```text
POST  :18106/internal/slips/backfill-committed-partners?dryRun={true|false}
POST  :18106/slips
GET   :18106/slips/{id}
PATCH :18106/slips/{id}/header
GET   partner-service 선택 인스턴스 /internal/partners/{id}/summary
```

GUI는 현재 워크트리 `clients/desktop/src`를 `vite.web.config.ts`로 `5327`에 띄웠다. 일반 조회는 실 gateway를 사용하고, 전표 생성 `POST /slips`만 Playwright route를 통해 검증 HEAD `18106`으로 전달했다.

### 발화 조건 카운트 — 어떤 변경도 하기 전

읽기 전용 SQL:

```sql
SELECT status,
       count(*) AS total,
       count(*) FILTER (WHERE partner_id IS NOT NULL
                         AND (partner_code IS NULL OR btrim(partner_code)='')) AS id_only,
       count(*) FILTER (WHERE partner_code IS NOT NULL AND btrim(partner_code)<>'') AS code_present,
       count(*) FILTER (WHERE partner_id IS NULL
                         AND (partner_code IS NULL OR btrim(partner_code)='')) AS no_partner
FROM slips
WHERE is_deleted=false AND slip_type='INBOUND'
GROUP BY status ORDER BY status;
```

```text
status      total  id_only  code_present  no_partner
ACCEPTED        6        6             0           0
CANCELED        4        0             4           0
COMPLETED      17       14             3           0
CONFIRMED       1        1             0           0
DRAFT          16       10             5           1
INSPECTING      2        2             0           0
PROCESSING      7        7             0           0
REJECTED        2        2             0           0
SAVED           4        3             0           1
SENT            2        2             0           0
합계           61       47            12           2
```

## 1. 판정

**차단 — 실 사용자 경로로 재현 가능한 결함이 있다.**

1. 구현자가 보고한 `88/88 resolve 실패` 자체는 코드 문제가 아니라 실행 위치와 Eureka 주소 공간이 어긋난 **환경/배치 토폴로지 문제**다. 같은 JAR을 Eureka 대상과 같은 Docker network에서 실행하자 `88/88`이 해소되고 실제 보정도 끝났다.
2. 그러나 보정 코드는 `DRAFT/SAVED`를 대상에서 제외하여 기존 활성 `INBOUND` 공백 47건 중 13건을 남긴다. 그 13건은 실 `save/send` 경로로 `SENT`가 되어도 code를 채우지 않는다. 일회성 batch 실행 뒤 다시 결함 상태로 진입하는 도달 가능한 코드 결함이다.
3. `PATCH /slips/{id}/header`는 거래처를 바꾸면서 `partner_id`만 바꾸고 이전 `partner_code`를 보존한다. 실 API에서 새 거래처로 바꾼 뒤 이전 코드 `00`이 남는 것을 재현했다.
4. 신규 생성과 lookup fail-open은 요구 계약대로 동작했다.

## 2. 각도 1 — 소급 보정이 왜 안 되었는가

### 2.1 구현자의 88/88 실패: 환경 문제로 확정

Eureka 원문 요약:

```text
GET http://127.0.0.1:8761/eureka/apps/PARTNER-SERVICE
instance count=1
instanceId=da4cd793c357:partner-service:8095
hostName=da4cd793c357
ipAddr=172.19.0.18
status=UP
port=8095
```

`PartnerInternalClient.resolvePartnerCode`의 실제 요청은 Eureka가 고른 위 인스턴스의 다음 endpoint로 간다.

```text
GET http://da4cd793c357:8095/internal/partners/{id}/summary
X-Internal-Token: <redacted>
HTTP 200
data.partnerCode=<non-empty>
```

등록 인스턴스는 하나뿐이므로 “Eureka가 다른/낡은 여러 partner 인스턴스 중 하나를 선택했다”는 설명은 사실이 아니다. 구현자 실행은 host의 독립 프로세스였고, Eureka는 Docker 내부 hostname/IP를 반환했다. host에서 `localhost:8095` 직접 호출은 성공하지만 Docker 내부 이름 `da4cd793c357`은 같은 주소 공간이 아니어서 실패한다. 같은 검증 JAR을 `samhan-net`에서 실행하면 위 원문 요청이 HTTP 200이었다.

즉 요청/응답의 제3 가능성은 **partner 응답 오류가 아니라 service discovery가 반환한 Docker 내부 주소를 host 프로세스가 소비한 토폴로지 불일치**다.

### 2.2 같은 JAR의 실 endpoint 결과

```text
POST :18106/internal/slips/backfill-committed-partners?dryRun=true
HTTP 200
candidateCount=88, processedCount=88, unresolvedCount=0,
remainingCount=88, dryRun=true

POST :18106/internal/slips/backfill-committed-partners?dryRun=false
HTTP 200
candidateCount=88, processedCount=88, unresolvedCount=0,
remainingCount=0, dryRun=false

동일 endpoint 재실행
HTTP 200
candidateCount=0, processedCount=0, unresolvedCount=0,
remainingCount=0, dryRun=false
```

컨테이너 로그 원문:

```text
dryRun=true,  candidate=88, processed=88, unresolved=0, remaining=88
dryRun=false, candidate=88, processed=88, unresolved=0, remaining=0
dryRun=false, candidate=0,  processed=0,  unresolved=0, remaining=0
```

DB 직접 UPDATE/INSERT 없이 실제 endpoint만 호출했다. 멱등성도 확인됐다.

### 2.3 별도 코드 결함: 기존 INBOUND 13건은 보정 대상 밖

실행 뒤 최초 47건 중 커밋 상태 34건은 code가 채워졌지만 아래는 그대로 남았다.

```text
DRAFT id_only=10
SAVED id_only=3
합계=13
```

13행이 참조하는 distinct partner 7개를 `partner_db`에서 읽기 전용 대조한 결과 7개 모두 활성 거래처였다. 해소 불가능 데이터가 아니다.

원인:

```text
Slip.requiredPartnerStatuses()
  SENT, ACCEPTED, PROCESSING, INSPECTING, COMPLETED,
  SHIPPING, DELIVERED, CONFIRMED, REJECTED

SlipPartnerBackfillService
  위 상태 집합만 repository 조회에 전달

SlipService.save
  slip.save()만 실행

SlipService.send
  slip.send()만 실행; resolvePartnerCode 없음

Slip.send
  partnerId null만 거부하고 SAVED -> SENT 전이; partnerCode 검사/해소 없음
```

따라서 batch 후에도 기존 `DRAFT -> SAVED -> SENT` 또는 기존 `SAVED -> SENT`라는 정상 사용자 전이로 `SENT + partner_id SET + partner_code EMPTY`를 다시 만들 수 있다. 이것은 이 머신의 인스턴스 문제가 아니라 코드의 lifecycle coverage 결함이다.

## 3. 각도 2 — 신규 INBOUND 경로

### 3.1 실 API

실 product, warehouse, partner를 사용해 `POST http://127.0.0.1:18106/slips`를 호출했다.

```text
HTTP 201
slipNo=2026/08/09-1
slipType=INBOUND
status=DRAFT
partnerId=SET
partnerCode=00
```

읽기 전용 DB 대조:

```sql
SELECT slip_no, slip_type, status,
       CASE WHEN partner_id IS NULL THEN 'EMPTY' ELSE 'SET' END AS partner_id_state,
       COALESCE(NULLIF(btrim(partner_code),''),'<EMPTY>') AS partner_code,
       memo
FROM slips
WHERE slip_no='2026/08/09-1' AND slip_type='INBOUND';
```

```text
2026/08/09-1 | INBOUND | DRAFT | SET | 00 | SOL #1156 R1 실 API 신규 INBOUND
```

### 3.2 실 GUI

현재 워크트리 renderer에서 로그인, 구매 신규 화면 진입, 실 창고/거래처/품목 선택, 저장 버튼 클릭까지 수행했다. Playwright 결과:

```text
1 passed (5.6s)
POST /slips -> 검증 HEAD :18106
HTTP 201
slipNo=2026/08/09-4
slipType=INBOUND
partnerId=SET
partnerCode=00
finalUrl=http://127.0.0.1:5327/purchases
```

읽기 전용 DB 대조:

```text
2026/08/09-4 | INBOUND | DRAFT | SET | 00 | SOL #1156 R1 실 GUI 신규 INBOUND
```

스크린샷/응답 증거:

- `docs/qa/2026-08-09-1155-r1-sol/01-inbound-before-save.png`
- `docs/qa/2026-08-09-1155-r1-sol/02-inbound-after-save.png`
- `docs/qa/2026-08-09-1155-r1-sol/gui-create-evidence.json`

판정: 신규 API 및 GUI 생성 경로는 두 컬럼을 함께 저장한다.

## 4. 각도 3 — lookup 실패 fail-open

partner-service에 존재하지 않는 결정적 QA UUID의 summary 조회가 HTTP 404임을 먼저 확인했다. 같은 값을 `partnerId`로 실 생성 API에 전달했다.

```text
partner summary lookup  HTTP 404
POST :18106/slips       HTTP 201
slipNo=2026/08/09-2
slipType=INBOUND
status=DRAFT
partnerId=SET
partnerCode=<EMPTY>
```

읽기 전용 DB 대조:

```text
2026/08/09-2 | INBOUND | DRAFT | SET | <EMPTY>
memo=SOL #1156 R1 lookup 실패 fail-open
```

판정: lookup 실패가 저장 실패로 전파되지 않는다. 이 반대급부 계약은 통과했다.

## 5. 각도 4 — 계열 sweep 재검증

### 5.1 모집단 산정

토큰 공존 grep이 아니라 entity column을 기준으로 먼저 모집단을 만들었다.

```powershell
$files = rg -l --glob '*.java' 'partner_id' services
# @Column + partner_id 보유 entity를 partner_code column 유무로 분류
```

`partner_id`와 `partner_code`를 같은 entity에 보유한 저장 모델은 정확히 7개였다.

```text
accounting-service/BankDepositorPartnerMapping.java
accounting-service/PurchaseAccountingSlip.java
accounting-service/SalesAccountingSlip.java
accounting-service/TaxInvoice.java
partner-order-service/PartnerOrder.java
partner-service/PartnerRevision.java
slip-service/Slip.java
```

`partner_id`만 갖는 entity 20개도 확인했다. 이들은 FK/집계/원장/설정처럼 애초에 `partner_code` snapshot column이 없는 별도 schema 계약이므로 “두 컬럼 중 한쪽만 쓰는 저장 지점” 모집단에서는 제외했다.

```text
accounting: BankTransaction, CashDisbursement, CashReceipt, CollectionPlan,
            DailyClosing, JournalLine, NotesReceivable, Order
dashboard:  SalesAggregate
dc-config:  DcConfig, DcRule, PriceCalculationLog
partner:    PartnerAttachment, PartnerContact, PartnerCreditHistory,
            PartnerPriceDiscount, PartnerShippingAddress
slip:       Carrier, Estimate, PartnerProductPriceMemory
```

### 5.2 Slip 생성/변경 저장 지점 전수 결과

`Slip.createInbound/createOutbound`, `editHeader`, `setPartnerCode`, `backfillPartnerId`, `slipRepository.save` 호출 관계를 다시 추적했다.

함께 처리됨:

```text
SlipService.create                이번 변경; 실 API/GUI 확인
SlipDuplicateService             partnerId로 code 재조회 후 set
SlipPublishService               code 입력/검증 후 set (3개 발행 경로)
MobilePartnerOrderService        partnerId 해소 후 요청 code set
SlipService.updateSlip           partnerId 변경/기존 code 공백 시 재조회
SlipPartnerBackfillService       양방향 보정
Slip revision restore            snapshot의 id/code 동시 복원
```

구현자 보고의 “저장 지점은 `SlipService.create` 하나”는 전수가 아니다. 남은 지점:

1. **`SlipService.editHeader` — 실 사용자 INBOUND 도달 결함, 재현 완료.**
   `PATCH /slips/{id}/header`가 `Slip.editHeader`로 partnerId를 바꾸지만 code를 재조회/clear하지 않는다. 제가 GUI로 만든 QA 전표의 거래처를 다른 활성 거래처로 실 PATCH한 원문:

   ```text
   before partnerCode=00
   PATCH HTTP 200
   partnerIdChanged=true
   expected target partnerCode=1068689215
   after partnerCode=00
   staleCode=true
   ```

   DB도 새 partner_id와 이전 code `00` 조합을 보존했다. 빈 code뿐 아니라 잘못된 거래처 code snapshot이 남는 결함이다.

2. **`EstimateToSlipConverter.convert` — 남은 저장 지점.**
   `estimate.getPartnerId()`로 `Slip.createOutbound` 후 바로 `slipRepository.save(slip)`하며 code를 쓰지 않는다. 사용자 지시대로 OUTBOUND 설계 재검토/라이브 재현은 하지 않았고 sweep 목록에만 남긴다.

3. **`SlipSeeder` — 비사용자 seed 저장 지점.**
   `partnerCode` 지역변수로 결정적 partnerId/name을 만들지만 `slip.setPartnerCode(partnerCode)`가 없다. 여러 target status로 전이한 뒤 seed persist 흐름에 넘긴다. 실 사용자 결함 판정에는 포함하지 않지만 전수 목록에는 포함한다.

## 6. 증거 무결성 및 변경 제한 준수

- DB 직접 INSERT/UPDATE를 하지 않았다. 생성/변경/보정은 모두 실 HTTP endpoint만 사용했다.
- 읽기 전용 SQL은 상태 count 및 HTTP 결과 대조에만 사용했다.
- 다른 서비스는 재배포하지 않았다.
- Playwright 전량 및 로컬 전체 suite를 실행하지 않았다.
- 지정 테스트만 재실행했다: `SlipServiceTest.create_inbound_resolvesPartnerCode_andPersistsBothPartnerColumns` + `SlipPartnerBackfillIT` — `BUILD SUCCESSFUL in 59s`.
- QA 스펙은 `resolveQaShotsDir()`를 경유한다.
- `resolveQaCredential()`는 테스트 본문의 `try/catch`에서 호출하고 실패 시 `test.skip`한다.
- git commit/push를 하지 않았다.

## 7. 신규 생성 파일

```text
clients/desktop/playwright/1156-r1-sol-real-qa/playwright.config.ts
clients/desktop/playwright/1156-r1-sol-real-qa/1156-r1-sol-real-qa.spec.ts
docs/qa/2026-08-09-1155-r1-sol/01-inbound-before-save.png
docs/qa/2026-08-09-1155-r1-sol/02-inbound-after-save.png
docs/qa/2026-08-09-1155-r1-sol/gui-create-evidence.json
docs/dev-reports/2026-08-09-1155-r1-sol-adversarial.md
```

실 API로 생성한 QA 전표는 business slip 번호 `2026/08/09-1`부터 `-4`까지이며, 운영 데이터와 구분되는 `SOL #1156 R1 ...` memo를 사용했다. 삭제도 DB 직접 조작하지 않았다.
