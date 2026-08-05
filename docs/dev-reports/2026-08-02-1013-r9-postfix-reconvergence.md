# PR #1059 / 이슈 #1013 — R9 postfix 재수렴 리뷰

작성일: 2026-08-02  
대상 브랜치: `feat/1013-dispatch-inherit`  
대상 HEAD: `1e6ae2b640ac591b92ed94524db810b9c3064375`

## 0. 결론

**판정: BLOCKING / 머지 불가.**

R8의 핵심 실측 `{"sourceRows":1911,"entries":12,"maxMessageLength":2000,"missingMessages":0}`는 현재 HEAD에서 재현되지 않는다. production `buildSendEntries`를 호출하는 기존 Vitest를 fresh 실행한 실제 결과는 **expected 12, got 1,736**이었다. R8 fixture의 전화번호 분포를 그대로 계수하면 첫 번호가 **1,735통**, 둘째 번호가 **1통**을 받는다. 즉 12명이 1통씩 받는 구조도 아니며, 현재 HEAD는 보고된 12통보다 훨씬 심하게 한 수신번호에 1,735통을 만든다.

원인은 첫 수신번호 entry만 `entriesByRecipient.get(recipientPhone)`으로 계속 조회하고, 2,000자 초과 후 만든 새 chunk를 다음 병합 대상으로 갱신하지 않는 데 있다. 첫 chunk가 찬 뒤의 원문 블록 대부분이 각자 새 entry가 된다. 또한 단일 원문 블록 자체가 2,000자를 넘으면 첫-entry 경로에는 길이 검사가 없어 **2,001자 그대로** send 계약으로 간다.

로컬 DB는 운영 실데이터가 아니라 `[DEV-SEED]`다. fresh SELECT 기준 활성 OUTBOUND 2,303건, 번호 보유 1,911건, 번호 없음 392건이며, 번호 보유 1,911건 모두 `partnerCode`가 비어 있다. 따라서 R8 production 필터를 적용하면 이 시드에서 실제 send entry는 **0건**이고 한 번호가 실제로 받는 통수도 **0통**이다. 위 1,735통/1통은 R8이 만든 합성 fixture에 대한 production 알고리즘 결과이며, 운영 실데이터 수치가 아니다. 실 원본은 `docs/migration/ecount-data/raw/.gitkeep`만 있어 운영 실데이터 판정은 하지 않았다.

실제 SMS/Aligo 발송, send POST, DB write/DDL, Docker 이미지 재빌드·재기동은 전혀 하지 않았다. dev의 mock `SENT`/`SUCCESS`를 실전달 성공으로 세지 않았다.

## 1. 1순위 — 한 수신번호가 받는 실제 통수

### 1.1 current HEAD fresh Vitest

실행:

```text
clients/desktop> .\node_modules\.bin\vitest.cmd run src/renderer/routes/DispatchSmsPage.test.ts --reporter=verbose
```

원문 요약:

```text
Test Files  1 failed (1)
Tests       1 failed | 2 passed (3)
R8 1911건 후보는 2000자 이하 entry로 분할되고 누락 0건이다
AssertionError: expected [ …(1736) ] to have a length of 12 but got 1736
```

production 함수와 동일한 분기·키 갱신을 사용해 fixture 결과를 번호별로 계수한 원문:

```json
{"sourceRows":1911,"entries":1736,"perRecipient":{"010-1111-2222":1735,"010-2222-3333":1},"maxMessageLength":2000,"missingMessages":0}
```

| 기준 | 첫 번호 | 둘째 번호 | 합계 |
|---|---:|---:|---:|
| R8 fixture 원문 행 | 1,910 | 1 | 1,911 |
| current HEAD가 만든 entry = mock send 호출 가능 통수 | **1,735** | **1** | **1,736** |

