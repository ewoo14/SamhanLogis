# PR #1156 / Issue #1155 — SOL 5.6 R3 적대검증 재수렴

## 0. 환경 확인과 시작 표본

### 0.1 검증 대상

```text
워크트리  C:\dev\Samhan-Public\.claude\worktrees\t1155
브랜치    fix/1155-inbound-partner-code
HEAD      964aa8edfa83b9d9971857758a9f7c72f41ca06d
```

검증 시작 시 tracked 변경은 없었다. HEAD에서 새로 만든 JAR과 실행 환경은 다음과 같다.

```text
.\gradlew.bat :services:slip-service:bootJar --no-daemon
BUILD SUCCESSFUL in 21s

services/slip-service/build/libs/slip-service.jar
SHA-256 6A73A4D5B194B611BBF5972871AEE3E1C845374AC347C4E3A55CDB88C821F429

container  sol1156-r3-slip
mount      ...\t1155\services\slip-service\build\libs\slip-service.jar
           -> /qa/slip-service.jar:ro
port       127.0.0.1:18206 -> 8086
health     HTTP 200 {"status":"UP","groups":["liveness","readiness"]}
```

lookup 장애용 컨테이너도 같은 JAR을 사용했다.

```text
container  sol1156-r3-slip-partner-timeout
port       127.0.0.1:18207 -> 8086
health     UP
Docker ExtraHosts ["da4cd793c357:10.255.255.1"]
```

Eureka의 실제 `PARTNER-SERVICE` 인스턴스는 1개이며 `hostName=da4cd793c357`, `ipAddr=172.19.0.18`, `status=UP`였다. 장애 컨테이너에서는 그 hostname만 비응답 IP로 돌렸다. DB·auth·product는 공유 실 서비스를 그대로 사용했다. 따라서 `18206/18207` 호출은 mock이 아니라 동일 HEAD JAR의 실 HTTP 호출이며, `18207`만 partner network connect timeout을 강제한다.

실 GUI는 `http://127.0.0.1:5316`의 실행 중 renderer를 사용하고, Playwright network route에서 `/slips`만 `HEAD-18206`으로 보냈다. 증거 JSON에 각 요청의 최종 destination을 기록했다. 현재 워크트리 renderer를 별도 `5328`에 띄우려는 시도는 아래 원문으로 실패해 frontend bundle SHA까지는 주장하지 않는다. 다만 backend 검증본은 위 JAR mount/hash로 고정됐고, GUI가 보낸 payload는 현재 소스의 `SlipDetailPage.tsx:2683-2717,2880-2888,2902-2945`와 일치한다.

```text
Could not resolve 'vite'
Could not resolve '@vitejs/plugin-react'
ERR_MODULE_NOT_FOUND
```

### 0.2 어떤 write도 하기 전 표본 분포 SQL 원문

```sql
SELECT status, count(*) AS total,
       count(*) FILTER (
         WHERE partner_id IS NOT NULL
           AND (partner_code IS NULL OR btrim(partner_code)='')
       ) AS partner_id_set_code_empty
FROM slips
WHERE is_deleted=false
GROUP BY status
ORDER BY status;
```

```text
   status   | total | partner_id_set_code_empty
------------+-------+---------------------------
 ACCEPTED   |    12 |                         0
 CANCELED   |    55 |                         0
 COMPLETED  |    27 |                         0
 CONFIRMED  |     9 |                         0
 DELIVERED  |    10 |                         0
 DRAFT      |   281 |                        16
 INSPECTING |     9 |                         0
 PROCESSING |    14 |                         0
 REJECTED   |     5 |                         0
 SAVED      |    19 |                        14
 SENT       |    17 |                         0
 SHIPPING   |     5 |                         0
(12 rows)
```

