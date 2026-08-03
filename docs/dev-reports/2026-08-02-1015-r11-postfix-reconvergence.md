# PR #1060 / 이슈 #1015 — R11 머지 전 재수렴 리뷰

작성 시각: 2026-08-03 KST  
대상 브랜치/HEAD: `feat/1015-order-app-access` / `3d22eb0b8` (사용자 제공 기준, 직접 Git 명령·조작 미실행)  
데이터 등급: **`[DEV-SEED]` 로컬 Docker PostgreSQL 실 저장 행 — production 실데이터 아님**  
제약 준수: 코드 patch·Git 조작·공유 DB write/DDL·Docker 이미지 재빌드·합성 데이터 생성 없음. DB 조회는 세 데이터베이스 모두 명시적 read-only transaction의 `SELECT`만 사용했다. API JSON·터미널 출력을 화면 증거로 사용하지 않았고, 이번 라운드는 화면 캡처를 만들지 않았다.

## 0. 결론

**판정: BLOCK — 머지 불가.**

1순위 우려였던 신규 표면은 운영 소스 기준으로 연결되어 있다. 데스크톱이 화면 진입 시 `/api/v1/partner-approvals/access-preview/report`를 호출하고, 응답의 `deferred`, `deferredPartnerCount`, `deferredSources`를 `role="alert"` 문구로 표시한다. 따라서 신규 endpoint를 아무도 호출하지 않아 R8 보류 노출이 완전히 사라진 상태는 아니다.

그러나 R10이 주장한 “실제 차단·만료 API 양쪽 strict `<`”는 현재 HEAD에 성립하지 않는다. 미리보기와 실제 인증 차단은 `expiresAt.isBefore(now)`이지만, `GET /api/v1/auth/partner-expiration`은 `!expiresAt.isAfter(now)`를 사용한다. 정확히 30일에서 전자는 활성이고 후자의 `expiredAlready`는 `true`다. 기존 테스트도 이 잘못된 값을 의도적으로 `true`로 고정해 전체 77 tests GREEN이 결함을 숨긴다.

또한 프런트 보류 표시를 검증하는 자동 테스트가 없고, mock interceptor의 광범위한 목록 분기가 `/access-preview/report`를 먼저 가로채 page 응답을 돌려준다. 그 응답에는 `candidates`가 없는데 화면은 성공 응답 뒤 `previewQuery.data?.candidates.length`를 평가하므로 mock 화면은 보류 미표시에 그치지 않고 렌더 예외에 도달한다. 따라서 실제 운영 wiring은 있지만 mock QA에서 신규 표면은 깨져 있다.

## 1. ① 프런트가 `/access-preview/report`를 호출·표시하는가

### 1.1 운영 코드 호출 체인

`clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:84-90`:

```tsx
const previewQuery = useQuery({
  queryKey: ['partner-access-preview', unusedDays],
  queryFn: () => previewPartnerAccess(unusedDays),
  retry: 1,
})
```

`clients/desktop/src/renderer/api/sales.ts:1062-1069`:

```ts
export async function previewPartnerAccess(
  unusedDays: number,
): Promise<PartnerAccessPreview> {
  const res = await apiClient.get<ApiEnvelope<PartnerAccessPreview>>(
    '/api/v1/partner-approvals/access-preview/report',
    { params: { unusedDays } },
  )
  return res.data.data
}
```

화면 route는 `clients/desktop/src/renderer/routes/index.tsx:508-511`에서 `/sales/order-approvals`에 등록되어 있고, gateway는 `services/api-gateway/src/main/resources/application.yml:549-554`의 `Path=/api/v1/partner-approvals/**`로 신규 하위 endpoint를 partner-auth-service에 전달한다.

### 1.2 보류 표시 체인

`SalesOrderApprovalsPage.tsx:294-300`:

```tsx
<strong data-testid="access-preview-count">
  현재 대상 {previewQuery.data?.candidates.length ?? 0}건
</strong>
{previewQuery.data?.deferred ? (
  <p role="alert" style={{ color: '#b45309' }}>
    주문·출고 조회 실패로 {previewQuery.data.deferredPartnerCount}건의 판정이 보류되었습니다.
    ({previewQuery.data.deferredSources.join(', ')})
  </p>
) : null}
```

