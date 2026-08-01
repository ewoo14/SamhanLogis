# 1015 주문 앱 접근 — Slice 1 구현 보고서

## 1. 조사 결과와 범위 확정

- 정찰 문서와 영향 측정 문서를 읽었다.
- 이번 변경은 두 결함만 다룬다. 판정 기준은 마지막 로그인·비밀번호 변경일을 그대로 유지하고, 안내문만 실제 기준에 맞춘다.
- 승인현황 화면의 `장기미발주 → 승인` 선택은 backend의 `APPROVED` 분기에서 `PENDING`만 변경하고 `LONG_UNUSED`에는 저장하지 않아 no-op이다. 화면이 성공으로 보이므로, 원래 의도(화면에서 상태를 직접 변경하는 승인현황 흐름)와 기존 `markApproved()` 도메인 계약을 따라 backend가 장기미발주도 승인으로 저장하도록 고친다.
- 비밀번호 재설정, 판정 기준 전환, Docker 재기동, 실 DB 쓰기는 하지 않는다.

## 2. RED 테스트 작성 전 설계

- 안내문 결함은 주문서 앱의 `LONG_UNUSED` 모달 문구를 검증하는 Vitest 테스트로 재현한다. 기대 문구는 실제 판정 순서인 마지막 로그인, 없으면 비밀번호 변경일을 설명하며, `최종 주문일` 표현이 없어야 한다.
- 복구 no-op 결함은 `PartnerApprovalService.updateStatus()` 단위 테스트로 재현한다. `LONG_UNUSED` 상태에서 `APPROVED`를 선택하면 내부 상태가 `NEED_PW_INPUT`으로 바뀌어야 한다. 기존 `PartnerAuth.unlock()`은 LOCKED 전용이므로, 기존 승인 흐름을 막지 않도록 별도의 명시적 승인 전환 메서드를 추가한다.
- 변경 전후 판정 결과 불변식 B는 `PartnerAuth.expirationAt()` 관련 기존 테스트/코드 계약을 유지하고, 장기미사용→승인 전환 테스트에서 만료 시각 계산 로직을 건드리지 않았음을 함께 확인한다. 판정 코드는 수정하지 않는다.

## 3. RED 실행 원문

### 안내문 테스트

```text
> npm test -- --run src/__tests__/longUnusedMessage.test.ts

'vitest' is not recognized as an internal or external command,
operable program or batch file.
```

프론트 모듈에 `node_modules`가 없어 테스트 runner가 시작되지 않았다. assertion 실패 원문을 만들 수 없는 환경 제약이며, 테스트 파일은 남겨 두고 구현 후 `npm run typecheck`도 같은 조건으로 확인한다.

### 복구 테스트

```text
> ./gradlew :services:partner-auth-service:test --tests com.samhanair.logis.partnerauth.service.PartnerApprovalServiceTest

1 test completed, 1 failed
expected: NEED_PW_INPUT
 but was: LONG_UNUSED

BUILD FAILED
```

실패 원인: `PartnerApprovalService.updateStatus(APPROVED)`가 `PENDING`과 `LOCKED` 외 상태를 변경하지 않아 `LONG_UNUSED`가 그대로 남는다.

## 4. 구현

- 주문서 앱 `LONG_UNUSED` 안내문을 마지막 로그인일, 로그인 기록이 없을 때 비밀번호 변경일 기준이라고 수정했다. 30일 판정 상수와 backend 판정 코드는 변경하지 않았다.
- `PartnerAuth.restoreFromLongUnused()`를 추가하고 승인 상태 변경 서비스에서 `LONG_UNUSED → NEED_PW_INPUT` 전환을 연결했다. 화면이 성공으로 보이던 no-op을 실제 영속 엔티티 상태 변경으로 바꿨다.
- 기존 `PENDING → NEED_PW_SET`, `LOCKED → NEED_PW_INPUT`, 이미 승인 상태의 no-op 계약은 그대로 두었다.

## 5. GREEN 및 전체 검증 원문

### 복구 회귀 테스트

```text
> ./gradlew :services:partner-auth-service:test --tests com.samhanair.logis.partnerauth.service.PartnerApprovalServiceTest

BUILD SUCCESSFUL in 13s
9 actionable tasks: 3 executed, 6 up-to-date
```

### 변경 모듈 전체 테스트

```text
> ./gradlew :services:partner-auth-service:test --no-daemon

BUILD SUCCESSFUL in 39s
9 actionable tasks: 2 executed, 7 up-to-date
```

### 안내문 정적 확인

```text
GuideMatches      : True
OldGuidePresent   : False
ReportExists      : True
BackendTestExists : True
```

### 프론트 테스트·타입 확인

```text
> npm test
'vitest' is not recognized as an internal or external command,
operable program or batch file.

> npm run typecheck
'tsc' is not recognized as an internal or external command,
operable program or batch file.

node_modules: absent
```

웹 주문 앱 워크트리에 의존성이 없어 프론트 테스트와 타입 확인은 실행할 수 없었다. 데스크톱 화면 파일은 이번에 변경하지 않았으므로 데스크톱 `npm run typecheck` 의무 대상은 아니다.

## 6. 불변식 B 확인

- 판정 기준을 계산하는 `PartnerAuth.expirationAt()`와 `LONG_UNUSED_DAYS`는 변경하지 않았다.
- 복구 테스트는 마지막 로그인 시각을 고정한 뒤 `expirationAt()`을 복구 전 저장하고, `LONG_UNUSED → NEED_PW_INPUT` 승인 복구 후 동일한 값을 다시 비교한다.
- 해당 테스트를 포함한 `:services:partner-auth-service:test` 전체가 `BUILD SUCCESSFUL`이므로, 상태 복구가 선별 기준 시각 계산을 바꾸지 않는 결과를 실행으로 확인했다.

## 7. 제한사항

- 변경 파일은 안내문, PartnerAuth 상태 전환, PartnerApprovalService 연결, 두 결함 회귀 테스트, 본 보고서뿐이다.
- 비밀번호·자격 값, UUID, 실 DB 값은 보고서에 기록하지 않았다. Docker와 실 DB 쓰기는 수행하지 않았다.