```sql
SELECT count(*) FILTER (
         WHERE partner_id IS NOT NULL
           AND (partner_code IS NULL OR btrim(partner_code)='')
       ) AS id_only_all,
       count(*) FILTER (
         WHERE status IN ('DRAFT','SAVED')
           AND partner_id IS NOT NULL
           AND (partner_code IS NULL OR btrim(partner_code)='')
       ) AS id_only_draft_saved
FROM slips
WHERE is_deleted=false;
```

```text
 id_only_all | id_only_draft_saved
-------------+---------------------
          30 |                  30
(1 row)
```

표본은 0이 아니었다. 실 관리자 API/GUI로 `R3` 식별자를 가진 추가 표본만 생성했으며 DB 직접 INSERT/UPDATE는 하지 않았다.

## 1. 최종 판정

**실 사용자 경로로 재현 가능한 결함이 있다.** R2가 바꾼 `updateSlip`, `send/confirm`, 견적 변환 및 원래 `/header` 결함은 실 경로에서 닫혔다. 그러나 축 전수에서 누락된 매입·매출 direct PUT은 GUI가 거래처의 `bizNo`를 `partnerCode`로 보내고 backend가 그대로 저장한다. 실 매입 GUI에서 재현했으며, 이번 R3가 실제로 만든 오염 전표는 3건이다.

## 2. ② 확정 전이 라이브 결과

### 2.1 lookup 장애에서도 send·confirm 성공

실 API로 유효 거래처를 가진 `R3 TIMEOUT SEND fail-open` 전표를 `18207`에서 만들고 저장·전이했다.

```text
POST /slips            HTTP 201  4840ms  status=DRAFT      partnerCode=<EMPTY>
POST /slips/{id}/save  HTTP 200    98ms  status=SAVED      partnerCode=<EMPTY>
POST /slips/{id}/send  HTTP 200  2054ms  status=SENT       partnerCode=<EMPTY>
POST /slips/{id}/accept   HTTP 200 103ms  status=ACCEPTED
POST /slips/{id}/process  HTTP 200  47ms  status=PROCESSING
POST /slips/{id}/complete HTTP 200 620ms  status=INSPECTING
POST /slips/{id}/inspect  HTTP 200  52ms  status=COMPLETED
POST /slips/{id}/confirm  HTTP 200 2047ms  status=CONFIRMED partnerCode=<EMPTY>
```

장애 컨테이너 로그 원문(UUID만 비공개):

```text
PartnerInternalClient.resolvePartnerCode 호출 실패 — partnerId=<redacted-uuid>,
msg=I/O error on GET request for
"http://partner-service/internal/partners/<redacted-uuid>/summary": Connect timed out
```

DB 최종 원문:

```text
2026/08/09-6 | CONFIRMED | <EMPTY> | R3 TIMEOUT SEND fail-open
```

코드 지점은 `SlipService.java:901-902`, `:1401-1402`, helper `:1863`이다. 실 데이터 영향은 의도적으로 만든 공백 CONFIRMED 1건이다. lookup 1회의 connect timeout이 send/confirm 응답에 각각 약 2.05초 반영됐다.

### 2.2 기존 snapshot 보존 및 mutation rollback

기존 `partnerCode=00`인 전표를 `send`했다.

```text
POST /slips            HTTP 201 1224ms status=DRAFT partnerCode=00
POST /slips/{id}/save  HTTP 200  126ms status=SAVED partnerCode=00
POST /slips/{id}/send  HTTP 200   51ms status=SENT  partnerCode=00
```

값은 바뀌지 않았다. `ensurePartnerCodeBeforeCommitTransition`이 `applyMutation` 안에 있는 rollback도 확인했다. 위 timeout 전표가 `SENT + <EMPTY>`일 때 정상 lookup 컨테이너로 허용되지 않는 `/confirm`을 호출했다.

```text
before DB  SENT | <EMPTY>
HTTP 409
{"success":false,"code":"CONFLICT","message":"전이 가능한 상태가 아닙니다: 현재 창고 전송, 필요 처리 완료",...}
after DB   SENT | <EMPTY>
```

