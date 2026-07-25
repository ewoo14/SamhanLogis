# #920 CODEF 가져오기 선택 낙관적 잠금 구현 보고서

## 1. 해결 내용과 선택한 수단

CODEF 가져오기 선택 PUT 계약에 조회 시점의 `version`을 추가하고, 서버가 현재 행 버전과 요청 버전을 저장 직전에 대조하도록 구현했다.

- `UserCodefImportScope` 행에 JPA `@Version`과 `version BIGINT NOT NULL DEFAULT 0`을 추가했다.
- 기존 행은 마이그레이션에서 버전 0으로 시작하므로 기존 데이터가 조회·저장된다.
- 최초 저장은 `version: null`, 기존 행 저장은 GET 또는 직전 PUT 응답의 버전을 보내도록 했다.
- 요청 버전이 없거나 현재 버전과 다르면 `409 CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT`를 반환한다.
- 최초 저장 경쟁에서 unique 충돌이 나도 기존의 재조회·재저장 retry를 하지 않아 나중 요청이 조용히 덮어쓰지 않게 했다.
- 낡은 저장 요청은 트랜잭션 안에서 검증되므로 거부 시 선택 목록을 변경하지 않는다.
- 데스크톱은 409를 받으면 서버 최신 선택을 다시 조회해 표시하고, 사용자가 최신 상태에서 의도를 다시 선택해 저장할 수 있도록 했다. 자동 합집합 병합은 하지 않았다.
- desktop mock도 저장 버전 대조와 409 응답을 동일하게 재현한다.

이 수단을 고른 이유는 이 계약이 전체 교체 저장을 유지하면서도 의도하지 않은 삭제를 막기 때문이다. 자동 합집합은 사용자가 해제한 항목을 되살릴 수 있어 PM 결정과 맞지 않는다. 저장 응답의 증가한 버전을 화면 상태에 반영하면 같은 화면의 즉시 재저장도 자기 자신과 충돌하지 않는다.

## 2. RED 출력 원문

아래는 구현 전 새 회귀 테스트를 먼저 실행한 결과다.

### BE

실행 명령:

```text
.\gradlew :services:accounting-service:test --tests "com.samhanair.logis.accounting.it.CodefImportControllerIT.upsertScope*" --tests "com.samhanair.logis.accounting.it.UserCodefImportScopeMigrationIT.v65UpgradePreservesLegacySelectedEmptyRows" --rerun-tasks --no-build-cache --no-daemon
```

```text
CodefImportControllerIT > CODEF scope ? 낡은 저장은 409로 거부하고 최신 선택을 바꾸지 않는다 FAILED
CodefImportControllerIT > CODEF scope ? 미저장 상태의 동시 첫 저장은 하나만 성사되고 다른 하나는 거부된다 FAILED
CodefImportControllerIT > CODEF scope ? 저장 응답의 잠금값으로 같은 화면의 즉시 재저장이 성공한다 FAILED
UserCodefImportScopeMigrationIT > V64 legacy SELECTED+빈 refs 행이 있어도 V65 upgrade가 성공하고 행을 보존한다 FAILED

8 tests completed, 4 failed
FAILURE: Build failed with an exception.
```

### FE Form

실행 명령:

```text
cd clients/desktop
npx vitest run src/renderer/routes/components/CodefImportScopeForm.test.tsx
```

```text
RUN v2.1.9 ...
src/.../CodefImportScopeForm.test.tsx (24 tests | 2 failed) 1729ms
× ... 조회 버전을 저장 요청에 싣고 ...
  → expected { connectedId: 'connected-main', …(5) } to match object { version: +0 }
× ... 충돌 시 서버 최신 선택을 보여주고 ...
  → expected "spy" to be called 2 times, but got 1 times
Test Files 1 failed
Tests 2 failed | 22 passed
```

### desktop mock

```text
RUN v2.1.9 ...
src/.../mock.test.ts (124 tests | 1 failed | 123 skipped)
× ... CODEF scope mock — 낡은 잠금값 저장은 409...
  → expected undefined to be 409
Tests 1 failed | 123 skipped
```

## 3. GREEN 출력 원문

### BE 전체

실행 명령:

```text
.\gradlew :services:accounting-service:test --rerun-tasks --no-build-cache --no-daemon --console=plain
```

```text
BUILD SUCCESSFUL in 6m 53s
21 actionable tasks: 21 executed
```

JUnit XML 집계:

```text
TestFiles : 191
Tests     : 1483
Failed    : 0
Skipped   : 10
```

### FE typecheck

실행 명령:

```text
cd clients/desktop
npm run typecheck
```

```text
> @samhan/desktop@0.1.0 typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
```

### FE 지정 테스트

실행 명령:

```text
cd clients/desktop
npx vitest run src/renderer/routes/components/CodefImportScopeForm.test.tsx
```

```text
✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (24 tests)
Test Files 1 passed (1)
Tests 24 passed (24)
```

mock 및 API 회귀도 함께 확인했다.

```text
✓ src/renderer/api/codef.test.ts (3 tests)
✓ src/renderer/api/mock.test.ts (124 tests)
Test Files 2 passed (2)
Tests 127 passed (127)
```

## 4. 변경 파일과 작업 내용

