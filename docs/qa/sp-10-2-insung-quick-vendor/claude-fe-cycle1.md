# SP-10-2 FE 리뷰 — claude-fe-cycle1

**PR**: #245 `[FEAT] SP-10-2 인성데이타 퀵프로그램 vendor 통합 (W10-2)`
**Head**: `f82a5ad5`
**리뷰어**: Claude FE agent (cycle 1)
**작성일**: 2026-05-19

---

## 총평

FE 코드 7개 파일 전체 검토 완료. 신규 컴포넌트 0건 (Spinner design-system 재사용 확인). 타입 안전성, UUID 비공개 원칙, 접근성 기본 구현 모두 양호. P1 결함 1건 (sandbox banner testid 불일치), P2 결함 3건 발견.

---

## 검토 항목별 결과

### 1. tokens.css `--color-insung-*` 6종 light + dark

**결과: 통과**

- light `:root` 블록 6종 (`--color-insung-primary`, `-50`, `-100`, `-200`, `-700`, `-text`) 정상 추가 확인.
- `tokens/index.ts`의 `colors.insung` JS 객체와 CSS variable 값 1:1 일치.
- WCAG 대비비 직접 계산:
  - light: `--color-insung-text(#431407)` on `--color-insung-50(#FFF7ED)` = **14.74:1** (AAA 7:1 기준 초과, PR 본문 10.2:1 기재는 보수적 표기이나 실제 더 높음).
  - dark: `--color-insung-text(#FDBA74)` on `--color-insung-50(#2C1A07)` = **9.90:1** (AAA 충족).
- SP-09 vendor 패턴 (NTS/Aligo/Clova/KFTC) 일관성 확인.
- 색조 105° 분리 — 색맹(deuteranopia) 시각 구분 가능.

**[P2] dark mode `--surface-subtle` 오버라이드 누락**

`InsungLbsPanel` 패널 배경(`background: var(--surface-subtle)`)이 dark mode에서 light 값(`#F4F6F8`)을 그대로 사용한다. `tokens.css`의 `html[data-theme="dark"]` 블록에 `--surface-subtle` 오버라이드가 없기 때문이다. 다크 모드 활성화 시 패널 배경이 white에 가까운 색으로 남아 dark UI 내에서 시각적 부조화가 발생한다. 현재 `arologis-desktop`이 dark mode를 프로덕션 사용하는지 여부에 따라 우선순위 조정 가능하나, `InsungLbsPanel`만이라도 `--color-neutral-100`(dark override 존재) 등 실존 dark 토큰으로 대체를 권장한다.

---

### 2. VehicleMatchStatusBadge

**결과: 통과 (testid 3종 확인)**

- 4 상태 (PENDING/MATCHING/ASSIGNED/DELIVERED) 색상 토큰: Designer tokens.md §1 표와 1:1 일치 확인.
- `data-testid="vehicle-match-status-badge"` (line 199), `"insung-vendor-badge"` (line 230), `"match-status-driver-code"` (line 241) 3종 부여 확인.
- MATCHING 상태 `aria-live="polite"` 적용 확인 (line 197). PENDING/ASSIGNED/DELIVERED는 `aria-live` 미적용 — 정책 준수.
- `Spinner` design-system `@samhan/design-system` import 확인, `tone="var(--color-brand-500)"` `size="sm"` 사용 — Spinner 인터페이스(`SpinnerProps.tone?: string`, `SpinnerProps.size?: SpinnerSize`) 완전 호환.
- INSUNG 뱃지 표시 조건: `MATCHING || ASSIGNED` — wireframe 2-2/2-3 일치.
- UUID 비공개: `driverCode` prop 타입 주석에 "UUID driverId 는 전달 금지" 명시, `vendorOrderId` tooltip에만 노출.
- `vendorOrderId` tooltip: `title` HTML 속성 사용 — hover 동작하나 모바일/키보드 접근 불가 한계는 현 desktop-only 스코프에서 허용 가능.

