# Designer/UX 리뷰 — PR #316 권한 매트릭스 UI (cycle 1)

> 리뷰어: Claude Designer (정적 코드/레이아웃 리뷰, 실 브라우저 캡처는 QA 담당)
> 대상: `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`,
>       `clients/desktop/src/renderer/routes/PermissionMatrixBulkPage.tsx`,
>       `clients/desktop/src/renderer/components/AppLayout.tsx`
> 대조: `clients/web/design-system` (Button/Badge/Spinner/Select/Input/Modal/DataTable/Tabs/ProgressBar) + `tokens.css`
> 작성일: 2026-05-28

## 종합 판정

**APPROVE (조건부)** — 평탄 매트릭스의 핵심 UX(7-action 풀라벨 헤더, 행/열/도메인 일괄, 검색,
sticky 변경패널 + 미리보기 wizard)는 spec §7 을 충실히 구현했고 디자인 토큰(`--color-*`/`--space-*`/`--radius-*`)을
일관 인용한다. UUID 비공개 원칙도 준수(계정 셀렉터 value 에만 UUID, 화면 노출 X). 다만 **P1 2건**
(bulk grants 모드가 173 중 12 page 만 타깃 가능 / 파괴적 일괄 토글이 native `window.confirm` 으로 처리되어
DS Modal 미사용 + 미리보기 부재)과 일관성/접근성 Minor 다수가 있어 cycle 내 보강을 권고한다.
P0 없음.

---

## P1 (cycle 내 보강 권고)

### P1-1. bulk wizard "명시(grants)" 모드 — 173 page 중 12 page 만 선택 가능
- 위치: `PermissionMatrixBulkPage.tsx` L41-54 `PAGE_OPTIONS` (12개 하드코딩), L455-468 page `<select>`.
- 내용: 단일 매트릭스(`PermissionMatrixPage`)는 `PAGE_GROUPS` 로 173 PageCode 전부 다루는데,
  일괄 wizard 의 grants 모드는 도메인별 대표 1개씩 12 page 만 노출한다. 사용자가 "여러 계정에 특정 page×action 부여"
  하려는 본래 목적(spec §7-3 "단일 page × action 설정")을 12 page 밖에서는 달성할 수 없다.
  발견성 측면에서도 "왜 내가 쓰던 page 가 목록에 없지?" 혼란을 유발한다.
- 권고: `PermissionMatrixPage` 의 `PAGE_GROUPS`/`PAGE_LABEL` 를 공용 모듈로 추출해 양 화면이 동일한 173 page 소스를
  공유(검색 가능한 도메인 그룹 `<optgroup>` 또는 동일 검색 input). 최소한 `PAGE_OPTIONS` 가 부분집합임을 UI 에 명시하거나
  template 모드를 기본으로 안내.

### P1-2. 파괴적 일괄 토글이 native `window.confirm` — DS Modal 미사용 + 영향 미리보기 부재
- 위치: `PermissionMatrixPage.tsx` 컬럼 토글 L771 만 confirm 사용. 행 `[전부]`(L762 `toggleRow`),
  도메인 `[전체ON]/[전체OFF]`(L1017 `onDomainSet`), 툴바 `전체ON/전체OFF`(L896/903)는 **확인 없이 즉시** 다수 셀 변경.
  계정 변경/템플릿/복사(L792/799/805)는 native `window.confirm`.
- 내용: (1) spec §7-2 는 컬럼/도메인/템플릿/복사 모두 "확인 모달 / 미리보기 → 확정"을 요구하나, 구현은
  컬럼만 confirm 이고 도메인 전체ON/OFF·툴바 전체ON/OFF·행 전부는 **확인 없는 즉시 대량 변경**이다(실수 방지 장치 불균일).
  (2) 확인이 있는 경로도 native `window.confirm` 이라 디자인 시스템에 `Modal`(focus trap/ARIA/토큰 스타일)이 있음에도
  비일관(OS chrome). spec §7-2 "템플릿 적용/복사 = 미리보기 → 확정"의 미리보기 단계도 부재(즉시 mutate).