helper가 먼저 해소한 code가 예외 뒤 남지 않았다. 실 데이터 부분 상태 영향은 0건이다.

## 3. ① updateSlip 및 header 회귀

유효 거래처 A의 실제 code는 `00`, B는 `000-00-00000`이었다. `R3 HEADER original defect A to B` 전표를 HEAD API에서 다음 순서로 수정했다.

```text
POST  /slips                         HTTP 201 124ms code=00
PATCH /slips/{id}/v20 same A         HTTP 200  57ms code=00
  memo=R3 UPDATE same partner resend
PATCH /slips/{id}/v20 partner 생략   HTTP 200  33ms code=00
PATCH /slips/{id}/v20 A -> B         HTTP 200  41ms code=000-00-00000
PATCH /slips/{id}/header B -> A      HTTP 200  57ms code=00
PATCH /slips/{id}/header A -> B      HTTP 200  41ms code=000-00-00000
```

```text
DB final: 2026/08/09-7 | DRAFT | 000-00-00000 | R3 HEADER original defect A to B
```

같은 partnerId 재전송과 partnerId 생략은 기존 code를 지우지 않았고, A→B는 B code로 바뀌었다. `previousPartnerId` 캡처는 mutation 앞인 `SlipService.java:492`, mutation은 `:494`, 공통 helper 호출은 `:505`다. `/header`도 `:409-412`에서 같은 순서를 쓴다. 이 경로의 잘못된 snapshot 영향은 0건이다.

## 4. ④ 원래 결함 종료 여부

- `/header` A→B: 위 실 API에서 B code `000-00-00000` 저장.
- 기존 code 공백 DRAFT→SAVED를 timeout 컨테이너에서 만들고, 정상 HEAD에서 send: `HTTP 200`, `SENT`, code `00`.
- 신규 INBOUND 실 GUI: `POST /slips -> HEAD-18206`, `HTTP 201`, `DRAFT`, `partnerCode=00`.

GUI 원문은 `inbound-gui-evidence.json`에 다음처럼 남겼다.

```text
httpStatus=201
slipNo=2026/08/09-18
status=DRAFT
partnerId=<redacted-uuid>
partnerCode=00
network: POST /slips, status=201, destination=HEAD-18206
Playwright 전체: 3 passed (9.5s)
```

공백 DRAFT→SENT 표본의 DB 결과:

```text
2026/08/09-8 | SENT | 00 | R3 DRAFT TO SENT backfill
```

이 세 경로의 잘못된 snapshot 영향은 0건이다.

## 5. ③ partnerId 설정 축 전수

파일명 목록이 아니라 `Slip.partnerId`가 생성·변경·복원되는 호출을 시작점으로 추적했다.

| 저장 축 | partnerCode 처리 | 라이브/판정 |
|---|---|---|
| `SlipService.create` (`SlipService.java:278-354`) | partnerId로 resolve 후 set | 실 API·GUI 신규 INBOUND code `00` |
| `SlipService.editHeader` (`:409-412`) | 공통 sync helper | 실 A→B 통과 |
| `SlipService.updateSlip` (`:492-505`) | 공통 sync helper | 동일·생략·A→B 통과 |
| `SlipService.send/confirm` (`:901-902,1401-1402`) | 공백일 때 fail-open resolve | timeout send·confirm 성공, 정상 backfill 성공 |
| `EstimateToSlipConverter` (`EstimateToSlipConverter.java:80-90`) | resolve 성공 시 set | 실 GUI convert HTTP 200, DRAFT code `00` |
| `SlipSeeder` (`SlipSeeder.java:415-423`) | 지역 code를 즉시 set | 사용자 도달 경로 아님; 누락 없음 |
| `SlipDuplicateService` (`SlipDuplicateService.java:97-147`) | copy partnerId로 resolve | 누락 없음 |
| `SlipPublishService` 3경로 (`SlipPublishService.java:150-176,236-260,339-361`) | 검증된 요청 code set | 누락 없음 |
| `MobilePartnerOrderService` (`MobilePartnerOrderService.java:125-147`) | 요청 code set | 누락 없음 |
| revision restore (`Slip.java:2228-2237`) | snapshot id/code 동시 복원 | 누락 없음 |
| 양방향 보정 (`SlipPartnerBackfillService.java:52-65`) | code→id 해소 경로 | 이번 R3 미실행 |
| 매입 direct PUT (`SlipUpdateService.java:119-129`) | 요청 id/code를 독립 전달 | **실 GUI 도달 결함 재현** |
| 매출 direct PUT (`SalesSlipUpdateService.java:112-122`) | 매입과 동일한 독립 전달 | 동일 코드 구조; 매입 실증으로 공통 FE 원인 도달 확인 |