따라서 report 응답에서 `deferred=true`이면 보류 건수와 원천을 화면에 표시한다. 후보 수 역시 같은 report의 `candidates`를 사용한다.

**1순위 답: 운영 소스상 실제 호출하고 표시한다. R8 성과가 신규 endpoint 미호출 때문에 사라진 상태는 아니다.** 다만 이번 라운드는 stale 로컬 컨테이너를 재빌드할 수 없어 브라우저의 실 네트워크 요청과 실 화면을 라이브 관측하지 않았다. 위 판정은 route→React Query→API client→gateway→controller→render의 정적 실행 경로에 근거한다.

### 1.3 새 표면의 미고정 부분

저장소 전수 검색에서 `SalesOrderApprovalsPage`의 보류 문구나 `previewPartnerAccess`의 report URL을 단언하는 Vitest/Playwright 테스트는 0건이었다.

또한 `clients/desktop/src/renderer/api/mock.ts:8021-8093`의 아래 분기는 report 전용 분기보다 넓고, 별도 report 분기는 존재하지 않는다.

```ts
if (method === 'GET' && url.includes('/api/v1/partner-approvals')) {
  return envelope({ content: sample, totalElements: sample.length, ... })
}
```

`/api/v1/partner-approvals/access-preview/report`도 이 조건에 포함된다. mock 모드에서 `previewPartnerAccess()`는 page 객체를 `PartnerAccessPreview`로 받는다. `candidateCodes` 계산은 `(undefined ?? [])`라 먼저 통과하지만, 성공 화면의 `previewQuery.data?.candidates.length`는 `data`만 optional-chain하고 `candidates`는 보호하지 않는다. 따라서 page 객체가 존재하는 상태에서 `undefined.length` 렌더 예외에 도달하며 보류 alert도 표시되지 않는다. 이는 운영 API 미호출 결함은 아니지만 **공식 mock QA에서 신규 표면이 동작하지 않는 도달 가능 프런트 결함**이다.

## 2. ② 경계 방향 — 레거시와 세 지점 대조

### 2.1 지정 원문과 실제 차단 원문

사용자가 지정한 `tools/legacy-gas/거래처 발송 주문서/Code.js:2938-2961`은 주문 성공 로그와 출고 Notion DB의 최신 행을 읽는 구간이다. 인접한 `2967-2983`에서 최신 주문·출고·생성시각의 최댓값에 30일을 더한다.

```js
const logTime = getLatestTime(NOTION_DB_ID_LOG, true);
const shipTime = getLatestTime(NOTION_DB_ID_SHIPPING, false);
const createdTime = new Date(user.createdTime).getTime();
const baseTime = Math.max(createdTime, logTime, shipTime);
const standardExpTime = baseTime + (30 * 24 * 60 * 60 * 1000);
```

경계 포함 방향은 실제 전환 원문 `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js`에서 확정된다.

```js
// 19-20행
const thresholdDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
const thresholdIso = thresholdDate.toISOString();

// 39행
if (!isActive && client.createdTime < thresholdDate) {

// 주문 74행, 출고 121/125행
created_time: { on_or_after: thresholdIso }
date: { on_or_after: thresholdIso }
```

따라서 레거시는 정확히 threshold인 활동을 활성 집합에 포함하고, 생성시각도 strict `<`일 때만 차단한다.

### 2.2 HEAD 세 지점

`PartnerAccessPolicy.java:27,33`은 미리보기와 인증 차단에 `expiresAt.isBefore(now)`를 사용한다. 기존 `OrderAppAccessPreviewTest.legacyBoundaryIsActiveAtExactlyThirtyDaysAndExpiresOnlyAfterIt`도 다음 세 지점을 고정한다.

| 기준시각 | 레거시 | 미리보기 | 실제 인증 차단 |
|---|---|---|---|
| 정확히 30일 | 활성 | 활성 | 활성 |
| 30일+1초 | 차단 | 차단 | 차단 |
| 29일 | 활성 | 활성 | 활성 |

여기까지는 레거시와 같다.

