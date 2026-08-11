# PR #1126 R8 — CI 회복 전용 라운드

## 원인

R2에서 `MultiSelectAutocomplete` 칩 카운트의 `data-testid`를
`multiselect-chip-count`에서 `${inputTestId}-chip-count`로 변경했다. 현재
메신저는 검색 input 소비자 때문에 `inputTestId="messenger-recipient-search"`를
계속 넘기고 있어, 기존 메신저 소비자가 기대하던 고정 testid가
`messenger-recipient-search-chip-count`로 바뀌었다.

RED 재현 결과:

```text
MessengerPage.test.tsx (23 tests | 3 failed)
TestingLibraryElementError:
Unable to find an element by: [data-testid="multiselect-chip-count"]
실제 DOM: data-testid="messenger-recipient-search-chip-count"
실패 위치: MessengerPage.test.tsx:109, :193, :541
```

메신저의 `inputTestId`를 제거하면 input을 조회하는 기존 Playwright/테스트 소비자
(`messenger-recipient-search`)가 깨진다. 따라서 검색 input testid와 칩 카운트
testid를 분리하는 `chipCountTestId` 선택 prop을 추가하고, 메신저에만
`chipCountTestId="multiselect-chip-count"`를 지정했다. `inputTestId` 기반 동적
계약과 inputTestId 미지정 시의 기존 고정 fallback은 그대로 보존된다.

## 소비자 전수

저장소 전체에서 `multiselect-chip-count`와 `-chip-count`를 검색한 결과다.

| 소비자 | 기대 형태 | 근거/판정 |
|---|---|---|
| `MessengerPage.test.tsx` 3건 | 고정 `multiselect-chip-count` | 기존 테스트 계약; 수정 금지 |
| `playwright/ac-825-s6-messenger-chip` | 고정 `multiselect-chip-count` | 메신저 mock 회귀 계약 |
| `playwright/ac-1049-search-modal-multiselect` | 고정 `multiselect-chip-count` | 견적품목 추가 검색 영역의 유일 조회 |
| `playwright/product-catalog` | 고정 `multiselect-chip-count` | 견적품목 관리 추가 검색 영역의 유일 조회 |
| `MultiSelectAutocomplete.test.tsx` C1 | 고정 `multiselect-chip-count` | `inputTestId` 미지정 하위호환 계약 |
| `MultiSelectAutocomplete.test.tsx` R2 | 동적 `row-quantity-sync-input-chip-count` | `inputTestId` 지정 인스턴스 계약 |
| `EstimateItemsCatalogPage`의 행별 `ProductMultiSelectAutocomplete` | 동적 `estimate-items-quantity-sync-${modelCode}-input-chip-count` | CategoryCell별 유일 조회; R2 보호 대상 |
| `FreeTextChipInput` 및 테스트 | 별도 고정 `free-text-chip-count` | `MultiSelectAutocomplete` 소비자가 아닌 별도 컴포넌트 |

문서·소스 포함 grep 결과에서 추가적인 `multiselect-chip-count` 소비자는
발견되지 않았다. `docs/dev-reports`의 과거 기록은 실행 소비자가 아니므로 표에서
제외했다.

## 수정 범위

- `MultiSelectAutocompleteProps`에 선택적 `chipCountTestId` 추가.
- 칩 카운트 testid 결정 순서: `chipCountTestId` → `inputTestId` 기반 동적 값 →
  기존 고정값 `multiselect-chip-count`.
- 메신저에만 고정 칩 카운트 testid 지정.
- 새 옵션의 단위 테스트 추가.
- 메신저 테스트·Playwright 스펙, 수량 동기화 로직, `tools/legacy-gas/**`는
  수정하지 않았다.

## RED 원문

수정 전 실행:

```text
cd clients/desktop
npx vitest run src/renderer/routes/MessengerPage.test.tsx

MessengerPage.test.tsx (23 tests | 3 failed)
Unable to find an element by: [data-testid="multiselect-chip-count"]
DOM에는 messenger-recipient-search-chip-count만 존재
```

추가한 회귀 테스트는 수정 전 다음과 같이 실패했다.

```text
MultiSelectAutocomplete.test.tsx (9 tests | 1 failed)
Unable to find an element by: [data-testid="multiselect-chip-count"]
실제 DOM: messenger-recipient-search-chip-count
```

## 검증 원문

### 관련 Vitest

```text
MultiSelectAutocomplete.test.tsx: 9 passed
MessengerPage.test.tsx: 23 passed
```

### 관련 Playwright CI hard gate

```text
CI=1 PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test playwright/ac-825-s6-messenger-chip/ac-825-s6-messenger-chip.spec.ts
6 passed (10.6s)
[guard] expected=6 unexpected=0 skipped=0 flaky=0
```

### typecheck / lint / build

```text
clients/web/design-system: npm run build       exit 0
clients/web/design-system: npm run typecheck   exit 0
clients/web/design-system: npm run lint        exit 0 (0 errors, 69 existing warnings)
clients/desktop: npm run typecheck             exit 0
clients/desktop: npm run lint                  exit 0 (0 errors, 157 existing warnings)
clients/desktop: npm run build                 exit 0
```

### 전체 Playwright

요청 명령 `npx playwright test`와 기존 mock 서버 재사용 방식의 전체 실행 모두
15분 제한에 도달하여 exit 124로 종료되었다. 전체 667건에 대한
`[guard] expected=667 unexpected=0 ...` 원문은 확보하지 못했다. 관련 6건의
CI hard gate 원문은 위와 같이 `unexpected=0`이다.

## 신규 생성 파일

- `docs/dev-reports/2026-08-10-896-r8-testid-compat.md`

빌드 산출물은 저장소 추적 변경으로 남지 않았다.

## 못 한 것

- 전체 `npx playwright test` 667건의 완주 및 전체 guard 원문 확보: 15분 timeout.
- git commit/push: 요청에 따라 하지 않음.
- 메신저 테스트/스펙 수정: 하지 않음.
