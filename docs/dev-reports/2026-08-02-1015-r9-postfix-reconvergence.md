# PR #1060 / Issue #1015 — R9 머지 전 재수렴 리뷰

작성 시각: 2026-08-03 00:52 KST  
대상 브랜치/HEAD: `feat/1015-order-app-access` / `2e030fba4` (사용자 제공 기준, Git 명령 미실행)  
데이터 등급: **`[DEV-SEED]` 로컬 Docker PostgreSQL 실 저장 행** — production 실데이터 아님  
제약 준수: 코드 수정·Git 조작·공유 DB write/DDL·Docker 이미지 재빌드·합성 DB 데이터 생성 없음

## 0. 결론

**판정: BLOCK — 머지 불가.**

R8의 `<` → `<=` 변경은 미리보기·실제 차단·만료 API 내부 경계를 서로 맞췄지만, 레거시 실제 전환 규칙과는 반대로 어긋났다. 레거시는 정확히 30일 전 시각의 활동을 `on_or_after`로 활성 처리하고, 생성시각도 `createdTime < thresholdDate`일 때만 차단한다. 따라서 **정확히 30일째는 레거시에서 차단되지 않고, 30일을 초과한 뒤에만 차단된다.** HEAD는 `expiresAt <= now`이므로 정확히 30일째부터 차단한다.

현재 `[DEV-SEED]` 2행에는 정확한 경계 행이 없어 fresh 실측의 잘못 차단 수는 0건이다. 이는 경계 규칙 결함이 없다는 뜻이 아니라 현재 시드가 해당 분기를 밟지 않았다는 뜻이다.

추가로 `access-preview`의 HTTP `data`가 배열에서 객체 envelope로 바뀌었다. 저장소 안의 유일한 데스크톱 소비처는 새 형태로 바뀌었지만, 구버전 데스크톱과의 하위 호환은 없다. partner-auth와 데스크톱을 원자적으로 같이 배포하지 않으면 구버전 소비처가 깨질 수 있다. 프런트 타입체크도 의존성 부재로 완료하지 못했다.

## 1. ① 레거시 경계 포함 여부 원문 대조

### 1.1 사용자가 지정한 `Code.js:2938-2961`

지정 범위는 주문 성공 로그/출고 Notion DB의 최신 행을 읽는 조회 코드다.

```javascript
// Code.js:2938-2953
const getLatestTime = (dbId, isLog) => {
  const filter = isLog ? {
    and: [
      { property: '거래처코드', number: { equals: Number(cleanBiz) } },
      { property: '로그', rich_text: { contains: '주문 성공' } }
    ]
  } : {
    property: '거래처코드', number: { equals: Number(cleanBiz) }
  };
  const payload = {
    filter: filter,
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: 1
  };
```

이 범위 자체에는 현재시각과 만료시각을 비교하는 부등호가 없다. 바로 뒤 원문은 최신 기준과 만료시각만 계산한다.

```javascript
// Code.js:2967-2983
if (res.getResponseCode() === 200) {
  const json = JSON.parse(res.getContentText());
  if (json.results && json.results.length > 0) return new Date(json.results[0].created_time).getTime();
}
...
const logTime = getLatestTime(NOTION_DB_ID_LOG, true);
const shipTime = getLatestTime(NOTION_DB_ID_SHIPPING, false);
const createdTime = new Date(user.createdTime).getTime();
const baseTime = Math.max(createdTime, logTime, shipTime);
const standardExpTime = baseTime + (30 * 24 * 60 * 60 * 1000);
```

따라서 지정 범위와 인접 범위만으로는 경계 포함 여부를 단정할 수 없다. 실제 차단 전환 원문인 `장기미발주 거래처 선별/Code.js`까지 대조해야 한다.

### 1.2 실제 레거시 차단 전환 원문

`tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js`:

```javascript
// 17-20행
const isMonday = (dayOfWeek === 1);
const thresholdDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
const thresholdIso = thresholdDate.toISOString();

// 38-40행
if (client.status === '승인' && isMonday) {
  if (!isActive && client.createdTime < thresholdDate) {
    updateClientStatus_(client.pageId, '장기미발주');
  }
}

// 주문 성공 로그 74행
{ timestamp: 'created_time', created_time: { on_or_after: thresholdIso } }

// 출고 121, 125행
created_time: { on_or_after: thresholdIso }
date: { on_or_after: thresholdIso }
```

원문 의미는 다음과 같다.

- 활동시각 `== now-30일`: `on_or_after`에 포함되어 `isActive=true` → 차단 안 됨.
- 생성시각 `== now-30일`: `createdTime < thresholdDate`가 false → 차단 안 됨.
- 활동과 생성이 모두 `now-30일`보다 과거일 때만 차단됨.
- 전환 실행은 월요일 검사라는 별도 주기 조건도 있다.

