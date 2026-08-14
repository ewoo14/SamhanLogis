# PR #1208 fix 재수렴 적대검증 보고서 (SOL)

- 검증일: 2026-08-14 (Asia/Seoul)
- 대상: PR #1208 / `feat/1144-accounting-slip-link`
- 대상 HEAD: `1c4bcd3d400aba5e8e0ffc24a2ddbc1152ff9467`
- 판정: **도달 가능한 결함 1건**
- 안전 조건: 공유 DB 쓰기 0, 공유 스택 재배포 0. 공유 DB 계측은 명시적 읽기 전용 트랜잭션 후 rollback했다. 쓰기는 `qa1208-reconv-pg`와 `qa1208-reconv-slip-pg` 두 격리 PostgreSQL에만 수행했다.
- 종료 정리: 두 격리 컨테이너는 증거 수집 후 정확한 이름을 재확인하고 제거했다(`remaining=0`). 임시 fixture DB는 복구하지 않으며, 공유 `samhan-postgres`는 계속 `running` 상태다.

## 0. 사전 확인

PR 본문, issue comment 2건, review 0건, inline review comment 0건을 먼저 읽었다. 다음 정본과 직전 보고서를 전부 판정 기준으로 사용했다.

- `docs/decisions/2026-08-14-accounting-slip-link-decisions.md`
- `docs/qa/2026-08-14-1208-adversarial/REPORT.md`

금지된 git 명령은 사용하지 않았다. worktree `.git` 포인터와 ref 파일을 직접 읽고 원격 PR head와 대조했다.

```text
local branch = feat/1144-accounting-slip-link
local HEAD   = 1c4bcd3d400aba5e8e0ffc24a2ddbc1152ff9467
PR branch    = feat/1144-accounting-slip-link
PR HEAD      = 1c4bcd3d400aba5e8e0ffc24a2ddbc1152ff9467
MATCH        = true
```

## ① 환경 실측 원문과 Q5 실제 차단/정상 통과

### 환경

accounting 실 HTTP는 branch JAR을 `http://localhost:19091`에 띄우고 다음 격리 DB만 사용했다.

```text
container       qa1208-reconv-pg
endpoint        127.0.0.1:55433/accounting_db
database/user   accounting_db / qa1208
encoding        server UTF8 / client UTF8
한글 왕복       한글 HTTP 재수렴
Flyway          102 quarantine orphan accounting allocations
```

### 미검증 원천

ISSUED 판매 세금계산서 공급가 100,000원, VAT 10,000원, 합계 110,000원을 격리 DB에 넣고 `amountVerified` 없이 실제 네트워크 POST를 호출했다.

```http
POST /accounting/daily-closings
{"closingDate":"2026-08-14","scopeMode":"ALL","closingKind":"SALES","sourceKind":"TAX_INVOICE"}

HTTP 409
{"code":"CONFLICT","message":"일마감 금액 검증이 완료되지 않았습니다"}
```

거부 직후 `daily_closings` 활성 행은 **0건**이었다. 즉 응답만 409인 것이 아니라 마감/잠금도 생성되지 않았다.

### 검증 완료 원천

같은 요청에 `"amountVerified":true`를 넣어 재호출했다.

```text
HTTP 201
totalSupply=100000.00
totalVat=10000.00
totalAmount=110000.00
slipCount=1
isLocked=true
lockedBy=qa1208-sol
```

DB에도 동일 금액과 `is_locked=true`가 1건 기록됐다. **Q5 음성·양성 경로 모두 통과**다.

원문: `screenshots/01-environment-q5-http.txt`

## ② eligibility 실 HTTP, UUID, 역할 Q6

### 직접 서비스 계약

원천 UUID는 요청 URL에 UUID 문자열을 쓰지 않고 22자 URL-safe opaque token `EREREREREREREREREREREQ`로 전달했다. 실제 GET 응답에 UUID 정규식 일치는 모든 케이스 **false**였다. read model도 전표번호·유형·상태·거래처코드·금액만 반환했다.

| 직접 전달 역할 | HTTP | allowed | 사유 |
|---|---:|---:|---|
| ACCOUNTANT | 200 | true | 없음 |
| MANAGER | 200 | true | 없음 |
| MASTER | 200 | true | 없음 |
| SALES | 200 | false | `PERMISSION_DENIED` / `회계전표 생성 권한이 없습니다` |

따라서 컨트롤러에 유효 identity와 역할 헤더를 직접 전달하면 사유 코드·한국어 메시지·UUID 비노출·Q6 역할 집합 자체는 동작한다.

### 실제 게이트웨이 계약 — 결함

