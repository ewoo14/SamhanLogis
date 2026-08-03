# PR #1060 / 이슈 #1015 R10 — 주문서 앱 접근권한 경계 방향·DTO 하위호환 수정

## 1. 결론과 레거시 원문

수정 결론은 레거시와 동일한 strict `<`이다. 정확히 30일째는 활성(차단하지 않음), 30일+1초부터 만료·차단한다. 미리보기와 실제 인증 차단, 만료 API가 같은 `expiresAt < now` 판정을 공유한다.

근거 원문 `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:2938-2961`:

```js
const thresholdDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
...
const isActive = activeBizNos.has(numBizNo);
...
if (!isActive && client.createdTime < thresholdDate) {
```

활동 조회 원문도 `on_or_after: thresholdIso`를 사용한다. 따라서 기준시각이 정확히 threshold인 활동은 활성이고, 생성시각이 정확히 threshold인 승인 거래처도 `createdTime < thresholdDate`가 거짓이라 차단하지 않는다. HEAD의 `!expiresAt.isAfter(now)`(`<=`)는 이 레거시 경계를 한 점 더 차단하므로 R10에서 `expiresAt.isBefore(now)`로 되돌렸다.

## 2. RED-first 재현

### 2.1 경계 RED

추가 테스트: `OrderAppAccessPreviewTest.legacyBoundaryIsActiveAtExactlyThirtyDaysAndExpiresOnlyAfterIt`.

고정 `LocalDateTime.of(2026, 8, 3, 0, 0)`을 사용하고 기준시각 세 지점을 검사했다.

- 30일: 미리보기 후보 `false`, 실제 인증 차단 `false`
- 30일+1초: 미리보기 후보 `true`, 실제 인증 차단 `true`
- 29일: 미리보기 후보 `false`, 실제 인증 차단 `false`

수정 전 RED 원문:

```text
OrderAppAccessPreviewTest > legacyBoundaryIsActiveAtExactlyThirtyDaysAndExpiresOnlyAfterIt() FAILED
    org.opentest4j.AssertionFailedError at OrderAppAccessPreviewTest.java:47
6 tests completed, 1 failed
Execution failed for task ':services:partner-auth-service:test'
```

실패 원인은 수정 전 `<=`가 정확히 30일을 만료로 판정한 것이다.

### 2.2 DTO 하위호환 RED

추가 테스트: `PartnerApprovalsControllerContractTest.accessPreviewKeepsLegacyArrayDataShape`.

기존 `/api/v1/partner-approvals/access-preview`의 `ApiResponse.data`가 구버전 데스크톱 계약인 배열인지 검사했다.

수정 전 RED 원문:

```text
PartnerApprovalsControllerContractTest > accessPreviewKeepsLegacyArrayDataShape() FAILED
    java.lang.AssertionError at PartnerApprovalsControllerContractTest.java:23
1 test completed, 1 failed
Execution failed for task ':services:partner-auth-service:test'
```

실패 원인은 수정 전 `data`가 `PartnerAccessPreviewResponse` 객체였기 때문이다.

## 3. Fix

- `PartnerAccessPolicy.isLongUnused`와 `isAuthenticationLongUnused`를 모두 `expiresAt.isBefore(now)`로 변경했다. 미리보기·상태조회/로그인 차단·만료 API의 공통 판정 방향은 유지하고 경계만 레거시에 맞췄다.
- 기존 `/access-preview`는 `ApiResponse<List<PartnerApprovalResponse>>` 배열 응답으로 복원했다. 구버전 데스크톱은 새 객체 필드를 읽지 않아도 깨지지 않는다.
- 보류(`deferred`, 영향 건수, 실패 원천)가 필요한 신형 소비자는 신규 `/access-preview/report`에서 `PartnerAccessPreviewResponse`를 받는다. 현재 데스크톱 API 클라이언트는 이 확장 endpoint를 사용한다.
- `previewLongUnusedReport`와 `createdAt` 기준, 외부 조회 실패 보류 동작은 변경하지 않았다.