- `.github/workflows/ci.yml` — 새 migration 회귀 클래스와 CODEF 관련 회귀 표면을 CI allowlist에 명시했다.
- `shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java` — CODEF 잠금 충돌용 409 오류 코드를 추가했다.
- `services/accounting-service/src/main/resources/db/migration/V66__add_user_codef_import_scope_version.sql` — 기존 행과 신규 행의 버전 기본값을 0으로 추가했다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/UserCodefImportScope.java` — `@Version` 필드를 추가했다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/UserCodefImportScopeService.java` — 요청 버전 검증, 최초 저장 규칙, 충돌 매핑, 무음 retry 제거를 구현했다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/CodefImportScopeRequest.java` — nullable `version` 요청 필드와 검증을 추가했다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/CodefImportScopeResponse.java` — 저장 버전을 응답하고 미저장 상태에는 null을 반환하게 했다.
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/CodefImportControllerIT.java` — stale 저장, 동시 최초 저장, 저장 직후 재저장 회귀를 추가했다.
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/UserCodefImportScopeMigrationIT.java` — 기존 행의 버전 0 보존을 추가했다.
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/CodefAccountSelectionIT.java` — 기존 full replacement 회귀를 새 버전 계약에 맞추고 동시 충돌·기존 선택 보존을 검증했다.
- `clients/desktop/src/renderer/api/codef.ts` — FE scope 타입에 버전을 추가했다.
- `clients/desktop/src/renderer/routes/components/CodefImportScopeForm.tsx` — PUT 버전 전송, 409 최신 상태 재조회, 한국어 충돌 안내, 명시적 재선택 경로를 추가했다.
- `clients/desktop/src/renderer/routes/components/CodefImportScopeForm.test.tsx` — 버전 연속 저장과 충돌 안내·최신 선택 표시를 추가했다.
- `clients/desktop/src/renderer/api/mock.ts` — 실 BE와 같은 버전 대조 및 409 응답을 구현했다.
- `clients/desktop/src/renderer/api/mock.test.ts` — mock stale 저장 거부와 최신 선택 보존을 추가했다.
- `clients/desktop/src/renderer/api/codef.test.ts` — 응답 fixture에 버전을 반영했다.

## 5. 불변식 대응표

| 불변식 | 검증 테스트 | 검증 표면 |
|---|---|---|
| I1 낡은 저장 거부 및 이유 공개 | `CodefImportControllerIT.upsertScope_staleSnapshot_returns409AndPreservesLatestState`, `CodefImportScopeForm.test.tsx` 충돌 테스트 | 실제 MockMvc PUT 409 오류 코드·메시지, 데스크톱 안내 |
| I2 거부 시 무변경 | 같은 BE stale 테스트, `CodefAccountSelectionIT.upsertScopeRejectsUniqueConflictWithoutMutatingExistingScope` | stale PUT 뒤 GET에서 최신 선택만 유지 |
| I3 최신 상태 확인 및 의도 관철 경로 | `CodefImportScopeForm.test.tsx` 충돌 테스트 | 409 뒤 GET 재조회, 최신 표시값·체크 상태, 다시 활성화된 저장 경로 |
| I4 최초 저장 경쟁도 무음 덮어쓰기 금지 | `CodefImportControllerIT.upsertScope_concurrentFirstSave_rejectsOneWithoutSilentOverwrite`, `CodefAccountSelectionIT.upsertScopeConcurrentRequests_acceptsOneAndRejectsTheOther` | 동시 최초 PUT 결과가 정확히 200/409이고 active row가 하나임 |
| I5 기존 행 하위호환 | `UserCodefImportScopeMigrationIT.v65UpgradePreservesLegacySelectedEmptyRows`, `CodefAccountSelectionIT.upsertScope_isIdempotentPerUserAndConnectedId` | migration 후 기존 행 버전 0, version 0으로 정상 조회·갱신 |
| I6 저장 직후 재저장 | `CodefImportControllerIT.upsertScope_successResponseVersion_allowsImmediateSecondSave`, Form 연속 저장 테스트 | PUT 응답 버전 0→1→2와 다음 요청 버전 전달 |

## 6. 범위 밖에서 발견한 것

이번 구현과 검증에서 #920 범위 밖의 다른 사용자 설정 저장 경로는 추가로 변경하지 않았다. 새 이슈 등록도 하지 않았다.

## 7. 하지 못한 것과 확신 범위

- 로컬 `design-system` 패키지의 `dist`가 없던 초기 환경에서는 desktop typecheck가 외부 패키지 선언을 찾지 못했다. 로컬 의존성 설치 후 design-system build로 개발 산출물을 만든 뒤 typecheck를 재실행해 통과시켰다. 이 산출물은 무시 파일이며 제품 소스 변경은 아니다.
- 전체 BE 테스트는 통합 테스트가 많아 약 7분이 걸렸다. 최종 결과는 캐시 없이 genuine 실행했으며 1483개 실행, 10개 skip, 실패 0개였다.
- 실 서버가 아닌 로컬 MockMvc·desktop mock·단위/통합 테스트로 검증했다. 집 PC 실서버 재현 환경에 대한 별도 배포·운영 확인은 수행하지 않았다.