그러나 `PartnerAuthService.java:377`의 만료 API는 다르다.

```java
boolean expired = !expiresAt.isAfter(now);
```

이는 `expiresAt <= now`다. `PartnerAuthServiceAccessSetTest:24-54`의 테스트 이름은 `expirationApiTreatsExactlyThirtyDaysAsExpiredLikeAuthenticationBlock`이고, 정확히 30일에 `expiredAlready()`가 `true`라고 단언한다. 이름의 “LikeAuthenticationBlock”과 달리 인증 차단은 같은 시점에 `false`다.

| 기준시각 | 레거시 | 미리보기/인증 | 만료 API `expiredAlready` |
|---|---|---|---|
| 정확히 30일 | 활성 | `false` | **`true` — 불일치** |
| 30일+1초 | 차단 | `true` | `true` |
| 29일 | 활성 | `false` | `false` |

**판정: 경계는 미리보기·인증에서만 레거시와 같고, 만료 API까지 포함하면 R10 재수렴이 실패했다.**

## 3. ③ 잘못 차단 0 · 대칭 차집합 0 fresh `[DEV-SEED]` 실측

세 DB 모두 아래 형태로 조회했다.

```text
BEGIN TRANSACTION READ ONLY;
SELECT current_setting('transaction_read_only');
SELECT ...;
COMMIT;
```

측정 기준시각은 `partner_auth_db`의 `2026-08-03 01:20:34.716742+09`, `transaction_read_only=on`이다.

`partner_auth_db` 활성 판정 대상:

```text
partner_code  status         created_at                  last_login_at
1068689215    NEED_PW_INPUT  2026-07-30 01:03:17.741187  2026-07-30 01:59:02.245854
2118712345    NEED_PW_INPUT  2026-07-09 07:25:53.085447  2026-08-02 00:22:41.802872
```

`partner_order_db`에서 `1068689215`는 주문 1행이 있지만 확정 주문은 0행이고, `2118712345`는 주문 0행이다. `slip_db`의 두 거래처 active `OUTBOUND` 전표는 0행이다. 공유 DB에는 아직 `access_restored_at` 컬럼이 없다. DDL을 적용하지 않았으며 HEAD 기존 행의 값은 `NULL`로 계산했다.

| `[DEV-SEED]` 거래처 | 판정 baseline | 만료시각 | 레거시/preview/auth 차단 | expiration API |
|---|---|---|---:|---:|
| `1068689215` | `2026-07-30 01:03:17.741187` | `2026-08-29 01:03:17.741187` | false | false |
| `2118712345` | `2026-07-09 07:25:53.085447` | `2026-08-08 07:25:53.085447` | false | false |

```text
DATA_CLASS=[DEV-SEED]
TARGET_ROWS=2
LEGACY_BLOCK_COUNT=0
PREVIEW_BLOCK_COUNT=0
AUTH_BLOCK_COUNT=0
EXPIRATION_EXPIRED_COUNT=0
WRONGLY_BLOCKED_COUNT=0
PREVIEW_AUTH_SYMMETRIC_DIFFERENCE_COUNT=0
EXACT_BOUNDARY_COUNT=0
```

fresh 시드 수치의 잘못 차단과 미리보기↔인증 대칭 차집합은 0이다. 하지만 정확 경계 행도 0건이므로 규칙 일치 증거가 아니다. 정확 경계 행이 존재하면 레거시/preview/auth 집합에는 없고 expiration 집합에만 들어가므로, 세 표면을 포함한 구조적 대칭 차집합은 0이 아니다.

## 4. ④ DTO 하위호환

`PartnerApprovalsController.java:72-87`은 계약을 분리했다.

- 기존 `GET /access-preview`: `ApiResponse<List<PartnerApprovalResponse>>`
- 신규 `GET /access-preview/report`: `ApiResponse<PartnerAccessPreviewResponse>`

기존 endpoint는 `previewLongUnused()`가 report의 `.candidates()`를 꺼내 배열로 반환하므로 R7 이전의 `data: [...]` 형태가 소스상 복원됐다. `PartnerApprovalsControllerContractTest.accessPreviewKeepsLegacyArrayDataShape`는 controller 반환 `data`가 `List`인지 단언하며 fresh 전체 테스트에서 통과했다.

