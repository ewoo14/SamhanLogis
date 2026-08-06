# R27 — 확정 자동완성 포커스-only blur 회귀

- 기준 브랜치: `fix/1062-line-input-ux`
- 기준 HEAD: `d62e57fa3d78649afbe6138ad176f90cf267bed2`
- 범위: `AsyncAutocomplete` 공통 상태 판정과 회귀 테스트
- 제외: `/sales/:id/edit`(#1071), DB 쓰기·컨테이너 재배포, R26의 빈행/Y.Doc 구현 변경

## 1. 진단

R26은 빈 draft blur에서 `onChange(null)`을 호출하도록 고쳤지만, 같은 컴포넌트의 `handleFocus`가 확정값에 포커스하는 순간 `lastTypedDraftRef`와 화면 draft를 먼저 비웠다. 따라서 blur 시점에는 포커스만 한 경우와 사용자가 실제로 입력을 지운 경우가 모두 `trimmed === ''`로 합쳐졌다.

근본 원인은 빈 문자열을 “입력 결과”와 “아직 입력 이벤트 없음”에 동시에 사용한 상태 표현이다. `lastTypedDraftRef`를 nullable sentinel로 바꾸어 다음을 구분했다.

```text
null       = 이번 포커스 이후 입력 이벤트 없음
''         = 사용자가 실제로 빈 문자열까지 지움
'AJ'       = 사용자가 AJ를 입력함
```

변경 지점은 [AsyncAutocomplete.tsx](../../clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx)의 ref 초기화, focus/pick reset, blur 해제 게이트, controlled-null 보존 조건, 모달 취소 복원이다.

## 2. 불변식

```text
포커스만 하고 blur       → 선택 유지, onChange(null) 금지
확정값을 실제로 지움     → blur에서 onChange(null), 선택 해제
확정값 위에 AJ 입력      → AJ와 첫 글자 유지, 교체 가능
모달 취소 후 focus 복원  → preserveDraftOnNextFocusRef가 1회 검색어 보존
```

R26의 나머지 불변식도 유지했다.

- 네 화면의 삭제 경로와 `ensureTrailingBlankRow`는 수정하지 않았다.
- 견적 버전 변경 시 stale Y.Doc 재시드와 같은 버전의 미저장 입력 보존 코드도 수정하지 않았다.
- `onInputCommitChange`를 사용하는 전표 2개·일마감·차단 거래처의 committed 판정은 기존대로 유지했다.

## 3. RED → GREEN 원문

### RED

수정 전 R27 A1 회귀 테스트를 추가하고 실행했다.

```text
npx vitest run src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx
24 tests | 1 failed
R27 A1 ... expected onChange not to be called
Received: [null]
```

이 결과는 `focus → blur`만으로 실제 선택 해제가 발생한다는 PM 실측과 일치한다. 기존 R26의 “빈 draft blur” 테스트는 입력 이벤트 없이 focus와 blur만 수행했기 때문에, A1과 A2를 동시에 보장하는 RED가 아니었다. R27 A2는 실제 입력처럼 임시 검색어 입력 후 `change('')`으로 지우도록 고쳤다.

### GREEN

최종 공통 스위트 결과:

```text
AsyncAutocomplete.test.tsx       29 passed
AsyncAutocomplete.contrast...     7 passed
Test Files 2 passed · Tests 36 passed
```

데스크톱 전체 Vitest도 exit 0, 지정 Playwright도 16/16 통과했다.

## 4. A1·A2·A3를 한 파일에 나란히 둔 근거

세 테스트는 모두 [AsyncAutocomplete.test.tsx](../../clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx)에 연속 배치했다.

| 테스트 | 파일 위치 | 핵심 단언 |
|---|---:|---|
| A1 포커스-only blur | 683행 | `onChange` 미호출, 확정 라벨 유지 |
| A2 실제 지움 blur | 712행 | 실제 `change('지울 검색어') → change('')` 후 `onChange(null)` |
| A3 `AJ` 교체 | 750행 | `onInputCommitChange`가 부모 value를 null로 바꿔도 input이 `AJ` 유지 |

같은 파일의 782행에는 callback 없는 A3도 추가했다. 기존 R23 B1(618행)과 R23 A1(652행)은 callback 있음의 포커스-only·실제 지움 경로를 blur까지 검증한다. 이제 한 동선을 수정하면 반대 동선의 회귀가 같은 스위트에서 즉시 드러난다.

## 5. 자기 표면 닫기

### 5.1 조합 전수

| 동선 | 값 있음·callback 없음 | 값 있음·callback 있음 | 값 없음·callback 없음 | 값 없음·callback 있음 |
|---|---|---|---|---|
| 포커스-only | R27 A1 | R23 B1 | 기존 null 입력/모달 테스트 | R23 committed 계약 스위트 |
| 지움 | R27 A2 | R23 A1 | 해제할 선택 없음(no-op) | null committed 계약(no-op) |
| 교체 | R27 A3 callback 없음(782행) | R27 A3(750행) | 신규 검색 경로 기존 AC 스위트 | 신규 검색 경로 기존 AC 스위트 |
| 모달 취소 복원 | R27 parameterized | R27 parameterized | R27 parameterized | R27 parameterized |

모달 취소 parameterized 테스트는 63행에서 값 있음/없음과 callback 있음/없음 4개 조합을 모두 실행하며, `preserveDraftOnNextFocusRef`의 복원 focus를 실제로 밟는다. 모달 취소 후 한 번 더 필드를 왕복하면 검색어가 정리되는 기존 계약도 12행에서 유지 확인했다.

### 5.2 식별자 전수 조사

다음 명령으로 워크트리 전체를 조사했다.

```text
rg -n "lastTypedDraftRef|preserveDraftOnNextFocusRef|onInputCommitChange" .
```

활성 구현의 `lastTypedDraftRef` 참조는 전부 `AsyncAutocomplete.tsx` 안에서 nullable 의미로 갱신됐다. `onInputCommitChange`의 실제 소비 인스턴스는 전표 2개, 일마감 1개, 차단 거래처 1개로 확인했고, 네 화면의 draft-vs-selection 비교 경로를 변경하지 않았다.

### 5.3 변경 파일 참조 테스트

실행한 명령과 결과:

```text
cd clients/web/design-system
npx vitest run src/components/AsyncAutocomplete
→ 2 files · 36 tests passed

cd clients/desktop
npx vitest run
→ exit 0

cd clients/desktop
npx playwright test playwright/ac-2-product-autocomplete playwright/ac-3-partner-autocomplete playwright/1062-line-input-ux
→ 16 passed

cd clients/web/design-system
npx tsc -p tsconfig.json --noEmit
→ exit 0

cd clients/desktop
npx tsc -p tsconfig.node.json --noEmit
npx tsc -p tsconfig.web.json --noEmit
→ 모두 exit 0

git diff --check
→ 통과
```

## 6. 안 본 것

- 사용자 지시대로 전체 Playwright 게이트는 실행하지 않았다.
- 사용자 지시대로 `npm run typecheck` 전체는 실행하지 않고 명시한 `tsc -p ... --noEmit`만 실행했다.
- `/sales/:id/edit` 후속 이슈와 DB/컨테이너/배포 표면은 다루지 않았다.
- 이 작업에서는 R26의 네 화면 빈행 복원 및 견적 Y.Doc 구현 파일을 다시 수정하지 않았다.

## 결론

R27의 불변식 1을 최소 공통 컴포넌트 변경으로 완성했다. 포커스-only blur는 선택을 유지하고, 실제 지움만 null 해제를 발생시키며, `AJ` 교체와 모달 취소 복원 및 R26의 나머지 두 fix는 모두 유지된다.