---

### 3. InsungLbsPanel

**결과: 통과 (P2 1건)**

- testid 5종: `"insung-lbs-panel"` (line 314), `"gps-source-row-insung-lbs"` / `"-app-gps-active"` / `"-app-gps-background"` / `"-manual"` (SOURCE_TESTID 상수 line 62-67), `"gps-stale-warning"` (line 250) 전체 확인.
- `data-active="true"/"false"` attribute 부여 확인 (line 167).
- stale 60초 (`STALE_THRESHOLD_MS = 60_000`) 기준 준수.
- `useEffect` + `setInterval(1000)` 실시간 경과 — cleanup `clearInterval` 적용, memory leak 없음.
- GPS source 우선순위 정렬 (`SOURCE_PRIORITY` 상수 기반 sort) — Plan §3 FE-2 spec 일치.
- `gps-active-source-label` testid (line 374) 실존하나 QA spec comment에 "미반영 → 텍스트 검증으로 대체"로 기재됨. 향후 QA spec이 해당 testid를 직접 참조 가능하도록 정합 권장 (P2).

**[P2] `--surface-subtle` dark mode 이슈 (상기 tokens 항목과 동일)**

---

### 4. DispatchDetailPage

**결과: P1 결함 1건**

**[P1] sandbox banner testid 불일치**

FE 구현값: `data-testid="insung-sandbox-banner"` (DispatchDetailPage.tsx line 377)
QA spec 참조값: `data-testid="sandbox-banner"` (sp-10-2-insung-quick-vendor.spec.ts line 257, 316)

QA spec 주석(line 14)에도 `"sandbox-banner"` 로 기재되어 있다. Playwright `page.locator('[data-testid="sandbox-banner"]')`는 FE DOM에서 매칭되지 않으므로 QA-1/QA-2 테스트가 false green 없이 실패할 것이다. 어느 쪽을 정규값으로 할지 결정 후 FE 또는 QA spec 한 쪽을 수정해야 한다.

권장: `"insung-sandbox-banner"` 를 정규값으로 채택하고 QA spec을 수정 (FE 기존값 보존, QA spec만 변경으로 영향 최소화).

- testid 7종 중 나머지 6종 (`notify-row-{channel}`, `notification-result-section`, `notification-status-chip-{success/failed/delayed}`, `notification-fail-reason`, `notification-masked-phone`, `channel-badge-{channel}`, `dispatch-detail-page`) 전체 확인.
- `NotifyStatusChip` FAILED 상태 errorCode 치환 로직: `NOT_CONFIGURED`, `API_KEY` 포함 시 → "설정 오류 — 관리자 문의" 치환 확인. 내부 시스템 오류 코드 사용자 노출 차단.
- `SandboxBanner` — `role="status"` + `aria-live="polite"` 적용 확인 (DispatchDetailPage.tsx line 456-457).
- `formatSentAt` — 오늘 날짜는 `HH:MM`, 다른 날짜는 `YYYY-MM-DD HH:MM` 포맷. Date 연산 정상.

---

### 5. routes/index.tsx 라우터 mount

**결과: 통과**

- `/dispatches/detail/:dispatchCode` — `DispatchesLayout` children 배열에 정상 mount (line 66).
- `DispatchDetailRouteWrapper` — `useParams<{ dispatchCode: string }>()` 사용, `void dispatchCode` 컴파일 경고 억제 확인.
- `detail/:dispatchCode` 경로가 `DispatchesLayout` nav `links` 배열에 포함되지 않아 사이드바 메뉴 변경 없음 확인 (DispatchesLayout diff 없음).
- `dispatch={null}` 전달 → 로딩 메시지 표시 — QA mock 주입 방식 지원.

---

### 6. maskPhone util

**결과: 통과**

