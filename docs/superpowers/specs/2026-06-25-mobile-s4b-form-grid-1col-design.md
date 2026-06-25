# 모바일 슬4b — 입력 폼 1열 (공용 FormGrid) 설계

> 모바일 에픽 ②(데스크탑 렌더러를 반응형 웹/모바일로) 슬4b. 슬1(인증 추상화+웹배포 #596)·슬2(반응형 셸 Drawer #597)·슬3(DataTable 카드화 #598)·슬4a(Modal 풀스크린 #599) 머지 후속.
>
> 설계 확정 = 2026-06-25 brainstorming(개발책임자). 본 spec/plan = canonical ① 기획. 구현 = Codex 전담([[feedback_codex_sandbox_git]]).

## 1. 목표

데스크탑/모바일 공용 입력 폼의 **다열 레이아웃이 모바일(≤768px)에서 1열로 자동 전환**되도록, 공용 반응형 `<FormGrid>` 컴포넌트를 design-system에 신설하고 핵심 입력 폼(3~5개)을 이관한다. 데스크탑(>768px) 2열 무회귀.

## 2. 배경 — 정찰 결론 (슬3/4a와 다름, 중요)

- 공용 `FormField`(design-system, 21사용)는 **단일 필드 래퍼**(label + render-prop 컨트롤 + hint/error 세로 스택)일 뿐 — 다열 레이아웃 책임 없음. (`FormField.tsx` 확인.)
- 다열 폼 레이아웃은 **화면별 인라인 `style={{ display:'grid', gridTemplateColumns:'1fr 1fr', ... }}`** 로 흩어져 있음 — **64파일 93곳**(grep `gridTemplateColumns`, 핸드오프 "~96곳" 정찰 확정). 공용 폼-그리드 컴포넌트 **없음**.
- ⚠️ **인라인 스타일은 CSS `@media`로 덮을 수 없다** → 슬3(DataTable)·슬4a(Modal)식 "공용 1변경 → 전 화면 자동전환" 레버리지 **불가**. 공용 `FormGrid` 신설 + 인라인 → 컴포넌트 이관이 유일한 구조적 해법.

## 3. 설계

### 3.1 공용 `<FormGrid>` (design-system 신규)

위치: `clients/web/design-system/src/components/FormGrid/` (FormGrid.tsx + FormGrid.module.css + FormGrid.stories.tsx), `index.ts` export.

**API**
```ts
export interface FormGridProps {
  /** 데스크탑(>768px) 열 수. 기본 2. ≤768px 는 항상 1열(@media). */
  columns?: number
  /** 행/열 gap 토큰 override. 기본 design token. */
  gap?: string
  children: React.ReactNode
  className?: string
}
export function FormGrid(props: FormGridProps): JSX.Element
/** 전폭(주소/설명 등) 필드 — grid-column: 1 / -1 로 모든 열 span. */
FormGrid.Full: React.FC<{ children: React.ReactNode; className?: string }>
```

**🔑 반응형 핵심 (함정 회피)**: 열 수를 **인라인 `gridTemplateColumns`로 주면 @media가 못 덮는다**. 따라서:
- module.css 기준 규칙: `grid-template-columns: repeat(var(--fg-cols, 2), minmax(0, 1fr));`
- `columns` prop 은 **CSS 변수만** 주입: `style={{ ['--fg-cols' as string]: String(columns) }}` (grid-template-columns 직접 지정 금지).
- `@media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }` — @media 가 grid-template-columns 를 **리터럴로 직접 지정** → 변수 기준 규칙을 무력화, 인라인 변수와 충돌 없음(서로 다른 property). ≤768px 1열 강제.
- `minmax(0, 1fr)` — 긴 콘텐츠(자동완성/긴 값)가 열을 넘쳐 깨지는 것 방지(슬3 "긴값 줄바꿈" 교훈 계열).

**gap**: 기본 `var(--space-4)` (행) / `var(--space-3)` (열) 토큰. `gap` prop 으로 override 가능.

**FormGrid.Full**: `<div className={styles.full}>` 에 `.full { grid-column: 1 / -1; }`. 1열 모드에서도 정상(전폭).

### 3.2 핵심 입력 폼 이관 (focused 3~5개)

인라인 `'1fr 1fr'` / `repeat(2, 1fr)` grid wrapper → `<FormGrid>` 로 교체(자식 FormField/필드 그대로). 전폭 필드(주소/비고/설명)는 `<FormGrid.Full>` 로 감싼다. ※ 현재 라인번호는 핸드오프 기준(approx) — 구현 시 각 파일 `gridTemplateColumns` grep 으로 실위치 확정.

| # | 화면 | 파일 | 비고 |
|---|---|---|---|
| 1 | 거래처 등록 | `clients/desktop/src/renderer/routes/admin/PartnerCreatePage.tsx` | 신규 등록 폼 |
| 2 | 거래처 상세 편집 | `clients/desktop/src/renderer/routes/admin/PartnerDetailDialog.tsx` | grid 2곳 |
| 3 | 창고 편집 | `clients/desktop/src/renderer/components/EditWarehouseModal.tsx` | 모달 내 폼 |
| 4 | 공급자 설정 | `clients/desktop/src/renderer/routes/accounting/SupplierProfilePage.tsx` | grid 3곳 (공급자정보/계좌) |

(5번째 후보 = 견적/주문 폼 중 1개 — 구현 단계 판단. 무리하지 않음.)

### 3.3 범위 밖 (후속 슬4b-2+)

- 나머지 ~88곳 인라인 grid 점진 이관 (전표/회계/그룹웨어/배차 등). 슬4b는 **공용 컴포넌트 신설 + 핵심 폼 검증**에 집중.
- 와이드 회계보고서(~7) / 원시 table(권한매트릭스) 모바일 — 슬3 MAJOR 이월, 별도 슬라이스.
- 상세 페이지 반응형(10) — 별도.

## 4. 제약 (Global Constraints)

- **FE-only · design-system + desktop 렌더러.** BE/Flyway **0 변경**.
- **데스크탑(>768px) 무회귀 최우선** — 2열 레이아웃·간격 시각 불변. Electron(window.samhanAuth) 거동 무관(CSS-only).
- 한국어 Javadoc/주석/커밋/PR [[feedback_korean_commits]].
- design-system 우선 — 자체 컴포넌트 신규 작성 금지(FormGrid 가 그 공용 컴포넌트). 이관 화면은 기존 FormField/Input/Select 재사용.
- typecheck = `npm run typecheck` (tsconfig.node+web) [[feedback_desktop_typecheck_command]]. design-system 변경 후 `npm run build`(design-system dist) 갱신.
- **mock gate(CI) 통과 필수** — 신규 라우팅/플랫폼 분기는 아니나 design-system dist 변경 → desktop mock suite 재검증 [[feedback_platform_branch_build_time_flag]].
- 라이브 QA = 실서버·실캡처만 [[feedback_no_fake_data_ever]] [[feedback_qa_docker_real_test]]. **매 리뷰 라운드 귀속**(구현단계 독립 Task 금지) — 각 라운드 fix 후 그 fix 라이브 재캡처가 게이트.

## 5. 검증 (Acceptance)

1. **데스크탑 무회귀**: 이관 4폼이 >768px 에서 기존과 동일 2열 — 시각 비교 캡처.
2. **모바일 1열**: 이관 4폼이 ≤768px(390px viewport) 에서 1열 세로 스택, 가로 overflow 0 — 실 캡처.
3. **전폭 필드**: 주소/비고 등이 1열·2열 모두 전폭 유지.
4. **단위/타입**: FormGrid RTL 테스트(children 렌더·`--fg-cols`·Full class) PASS, `npm run typecheck` 0, design-system + desktop 빌드 성공.
5. **mock gate**: desktop mock suite green(56화면 무회귀 포함).
6. **CI green** + GitGuardian(dev 시드 FP 선례).

## 6. 워크플로우 (canonical 8단계 [[feedback_canonical_workflow]])

① 기획(본 spec+plan) → ② 조기 PR(OPEN, draft 금지) → ③ Codex 구현 → ④ Opus 5차원 리뷰+fix+**라이브 재캡처** ↔ ⑤ Codex 5차원+fix+**라이브 재캡처** (0수렴까지) → ⑥ PM 종합 → ⑦ CI green(mock gate) → ⑧ PM 자율 머지([[feedback_pm_auto_merge_authority]]). 🚨 매 단계 ScheduleWakeup 자각 + gh pr checks 재조회([[feedback_autonomous_loop_schedulewakeup]]). 🚫 Opus 임의구현 금지(Codex 전담).