**판정: 기존 `/access-preview` 배열 하위호환은 확보됐다.** 단, 현재 계약 테스트는 MockMvc/Jackson HTTP 직렬화까지 검사하지 않고 controller 객체 타입만 검사한다. 이 약한 테스트 범위는 호환 판정을 뒤집지는 않지만 향후 HTTP 계약 회귀 방지력은 제한한다.

## 5. ⑤ 데스크톱 typecheck

요청 순서를 충족하기 위해 다음을 fresh 실행했다.

### 5.1 design-system 최초 빌드

```text
clients/web/design-system> npm run build

> tsc -p tsconfig.build.json && vite build
'tsc' is not recognized as an internal or external command,
operable program or batch file.
exit 1
```

`node_modules`가 없어 컴파일러가 없었다. 같은 디렉터리에서 `npm install`을 실행해 470 packages를 설치했다. `npm audit fix`는 실행하지 않았다.

### 5.2 design-system 재빌드

```text
> @samhan/design-system@0.1.0 build
> tsc -p tsconfig.build.json && vite build

vite v5.4.21 building for production...
✓ 160 modules transformed.
[vite:dts] Declaration files built
✓ built in 4.15s
exit 0
```

Pretendard font 두 종류는 build time에 resolve하지 못해 runtime resolve로 남는다는 경고가 있었지만 `dist/index.d.ts` 생성과 빌드는 성공했다.

### 5.3 desktop install/typecheck

```text
clients/desktop> npm install
up to date, audited 1012 packages
exit 0
```

```text
clients/desktop> npm run typecheck

[로컬 파생물 신선도] typecheck 대상 확인 완료
tsc -p tsconfig.node.json --noEmit
tsc -p tsconfig.web.json --noEmit
typecheck:real-qa: tests 2, pass 2, fail 0
real-qa-scope: tests 50, pass 50, fail 0
exit 0
```

실행 중 Git 추적 집합을 읽는 real-QA scope script가 CRLF 경고와 의도된 미추적 fixture 차집합 메시지를 출력했으나, 해당 script 자체의 회귀 테스트는 모두 통과했고 최종 exit code는 0이다.

**판정: design-system dist 선행 빌드 후 데스크톱 typecheck 통과.**

## 6. ⑥ 레거시 기준 유지 — 로그인은 면제 사유가 아님

`PartnerAccessPolicy.latestBaseline()`은 다음 값의 최댓값만 사용한다.

- 마지막 주문 확정/출고 활동
- 관리자 `accessRestoredAt`
- 인증 레코드 `createdAt`

`lastLoginAt`은 포함하지 않는다. 실제 인증 경로도 비밀번호 확인 전에 `evaluateEffectiveStatus()`를 호출하므로 최근 로그인 기록이 장기미사용 차단을 면제하지 않는다.

기존 `PartnerAuthServiceAccessSetTest.recentLoginDoesNotExemptPartnerWithNoOrderOrShipmentActivity`는 생성 31일, 로그인 1일인 거래처가 로그인 시 `LONG_UNUSED`가 되는 것을 단언하며 fresh 전체 테스트에서 통과했다. `[DEV-SEED]`의 `2118712345`도 최근 로그인은 `2026-08-02`이지만 판정 baseline은 `created_at=2026-07-09`다. 현재는 아직 30일 이전이라 활성일 뿐, 로그인 때문에 면제된 것이 아니다.

**판정: 로그인 비면제 기준은 유지된다.**

## 7. ③ 재현 원문

### 7.1 partner-auth 전체 fresh 재실행

```text
./gradlew.bat :services:partner-auth-service:test --no-daemon --rerun-tasks

> Task :services:partner-auth-service:test
BUILD SUCCESSFUL in 41s
9 actionable tasks: 9 executed
```

생성된 JUnit XML 13개 suite 합산:

```text
TESTS=77 FAILURES=0 ERRORS=0 SKIPPED=0
```