- 010 11자리 하이픈 있음/없음 양방향 처리 확인.
- 010 아닌 번호 fallback `***-XXXX-{last4}` 처리 확인.
- `null`/`undefined`/빈 문자열 → "번호 없음" 반환.
- 4자리 미만 digits → `***-XXXX-****` 안전 fallback.
- 개인정보 보호 원칙 (feedback_uuid_no_user_visibility.md 연장 적용) 준수.

---

### 7. design-system 신규 컴포넌트 0건 확인

**결과: 통과**

- `clients/web/design-system/src/` 변경: `tokens/index.ts`, `tokens/tokens.css` 2개 파일만.
- Spinner, Button, Input 등 기존 컴포넌트 수정 없음.
- `feedback_integrated_pr_pattern.md` 가드 준수.

---

### 8. arologis-mobile 영향 0 확인

**결과: 통과**

- `clients/mobile-staff/` 변경 파일 없음.
- PR 변경 파일 목록에 `clients/desktop/` (Samhan Public desktop) 변경도 없음.
- `clients/arologis-desktop/` 단독 변경.

---

### 9. typecheck/lint/build PASS 확인

**결과: 추정 통과 (직접 실행 불가)**

- 모든 import 타입 추적 가능: `@samhan/design-system`(Spinner), `lucide-react`, `react-router-dom`, `react`.
- `CSSProperties` import (`import type { CSSProperties } from 'react'`) 적절.
- `JSX.Element` 반환 타입 명시 전체 함수 확인.
- `any` 미사용 — strict mode 준수.
- PR 본문 "typecheck/lint/build PASS" 선언 수용.

**[P2] DispatchDetailPage `usePageTitle` import 경로 주의**

`../../hooks/usePageTitle` 상대 경로 import. main 브랜치 기준 `clients/arologis-desktop/src/renderer/hooks/usePageTitle.ts` 실존 확인. 신규 파일이 아니므로 문제 없음.

---

## 결함 요약

| # | 심각도 | 위치 | 설명 | 권장 조치 |
|---|---|---|---|---|
| D-1 | **P1** | `DispatchDetailPage.tsx` line 377 vs QA spec line 257/316 | sandbox banner testid 불일치: FE `"insung-sandbox-banner"` ↔ QA spec `"sandbox-banner"` | QA spec을 `"insung-sandbox-banner"`로 수정 |
| D-2 | P2 | `InsungLbsPanel.tsx` line 316 + `tokens.css` dark 블록 | `--surface-subtle` dark mode 오버라이드 없음 → dark UI에서 패널 배경 #F4F6F8 유지 | `InsungLbsPanel`에서 `--color-neutral-100` (dark override 존재) 으로 교체 또는 tokens.css dark 블록에 `--surface-subtle` 추가 |
| D-3 | P2 | QA spec 주석 line 31 | `gps-active-source-label` testid 실존하나 QA spec이 "미반영 → 텍스트 검증 대체"로 기재. spec 정합 누락 | QA spec에 `[data-testid="gps-active-source-label"]` locator 직접 추가 |
| D-4 | P2 | QA spec 주석 line 26-30 | `channel-badge-insung-talk`, `channel-badge-aligo`, `notification-masked-phone`, `insung-lbs-panel` 4종 — FE 실존하나 QA spec이 "미반영"으로 처리 | cycle 2에서 QA spec testid locator 추가 |

---

## FE 영역 합격/불합격 판정

| 항목 | 판정 |
|---|---|
| tokens.css 6종 light + dark | 통과 |
| VehicleMatchStatusBadge testid 3종 + aria | 통과 |
| InsungLbsPanel testid 5종 + data-active | 통과 |
| DispatchDetailPage testid 7종 | **P1 결함** (sandbox-banner 불일치) |
| routes/index.tsx 라우터 mount | 통과 |
| maskPhone util | 통과 |
| design-system 신규 컴포넌트 0건 | 통과 |
| arologis-mobile 영향 0 | 통과 |
| typecheck/lint/build | 추정 통과 |

**cycle 1 결론**: P1 1건 (sandbox banner testid 불일치) 수정 필수. P2 3건은 cycle 2 fix 권장.
