# PR #1120 / 이슈 #825 S5 — 적대적 검증·라이브 QA

> 검증일: 2026-08-08  
> 기준 HEAD: `86fd9a7922a06f7e5420160c04f3f501bd4c3dce`  
> 실행: `clients/desktop` cwd, Chromium headless, `VITE_MOCK_MODE=1`, `VITE_API_BASE_URL=http://127.0.0.1:1`

## 판정

**도달 결함 0건. 증거 무결성 결함 1건. 최종 0결함 판정은 아니다.**

- 결재자 검색·은행거래 거래처·병합전환 출고창고 모두 첫 글자에서 모달이 열린 뒤 모달 검색 입력으로 목표 후보까지 좁혀 선택·확정됐다.
- 기존 runtime 소비처 10개 페이지의 사용자 선택 경로는 유지됐다.
- 다만 기존 Playwright `ac-5-chip-multiselect.spec.ts` 1건이 이번 PR의 `autoSelectSingleResult` 동작을 반영하지 않아 단독 실행에서도 red다. 사용자 도달성은 살아 있지만 “DOM 계약 의존 테스트가 깨지지 않았는가”에는 **아니다**.

## 1. 독립 소비처 전수 열거

구현 보고서 표를 사용하지 않고 `git ls-files`와 runtime JSX의 wrapper/prop을 역추적했다. 공용 모달을 직접 렌더하는 계층은 다음 2개다.

| 렌더 계층 | 위치 | 모드 |
|---|---|---|
| `AsyncAutocomplete` | `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx:790` | single / multiple |
| `WarehouseAutocomplete` | `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx:372` | single |

실제 데스크톱 소비 표면은 10개 페이지다. `ProductAutocomplete`의 기본값이 single 모달이고 `ProductMultiSelectAutocomplete`가 multiple 모달을 고정하므로, JSX에 `resultSelectionMode`가 직접 적힌 곳만 세지 않았다.

| 페이지·표면 | wrapper / 모드 | 실 화면 결과 |
|---|---|---|
| 결재라인 설정 `/admin/approval-line-config` | `MultiSelectAutocomplete` / multiple | 공란 내부 검색에서 전체 3건, 2건 선택·확정 PASS |
| 은행거래 `/accounting/bank-transactions` | `PartnerAutocomplete` / single | 전체 다건 → 내부 검색 1건 → 확정 PASS |
| 주문 병합전환 `/sales/partner-orders` | `WarehouseAutocomplete` / single | 전체 다건 → 0건 취소 → 재진입·목표 창고 확정 PASS |
| 입금자명 매핑 `/accounting/deposit-mappings` | `PartnerAutocomplete` / single | 내부 검색 공란 전체 다건 → 확정 PASS |
| 결재 작성 `/groupware/approvals/new` | `MultiSelectAutocomplete` / multiple | 기존 전체 후보 선택·칩·payload PASS |
| 메신저 `/messenger` | `MultiSelectAutocomplete` / multiple | 동명이인 2건 모달 선택·확정 PASS |
| 견적 작성 `/sales/estimates/new` | `ProductAutocomplete` / single | 전체 후보 모달 선택·확정 PASS |
| 판매전표 작성 `/sales/new` | `ProductAutocomplete` / single | 데스크톱/반응형 동일 의미 입력, 모달 선택·가격 반영 PASS |
| 안전재고 `/inventory/safety-stock-alerts` | `ProductAutocomplete` / single | 표형 후보 모달·단건 확정 PASS |
| 견적품목 `/products/estimate-items` | `ProductAutocomplete` single + `ProductMultiSelectAutocomplete` multiple | 단건 즉시확정·다건 2개 선택·확정 PASS |

type-only import, re-export, story는 runtime 소비처에서 제외했다.

## 2. 원래 문제 — 세 화면 도달성

### 결재자 검색 (multiple)

1. 외부 입력에 `팀`을 입력하자 `출고자 결재자 검색 결과` 모달이 열렸다.
2. 내부 `검색 결과 필터`가 자동 포커스를 받았고 공란에서 배차팀·영업팀·회계팀 3건이 보였다.
3. 첫 후보를 선택한 뒤 다른 후보명으로 필터해 첫 후보를 화면에서 숨겨도 선택이 유지됐다.
4. 필터를 비우자 두 checkbox가 모두 checked였고, 확정 뒤 칩 2개가 남았다.

### 은행거래 거래처 (single)

1. 외부 입력에 `P`를 입력하자 `거래처 검색 결과` 모달이 열렸다.
2. 내부 검색 입력에 목표 거래처의 표시명을 끝까지 입력하자 radio 1건만 남았다.
3. 그 항목을 선택·확정했고 외부 입력의 `P` draft가 확정 거래처 표시로 바뀌었다.

### 병합전환 출고창고 (single)

1. 외부 입력에 `창`을 입력하자 `출고 창고 검색 결과` 모달이 열렸다.
2. 내부 검색으로 0건을 만든 뒤 취소했고 외부 창고 입력으로 포커스가 복원됐다.
3. 다시 `창`을 입력해 모달을 열고 목표 창고를 1건으로 좁혀 선택·확정했다.

따라서 세 경로 모두 사용자가 원하는 항목에 실제로 도달했다.

## 3. fix가 만든 새 표면