즉 레거시 차단식은 기준시각에 대해 **`baseline < now-30일`**, 동치로 **`expiresAt < now`**이다. 경계는 미포함이다.

### 1.3 HEAD 대조

`PartnerAccessPolicy.java:27,33`과 `PartnerAuthService.java:377`:

```java
return expiresAt != null && !expiresAt.isAfter(now);
boolean expired = !expiresAt.isAfter(now);
```

이는 **`expiresAt <= now`**다. R8의 경계 통일은 내부 세 경로끼리는 일치하지만 레거시보다 경계 한 점을 더 차단한다.

**1순위 답:** 정확히 30일째인 거래처를 차단하는 것은 레거시와 같지 않다. 레거시는 정확히 30일째를 활성/미차단으로 본다.

## 2. ② 각도 2 — 차단되면 안 되는 거래처 fresh 실 DB 계수

### 2.1 배포본 나이 선확인

```text
samhan-partner-auth-service
container created: 2026-07-29 19:47:25 KST
image: infrastructure-partner-auth-service
started: 2026-08-02 11:11:11 KST
compose working tree label: .../worktrees/t992/infrastructure
```

R8 HEAD보다 오래된 배포본이다. 따라서 stale 컨테이너 API 응답을 HEAD 성공/실패 증거로 사용하지 않았다. Docker 이미지 재빌드·재기동도 하지 않았다.

### 2.2 읽기 전용 DB 원문

세 DB에서 `BEGIN TRANSACTION READ ONLY`와 `transaction_read_only=on`을 확인하고 `SELECT`만 수행했다. 기준시각은 partner-auth 트랜잭션의 `2026-08-03 00:46:50.497717+09`로 고정했다.

`partner_auth_db` 활성 행:

```text
partner_code  status         created_at
1068689215    NEED_PW_INPUT  2026-07-30 01:03:17.741187
2118712345    NEED_PW_INPUT  2026-07-09 07:25:53.085447
```

`partner_order_db`:

```text
1068689215 rows=1, confirmed_rows=0, last_order_at=NULL
2118712345 rows=0, last_order_at=NULL
```

`slip_db` active `OUTBOUND`:

```text
두 거래처 모두 0행, last_shipment_at=NULL
```

공유 DB에는 V3 `access_restored_at` 컬럼이 아직 없다. DDL 금지 때문에 적용하지 않았고, HEAD의 기존 행 계약대로 `NULL`로만 계산했다. 로그인 시각은 레거시 및 HEAD 판정 기준에서 제외했다.

### 2.3 HEAD와 레거시 계산

| `[DEV-SEED]` 거래처 | 기준 baseline | 만료시각 | HEAD `<=` | 레거시 `<` | 정확 경계 |
|---|---|---|---:|---:|---:|
| `1068689215` | `2026-07-30 01:03:17.741187` | `2026-08-29 01:03:17.741187` | false | false | false |
| `2118712345` | `2026-07-09 07:25:53.085447` | `2026-08-08 07:25:53.085447` | false | false | false |

```text
HEAD_BLOCK_COUNT=0
LEGACY_BLOCK_COUNT=0
WRONGLY_BLOCKED_COUNT=0
EXACT_BOUNDARY_COUNT=0
```

**fresh `[DEV-SEED]` 잘못 차단은 0건**이다. production 수치가 아니며, exact-boundary 행도 0건이므로 R8 반대급부가 현재 시드에서 발현되지 않았을 뿐이다.

## 3. ② 각도 3 — 보류 노출 정확성 및 실패 주입

### 3.1 영향 건수와 원천 계산

`PartnerApprovalService.previewLongUnusedReport()`는 판정 대상 status(`NEED_PW_INPUT`, `OK`, `LONG_UNUSED`)마다 활동 조회를 한 뒤:

- 한 원천이라도 실패하면 `deferredPartnerCount`를 거래처당 1 증가시킨다.
- 실패한 원천의 boolean에 따라 `ORDER`/`SHIPMENT`를 `LinkedHashSet`에 추가한다.
- `deferred = deferredPartnerCount > 0`으로 반환한다.
- 보류 거래처는 후보에서 제외한다.

따라서 `deferredPartnerCount`는 **보류된 거래처 수**, `deferredSources`는 **그 보류 집합에서 실패한 원천의 합집합**이다. 원천별 영향 건수나 거래처별 실패 원천 매핑은 응답하지 않는다.

### 3.2 실패 주입 fresh 실행

1. `PartnerActivityClientTest`
   - 주문 내부 endpoint에 HTTP 503, 출고 endpoint에 HTTP 200과 실제 시각을 주입한다.
   - `orderLookupSucceeded=false`, `shipmentLookupSucceeded=true`를 단언한다.
   - fresh 결과: `BUILD SUCCESSFUL`, 1 test 실행.

