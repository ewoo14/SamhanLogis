# PR #1059 / 이슈 #1013 — R9 CI RED 그룹화 결함 수정 보고서

## 1. 판정과 fixture 전화번호 분포

판정은 **구현 결함 + R8 기대값 stale**이다. `1736 entry`는 fixture가 전부 다른 번호라서가 아니다.

R8의 1,911건 축소 fixture 실제 분포는 다음과 같다.

| 수신번호 | 원본 전표 수 | 수정 후 entry 수 |
|---|---:|---:|
| `010-1111-2222` | 1,910 | 12 |
| `010-2222-3333` | 1 | 1 |
| 합계 | 1,911 | 13 |

수정 전 구현은 첫 bucket만 `entriesByRecipient.get(recipientPhone)`로 계속 조회했다. 2,000자 초과 시 새 bucket을 만들었지만 그 bucket을 현재 bucket으로 갱신하지 않아, 이후 같은 번호 전표가 계속 새 entry로 분리됐다. 그 결과 CI 원문처럼 `expected 12 ... got 1736`이 재현됐다.

수정 후에는 번호별 entry 배열의 **마지막 bucket**을 계속 조회한다. 따라서 동일 수신번호 1,910건이 12개 entry로 실제 묶인다. 원본 전표 1,910건 대비 12개이므로 1,898건이 기존 entry에 병합된 것이며, 별도 번호 1건을 합쳐 전체 13 entry다. 이 수치는 단순히 기대값을 1,736으로 바꾼 결과가 아니다.

R8 보고서의 “12 entry”는 전체 entry 수가 아니라 동일 번호 그룹의 bucket 수로 정정되어야 한다. R9 테스트는 전화번호가 2개임, 첫 번호가 1,910건임, 첫 번호 결과가 12 entry임, 전체 결과가 13 entry임을 각각 단정한다.

## 2. Fix

- `buildSendEntries`의 recipient map 값을 단일 entry에서 `DispatchSmsSendEntry[]`로 변경했다.
- 같은 번호는 마지막 bucket에 누적하고, 2,000자를 넘을 때만 새 bucket을 추가한다.
- 모든 bucket을 평탄화해 요청 entry로 반환한다.
- 기존 계약을 유지했다: blank `partnerCode` 제외, blank 전화번호 제외, 원문 블록 절단 금지.
- fixture에 실제 전화번호 분포와 동일 번호 그룹화 결과 단정을 추가했다.

변경 파일은 `clients/desktop`의 FE 2개뿐이다. 실제 SMS 발송, 공유 DB write, Docker 이미지 재빌드는 하지 않았다.

## 3. GREEN 원문

### 수정 전 CI 재현 원문

```text
× 배차문자 발송 모집단 > R8 1911건 후보는 2000자 이하 entry로 분할되고 누락 0건이다
  → expected [ …(1736) ] to have a length of 12 but got 1736
```

### 수정 후 대상 테스트

```text
✓ src/renderer/routes/DispatchSmsPage.test.ts (3 tests)
Test Files  1 passed (1)
     Tests  3 passed (3)
```

### Desktop typecheck

실행: `clients/desktop`에서 `npm run typecheck`

```text
Exit code: 0
✔ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다
ℹ tests 50
ℹ pass 50
ℹ fail 0
BUILD/tsc 단계도 오류 없이 종료
```

### Desktop 전체 Vitest

실행: `clients/desktop`에서 `npm run test`

```text
Test Files  193 passed (193)
     Tests  1727 passed (1727)
```

### Desktop lint/build

```text
npm run lint: 0 errors and 111 warnings
npm run build: Exit code 0
```

lint warning은 오류가 아니며, 이번 변경 파일의 lint error는 0이다. 경고의 baseline 증감 비교는 별도로 수행하지 않았다. build 출력에는 기존 폰트 경로·동적 import warning이 있었지만 build는 성공했다.

### notification-service 전체 테스트

실행: `./gradlew :services:notification-service:test --no-daemon`

```text
BUILD SUCCESSFUL in 13s
```

테스트 XML 38 suite의 `tests` 합계는 다음과 같다.

```text
233 tests, 0 failures, 0 errors, 0 skipped
```

## 4. 불변식 1~5 실측

| 불변식 | 결과 | 근거 |
|---|---|---|
| 1. CI GREEN | GREEN | Desktop typecheck, 전체 Vitest, lint error 0, build 성공; notification Gradle 성공 |
| 2. 그룹화 실검증 | GREEN | 전화번호 2개 분포를 확인했고 `010-1111-2222` 1,910행 → 12 entry를 단정 |
| 3. 길이·누락 동시 검증 | GREEN | 모든 entry `message.length <= 2000`, 모든 1,911 원문이 어떤 entry에 포함됨을 테스트 |
| 4. R8 성과 유지 | GREEN | 기존 blocked 조회 실패 fail-soft/실제 BLOCKED 차단, compose URL 배선, blank `partnerCode` 제외 계약을 전체 FE/notification 테스트와 typecheck/build에서 회귀 확인. 이번 fix는 그룹 bucket 로직만 변경 |
| 5. notification-service 233 tests 유지 | GREEN | 233/0/0/0, 감소 없음 |

Linux CI 호환성: 새 구현은 ECMAScript `Map`, 배열, `flat`, 문자열 길이만 사용하고 Windows 경로·줄바꿈·런타임 전용 API를 사용하지 않는다. 테스트의 `Set`/`Map`/`flat`도 Node/Vitest의 동일 표준 구현이므로 `ubuntu-latest`에서 OS 차이로 달라질 근거가 없다. 실제 GitHub ubuntu runner 재실행은 이 세션에서 하지 않았다.

## 5. 파일별 diff

`git diff --numstat` 기준:

| 파일 | 변경 |
|---|---:|
| `clients/desktop/src/renderer/routes/DispatchSmsPage.tsx` | `+12 / -10` |
| `clients/desktop/src/renderer/routes/DispatchSmsPage.test.ts` | `+7 / -1` |
| `docs/dev-reports/2026-08-02-1013-r9-ci-grouping-fix.md` | `+80 / -0` (신규 파일) |

## 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1013-r9-ci-grouping-fix.md`
