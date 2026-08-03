# R34 CI mock business document number fix

## 작업 시작

- 2026-08-04 `git pull` 완료: `Already up to date.`
- PM 기준 커밋 `e62f0ca6c` 이후 상태에서 조사 시작.
- 범위: `src/renderer/api/mock.test.ts` 가드의 위반 4건 원인 판정 및 테스트 fixture 최소 수정.
- 금지 범위: 제품 코드 변경, Docker 조작, 전체 Playwright/Gradle 실행, commit/push.

## 조사 로그

- 원본 실패 재현 명령: `clients/desktop`에서 `npx vitest run src/renderer/api/mock.test.ts`
- 재현 결과: `129 tests | 1 failed`, `128 passed`; 실패 가드가 다음 4건을 원문으로 보고함.

| # | 값 | 파일 | 필드 | 판정 | 근거 |
|---:|---|---|---|---|---|
| 1 | `1` | `src/renderer/routes/DispatchSmsPage.test.ts:28` | `slipNo` | (나) 규약 밖 값 | `setDriverContactsForDate`에 넣는 `DispatchDriverContactInput`의 사용자 입력값. BE 반환 응답이 아님. |
| 2 | `1` | `src/renderer/routes/DispatchSmsPage.test.ts:35` | `slipNo` | (나) 규약 밖 값 | 1번 입력을 날짜별 상태에서 꺼내는 기대값. 사용자 입력 상태 보존 검증이지 BE 전표번호 fixture가 아님. |
| 3 | `1` | `src/renderer/routes/DispatchSmsPage.test.ts:44` | `slipNo` | (나) 규약 밖 값 | `2026-08-03` 연락처 행의 매칭용 사용자 입력. BE가 채번·반환하는 전표번호 위치가 아님. |
| 4 | `1` | `src/renderer/routes/DispatchSmsPage.test.ts:50` | `slipNo` | (나) 규약 밖 값 | `2026-08-01` 연락처 행의 매칭용 사용자 입력. 날짜별 분리 회귀 검증의 입력값임. |

판정 근거:

- FE `DispatchDriverContactInput`은 `slipNo`, `companyName`, `driverPhone`, `date`로 구성된 레거시 배송기사내역 입력 행이다.
- BE `DispatchDriverContactInput`도 동일하게 `driverContacts` 요청 배열의 입력 DTO이며, 미리보기 응답 전표번호와 별도다.
- 화면 label은 `업체명/전표번호`이고 입력 변경 시 `slipNo`와 `companyName`을 사용자가 직접 타이핑한 값으로 함께 갱신한다.
- 레거시 `tools/legacy-gas/배차안내문자/Code.js:314-323`은 업체명 세그먼트에서 순수 숫자, 업체명-순번, `/` 다중 입력, 숫자 추출형을 매칭용으로 허용한다.
- 반대로 BE가 반환하는 배차 미리보기 `DispatchSmsPartnerEntry.slipNo`와 공통 문서번호 fixture는 `yyyy/MM/dd-N` 계약을 따른다. 그 값은 이번 위반 목록에 없다.

## 조치 예정

- `ALLOWED_NON_DOCUMENT_MARKERS`에 사용자 입력용 정확한 marker `1`만 추가한다.
- `DOCUMENT_NO_FMT`, 문서번호 key 집합, BE 반환 fixture, 제품 코드는 변경하지 않는다.

## 조치 완료

- `clients/desktop/src/renderer/api/mock.test.ts`의 `ALLOWED_NON_DOCUMENT_MARKERS`에 정확히 `'1'`을 추가했다.
- `DispatchSmsPage.test.ts`의 4개 fixture 값과 R27/R30의 날짜별 매칭 의도는 변경하지 않았다.
- 제품 코드, BE 계약, 정규식, 기존 허용 marker는 변경하지 않았다.

## GREEN 원문

실행 명령:

```text
cd clients/desktop
npx vitest run src/renderer/api/mock.test.ts src/renderer/routes/DispatchSmsPage.test.ts
```

실행 결과:

```text
✓ src/renderer/api/mock.test.ts (129 tests)
✓ src/renderer/routes/DispatchSmsPage.test.ts (3 tests)

Test Files  2 passed (2)
Tests       132 passed (132)
```

가드 포함 단독 실행 원문:

```text
cd clients/desktop
npx vitest run src/renderer/api/mock.test.ts
```

```text
✓ src/renderer/api/mock.test.ts (129 tests)

Test Files  1 passed (1)
Tests       129 passed (129)
```

## 가드 유효성 근거

- 수정은 허용 목록에 정확한 값 `'1'` 하나를 추가한 것뿐이다. `DOCUMENT_NO_FMT` (`YYYY/MM/DD-N`)와 `DOCUMENT_NO_KEY_SET`은 그대로다.
- 실제 BE 반환 전표번호를 검증하는 `ledger and statement mock endpoints use BE document number format` 테스트가 단독 GREEN 범위에 포함되어 통과했다.
- `DispatchSmsPage`의 응답 전표번호 fixture는 이미 `2026/08/03-1`이며 이번 marker 대상이 아니다.
- `mock.test.ts`의 문서번호 계약 필터는 허용 목록에 없는 비표준 값이면 계속 `violations`에 남겨 `toEqual([])`에서 실패하는 구조다. 따라서 사용자 입력 marker만 예외 처리되고 BE 반환 전표번호 parity 가드는 유지된다.
- `git diff --check`도 출력 없이 종료 코드 0이었다.

## 새 파일 목록

- `docs/dev-reports/2026-08-04-1013-r34-ci-mock-number-fix.md`

## 변경 파일 목록

- `clients/desktop/src/renderer/api/mock.test.ts` — 사용자 입력 순번 marker 1건 추가.

커밋·푸시는 수행하지 않았다.