2. `OrderAppAccessPreviewTest.previewExposesDeferredLookupInsteadOfSilentlyReturningNoCandidates`
   - reader 예외와 대상 1건을 주입한다.
   - 배열이 아닌 envelope, `deferred=true`, `deferredPartnerCount=1`을 단언한다.
   - fresh 결과: `BUILD SUCCESSFUL`, 1 test 실행.

정적 합성 경로상 실제 HTTP 주문 실패/출고 성공은 `deferredPartnerCount=1`, `deferredSources=[ORDER]`가 된다. 다만 두 테스트가 한 end-to-end 테스트로 연결되어 있지 않고 preview 테스트는 `deferredSources`를 직접 단언하지 않는다. 또한 preview 테스트는 reader 전체 예외를 주입하므로 `PartnerActivity.unavailable()`을 거쳐 두 원천 모두 실패로 표시된다. 따라서 **건수 노출과 원천 flag 생성은 확인했으나, 최종 envelope의 단일 원천 문자열까지 자동 회귀 단언한 것은 아니다.**

실 컨테이너 장애 주입·서비스 중단·네트워크 차단은 하지 않았다. stale 배포본이어서 화면/API 라이브 증거로도 세지 않았다.

## 4. ② 각도 4 — 신규 DTO와 기존 소비처

### 4.1 저장소 내 소비처 전수 검색

HTTP endpoint 소비처는 `clients/desktop/src/renderer/api/sales.ts`의 `previewPartnerAccess()` 한 곳이며, 새 `PartnerAccessPreview` 객체 타입으로 변경되어 있다. 화면도 `previewQuery.data.candidates`, `deferredPartnerCount`, `deferredSources`를 사용한다.

백엔드 내부/기존 단위 테스트용 `previewLongUnused(int)`는 계속 `List<PartnerApprovalResponse>`를 반환하고 새 report 메서드의 `.candidates()`를 꺼내므로 내부 Java 소비처는 유지된다.

### 4.2 호환성 판정

기존 HTTP 응답은 `data: PartnerApprovalResponse[]`, R8은 `data: { candidates, deferred, deferredPartnerCount, deferredSources }`다. 이는 additive field가 아니라 최상위 `data` 타입이 배열에서 객체로 바뀐 **breaking response change**다.

- 현재 저장소 HEAD의 데스크톱 소비처: 새 계약으로 수정됨.
- 구버전 데스크톱/캐시된 번들/저장소 밖 소비처: 배열을 기대하면 깨짐.
- API 버전 분리, 구형 배열 병행 field/endpoint, 콘텐츠 협상 없음.
- stale partner-auth와 새 데스크톱 또는 새 partner-auth와 구 데스크톱을 섞는 배포 순서 계약도 문서에서 확인되지 않음.
- controller JSON shape를 고정하는 통합/프런트 계약 테스트를 찾지 못함.

따라서 **현재 코드끼리의 정적 연결은 맞지만 기존 소비처 비파괴는 증명되지 않았고, 배포 순서상 실제 호환 위험이 있다.**

## 5. ② 각도 5 — 프런트 타입

`clients/desktop`에서 요청한 명령을 fresh 실행했다.

```text
npm run typecheck
```

사전 검사에서 종료되어 TypeScript compiler까지 도달하지 못했다.

```text
[로컬 파생물 신선도 확인 실패] 검증 결과를 코드 결함으로 해석하지 마십시오.
- electron-updater가 설치된 node_modules에 없습니다. clients/desktop에서 npm ci 를 먼저 실행하십시오.
- file: 의존 design-system dist이(가) 없습니다: ../web/design-system/dist/index.d.ts.
```

실측상 `clients/desktop/node_modules`와 `.bin/tsc.cmd`도 없었다. 의존성 설치와 design-system build는 수행하지 않았다. **프런트 타입 상태는 미검증**이다.

## 6. ② 각도 6 — 레거시 기준 및 로그인 비면제

HEAD `latestBaseline()`은 주문 성공, 출고, `createdAt`, 관리자 `accessRestoredAt`의 최댓값을 사용한다. `lastLoginAt`은 포함하지 않는다. 레거시도 주문 성공·출고·인증 생성시각을 사용하고 로그인 성공을 면제 활동으로 보지 않는다.

따라서 **로그인은 면제 사유가 아니라는 기준은 유지**된다. 이번 BLOCK 사유는 baseline 종류가 아니라 경계 부등호다.

주의할 차이는 다음과 같다.

- 레거시 상태 전환은 월요일 검사다.
- HEAD 상태조회/로그인/만료 API는 요청 시점마다 즉시 계산한다.
- R8은 세 HEAD 경로를 `<=`로 통일했지만 레거시 strict `<`와 다르다.