- 권고: 도메인/툴바 전체ON/OFF 도 confirm 일관 적용(특히 OFF=대량 회수). 가능하면 native confirm → DS `Modal`
  (영향 N건 텍스트 포함)로 통일. 단일 매트릭스는 sticky 변경패널 + 저장 전 dirty 검토가 있어
  실 적용 전 되돌릴 수 있으나, 템플릿/복사/일괄은 즉시 서버 반영이므로 미리보기 우선순위가 높다.

---

## Minor

### M-1. 선택 계정 role Badge 가 영문 코드, 셀렉터는 한국어 라벨 — 표기 불일치
- 위치: `PermissionMatrixPage.tsx` L836 `<Badge variant="brand">{selectedAccount.role}</Badge>` (예: "MANAGER"),
  반면 L617 `accountOptionLabel` 은 `ROLE_LABEL[role]`("매니저")로 표시. Bulk 페이지 L380 는 한국어 라벨.
- 권고: 헤더 Badge 도 `ROLE_LABEL[selectedAccount.role] ?? role` 로 한국어 통일(혹은 양쪽 영문 통일).
  feedback_role_naming_full 은 "풀네임" 의무지만 화면 내 동일 항목의 한/영 혼용은 학습부담.

### M-2. 7-action 시각 그룹핑/범례 부재 — 한눈에 의미군 구분 약함
- 위치: `PermissionMatrixPage.tsx` thead L985-1001 (7 컬럼 동일 스타일 버튼).
- 내용: 풀라벨(VIEW/CREATE/UPDATE/DELETE/RESTORE/DOWNLOAD/PRINT)로 약어 혼동은 해소됐으나, 7개가 모두 동일 톤이라
  "조회(VIEW) vs 변경 3종(CREATE/UPDATE/DELETE) vs 특수(RESTORE/DOWNLOAD/PRINT)"의 의미군이 시각적으로 안 보인다.
  173행 × 7열에서 빠른 스캔 시 DELETE/DOWNLOAD 오클릭 위험.
- 권고: 의미군별 미세한 컬럼 배경 톤 또는 group separator(예: 변경 3종 묶음 헤더), 상단 1줄 범례. 색은 위험도 표현용으로
  DELETE 만 danger 계열 hover 등 가벼운 차등도 고려.

### M-3. ad-hoc 인라인 스타일 다수 — DS 컴포넌트/패턴 대비 비일관
- 위치: 양 페이지의 `matrixSelectStyle`/`matrixButtonStyle`/`selectStyle`/`panelStyle`/`toast` 인라인,
  raw `<select>`/`<input type=search>`/raw `<table>`.
- 내용: 기존 desktop 화면도 filter 에 raw `<select>` + 공용 `selectStyle` const 를 쓰는 선례가 있어(예
  `InventoryAuditListPage.tsx`) raw select 자체는 house 패턴 허용 범위. 다만 DS 에 `Select`/`Input`/`Modal`/`DataTable`
  이 존재하는데 toast·stepper·confirm·toolbar 까지 전부 인라인 1회용으로 재구현되어 토큰 drift/유지보수 부담.
  매트릭스 그리드는 비정형 grid 라 raw `<table>` 이 합리적(DataTable 컬럼 모델과 안 맞음) — 이건 수용.
- 권고: 최소 `<select>`→DS `Select`, 검색 input→DS `Input`, toast 는 공용 패턴으로 추출. stepper 는
  DS `ProgressBar`(10단계 stepper 컴포넌트) 재사용 검토. cycle 내 무리면 후속 정리 backlog 로 명시(단,
  no-backlog-strict 상 "단순 치환 가능" 항목은 cycle 내 우선).

