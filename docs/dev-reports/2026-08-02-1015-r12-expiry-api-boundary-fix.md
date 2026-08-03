# PR #1060 / 이슈 #1015 — R12 만료 API 경계·mock report 수정

작성 시각: 2026-08-03 KST  
대상 브랜치: `feat/1015-order-app-access`  
데이터 등급: `[DEV-SEED]` 로컬 DB는 이번 라운드에 write/DDL하지 않음

## 1. 결론

R12에서 확정된 결함 2건을 수정했다.

1. 만료 API도 미리보기·실제 인증과 같은 `expiresAt.isBefore(now)` 판정을 사용한다. 정확히 30일은 세 경로 모두 활성이다.
2. mock의 `/access-preview/report`는 목록 API보다 먼저 전용 응답을 반환한다. 후보·보류 건수·원천 필드를 유지해 화면 렌더 예외를 막는다.

커밋·push·branch 조작·공유 DB write/DDL·Docker 이미지 재빌드는 하지 않았다.

## 2. ① 기존 오답 테스트와 RED

R11에서 77 tests GREEN이었지만, 다음 기존 테스트가 결함을 오답으로 고정하고 있었다.

- `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceAccessSetTest.java:29-53` (R12 시작 시점 기준)
- 특히 `:53`의 `expiredAlready()` 기대값 `true`가 정확히 30일을 expired로 단정했다.

이 기대값을 `false`로 먼저 변경하고 운영 코드는 고치지 않은 상태에서 실행한 RED 원문은 다음과 같다.

```text
PartnerAuthServiceAccessSetTest > allAccessPathsTreatExactlyThirtyDaysAsActive() FAILED
    org.opentest4j.AssertionFailedError at PartnerAuthServiceAccessSetTest.java:53
6 tests completed, 1 failed
BUILD FAILED
```

RED 테스트는 고정 `LocalDateTime.of(2026, 8, 3, 0, 0)`과 `boundary.minusDays(30)`을 사용하며, `LocalDateTime.now()`를 같은 boundary로 static stub한다. `ZoneId`·시스템 timezone을 사용하지 않는다.

## 3. ② mock 가로채기 RED

다음 프런트 회귀 테스트를 먼저 추가해 기존 mock 응답을 확인했다.

- `clients/desktop/src/renderer/api/mock.test.ts:81-102`

RED 원문:

```text
주문서 앱 접근권한 mock report 계약 > GET /access-preview/report 는 목록 Page가 아닌 후보 report를 반환한다
→ expected { content: [ ... ], ... } to deeply equal ObjectContaining{ candidates, deferred, deferredPartnerCount, deferredSources }
1 failed | 128 skipped
```

즉, `mock.ts`의 기존 `url.includes('/api/v1/partner-approvals')` 분기가 report 요청도 목록 Page로 응답하고 있었다.

## 4. fix

### 백엔드

`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:371-379`에서 만료 API의 별도 strict 경계를 제거하고, 이미 계산한 동일 `auth/activity/now` 입력을 `PartnerAccessPolicy.isAuthenticationLongUnused`에 전달한다.

```java
boolean expired = PartnerAccessPolicy.isAuthenticationLongUnused(auth, activity, now);
```

기존 DTO, endpoint, 로그인 비면제 기준은 변경하지 않았다.

### 프런트 mock

`clients/desktop/src/renderer/api/mock.ts:8022-8039`에 목록 분기보다 앞서는 report 전용 분기를 추가했다. 응답은 `candidates`, `deferred`, `deferredPartnerCount`, `deferredSources`를 포함하며, 기존 `/access-preview` 배열 DTO나 목록 Page 응답은 건드리지 않았다.

## 5. GREEN 및 세 경로 경계 나란히 비교

정확히 30일 입력 하나를 세 경로에 공통으로 적용한 테스트는 `PartnerAuthServiceAccessSetTest.java:29-64`다.

| 경로 | 같은 입력 | 결과 |
|---|---|---|
| 미리보기 `previewLongUnused(30)` | 생성시각 = boundary - 30일, activity = `(null, null)`, now = boundary | 후보 0건 / 활성 |
| 실제 인증 상태조회 `checkStatus` | 동일 auth/activity/boundary | `NEED_PW_INPUT` / 차단 안 함 |
| 만료 API `getExpiration` | 동일 auth/activity/boundary | `expiredAlready=false` |

보조 정책 단언도 같은 입력에서 `isPreviewCandidate=false`, `isAuthenticationLongUnused=false`를 확인한다.

GREEN 결과:

- `:services:partner-auth-service:test --tests ...PartnerAuthServiceAccessSetTest --tests ...OrderAppAccessPreviewTest`: BUILD SUCCESSFUL
- `:services:partner-auth-service:test`: BUILD SUCCESSFUL
- `clients/desktop/src/renderer/api/mock.test.ts`: 129/129 passed
- desktop `tsc -p tsconfig.node.json --noEmit` 및 `tsc -p tsconfig.web.json --noEmit`: exit 0
- RED 회귀 테스트 2건 모두 GREEN 전환

## 6. 불변식 1~6 실측

1. **세 경로 동일 경계**: 위 고정 boundary 테스트에서 세 경로 모두 정확히 30일 활성 판정.
2. **기존 오답 제거**: 기존 `PartnerAuthServiceAccessSetTest.java:29-53`의 `true` 기대값을 `false`로 교정하고, 새 나란히 비교 단언을 추가.
3. **mock report 처리**: 전용 분기와 `mock.test.ts:81-102` 회귀 테스트로 report shape를 확인; 화면이 기대하는 후보/보류 필드를 반환.
4. **보류 노출 유지**: 운영 FE의 report 호출·건수·원천 표시 코드는 변경하지 않았고, mock도 `deferred=true`, `deferredPartnerCount=1`, `deferredSources=['ORDER']`를 반환.
5. **DTO 하위호환·잘못 차단 0·대칭 차집합 0·로그인 비면제**: DTO/로그인 비면제 코드는 변경하지 않았다. 잘못 차단 0·대칭 차집합 0은 R11의 fresh `[DEV-SEED]` 실측 결과를 유지하며, 이번 라운드에는 DB read/write 검증을 재실행하지 않았다.
6. **모듈 전체 테스트·desktop typecheck**: 위 전체 모듈 테스트와 node/web TypeScript 검사 exit 0을 확인.

## 7. 파일별 변경량

| 파일 | 변경 |
|---|---:|
| `clients/desktop/src/renderer/api/mock.test.ts` | `+23 / -0` |
| `clients/desktop/src/renderer/api/mock.ts` | `+19 / -0` |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java` | `+1 / -1` |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceAccessSetTest.java` | `+13 / -3` |
| `docs/dev-reports/2026-08-02-1015-r12-expiry-api-boundary-fix.md` | `+71 / -0` |
| **합계(보고서 포함)** | **`+127 / -4`** |

## 8. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1015-r12-expiry-api-boundary-fix.md`
