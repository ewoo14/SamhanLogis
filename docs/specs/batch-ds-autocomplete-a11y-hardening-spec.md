# 배치 B1-A — DS 자동완성 상태/선택확정 계약 하드닝 (기획 spec v3)

<!-- v3(SOL R2 잔여 HIGH 2 고정): blur exact 복수후보=onChange 미호출·단일만 자동선택 / DocRef blur→refocus 재검색 경로 -->


> OPUS 기획 · 백로그 번다운. **CODEX SOL 기획검수 R1(BLOCKING 3·분할 권고) 반영**: 6이슈 배치를 **B1-A 상태/계약(#834·#837·#840)** + **B1-B 독립 a11y(#828·#842·#843·후속 PR)** 로 분할. B1-A 먼저(#840·#843 둘 다 `PartnerAutocomplete.tsx` → 병렬 충돌 회피).
>
> 대상: **#834**(AsyncAutocomplete debounce/a11y 상태머신) · **#837**(DocumentReferencePicker 요청 세대) · **#840**(selection-confirmed 계약·동명 우회).

## 1. 파급면 (SOL 실측)
`AsyncAutocomplete` base 변경은 **16 운영 화면·22 mount** 회귀면(PartnerAutocomplete 12화면/15mount·ProductAutocomplete 2/4·MultiSelectAutocomplete 2/2·AA 직접 JournalForm 1). name-equality 업무 가드는 **정확히 2곳**: `DailyClosingPage.tsx:230`·`admin/BlockedPartnersPage.tsx:409`. → **전 22 mount 회귀 스위트 필수**.

## 2. 결정

### D-B1A-01 (#840·BLOCKING) committed-selection = **출력 계약**
`aria-expanded`/listbox-open 은 팝업 a11y 상태이지 업무 확정 아님(빈 입력=전체마감 유효인데 focus만으로 open=true→오차단). `isSelectionConfirmed` **입력 prop 아님** — child→parent **출력 계약**:
```ts
onInputCommitChange?: (committed: boolean) => void   // committed = 표시중 입력이 마지막 확정 선택(업무키)과 일치·미편집
```
**상태표(고정·spec 불변식)**:
| 상태 | committed |
|---|---|
| `value=null`·입력 빈 | **true** |
| 명시적 후보 선택 완료 | **true**(확정키=선택 getKey) |
| 선택 P1 보유·focus 로 표시 빈 | **false** |
| 사용자 1글자라도 편집 | **false**(결과 문자열이 P1.name 같아도 false) |
| P2 후보 명시 선택 | **true**(확정키=P2 `partnerCode`) |
| Escape/blur 로 편집 취소·P1 복원 | **true** |
| 외부 controlled value 초기화/교체 | **true**(닫힘) |
| 선택 해제 후 빈 입력 | **true** |

업무키 = `getKey`(Partner=`partnerCode`)·**이름은 확정 판정 절대 미사용**. `AsyncAutocomplete.tsx:202` blur exact-match `candidates.find()` 첫항목 자동선택 = **(SOL R2 고정) exact 후보 복수면 `onChange` 자체 미호출·기존 선택 복원 or 미선택 유지**(부모 value 를 임의 첫 동명으로 바꾸며 committed=false 만 만드는 경로 금지)·**단일 exact 만 blur 자동선택 허용**. **외부 controlled value 변경 시 `open=false` + draft 동기화** 함께 구현. 소비처 2곳 가드를 name-equality → **확정키(committed+getKey)** 판정으로 교체.

### D-B1A-02 (#834·BLOCKING) AsyncAutocomplete 항목별 처분 (A~E)
- **A stale 선택**: 입력 변경 후 이전 후보 유지 시 Enter 단일후보 fallback·Arrow·**마우스 `onMouseDown` 모두** 이전 후보 선택 가능 → keydown만 막으면 부분해소. **후보 유지 정책 유지 시 `draft.trim() === resolvedQuery` 일 때만 키보드+포인터 선택 허용·stale 옵션 `aria-disabled=true`**.
- **B/E false-empty·error**: 새 유효 입력 즉시 terminal 상태 `idle` 중화 + `errorMsg` 제거(empty→hit·error→retry 방향 주석 정정).
- **C activeIndex**: `AsyncAutocomplete.tsx:258` 이미 `-1` 리셋 → **구현 대상 아님·회귀 테스트 pin/완료 처분**.
- **D ARIA**: `aria-controls` + **`aria-expanded` 를 실제 listbox 존재와 일치**(`:456` 내부 `open` 그대로 노출 → 후보 0/error/empty 시 정합). live IDREF.

### D-B1A-03 (#837·BLOCKING·HIGH) DocumentReferencePicker 요청 세대 무효화
수동 Axios(`documentReferenceSearch.ts:83`·React Query 아님). **세대 토큰(requestId) 동기 증가 트리거 전수**: query 변경·유형 변경·후보 선택·clear/empty·Escape·blur 닫힘·disabled 전환·외부 value 변경·unmount. `then/catch/**finally**` 전부 동일 세대 확인(stale `finally` 가 새 요청 spinner 미소등). `suppressNextSearchRef: boolean` → React 동일 query skip 시 미소비·다음 검색 삼킴 → **"건너뛸 정확 query" 저장 or 제거**. blur(`:250`) timer ref 없이 예약 → **focus 시 취소 + blur 세대 무효화**. **(SOL R2 고정) blur→refocus 재검색 경로**: ①실제 blur close 시 debounce 취소 + 세대++ ②120ms 전 refocus 면 blur timer 취소 ③blur 확정 후 **non-empty query 로 refocus 하면 검색 재예약**(query 불변으로 effect 미재실행되어 stale options 만 재오픈되는 갭 폐쇄·`DocumentReferencePicker.tsx:247` focus 가 기존 options 만 재오픈) ④테스트: debounce 전 blur / in-flight blur 각각 동일 query 재포커스 → 최신 요청 결과만 재오픈. [[feedback_react_query_freshness_route_param_reset]] 세대 latch 정신.

## 3. 검증 (SOL·실 게이트만)
- **#840**: 모바일 라이브 QA 아님 → **deterministic mock**(두 화면 각 P1/P2 **동명·상이 code** fixture·미선택 실행 0회·P2 명시선택 후 **P2 `partnerCode` payload** 단언). `clients/desktop/playwright/ac-*` desktop mock gate.
- **#837**: **deferred-Promise unit**(A/B 응답 역순 resolve·query/type/select/clear/disabled/blur/Escape/unmount 후 stale 응답이 options·open·loading 미변경)·loading owner 단언.
- **#834**: stale keyboard/단일 Enter/**mouse 모두 차단**·terminal 상태 전환(empty→hit·error→retry)·live IDREF·activeIndex 회귀 pin.
- **전 22 mount 회귀**: DS vitest + desktop vitest + `ac-*` desktop Playwright mock gate(skipped=0)·**npm run typecheck**(vitest≠tsc).

## 4. 워크플로우
OPUS 기획(본 spec v2·PR #857) → CODEX SOL 기획검수(R1 BLOCKING 3→v2·재검수 GO) → CODEX LUNA 구현 → OPUS R1+라이브QA(동명 우회 실증) → CODEX SOL R2(fix=LUNA) → 0수렴 → 재수렴 → PM 종합 → CI green → 머지·**#834/#837/#840 close**.

## 5. 스코프·후속
- **B1-B(#828 LineRow role=row 제거·#842 Warehouse DOM/ARIA·#843 matchBadge sibling 분리)** = B1-A 머지 후 후속 PR(SOL 권고 순서). #828은 `EstimateLineRow`·`LineTableHeader` orphan sweep + fake test wrapper 제거 포함 예정.
- B1-A는 AA 상태머신·계약 한정. 자동완성 재설계 = 밖.