그러나 실제 gateway의 `JwtAuthentication`은 C5-4 정책에 따라 `X-User-Id`, `X-Is-System-Master`, `X-User-Groups`만 전달하고 **`X-User-Role`을 전달하지 않는다**. 이 계약은 gateway 회귀 테스트 24건(실패/오류/skip 0)과 `/api/v1/accounting/**` 라우트에서 재확인했다.

동일 실 HTTP 서버에 gateway 형태 헤더를 보냈다.

```text
GATEWAY_MASTER_NO_ROLE
  X-User-Id + X-Is-System-Master:true + X-User-Groups, X-User-Role 없음
  HTTP 200, allowed=false, PERMISSION_DENIED, "회계전표 생성 권한이 없습니다"

GATEWAY_NONMASTER_NO_ROLE
  X-User-Id + X-Is-System-Master:false + X-User-Groups, X-User-Role 없음
  HTTP 200, allowed=false, PERMISSION_DENIED, "회계전표 생성 권한이 없습니다"
```

새 컨트롤러는 `X-User-Role`만 evaluator에 넘기고 gateway 정본인 그룹/시스템 마스터 헤더를 소비하지 않는다. 따라서 **실 사용자 경로에서는 허용 대상 MASTER까지 거부**된다. 아래 D-01이다.

원문: `screenshots/02-eligibility-http.txt`

## ③ CI 6건 — fixture만 변경, 기존 단언 유지

직전 red CI 원문은 `725 tests completed, 6 failed`였고 여섯 실패명을 모두 회수했다. fix 커밋 patch를 직접 대조한 결과 fixture 변경 파일은 5개다(한 파일에서 실패 2건).

```text
SlipControllerIT                         +5/-0
SlipInspectControllerIT                  +6/-0
SlipLifecycleControllerIT                +5/-0
SlipOutboundApprovalEnforcementIT        +9/-1
SlipQueryPurchaseIT                      +2/-0
```

변경은 `PartnerInternalClient` mock/stub과 reset 목록뿐이다. **테스트 메서드/단언 hunk 변경 0, 단언 삭제·완화 0**이다.

캐시를 배제한 강제 재실행:

```text
BUILD SUCCESSFUL in 1m 49s
suites=9 tests=162 failures=0 errors=0 skipped=0
```

이 실행에는 직전 실패 6건이 모두 포함된다. exact SHA의 CI `slip-it-core`도 `BUILD SUCCESSFUL in 3m 41s`다.

원문: `screenshots/03-tests-fixture-diff.txt`

## ④ 정상 CONFIRMED 라이프사이클과 빈 코드 차단

같은 fresh slip 실행에서 다음을 함께 밟았다.

```text
outbound_fullLifecycle_DraftToConfirmed()                 PASS
inbound_lifecycle_skipsShipDeliver()                       PASS
confirm_accountantRole_returns200()                        PASS
confirm_lookupFailure_blocksTransition_andKeepsCodeBlank() PASS
```

정상 partner-code lookup fixture가 있는 CONFIRMED 전이는 통과했고, lookup 실패/빈 코드는 여전히 전이를 차단하고 코드를 비운 채 유지했다. **1순위 가드가 정상 전이를 막지 않으면서 목적도 유지**한다.

## ⑤ 1순위 무결성·격리·복원 산출물

### 공유 DB 읽기 전용 재계측

모든 SELECT를 `BEGIN TRANSACTION READ ONLY`와 `ROLLBACK` 사이에서 실행했다.

| 항목 | 재실측 |
|---|---:|
| 활성 slips UUID-only | 9 |
| 그중 CONFIRMED INBOUND | 1 |
| 삭제 회계전표 아래 활성 allocation | 1 |
| 활성 tax_invoices UUID-only | 13 |
| 활성 회계전표 헤더 UUID-only | 0 |
| 복원 가능 / 불가 | 8 / 1 |

복원 가능 8건은 원본 코드 7건 `P0-6-C001`, 1건 `00`으로 다시 확인했다. 복원 불가는 `2026/08/09-2` 1건이다.

### 격리·복원 실제 실행

fresh Testcontainers 결과:

```text
SlipPartnerBackfillIT                  7/0/0/0
AccountingSlipIntegrityMigrationIT     1/0/0/0
AccountingSlipLinkAllocationRepositoryIT 1/0/0/0
```

다음 시나리오가 실제 실행됐다.