각 entry는 `DispatchBatchSendService`의 loop에서 각각 `notificationService.sendWithGatewayResult(...)` 한 번으로 위임된다. 따라서 validation과 blocked 가드를 통과하고 게이트웨이가 정상이라면 entry 수가 곧 해당 번호에 대한 SMS/LMS 요청 통수다. 실제 SMS는 호출하지 않았다.

### 1.2 `[DEV-SEED]`와 실데이터 구분

로컬 PostgreSQL fresh SELECT:

```text
total=2303, with_phone=1911, no_phone=392,
phone_without_partner_code=1911,
duplicate_groups=0, duplicate_extra=0
```

R8의 `buildSendEntries`는 `partnerCode` blank를 먼저 제외한다. 번호 보유 1,911건 전부가 이 조건에 걸리므로 현재 `[DEV-SEED]`에서 send entry는 **0건**, 수신번호별 통수도 **0통**이다. 이는 발송 기능이 안전하게 수렴했다는 뜻이 아니라, 시드의 유효 발송 표본이 0건이라는 뜻이다.

운영 실데이터: 원본 부재로 **조사하지 않음 / 미판정**.

## 2. 분할 경계와 정보 보존

### 2.1 여러 짧은 블록

R8 fixture에서는 원문 1,911개가 결과 문자열 어딘가에 모두 포함되어 `missingMessages=0`이고 최대 길이는 2,000자다. 그러나 chunk 갱신 결함 때문에 12개가 아니라 1,736개로 폭증한다. 길이·누락만 만족하고 사용자 통수 불변식은 실패한다.

### 2.2 단일 블록이 2,000자를 넘는 경우

current code의 첫-entry 분기는 `message.length`를 검사하지 않고 그대로 Map에 넣는다. 동일 알고리즘에 2,001자 한 블록을 넣은 fresh 재현:

```json
{"singleBlockChars":2001,"entries":1,"resultLength":2001,"within2000":false}
```

따라서 “원문 블록 경계에서만 분할” 정책은 한 블록 자체가 2,000자를 넘을 때 BE `@Size(max=2000)`을 위반한다. 자르지 않으므로 정보 누락은 없지만 요청 자체가 계약을 통과하지 못한다.

**각도 2 판정: BLOCKING.** 짧은 블록 모집단은 통수 폭증, 긴 단일 블록은 길이 계약 위반이다.

## 3. `blocked` 양방향 fresh 재현

실행:

```text
.\gradlew.bat :services:notification-service:test \
  --tests "com.samhanair.logis.notification.service.DispatchBatchSendServiceTest" \
  --rerun-tasks --console=plain
```

결과:

```text
BUILD SUCCESSFUL in 22s
18 actionable tasks: 18 executed
tests=6, failures=0, errors=0, skipped=0
```

동일 fresh XML/log에서 양쪽을 확인했다.

| 주입 | 결과 | adapter 경계 | 판정 |
|---|---|---|---|
| lookup 예외 `partner-service unavailable` | `sent=1, failed=0, blocked=0` | mock SMS adapter 도달 1회 | 정상 대상 과차단 없음 |
| lookup 성공 후 `true` | `sent=0, failed=0, blocked=1` | `verifyNoInteractions(notificationService)` | 실제 차단 대상 계속 차단 |

로컬 `[DEV-SEED]`의 `blocked_partners WHERE is_deleted=false`는 **0건**이다. 따라서 실제 DB positive row로 재현한 것이 아니라, 두 방향 모두 단위 테스트의 명시적 failure/true 주입으로 검증했다. 실제 SMS는 호출하지 않았다.

**각도 3 판정: PASS (mock 단위 경계).** 운영 active blocked row와 운영 provider 장애는 미검증이다.

## 4. compose 주입 도달성

기존 `docker compose config`의 grafana 오류를 우회하기 위해 YAML 문서 자체를 PyYAML로 독립 파싱했다. 두 파일 모두 파싱 성공했고 다음 경계를 확인했다.