## 7. ③ 재현 원문

### 7.1 경계 재현

HEAD 고정 테스트:

```text
./gradlew.bat :services:partner-auth-service:test \
  --tests com.samhanair.logis.partnerauth.service.PartnerAuthServiceAccessSetTest.expirationApiTreatsExactlyThirtyDaysAsExpiredLikeAuthenticationBlock \
  --no-daemon

BUILD SUCCESSFUL
1 test 실행
```

이 GREEN은 “레거시 일치” 증거가 아니라, **HEAD가 정확히 30일 경계를 expired=true로 의도적으로 고정했다는 재현 증거**다. 레거시 원문은 같은 경계를 미차단으로 둔다.

### 7.2 보류 실패 주입 재현

```text
./gradlew.bat :services:partner-auth-service:test \
  --tests com.samhanair.logis.partnerauth.client.PartnerActivityClientTest \
  --no-daemon

BUILD SUCCESSFUL
1 test 실행
```

```text
./gradlew.bat :services:partner-auth-service:test \
  --tests com.samhanair.logis.partnerauth.service.OrderAppAccessPreviewTest.previewExposesDeferredLookupInsteadOfSilentlyReturningNoCandidates \
  --no-daemon

BUILD SUCCESSFUL
1 test 실행
```

첫 preview 재실행 시에는 다른 Java/Gradle 프로세스가 `build/test-results/test/binary/output.bin`을 점유해 task cleanup이 실패했다. 프로세스 종료나 산출물 삭제 없이 재시도했고, 점유 해제 후 위 명령이 성공했다.

### 7.3 화면 증거 취급

API JSON이나 터미널 출력을 화면 증거로 사용하지 않았다. 이번 라운드는 UI 캡처를 생성하지 않았다. 위 원문은 코드·테스트·읽기 전용 계수의 재현 기록일 뿐 화면 QA 증거가 아니다.

## 8. ④ 최종 판정과 재수렴 조건

**BLOCK.** 최소 재수렴 조건은 다음과 같다.

1. 미리보기·실제 차단·만료 API의 경계를 레거시와 같은 `expiresAt < now`로 되돌리거나, 정확히 30일째 차단을 새 정책으로 채택한다면 레거시 변경임을 명시적으로 승인받아야 한다.
2. 정확히 30일째는 미차단, 30일 초과는 차단이라는 레거시 경계 회귀 테스트가 preview/authentication/expiration 세 경로에 있어야 한다.
3. 배열→envelope 변경에 대해 구버전 데스크톱 호환 endpoint/응답 또는 안전한 동시 배포·최소 지원 버전 계약이 필요하다.
4. 최종 envelope에서 주문만 실패하면 `[ORDER]`, 출고만 실패하면 `[SHIPMENT]`, 둘 다 실패하면 두 원천이 표시되는 계약 테스트가 필요하다.
5. 의존성을 갖춘 환경에서 `clients/desktop npm run typecheck`를 완료해야 한다.

현재 `[DEV-SEED]` 오차단 0건, 보류 관련 두 fresh 테스트 GREEN은 1번 경계 불일치를 상쇄하지 않는다.

## 9. ⑤ 이 라운드가 보지 않은 것

- production DB, 외부 운영 DB, 실제 Notion 운영 데이터는 조회하지 않았다.
- Docker 이미지를 재빌드·재기동하지 않아 R8 HEAD를 게이트웨이/실 UI에서 라이브 실행하지 않았다.
- 공유 DB write/DDL 금지로 V3 적용, `LONG_UNUSED` 전환, 관리자 복구, 실제 로그인, 비밀번호 초기화를 실행하지 않았다.
- 실 서비스 중단·네트워크 fault를 주입하지 않았다. 실패 주입은 기존 테스트의 로컬 HTTP server/mock 범위다.
- UI 화면 캡처, 시각 회귀, 접근성, 키보드 탐색은 조사하지 않았다.
- 프런트 의존성 설치와 design-system build를 하지 않아 TypeScript compiler 결과를 얻지 못했다.
- 저장소 밖 비공개 소비처와 이미 배포된 데스크톱 버전별 실제 사용량은 조사하지 않았다.
- 전체 저장소 테스트, partner-auth 75건 전체 재실행, 부하/N+1, 동시성, 보안 침투, 세션/JWT 만료, SMS는 조사하지 않았다.
- 레거시 월요일 trigger의 실제 Apps Script 스케줄 설정과 운영 실행 이력은 조사하지 않았다.
- Git 명령을 실행하지 않아 작업 트리 상태·diff·커밋 메타데이터를 독립 검증하지 않았다.

## 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1015-r9-postfix-reconvergence.md`