견적 자체, `Carrier`, `PartnerProductPriceMemory`는 `Slip.partnerCode` snapshot 저장 모델이 아니므로 전표 snapshot 저장 모집단에서 제외했다.

### 5.1 발견 결함 — direct PUT이 bizNo를 partnerCode로 저장

읽기 전용 마스터 분포:

```sql
SELECT count(*) AS active_total,
       count(*) FILTER (WHERE partner_code IS NOT NULL AND btrim(partner_code)<>''
                         AND (biz_no IS NULL OR btrim(biz_no)='')) AS code_set_biz_empty,
       count(*) FILTER (WHERE partner_code IS DISTINCT FROM biz_no) AS code_biz_different
FROM partners
WHERE is_deleted=false;
```

```text
 active_total | code_set_biz_empty | code_biz_different
--------------+--------------------+-------------------
         7309 |                  0 |                 55
```

안전한 활성 거래처를 선택했다.

```text
GET partner-service /internal/partners/<redacted-uuid>/summary HTTP 200
partner_code=P-2026-0001
biz_no=113-07-10031
name=(주)서울에어컨
```

실 사용자 절차:

1. 실 API로 memo `R3 GUI direct PUT partnerCode 축`인 INBOUND DRAFT 생성.
2. GUI 구매관리 상세의 `직접 수정` 진입.
3. 거래처 검색에서 `(주)서울에어컨` 선택.
4. 저장 버튼 클릭.

응답/네트워크 원문:

```text
POST /slips                 HTTP 201
GUI PUT /slips/{id}         HTTP 200 destination=HEAD-18206
selectedPartnerName         (주)서울에어컨
expected partnerCode        P-2026-0001
request.partnerCode         113-07-10031
response.partnerCode        113-07-10031
Playwright 전체             3 passed (9.5s)
```

DB 영향 원문:

```sql
SELECT count(*) AS r3_rows,
       count(*) FILTER (
         WHERE memo='R3 GUI direct PUT partnerCode 축'
           AND partner_code='113-07-10031'
       ) AS confirmed_defect_rows
FROM slips
WHERE is_deleted=false AND memo LIKE 'R3%';
```

```text
 r3_rows | confirmed_defect_rows
---------+----------------------
      15 |                     3
```

재현 성공 실행을 세 번 했으므로 실제 잘못 저장된 R3 전표는 3건이다. 기존 데이터의 전체 오염 건수는 보호 거래처 미접촉 조건 때문에 전표-거래처 전체 join으로 확장하지 않았고, 위험 모집단은 현재 `partner_code <> biz_no`인 활성 거래처 55개다.

원인은 세 층이 연결된다.

- FE 검색 mapping `SlipDetailPage.tsx:2880-2888`이 `row.businessRegistrationNumber`를 `partnerCode`로 둔다.
- 선택 처리 `:2693-2717`이 같은 `nextBizNo`를 code와 businessNumber 양쪽에 쓴다.
- 저장 `:2902-2945`가 그대로 PUT하고, BE `SlipUpdateService.java:119-129` / `SalesSlipUpdateService.java:112-122` 및 `Slip.java:786-799,855-867`이 id/code 일치성을 해소하지 않는다.