이 GREEN은 만료 API 경계가 맞다는 뜻이 아니다. 아래 현재 테스트가 정확히 30일을 잘못된 `true`로 고정한 상태에서 GREEN이기 때문이다.

```java
void expirationApiTreatsExactlyThirtyDaysAsExpiredLikeAuthenticationBlock() {
    ...
    assertThat(authService.getExpiration("2118712345").expiredAlready()).isTrue();
}
```

대조되는 공통 정책은 같은 시점에 다음을 반환한다.

```java
return expiresAt != null && expiresAt.isBefore(now);
```

### 7.2 프런트 빌드/typecheck 원문

최초 design-system build는 `tsc` 부재로 exit 1이었다. design-system `npm install` 후 build exit 0, desktop `npm install` 후 `npm run typecheck` exit 0이었다. 상세 원문은 §5에 기록했다.

### 7.3 화면 증거 취급

API JSON과 터미널 출력은 화면 증거로 사용하지 않았다. 이번 라운드는 실 UI 캡처를 생성하지 않았다. 위 출력은 코드·테스트·빌드·읽기 전용 DB 계수의 재현 기록이다.

## 8. ④ 최종 판정과 재수렴 조건

**BLOCK.** 최소 재수렴 조건:

1. `PartnerAuthService.getExpiration()`의 `expiredAlready` 경계를 preview/authentication과 같은 strict `<`로 맞추고, 정확히 30일 / 30일+1초 / 29일을 expiration API까지 포함해 고정해야 한다.
2. 현재 정확히 30일을 `expiredAlready=true`로 고정한 테스트의 이름과 기대값을 레거시 계약에 맞춰야 한다.
3. `/access-preview/report` 호출·보류 alert를 프런트 자동 테스트로 고정해야 한다.
4. mock API에 report 전용 응답을 일반 `/partner-approvals` 목록 분기보다 먼저 두어 mock QA에서도 보류 표면을 재현해야 한다.

DTO 배열 호환, 운영 프런트 wiring, 로그인 비면제, fresh `[DEV-SEED]` 0/0, partner-auth 77 tests GREEN, 데스크톱 typecheck GREEN은 1번의 도달 가능한 경계 불일치를 상쇄하지 않는다.

## 9. ⑤ 이 라운드가 보지 않은 것

- production DB, 외부 운영 DB, 실제 Notion 운영 데이터는 조회하지 않았다.
- Docker 이미지를 재빌드·재기동하지 않아 HEAD partner-auth를 gateway/브라우저에서 라이브 실행하지 않았다.
- 실 UI 네트워크 캡처, 화면 캡처, 시각 회귀, 접근성 트리, 키보드 탐색은 조사하지 않았다.
- 공유 DB write/DDL 금지로 V3 적용, 상태 전환, 실제 로그인, 관리자 복구, 비밀번호 초기화를 실행하지 않았다.
- 외부 서비스 중단·네트워크 fault를 주입하지 않았다.
- 합성 데이터와 신규 테스트를 만들지 않았다. 정확 경계 판단은 기존 고정 테스트와 소스 대조로 수행했다.
- 저장소 밖 비공개 소비처, 이미 배포된 데스크톱 버전별 실제 사용량, production의 경계 행 수는 조사하지 않았다.
- 전체 저장소 테스트, 전체 desktop Vitest/Playwright, 부하/N+1, 동시성, 보안 침투, 세션/JWT 만료, SMS는 조사하지 않았다.
- npm 의존성 보안 취약점은 `npm install` 출력만 기록했고 `npm audit` 분석이나 `npm audit fix`는 수행하지 않았다.
- 레거시 월요일 trigger의 실제 Apps Script schedule과 운영 실행 이력은 조사하지 않았다.
- 직접 Git 명령·조작을 실행하지 않아 작업 트리 상태·diff·커밋 메타데이터를 독립 검증하지 않았다. 단, 요청한 desktop `npm run typecheck` 내부 real-QA scope script가 추적 집합 확인을 위해 read-only Git 조회를 자체 실행했다.

## 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1015-r11-postfix-reconvergence.md`

의존성 설치와 build가 만든 `node_modules`/`dist`는 로컬 파생물이며 위 새 보고서 파일 목록에 포함하지 않는다.