- 격리 slip이 활성 목록에서 빠지고 사유 증거가 남음.
- 거래처 코드가 복구되면 `restore-quarantined-partner-slips`로 복원되고 `restoredAt`이 기록됨.
- 복원 가능 8건은 `processedCount=8`, quarantine evidence 없음으로 격리 입력에 삼켜지지 않음.
- 삭제 회계전표 아래 allocation은 soft-delete되고 감사행에 원 allocation/원천 키/수량/금액/격리 주체가 남음.
- 삭제 헤더 아래 allocation은 연결 read model repository join에서 제외됨.

추가로 V120이 적용된 별도 `qa1208-reconv-slip-pg`에서 활성/격리 slip 두 행과 금액 100/200을 놓고 직접 계측했다.

```text
physical slips   2       active list  1
physical sum     300.00  active sum   100.00
active join rows 1       active total 100.00
격리 행의 active join 기여도 0
격리 사유 "활성 partner 원본 없음" 보존
```

즉 격리 행은 물리적으로 남지만 목록·합계·조인에서 제외된다.

원문: `screenshots/04-integrity-ci.txt`

## ⑥ exact SHA CI

```text
PR HEAD             1c4bcd3d400aba5e8e0ffc24a2ddbc1152ff9467
GitHub Actions runs 5 / completed success 5
check runs          47 / completed success 47
non-success         0
```

성공 workflow: CI, QA E2E, Harness Guard, Docs Guard, Applied Flyway Migration Guard. **exact SHA CI는 green**이다.

## 도달 가능한 결함 목록

### D-01 — 높음 — eligibility가 gateway 정본 identity를 소비하지 않아 허용 역할도 전부 거부

- 사용자 경로: `GET /api/v1/accounting/slip-links/eligibility` → gateway `JwtAuthentication` → accounting-service.
- gateway 계약: `X-User-Role` 미전파, `X-User-Id`/`X-Is-System-Master`/`X-User-Groups` 전파.
- 신규 controller 계약: `X-User-Role`만 읽어 `AccountingSlipEligibility.evaluate()`에 전달.
- 실 HTTP 결과: gateway형 MASTER 요청도 `HTTP 200`, `allowed=false`, `PERMISSION_DENIED`, `회계전표 생성 권한이 없습니다`.
- 영향: Q6 허용 대상 ACCOUNTANT/MANAGER/MASTER가 실제 사용자 경로에서 eligibility를 통과할 수 없다. D-02의 “사용자에게 도달” fix가 직접 서비스 헤더 조합에서만 성립하고 gateway 경로에서는 재수렴하지 않았다.

## 관측 불가와 실패 원문

1. 첫 실 HTTP 하네스는 PowerShell 5.1에서 `System.Net.Http` 어셈블리를 명시 로드하지 않아 앱 동작 전에 종료됐다.

```text
Unable to find type [Net.Http.HttpClient].
APP_STOPPED=True
```

2. 다음 라운드의 Q5는 성공했으나 GET 요청 객체에 빈 content-body가 붙어 eligibility 단계가 중단됐다.

```text
ProtocolViolationException: 이 verb-type으로 content-body를 보낼 수 없습니다.
APP_STOPPED=True
```

3. identity 없이 역할 헤더만 보낸 최초 eligibility 진단은 Spring Security에서 네 역할 모두 403이었다. 유효 `X-User-Id`를 추가한 재실행은 직접 역할 4종 모두 controller에 도달했다. 따라서 최초 403은 결함 판정에 쓰지 않았다.

4. slip JAR은 `Started SlipServiceApplication in 18.762 seconds`와 Flyway V120을 기록했지만, RabbitMQ를 포함한 composite health가 503이라 “health 200” 준비 조건은 실패했다.

```text
HTTP 503 /actuator/health
app timeout
SLIP_APP_STOPPED=True
```

Flyway V120 DB는 정상 생성됐고 목록·합계·조인 SQL 계측에 사용했다. UI 캡처는 수행하지 않았고 합성 PNG도 만들지 않았다.

## 캡처/출력 SHA-256

- 실 PNG 캡처: 0개
- CLI 원문 텍스트: 4개
- SHA-256 고유값: 4개
- 중복 SHA-256: **0개**
- `01-environment-q5-http.txt` — `f43ecb720261cead0d2a56c1aff66a38c2c249aa35af1608d42ea310c85177b4`
- `02-eligibility-http.txt` — `c59c4f465959f01de1dfbee351559db2dfce33d001186c0cafc9f7dd4640fea4`
- `03-tests-fixture-diff.txt` — `8a7e9c1da172e7cb3a2851b556db870f2f2ee72d4fdc1860945e4682e62604f9`
- `04-integrity-ci.txt` — `2153d1e0db3ac51b20a7473558266eee594e444291ef37d42900b718de124a99`
