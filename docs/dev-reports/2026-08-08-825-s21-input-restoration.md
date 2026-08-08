# PR #1120 / Issue #825 — S21 입력 복구 및 backdrop draft 보존

## 결과

S20 결함 2건을 수정했다.

- S19의 값 접두사 조기 return을 자동확정 직후의 100ms 일회성 잔여 키 소비 표식으로 축소했다.
- `insertFromPaste`, `insertCompositionText`, `insertReplacementText`는 표식이 살아 있어도 사용자 입력으로 통과시킨다.
- blur 지연 콜백은 렌더 시점의 stale `draft` 대신 최신 `draftRef`를 읽는다. 따라서 backdrop/취소 뒤 300ms에도 draft가 보존된다.
- 선택/취소/Escape 경로도 draft ref를 함께 갱신해 표시값과 내부 선택의 경계를 유지했다.

## RED-A 원문

수정 전 `WarehouseAutocomplete` 좁은 spec의 원문 실패 4건이다.

```text
× allows intentional keyboard input after auto-confirmation has settled
  → expected 'false' to be 'true'
× allows paste replacement immediately after auto-confirmation
  → expected 'VH-001 · 차량 창고' to be 'VH-001'
× allows IME composition input immediately after auto-confirmation
  → expected 'HQ-001 · 본사 창고' to be '창'
× allows autocomplete replacement immediately after auto-confirmation
  → expected 'VH-001 · 차량 창고' to be 'VH-001'
Tests 20 | 4 failed | 16 passed
```

핵심 원인은 S19의 다음 조건이 이벤트 출처와 사용자 의도를 구분하지 않았기 때문이다.

```ts
if (selectedWarehouse && nextDraft.startsWith(selectedLabel) && nextDraft !== selectedLabel) {
  setDraft(selectedLabel)
  return
}
```

## RED-B 원문

S20에서 ②·③ 보존을 확인한 원문이다. 자동확정 뒤 잔여 suffix가 표시값에 붙지 않았다.

```text
{"tag":"confirmed-H","value":"HQ-001 · 본사창고","focused":true,"expanded":"false"}
{"tag":"keyboard-suffix-2","value":"HQ-001 · 본사창고","focused":true,"expanded":"false"}
```

수정 후에도 기존 회귀 테스트를 유지했고, 동일 동작이 GREEN이다.

## RED-A / RED-B 동시 GREEN 원문

```text
✓ WarehouseAutocomplete.test.tsx (20 tests)
  20 passed, 0 failed

✓ MergeConvertDialog.test.tsx (9 tests)
✓ SalesPartnerOrderDetailPage.coedit.test.tsx (20 tests)
✓ SlipFormPage.test.tsx (99 tests)
  3 files, 128 tests passed, 0 failed
```

새 입력 표면별 GREEN은 각각 독립 테스트로 확인했다.

```text
✓ allows intentional keyboard input after auto-confirmation has settled
✓ allows paste replacement immediately after auto-confirmation
✓ allows IME composition input immediately after auto-confirmation
✓ allows autocomplete replacement immediately after auto-confirmation
✓ preserves backdrop-cancelled draft after the blur timer settles
```

## 3절 — 새로 가능해진 조합을 실제로 밟은 결과

### 1. 확정 상태 × 입력 종류

```text
확정(HQ-001) × 일반 키보드(Q, guard window 이후)       → Q 유지
확정(HQ-001) × paste(VH-001)                          → VH-001 반영
확정(HQ-001) × 한글 IME(창)                            → 창 반영
확정(HQ-001) × autocomplete replacement(VH-001)       → VH-001 반영
확정(HQ-001) × Ctrl+A 후 HQ                            → 목표 창고 자동확정
확정 상태 × 지우기                                    → 빈 draft 유지, onChange 없음
```

일반 키보드는 자동확정과 같은 브라우저 잔여 이벤트만 100ms 동안 소비한다. 그 이후의 키보드 입력과 paste/IME/replacement는 정상 검색 입력이다.

### 2. 취소 경로 × 시간

```text
취소 버튼 × 즉시       → draft "창", dropdown 닫힘
취소 버튼 × 300ms 후   → draft "창" 보존
backdrop × 즉시        → draft "창", dropdown 닫힘
backdrop × 300ms 후    → draft "창" 보존
Escape × 즉시          → dropdown만 닫힘, 바깥 모달 유지
Escape × 다음 회       → 바깥 모달 닫힘
```

### 3. 회귀 울타리

기존 관련 spec에서 다음을 함께 확인했다.

```text
미확정 발행 disabled / POST 0건
결재자·은행거래 Enter 확정 / UUID 비노출
resultSelectionMode 미지정 dropdown Enter
명시확정 후 300ms 표시값 유지 / dropdown 닫힘
```

## 검증 명령과 종료 코드

파이프 없이 각 명령의 종료 코드와 로그를 확인했다.

```text
npm exec vitest run src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx
Exit code: 0

npm exec tsc -- --noEmit -p tsconfig.json   (clients/web/design-system)
Exit code: 0

npm run build   (clients/web/design-system; desktop typecheck freshness 갱신)
Exit code: 0

npm run typecheck   (clients/desktop)
Exit code: 0
real-QA tests 50 passed, 0 failed
Exit code: 0
```

desktop typecheck는 최초 실행에서 stale dist freshness guard로 중단되었고, 안내된 design-system build 뒤 재실행해 exit 0을 확인했다. 빌드의 폰트 unresolved 경고는 기존 런타임 경로 경고이며 TypeScript/테스트 실패가 아니다.

## 신규 파일 목록

```text
docs/dev-reports/2026-08-08-825-s21-input-restoration.md
```

수정 파일:

```text
clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx
clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx
```

`clients/desktop/playwright/825-s15-final-reconvergence/`는 읽거나 커밋 대상으로 다루지 않았다. git add/commit/push/checkout/stash와 DB 쓰기, Docker 재기동, Desktop mock 전체 suite 실행도 하지 않았다.