```text
local-all: notification-service.environment.SAMHAN_SLIP_SERVICE_URL
           = http://slip-service:8086
prod:      notification-service.environment.SAMHAN_SLIP_SERVICE_URL
           = http://slip-service:8086
두 문서 모두 services.slip-service 정의 존재
두 slip-service healthcheck 모두 localhost:8086 사용
```

애플리케이션 소비 경계도 연결된다.

- `application.yml`: `samhan.slip-service.url: ${SAMHAN_SLIP_SERVICE_URL:http://localhost:8086}`
- `RestClientSlipServiceClient`: `${samhan.slip-service.url:...}`를 base URL로 받고 `/internal/slips/outbound`를 붙인다.
- 기존 실행 중 notification 컨테이너에서 `http://slip-service:8086/actuator/health`를 read-only 호출한 결과: `{"status":"UP"}`.

따라서 **compose 선언 → Spring property → RestClient base URL**과 동일 Docker network의 DNS/포트 도달성은 유효하다. 다만 현재 실행 중 notification 컨테이너는 R8 이전 이미지·환경이고 `SAMHAN_SLIP_SERVICE_URL`이 unset인 상태다. 재빌드·재기동 금지 때문에 새 compose 선언이 실제 새 컨테이너 환경에 주입되는 실행 검증은 하지 않았다.

**각도 4 판정: 설정·도달 경계 PASS / 재기동 후 runtime 주입 미검증.**

## 5. R4~R7 성과 유지 실측

데이터 수치는 모두 로컬 `[DEV-SEED]` 기준이며 운영 실데이터가 아니다.

| 항목 | fresh 결과 | 판정 |
|---|---:|---|
| 활성 OUTBOUND | 2,303 | source 모집단 존재 |
| 번호 보유 / 번호 없음 | 1,911 / 392 | 표본 규모 유지 |
| 번호 보유 중 partnerCode blank | 1,911 / 1,911 | 유효 send 표본 0 |
| 동일 `(slip_date, slip_no)` 중복 | group 0 / extra 0 | 유지 |
| 번호 없는 건 외부 entry 혼입 | 0 / 392 | 유지. 단 partnerCode blank 필터까지 겹친 결과 |
| current preview 단위 테스트 | 6 tests, 0 failures/errors/skips | mapped/unmapped/partnerCode 누락 표본 보존 경로 유지 |
| current HEAD live preview | 이미지 재빌드 금지 | 조사하지 않음 |

`DispatchBatchPreviewServiceTest` fresh 실행은 `BUILD SUCCESSFUL`, 6/6이었다. 특히 `partner_code 누락 slip → unmapped 누적`이 통과하여 blank row를 preview 표본에서 버리지 않는 경로를 확인했다. production 코드도 source slip마다 mapped 또는 unmapped에 누적한다.

다만 R8 FE는 partnerCode blank인 preview row를 send 결과에서 제외하므로, `[DEV-SEED]` 번호 보유 1,911건은 preview에는 보존되지만 send 상세에는 0건이다. “preview 표본 보존”과 “미발송 사유의 send 결과 가시성”은 같지 않다.

**각도 5 판정: preview·중복·번호 없음 불변식은 코드/시드 범위 유지. 실제 current HEAD live preview와 운영 실데이터는 미검증.**

## 6. 레거시 원문 대조

레거시 `tools/legacy-gas/배차안내문자/Index.html:1145-1189`는 같은 방 또는 같은 번호의 연속 행을 한 group으로 만들고, 하차일별 `라인`을 compact section으로 합친 **하나의 `mergedText`**를 group 모든 행에 넣는다.

```javascript
let key = roomKey ? 'R_' + roomKey : (phoneKey ? 'P_' + phoneKey : 'N_' + ai);
let group = list.slice(ai, aj);
let mergedText = 'AI 삼성무풍 시스템에어컨 배차실입니다.\n\n' + sections.join('\n\n');
group.forEach(g => { g['발송멘트'] = mergedText; });
```