| 항목 | 관찰 |
|---|---|
| 자동 포커스 | 모달 open 직후 내부 searchbox가 focused. `Tab` 1회로 첫 checkbox에 도달하고 Space로 선택됐다. 목록 이동을 막지 않았다. |
| 0건 탈출 | `검색 결과가 없습니다.` 표시, 선택 전 `선택 확정` disabled, `취소` enabled. 취소 후 원래 combobox로 포커스 복원. 갇힘 없음. |
| multiple 선택 유지 | 선택한 항목을 필터 밖으로 숨긴 뒤 다른 항목을 선택하고 필터를 비우면 두 선택 모두 유지. 확정 시 칩 2개. |
| 한글 IME | Chromium에서 `compositionstart` → `insertCompositionText(isComposing)` → `compositionupdate/end` 이벤트를 넣었다. 조합 문자열이 입력값과 필터에 반영됐고 후보·취소 경로가 유지됐다. |
| 다시 열기 | design-system 테스트에서 close 후 reopen 시 query 공란·searchbox 재포커스 PASS. |

## 4. 접근성·문구·UUID

- searchbox accessible name: `검색 결과 필터`
- 결과 영역: `검색 결과 선택`; 표형 결과 caption도 `검색 결과 선택`
- 버튼: `취소`, `선택 확정`; 0건 문구: `검색 결과가 없습니다.`
- 선택 input은 `getLabel(option)`을 accessible name으로 사용한다.
- 세 대표 화면·입금자명 매핑·기존 품목/담당자/메신저 스위트에서 화면 UUID 정규식 노출 0건.
- 캡처의 제목·필드·버튼·빈 결과 안내는 한국어다. fixture 고유명/코드는 원본 표시값으로 유지됐다.

## 5. 결함

### S5-F1 — 기존 AC-5 DOM 계약 테스트 red (증거 무결성)

- 파일: `clients/desktop/playwright/ac-5-chip-multiselect/ac-5-chip-multiselect.spec.ts:176`
- 실패 위치: `:182`, `getByRole('listbox', { name: '출고자 결재자 검색 결과' })`
- 재현: 전체 26건 묶음에서 1회, 포트 회수 후 단독 새 서버에서 1회 — 두 번 동일 red.
- 원인 증거:
  - PR diff가 `ApprovalLineConfigPage.tsx`에 `resultSelectionMode="multiple"`와 `autoSelectSingleResult`를 추가했다.
  - 테스트는 `매니저` 검색 뒤 legacy listbox를 기다린다.
  - 현재 `매니저`는 단일 후보라 즉시 선택·칩 확정되고 listbox는 생성되지 않는다.
  - 실패 snapshot에도 `매니저` 칩 1개와 focused combobox가 보였다.
- 사용자 도달성: 즉시확정으로 살아 있다.
- 판정: 기능 회귀는 아니지만 기존 DOM 계약 테스트가 PR 동작과 불일치해 red이므로, 요청된 “테스트가 깨지지 않았는지” 관문은 실패다.

## 6. 실행 증거

```text
S5 신규 실 화면 spec                         4 passed (8.1s)
기존 소비처 4-suite 묶음                    25 passed / 1 failed (45.7s)
  - 1062 안전재고·견적                      8/8 PASS
  - AC-2 판매전표                           7/7 PASS
  - AC-5 결재작성·결재선·양식               4 PASS / 1 FAIL
  - AC-825 메신저                           6/6 PASS
AC-5 실패 케이스 단독 새 서버               1 failed (동일 selector)
견적품목 multiple                           4/4 PASS
design-system Vitest                        26 files / 200 tests PASS
S3 은행 기준 spec 진단 대조                 1/1 PASS
```

mock handler가 없는 endpoint가 localhost 실서버로 빠지지 않도록 모든 Playwright 실행에서 `VITE_API_BASE_URL=http://127.0.0.1:1`을 사용했다.

## 7. 캡처

- `docs/qa-shots/825-s5-verify/01-approval-multiple-filter-retains-selection.png`
- `docs/qa-shots/825-s5-verify/02-bank-partner-filtered-target.png`
- `docs/qa-shots/825-s5-verify/03-warehouse-zero-results-cancel-enabled.png`

세 파일을 원본 해상도로 다시 열어 제목·검색값·선택 상태·0건 취소 상태를 시각 확인했다.

## 8. 신규 파일

- `clients/desktop/playwright/825-s5-verification/825-s5-verification.spec.ts`
- `docs/qa-shots/825-s5-verify/01-approval-multiple-filter-retains-selection.png`
- `docs/qa-shots/825-s5-verify/02-bank-partner-filtered-target.png`
- `docs/qa-shots/825-s5-verify/03-warehouse-zero-results-cancel-enabled.png`
- `docs/dev-reports/2026-08-08-825-s5-verification.md`

커밋·push·제품 코드 수정·DB write·Docker 재기동은 하지 않았다.

## 이 라운드가 보지 않은 것

- Windows/macOS의 실제 OS IME 후보창 자체. headless Chromium의 composition 이벤트 경로까지만 확인했다.
- mock이 아닌 운영/공유 Docker API 응답과 실제 5,587건 전체 데이터를 통한 세 대표 화면 수동 조작. 공유 스택은 지시대로 건드리지 않았다.
- 모바일 클라이언트. 이번 공용 모달의 열거된 runtime 소비처는 데스크톱이다.
- 스크린리더 음성 출력. accessible role/name과 키보드 포커스 순서까지만 확인했다.