스크린샷 `05-direct-put-before-save.png`는 저장 전 거래처코드와 사업자번호가 둘 다 `113-07-10031`인 실제 수정 폼, `06-direct-put-after-save.png`는 저장 후 상세를 기록한다. 요청/응답 원문은 `direct-put-partner-code-defect.json`에 UUID를 비공개 처리해 저장했다.

### 5.2 견적 → 전표 GUI

실 GUI에서 견적 생성 후 `전표 변환`을 눌렀다.

```text
create estimate HTTP 201
convert HTTP 200 destination=HEAD-18206
converted slip status=DRAFT
partnerCode=00
Playwright 해당 시나리오 통과
```

증거는 `03-estimate-before-convert.png`, `04-estimate-after-convert.png`, `estimate-convert-gui-evidence.json`이다. 잘못된 snapshot 영향은 0건이다.

### 5.3 보정 endpoint

R3에서는 보정 endpoint를 실행하지 않았다. 따라서 보정 실행 전후 행 수는 `N/A`다. 시작 공백은 30건, 검증 종료 시 공백은 31건이며 증가 1건은 lookup timeout fail-open을 실증하기 위해 API로 만든 `R3 TIMEOUT SEND fail-open` CONFIRMED 전표다.

## 6. 증거 무결성·제한 준수

- 모든 write는 실 HTTP API/GUI로만 수행했고 DB는 SELECT만 사용했다.
- 보호 대상 `partner_code=1068689215`를 SQL 조건·API·GUI에 사용하지 않았고 개별 조회·수정·선택하지 않았다. 전체 활성 거래처의 익명 집계 SELECT만 수행했다.
- 보정 endpoint는 재실행하지 않았다.
- JWT·비밀번호·internal token·UUID는 커밋 산출물에서 비공개 처리했다.
- `/slips` GUI network가 `HEAD-18206`에 도착했음을 JSON에 기록했다.
- Playwright 디렉터리는 `1156-r3-sol-real-qa`, 자격 해소는 각 테스트 본문 `try/catch`, 캡처 경로는 `resolveQaShotsDir`을 사용했다.
- git commit/push는 하지 않았다.

## 7. 신규 생성 파일과 못 한 것

신규 파일:

```text
clients/desktop/playwright/1156-r3-sol-real-qa/playwright.config.ts
clients/desktop/playwright/1156-r3-sol-real-qa/1156-r3-sol-real-qa.spec.ts
docs/qa/2026-08-09-1156-r3/01-inbound-before-save.png
docs/qa/2026-08-09-1156-r3/02-inbound-after-save.png
docs/qa/2026-08-09-1156-r3/03-estimate-before-convert.png
docs/qa/2026-08-09-1156-r3/04-estimate-after-convert.png
docs/qa/2026-08-09-1156-r3/05-direct-put-before-save.png
docs/qa/2026-08-09-1156-r3/06-direct-put-after-save.png
docs/qa/2026-08-09-1156-r3/inbound-gui-evidence.json
docs/qa/2026-08-09-1156-r3/estimate-convert-gui-evidence.json
docs/qa/2026-08-09-1156-r3/direct-put-partner-code-defect.json
docs/dev-reports/2026-08-09-1156-r3-sol-reconvergence.md
```

못 한 것:

- 현재 워크트리 renderer의 별도 실행: 위 `vite` module resolution 실패 원문 때문에 기존 실행 renderer를 사용했다.
- 매출 direct PUT의 별도 GUI 저장: 매입과 동일한 FE 선택 함수·payload 조립 및 미러 BE 구조까지 전수했으나, 실 write는 매입 경로에서 수행했다.
- 보호 거래처를 포함할 수 있는 전체 과거 전표 오염 join: 미접촉 조건을 우선해 수행하지 않았다.
