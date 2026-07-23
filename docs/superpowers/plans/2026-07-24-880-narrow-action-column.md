# 슬라이스 #880 — 좁은 폭에서 조작 버튼 컬럼 DOM 제거 결함 (6화면)

- 이슈: #880 `[FIX] 좁은 폭에서 조작 버튼 컬럼이 DOM 제거되어 기능 도달 불가 (6화면)`
- 브랜치: `feat/880-narrow-action-column` (origin/main 29383b1f1 기반, #914·#909 머지 포함)
- 작성: OPUS 4.8 기획자, 2026-07-24
- 성격: FE-only 버그 수정. Flyway 0, BE 0.

---

## 1. 문제

공용 `DataTable`(`clients/web/design-system/src/components/DataTable/DataTable.tsx`)은 `≤768px`에서 각 행을 **카드**로 변환한다(모바일 슬3 #598 + 그 위에 덧붙은 `mobilePriority` grid 레이어). 컬럼별 `mobilePriority?: 'primary' | 'secondary' | 'hidden'` 값이 카드 안에서의 표시 방식을 정한다.

`mobilePriority: 'hidden'` 의 계약(`DataTable.module.css:284-286`):

```css
.tr:has(td[data-mobile-priority]) td[data-mobile-priority="hidden"] {
  display: none;
}
```

`hidden` 은 **시각적 약화가 아니라 DOM 렌더 제거**다. 아래 6화면은 **조작 버튼을 담은 컬럼**에 `hidden` 을 지정해, `≤768px`(데스크톱 창을 좁혔을 때)에서 그 버튼이 통째로 사라진다. `onRowClick` 대체 경로도 없어(6화면 전부 0건, 목록 전용·상세 뷰 없음) 그 기능 자체가 도달 불가가 된다.

| # | 파일 | 라인(hidden) | 컬럼 key | header | 조작 내용 | 버튼 수 |
|---|---|---|---|---|---|---|
| 1 | `clients/desktop/src/renderer/routes/CollectionPlanPage.tsx` | 236 | `actions` | 상태전이 | `TRANSITION_OPTIONS` 별 상태전이 Button | 다중 |
| 2 | `clients/desktop/src/renderer/routes/NotesReceivablePage.tsx` | 201 | `actions` | 상태전이 | `TRANSITION_OPTIONS` 별 상태전이 Button | 다중 |
| 3 | `clients/desktop/src/renderer/routes/PermissionGroupManagePage.tsx` | 165 | `actions` | 작업 | 개명 + 삭제 Button | 2 |
| 4 | `clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipPage.tsx` | 91 | `action` | (빈 헤더) | 전기 Button (DRAFT 일 때만) | 1 (조건부) |
| 5 | `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipPage.tsx` | 91 | `action` | (빈 헤더) | 전기 Button (DRAFT 일 때만) | 1 (조건부) |
| 6 | `clients/desktop/src/renderer/routes/admin/BlockedPartnersPage.tsx` | 186 | `action` | 액션 | 차단 해제 button (권한 있을 때) 또는 "MASTER 전용" 텍스트 | 1 (조건부) |

> 이슈 표의 header 표기 일부는 실제 코드와 다르다(#1·#2 는 이슈가 "상태전이/작업"으로 혼기했으나 코드는 둘 다 `상태전이`, #3 은 `작업`). 본 기획은 실제 코드 값을 기준으로 한다. 발현 조건·심각도는 이슈의 정직한 한정을 그대로 승계한다: **desktop(Electron) 렌더러 라우트**이며 별도 RN 앱 화면이 아니다. 상시 발현이 아니라 "창을 768px 이하로 좁혔을 때"만 발현. 그럼에도 결함인 이유 = 반응형 규약상 **정보 우선순위 하향은 허용되나 기능 제거는 불가**이고, 사라진 사실·복구법(창 넓히기)을 알리는 장치가 없다.

---

## 2. 원인 분석 — 의도 vs 실수 (실수로 확정)

**카드화 원본(#598)에는 이 결함이 없었다.** 슬3 카드 패턴은 조작 컬럼을 `td[data-label=""]` → `::before content:none` + `justify-content:flex-end`(우측 정렬)로 자연스럽게 처리했다(메모리 `mobile-s3-datatable-card` 로 박제). 즉 **원래는 조작 버튼이 카드 안에 우측 정렬로 남았다.**

이후 `mobilePriority` grid 레이어(`DataTable.module.css:205-311`, `primary`=카드 제목 / `secondary`=라벨-값 셀 / `hidden`=제거)가 덧대어졌다. 6화면에 이 레이어를 적용하면서, **"좁은 카드에서 덜 중요한 정보 컬럼을 접는다"는 의도로 `hidden` 을 지정하다가 조작 컬럼까지 같은 버킷에 넣은 것**이 원인이다. 정보 컬럼(거래처코드·근거·비고·발행일 등)에 `hidden` 은 정당하지만(이슈도 그 정보 소실군은 별도 UI 에픽으로 이월), **조작 컬럼은 정보가 아니라 기능**이라 접으면 안 된다. 이를 구분하지 못한 기계적 지정이 결함의 본질이다.

**코드베이스가 이를 직접 증명한다.** 조작 컬럼(`key: 'action'|'actions'`)의 `mobilePriority` 관례를 전수하면 6화면만 이례적이다:

| mobilePriority | 조작 컬럼을 가진 화면 | 좁은 폭 결과 |
|---|---|---|
| `'secondary'` (지배적 관례) | BankCardAdminPage, ActivityLogPage, SalesOrderApprovalsPage, admin/PartnersPage, EstimateListPage | 카드 내 표시(도달 가능) |
| `'primary'` | AppNoticeManagementPage, AppReleaseManagementPage | 카드 제목영역 표시(도달 가능) |
| **`'hidden'`** | **본 6화면(#880)** | **DOM 제거(도달 불가) — 결함** |

→ 조작 컬럼을 다루는 다른 7개 화면은 전부 도달 가능한 값을 쓴다. **6화면은 관례 이탈이며, 관례로 되돌리는 것이 정확한 수정**이다.

---

## 3. 결정 — 좁은 폭 조작 도달 방안

### 후보 비교

| 후보 | 변경 범위 | 기존 관례 재사용 | design-system 변경 | 재발 방지 가드 | 판정 |
|---|---|---|---|---|---|
| **A. 6화면 조작 컬럼 `hidden` → 도달 가능한 우선순위(기본 `secondary`)** | 6개 .tsx, 각 1줄 | ✅ 지배적 관례(7화면) 그대로 | ❌ 없음 | 정적 회귀 테스트로 보강 가능 | **채택** |
| B. design-system 에 `mobilePriority: 'action'`(카드 하단 전폭 액션바) 신설 + "actions 는 hidden 불가" 가드 | DataTable.tsx+css + 6 .tsx | 신규 계약 발명 | ✅ 있음(blast radius) | 계약 자체가 가드 | 대안(개발책임자 판단) |
| C. `onRowClick` → 상세/액션 시트 부여 | 6화면 + 신규 상세/시트 뷰 | 부분 | 경우에 따라 | — | 기각 |

- **후보 C 기각**: 6화면은 목록 전용으로 상세 뷰가 없다. 행 클릭 상세/시트를 새로 만드는 것은 슬라이스 범위를 크게 벗어나고(6개 신규 뷰), 이슈가 요구한 "기능 도달 복구"에 비해 과도하다. (이슈도 이를 최후 대안으로만 언급.)
- **후보 A 채택 근거**: 최소 변경(6줄) + **이미 코드베이스에 존재하는 지배적 관례**(`secondary`) 재사용 + design-system 무변경 → 공용 컴포넌트 blast radius 0 + design-system Playwright mock 게이트 발동 안 함. 넓은 폭 무회귀가 자명(§9). 이슈가 제시한 "카드 하단 액션바"는 후보 B의 이상형이나, `secondary` 로도 도달성은 완전히 복구되며(§7 검증) 최소 변경 원칙에 부합한다.

### 채택 결정 (후보 A)

**6화면 조작 컬럼의 `mobilePriority: 'hidden'` 을 도달 가능한 우선순위로 교체한다. 기본값 = `secondary`(조작 컬럼 지배적 관례).**

- design-system(`DataTable.tsx`/`.module.css`) **무변경**. 6개 화면 파일의 컬럼 정의만 수정.
- 구현자는 화면별로 `secondary` 를 기본으로 하되, **불변식(§5)을 만족하는 선에서** 특정 화면이 `primary` 또는 `mobilePriority` 생략(= #598 기본 조작셀 전폭 우측정렬)을 선택해도 무방하다. 기획은 수단을 강제하지 않고 도달성·무회귀 불변식만 요구한다.
  - 참고(구현 재량 판단 자료): 현재 컬럼 구성에서 `secondary` 적용 시 grid `secondary` 개수 패리티상 #1·#2·#3 은 마지막 홀수 `secondary` 규칙(`DataTable.module.css:280`)으로 전폭 렌더(다중 버튼에 유리)되고, #4·#5·#6 은 반폭 셀 렌더(단일 버튼이라 충분)된다. 단 이 패리티는 향후 컬럼 추가에 취약하므로 **도달성 회귀 테스트(§8)로 못박는다.**

### design-system 변경 여부 — **불필요(후보 A). 단, 후보 B 채택 시에만 필요.**

- 후보 A는 design-system 을 건드리지 않으므로 `feedback_design_system_playwright_mock_suite` 의 "공용 컴포넌트 변경 = Playwright mock 스위트 필수" 규칙이 **발동하지 않는다.**
- 후보 B(개발책임자가 재발 방지 가드를 원할 경우)를 택하면 design-system 변경이 되어 **그 규칙이 발동**한다(§8·§9에 비용 명시).

---

## 4. 범위

### 포함 (6화면 일괄, 동일 패턴)
1. `CollectionPlanPage.tsx:236` — `actions` 컬럼 `hidden` 교체
2. `NotesReceivablePage.tsx:201` — `actions` 컬럼 `hidden` 교체
3. `PermissionGroupManagePage.tsx:165` — `actions` 컬럼 `hidden` 교체
4. `accounting/PurchaseAccountingSlipPage.tsx:91` — `action` 컬럼 `hidden` 교체
5. `accounting/SalesAccountingSlipPage.tsx:91` — `action` 컬럼 `hidden` 교체
6. `admin/BlockedPartnersPage.tsx:186` — `action` 컬럼 `hidden` 교체
7. 좁은 폭 도달성 회귀 테스트 추가(§8)

### 슬라이스 밖 (명시적 제외)
- **정보 소실군**(이슈 배경의 `TaxInvoiceInboundPage` 상태 컬럼, `DispatchSmsSendAuditPage` 3지표, `SlipListPage`·`BankTransactionPage` 등, 전체 `hidden` 114건 중 정보 컬럼): 기능 소실이 아니라 판독 정보 하향이며, 이슈가 UI 개편 에픽의 모바일 슬라이스로 이월 지정. **본 슬라이스에서 손대지 않는다.**
- **design-system `'action'` 값 신설 + DataTable 레벨 가드**(후보 B): 개발책임자가 재발 방지를 명시적으로 원할 때만. 기본 계획엔 미포함(§10 판단 지점).
- **행 클릭 상세/액션 시트**(후보 C): 기각. 신규 상세 뷰 없음.
- BE·Flyway·권한 계약: 무변경.

---

## 5. 불변식 (구현자에게)

1. **[도달성]** `≤768px` 렌더에서 6화면 각 행의 조작 버튼(들)이 **DOM에 렌더되고, 화면에 보이고, 클릭 가능**하다. `display:none` 되지 않는다.
2. **[무회귀·넓은 폭]** `>768px`(데스크톱 기본)에서 6화면의 테이블 레이아웃·조작 컬럼 위치·동작이 **수정 전과 완전히 동일**하다. (mobilePriority 스타일은 `@media(max-width:768px)` 안에만 있으므로 넓은 폭은 원리상 무영향 — 테스트로 확인.)
3. **[가로 오버플로 없음]** 좁은 폭 카드에서 조작 버튼이 카드 폭을 넘겨 가로 스크롤/클리핑을 유발하지 않는다(다중 버튼은 `flexWrap` 으로 줄바꿈).
4. **[조건부·비활성 상태 보존]** 각 화면의 기존 게이팅을 그대로 유지한다:
   - #1·#2: 전이 버튼 `disabled` 조건(`!canUpdateReceivable || !canTransition(...) || isPending`) 불변.
   - #3: 개명 `disabled={group.isBuiltin}`, 삭제 `disabled={group.isBuiltin || group.assignedAccountCount > 0}` 불변(빌트인 잠금 규칙 — §6).
   - #4·#5: `전기` 버튼은 `status === 'DRAFT'` 일 때만 렌더(POSTED 는 빈 셀) 불변.
   - #6: `canBulkManage` 참이면 `차단 해제` button, 거짓이면 "MASTER 전용" 텍스트 — 분기 불변.
5. **[권한 무확장]** 어떤 화면에서도 권한 게이팅이 넓어지지 않는다(도달 = 렌더링 도달일 뿐, 권한 없는 사용자에게 실행 권한을 부여하지 않는다).
6. **[design-system 무변경]** 후보 A 채택 시 `DataTable.tsx`/`DataTable.module.css` diff 0. (변경한다면 후보 B로 전환되어 §8 mock 스위트 의무 발동 — 사전에 개발책임자 확인.)

---

## 6. 기존 결정 교차검증 결과

- **`project_mobile_s3_datatable_card`(#598)**: 카드화 = 공용 DataTable CSS-only, 56 리스트 화면 자동 전환, 데스크탑/인쇄 무변동(신규 CSS 전부 `@media` 한정). 원본 카드 패턴은 조작셀을 `td[data-label=""]` 우측정렬로 이미 처리 → **본 결함은 이후 mobilePriority 레이어의 오지정**임을 확증. 후보 A는 이 슬3 관례에 정합.
- **`project_mobile_s4a_modal_fullscreen`(#599)**: 좁은 폭 모달 풀스크린. 조작 도달과 직접 상충 없음. 다만 "라이브QA가 매 라운드 실결함 단독 적발" 교훈 → §8에 좁은 폭 라이브 캡처 반영.
- **`feedback_responsive_drawer_offscreen_a11y`(#597)**: `display:none` vs `visibility/transform` 의 a11y 차이. 본 건은 반대 방향(제거된 것을 되살림)이라 오프스크린 focusable 잔존 리스크 없음. 단 "숨김의 종류가 접근성 트리에 미치는 영향" 관점은 §8 도달성 테스트가 `toBeVisible`/클릭으로 커버.
- **`feedback_design_system_playwright_mock_suite`**: 공용 컴포넌트 변경 시 vitest·타입체크만으론 부족, Playwright mock 스위트 필수(+ `design-system && npm run build` 로 dist 선빌드). → **후보 A는 design-system 무변경이라 미발동. 후보 B 전환 시 발동**(§8).
- **`feedback_fe_guard_removal_contract_tests`**: 라우트 가드 변경 시 전체 mock suite 필요. 본 건은 가드 변경 아님(컬럼 표시 우선순위만). 단 #3 PermissionGroup 은 `permission-groups.spec.ts`·`permission-delegation.spec.ts` 커버리지 존재 → 회귀 확인 대상(§8).
- **권한그룹 편집 도달 관련 기존 결정**: 메모리 전수(`feedback_pgc_c2_widening_option_a`, `feedback_fe_guard_removal_contract_tests`, `feedback_pm_permission_autonomy` 등) 확인 결과 **"편집 버튼 좁은 폭 도달"에 대한 상충 결정 없음**. 존재하는 제약은 **빌트인 그룹 잠금**(개명/삭제 비활성)뿐 → 불변식 §5.4 로 보존. 도달성 복구는 이 잠금과 무관(비활성 버튼도 렌더는 되어야 사용자가 "왜 잠겼는지" 인지 가능).

---

## 7. U-gate 시나리오

**이 슬라이스가 끝나면 사용자는 좁은 화면(태블릿/폭 좁힌 데스크톱 창, ≤768px)에서 6화면의 조작 기능을 다시 실행할 수 있다.**

시나리오 (수금계획): 사용자가 데스크톱 창을 720px 폭으로 좁힌 상태에서 `수금계획` 화면을 연다. 각 수금계획 카드에 **상태전이 버튼(예: 확정/보류/취소)이 보이고**, 원하는 상태 버튼을 눌러 실제로 `updateCollectionPlanStatus` 가 호출되어 목록이 갱신된다. (수정 전에는 720px 에서 버튼이 사라져 상태 전이가 불가능했다.)

동형 확인 시나리오: 720px 에서 매출전표 DRAFT 행의 `전기` 클릭 → POSTED 전환 / 권한그룹(비빌트인) 카드의 `개명` 클릭 → 개명 폼 오픈 / 차단거래처 카드의 `차단 해제` 클릭 → 확인 모달.

---

## 8. 테스트 전략

### 후보 A (채택) — design-system 무변경 기준
1. **좁은 폭 도달성 회귀 테스트(신규, 필수)**: Playwright mock 스펙에서 viewport 를 `≤768px`(예: 720×900)로 설정하고 6화면 각각에 대해:
   - 조작 버튼(대표 1개, 가능하면 `data-testid` 사용: `perm-group-edit-*`, `admin-blocked-unblock-*` 등)이 **`toBeVisible()`** 이고 **클릭 가능**함을 단언.
   - 다중 버튼 화면(#1·#2)은 전이 버튼 중 하나가 visible + 클릭 시 mutation 호출(mock)까지 확인.
   - 조건부(#4·#5 DRAFT / #6 canBulkManage)는 해당 조건 행에서 버튼 존재를 단언.
   - `datagrid/datagrid-interaction.spec.ts` 에는 좁은 폭/카드 테스트가 **없으므로** 이 도달성 스펙이 회귀 방지의 핵심 게이트가 된다.
2. **넓은 폭 무회귀**: 기본 뷰포트(≥1280px)에서 기존 스펙 유지. 특히 `permission-groups.spec.ts`·`permission-delegation.spec.ts`(#3 커버) green 확인.
3. **라이브QA(좁은 폭 GUI 스샷, 매 라운드)**: mock OFF·실서버·:8080·`dev_master` 로 6화면을 **폭 ≤768px 로 실제 좁혀** 조작 버튼 노출→클릭→상태 변화를 단계별 스크린샷. (`feedback_live_qa_every_round_screenshots`·`mobile-s4a` 교훈: 정적/텍스트로 대체 금지.)
4. (선택·권장) **정적 재발 가드**: desktop vitest 로 6화면(또는 `key:'action(s)'` 컬럼 전수)에 `mobilePriority:'hidden'` 이 없음을 단언하는 경량 회귀 테스트. design-system 무변경으로 재발 방지 일부를 확보.
5. desktop `npm run typecheck` + 변경 모듈 vitest(`feedback_desktop_typecheck_command`·`feedback_changed_module_full_test_before_push`).

### 후보 B 로 전환 시 추가 의무
- 🚨 `cd clients/web/design-system && npm run build`(dist 선빌드) → `cd clients/desktop && npx playwright test`(**전체 mock 회귀 hard gate**, ac-*·bundle-set-options·journal-form-dropdown·datagrid 등 포함). vitest·typecheck·타깃 QA green 만으로 수렴 선언 금지.
- 신규 `'action'` 값의 카드 렌더를 검증하는 스냅샷/도달성 스펙 신설(현재 카드 좁은 폭 스펙 부재).

---

## 9. 회귀 위험

1. **넓은 폭 레이아웃(최우선)**: `mobilePriority` 소비 CSS가 전부 `@media(max-width:768px)` 안에 있어 `>768px` 는 원리상 무영향. 단, "무영향"을 **테스트로 확증**(넓은 폭 조작 컬럼 위치/동작 스냅샷) — 메모리 `feedback_pm_verify_what_measurement_proves`("이 측정이 증명하는 것" 진술) 적용.
2. **좁은 폭 테이블 폭 초과**: 다중 버튼(#1·#2)이 카드 폭을 넘으면 가로 스크롤 유발 가능 → `flexWrap` 줄바꿈 + 라이브QA 로 확인(불변식 §5.3). `secondary` 반폭 셀에서 다중 버튼이 좁을 수 있으나 패리티상 #1·#2·#3 은 전폭 렌더됨(§3) — 그래도 시각 확인 필수.
3. **패리티 취약성**: `secondary` 전폭/반폭이 grid `secondary` 개수 홀짝에 의존(`DataTable.module.css:280`). 향후 컬럼 추가로 패리티가 뒤집히면 다중 버튼이 반폭으로 좁아질 수 있음 → §8.1 도달성 테스트가 "보이고 클릭됨"을 못박아 기능 회귀는 차단(미관은 후속).
4. **조건부 렌더 미관(#4·#5)**: `secondary` 적용 시 POSTED 행은 빈 조작 셀이 반폭 빈 칸으로 남을 수 있음 → 라이브QA 로 어색한 공백 여부 확인, 필요 시 구현자가 `null` 대신 셀 자체 처리(불변식 내 재량).
5. **공용 컴포넌트 소비처 영향**: 후보 A는 design-system 무변경 → **다른 DataTable 소비처(56화면) 영향 0**. 후보 B는 계약 확장(신규 enum 값은 하위호환이나 카드 CSS 추가가 전 소비처에 로드됨) → 전체 mock 스위트로 blast radius 검증 필요(§8 후보 B).
6. **#3 권한 도메인**: 도달성 복구가 빌트인 잠금(개명/삭제 비활성)을 우회하지 않음(불변식 §5.4·§5.5). `permission-groups` 스펙으로 확인.

---

## 10. 개발책임자 판단 필요 지점

**단 하나: 재발 방지 가드를 위해 design-system 을 건드릴 것인가(후보 B) vs 최소 변경 유지(후보 A)?**

- 이슈는 "`DataTable` 레벨에서 actions 컬럼은 hidden 불가 가드를 두면 재발이 막힌다"를 제안. 이는 **후보 B**(design-system `'action'` 값 신설 또는 dev-time 가드)라야 근본 실현된다. 비용 = design-system 변경 → **전체 Playwright mock 회귀 스위트 의무 + dist 선빌드 + 카드 좁은폭 스냅샷 신설**(범위·시간 확대, 56 소비처 blast radius 검증).
- 후보 A(기본 계획)는 최소 변경으로 **도달성 결함을 완전히 해소**하고, 재발 방지는 §8.4 경량 정적 테스트(design-system 무변경)로 부분 확보한다. 단 DataTable 레벨의 강한 가드는 없다.
- 기획 권고: **후보 A 로 착수**(최소 변경·기존 관례 재사용·blast radius 0). DataTable 레벨 강가드가 정책적으로 필요하다는 판단이면 후보 B를 별도 결정으로 승격(범위·게이트 비용 수용). 두 후보 모두 U-gate(§7)는 동일하게 충족.

---

## 부록 — 6화면 동질/이질 요약

- **동질(수정 메커니즘)**: 6화면 모두 "조작 컬럼 `mobilePriority: 'hidden'` → 도달 가능한 값" 한 줄 교체로 해결. 일괄 처리 가능.
- **이질(조작 성격, 검증 시 유의)**:
  - #1·#2 = 다중 상태전이 버튼(전폭 렌더 유리, 가로폭 유의).
  - #3 = 개명+삭제 2버튼(빌트인 잠금 비활성 상태 보존 필수).
  - #4·#5 = 단일 조건부 전기(DRAFT only, POSTED 빈 셀).
  - #6 = 단일 조건부 차단해제 or "MASTER 전용" 텍스트 분기.
  - → 수정은 동일하되 **도달성 테스트·라이브QA 는 화면별 조건(다중/조건부/권한분기)을 각각 커버**해야 한다.