### M-4. dark theme 에서 dirty/도메인 헤더 대비 미검증
- 위치: dirty 셀 `--color-warning-50`(L1171), 도메인 헤더 `--color-brand-50`(L1113). `tokens.css` dark 블록은
  `--color-warning-400`/`--color-brand-50`(neutral 만)만 override, `--color-warning-50` 은 light 값(#FEF6E7) 유지.
- 내용: desktop 이 `data-theme="dark"` 를 실제 노출하는지 확인 필요. 노출 시 dark 배경에 밝은 yellow-50 셀이
  대비 과다/이질. 미노출이면 무해.
- 권고: QA 가 dark 토글 가용 여부 확인. dark 사용 시 dirty 배경을 `--color-warning-400`/`-700` 계열 또는
  semantic alias 로 교체.

### M-5. bulk grants 모드 — action 0개 선택 시 안내 부재
- 위치: `PermissionMatrixBulkPage.tsx` L131 `selectedActionList.length===0 → payload null` → "미리보기" 버튼 disabled(L488).
- 내용: 버튼만 비활성화되고 "액션을 1개 이상 선택하세요" 힌트가 없어 사용자가 왜 진행 못 하는지 모름.
  template 모드 기본 1 view 선택과 달리 grants 전환 시 직관성 저하.
- 권고: disabled 사유를 helper text 로 노출(`FormField`/`Input` 의 hint 패턴 차용).

### M-6. wizard StepHeader 가 비대화형 단계 표시 — 뒤로 점프 불가(의도 확인)
- 위치: `PermissionMatrixBulkPage.tsx` L295-321 `StepHeader` (단순 표시), 이동은 각 step 의 이전/다음 버튼만.
- 내용: 단계 칩이 클릭 불가라 step3 미리보기에서 step1 로 직접 점프 불가(이전 2회). 4-step 단방향 흐름엔 무난하나,
  접근성상 단계 칩에 현재 단계 `aria-current="step"` 미설정.
- 권고: 칩에 `aria-current="step"`(active), 완료 단계는 클릭 점프 허용 검토(선택).

### M-7. 계정 셀렉터 변경 시 "행전체/검색" 컨텍스트 유지 안내 약함 + 빈 검색결과 처리
- 위치: `PermissionMatrixPage.tsx` `filteredPageGroups`(L621) 가 0건이면 thead 만 남고 본문 공백.
- 내용: 검색 미스 시 "결과 없음" empty state 가 없어 빈 표로 보임. 또 컬럼 토글 confirm 문구가
  "표시된 N개 페이지"라 검색 필터 중 일괄범위를 잘 설명하나, 검색 0건일 때 `visiblePages.length===0` →
  툴바 전체ON/OFF disabled 는 정상 동작.
- 권고: 검색 0건 시 표 본문에 "검색 결과가 없습니다" empty row 추가.

---

## 잘 된 점 (인정)
- 7-action 컬럼 헤더를 spec 의 약어(CRT/UPD/...) 대신 **풀라벨**로 렌더 → 약어 혼동 해소.
- 행 PageCode displayName + dot-code 2줄 표기로 식별성 양호(L1158-1160).
- UUID 비공개 준수 — 계정은 displayName/role 만 표시, UUID 는 `<option value>` 에만.
- sticky thead + sticky 행헤더(L1148 left:0) + sticky 툴바/변경패널 → 173행 스크롤 가독성 확보.
- 변경패널 dirty>0 시 warning-50 배경 + `role="status" aria-live="polite"`, toast `role="alert"` → 기본 ARIA 양호.
- 체크박스 `accentColor: --color-brand-500` + `aria-label`(page+action) → 브랜드 일관 + 스크린리더 식별.
- bulk 미리보기 영향범위 Badge(계정수/page범위/예상건수) + 계정별 적용내용 표 → 실수 방지 양호.
- 권한 관리 진입점 MASTER + `system.permission-admin`(view) 이중 fail-closed (AppLayout L306).