`Index.html:1254-1273`은 동일 발송멘트를 `rowspan`으로 한 셀처럼 표시하고, `1515-1555`는 선택 셀 텍스트를 clipboard에 복사한다. 전체 레거시 디렉토리에서 SMS/Aligo send API 또는 2,000자 분할 로직은 발견되지 않았다. `Code.js`의 `UrlFetchApp.fetch`는 데이터/Notion 조회·저장 경로이며 SMS 발송 경로가 아니다.

따라서 “레거시가 긴 그룹을 여러 SMS로 보낸다”는 원문 근거는 **없다**. 레거시는 긴 그룹도 하나의 병합 문구로 만들어 화면에서 수동 복사하는 도구다. 자동 실발송 통수는 0이고, 운영자가 복사 후 외부 채널에서 어떻게 나눴는지는 이 저장소 원문만으로 알 수 없다.

현행은 entry마다 SMS adapter를 호출하므로 2,000자 분할이 곧 동일 번호의 여러 발송 요청이 된다. 이는 레거시의 “그룹당 한 병합 셀/한 번 복사” UX와 동일하지 않으며, R5의 동일 수신자 과다 발송 방지 목적도 충족하지 못한다.

**레거시 대조 판정: BLOCKING / 비동일.**

## 7. 종합 판정

| 각도 | 판정 |
|---|---|
| 한 수신번호 실제 통수 | **BLOCKING** — fixture 첫 번호 1,735통, 둘째 1통; `[DEV-SEED]` 유효 send는 0통 |
| 분할 경계 | **BLOCKING** — chunk 갱신 결함 + 단일 2,001자 블록 계약 위반 |
| blocked 양방향 | PASS — failure는 정상 진행, true는 BLOCKED (mock 단위 경계) |
| compose 주입 | 선언/property/DNS 도달 PASS, 재기동 후 env 미검증 |
| R4~R7 유지 | 코드/시드 범위 PARTIAL PASS, current live/운영 실데이터 미검증 |
| 레거시 | **BLOCKING** — 자동 분할/다통 발송 없음, 한 병합 셀 수동 복사 |

PR #1059는 현재 HEAD `1e6ae2b64`로 머지하면 안 된다.

## 8. 이 라운드가 보지 않은 것

- 실제 SMS/Aligo 전송, `/admin/notifications/dispatch-batch/send` POST, delivery receipt: **실행·조사하지 않음**.
- dev `SENT`/`SUCCESS`: mock 결과일 뿐 실전달로 세지 않음.
- 운영 DB·운영 원본·운영 수신번호 귀속·운영 active blocked row: **접근·조사하지 않음**.
- 현재 HEAD notification Docker image 빌드·재기동 및 새 컨테이너 env inspect: **금지 조건으로 실행하지 않음**.
- `docker compose config` 전체 성공: 기존 grafana 구성 오류 때문에 **조사하지 않음**. 대신 두 YAML을 독립 파싱하고 설정 소비/DNS 경계를 확인함.
- 공유 DB write/DDL/seed/합성 row 생성: **실행하지 않음**.
- 한 블록 2,000자 초과의 HTTP Bean Validation 응답: send POST 금지로 **호출하지 않음**. production FE 분기와 BE `@Size` 계약을 대조함.
- 레거시 도구 밖에서 운영자가 clipboard 문구를 어떤 메신저/SMS로 몇 통 전송했는지: 저장소 원문에 없어 **알 수 없음**.
- 전체 desktop/notification 회귀 suite: **실행하지 않음**. 대상 Vitest 3개와 preview/send 단위 테스트 각 6개만 실행함.

## 9. 새 파일 경로

- `docs/dev-reports/2026-08-02-1013-r9-postfix-reconvergence.md`

기존 `docs/dev-reports/2026-08-02-1013-*.md`는 수정·덮어쓰기·축약하지 않았다. 코드, Git 상태, Docker 이미지, 공유 DB는 변경하지 않았다.