## 4. GREEN

```text
./gradlew :services:partner-auth-service:test --tests ...legacyBoundary... --no-daemon --rerun-tasks
BUILD SUCCESSFUL

./gradlew :services:partner-auth-service:test --tests ...PartnerApprovalsControllerContractTest --no-daemon --rerun-tasks
BUILD SUCCESSFUL
```

경계 RED 테스트와 DTO 배열 계약 테스트가 각각 GREEN으로 전환됐다.

## 5. 불변식 1~6 실측

1. **경계가 레거시와 같다:** 통과. 고정 시각 테스트에서 30일은 양쪽 모두 미차단, 30일+1초는 양쪽 모두 차단, 29일은 양쪽 모두 미차단이다. 타임존 의존이 없는 `LocalDateTime` 고정값이다.
2. **경계 테스트 고정:** 통과. 정확히 30일 / 30일+1초 / 29일 세 지점을 미리보기와 실제 인증 판정 양쪽에 고정했다.
3. **DTO 하위호환:** 통과. 구 endpoint의 `data` 배열 계약을 테스트로 고정하고, 메타데이터는 `/access-preview/report`로 분리했다.
4. **잘못 차단 0·대칭 차집합 0:** R10 코드 경로는 공통 strict `<` 판정으로 양쪽을 동일하게 사용한다. 로컬 DB는 `[DEV-SEED]`이며 이번 작업에서 공유 DB read/write probe는 실행하지 않았다. R9의 `[DEV-SEED]` 결과(잘못 차단 0, 대칭 차집합 0)를 보존하는 범위로 수정했다.
5. **보류 노출·`createdAt` 기준:** 통과. `previewExposesDeferredLookupInsteadOfSilentlyReturningNoCandidates`, `previewAndAuthenticationUseCreatedAtWhenItIsNewerThanBusinessActivity` 및 전체 모듈 테스트가 GREEN이다.
6. **데스크톱 typecheck:** 미검증. `npm install`은 완료했으나 `npm run typecheck`가 아래 의존 산출물 부재로 시작 단계에서 중단됐다.

```text
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

[로컬 파생물 신선도 확인 실패] 검증 결과를 코드 결함으로 해석하지 마십시오.
- file: 의존 design-system dist이(가) 없습니다: ..\\web\\design-system\\dist\\index.d.ts. cd ..\\web\\design-system; npm run build
```

## 6. 모듈 전체 테스트

실행:

```text
./gradlew :services:partner-auth-service:test --no-daemon
BUILD SUCCESSFUL
```

결과: **77 tests / 0 failures / 0 errors / 0 skipped**. 직전 75건에서 R10 RED 회귀 테스트 2건이 추가되어 줄지 않았다. Testcontainers IT는 모듈 테스트 구성상 포함됐으며 공유 DB write/DDL은 수행하지 않았다.

## 7. 변경 파일별 `+N/-M`

`git diff --numstat` 기준 tracked 변경:

| 파일 | + | - |
|---|---:|---:|
| `clients/desktop/src/renderer/api/sales.ts` | 1 | 1 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/controller/PartnerApprovalsController.java` | 12 | 2 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAccessPolicy.java` | 2 | 2 |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/OrderAppAccessPreviewTest.java` | 23 | 0 |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/controller/PartnerApprovalsControllerContractTest.java` | 25 | 0 |
| `docs/dev-reports/2026-08-02-1015-r10-boundary-direction-fix.md` | 새 파일 | 새 파일 |

## 8. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1015-r10-boundary-direction-fix.md`
- `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/controller/PartnerApprovalsControllerContractTest.java`

커밋, push, checkout/브랜치 조작, 공유 DB write/DDL, Docker 이미지 재빌드는 수행하지 않았다.
