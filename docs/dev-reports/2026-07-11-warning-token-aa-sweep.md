# warning 색 토큰 AA 회귀 sweep (#784)

- **일자**: 2026-07-11 (집PC)
- **PR**: #784 `fix/warning-token-aa`
- **연관**: #776(CSS var 토큰 fallback 함정) 후속
- **워크플로우**: 표준 Opus(PM)+Codex 캐논 — Design 정찰 → Codex 구현 → Opus 5-agent → 라이브 QA → Codex 5-agent → PM 종합 → 머지

## 배경 — #776 교훈의 잔존 회귀
`var(--token, #fallback)`은 토큰이 정의돼 있으면 **fallback이 아니라 토큰값을 렌더**한다([[feedback_css_var_token_not_fallback]]). design-system `tokens.css`에 `--color-warning-700: #B47A1F`가 정의돼 있어, `var(--color-warning-700, #b45309)`는 fallback #b45309(AA 5.02)가 아니라 **#B47A1F(on-white CR 3.66)**를 렌더 → WCAG AA 정상텍스트(4.5) 미달. 토큰화가 대비 회귀를 일으킨 상태가 desktop/arologis-desktop 전반에 잔존했다.

## 정찰 (Design) — 토큰 실값 기준 AA 계산
| 텍스트 토큰 | 렌더값 | 대표 배경 | CR | 판정 |
|---|---|---|---|---|
| `-700` | #B47A1F | 흰색/-50/neutral-50/brand-50/state-warning-bg | 3.28~3.66 | ❌ FAIL |
| `-500` | #E9A53D | row bg | 1.94~2.12 | ❌ FAIL(최악) |
| `-600` | (미정의) | 테이블셀 | invalid→inherit | ⚠️ no-op 결함 |
| **`-800`** | **#8C5C13** | 흰색/-50 | **5.35~5.74** | ✅ PASS |

`-700`은 저장소 전수에서 **100% 텍스트 용도**(border/bg 0건) → 사용처별 `-700→-800` 교체가 장식을 깨지 않고 안전. 토큰값 자체 변경은 700/800 스케일을 붕괴(설계결정)시켜 부적절.

## 변경 (13파일 20건 · 텍스트 색만 · `var(--color-warning-800, #8C5C13)`)
- 패턴 A(17건): `color: var(--color-warning-700, …)` 텍스트 → `-800`.
- 패턴 B(1건): `InsungLbsPanel:239` GPS stale 타임스탬프 `-500`(CR 1.94) 삼항 stale 분기 → `-800`.
- 결함 복구(1건): `InboundInspectionDialog:433` 부족수량 강조 `-600`(**미정의→inherit no-op**) → `-800`(AA-safe 텍스트로 최초 활성화).
- fallback도 `#8C5C13`로 통일(토큰 미정의 시에도 동일 렌더·#776 재발 차단).
- **유지(무변경)**: border(`-200/-300`)·background(`-50`)·box-shadow inset(`-500`)·아이콘(`-400/-500`)·design-system `tokens.css` 값.

## 리뷰 — Opus 5-agent 전원 PASS(blocking 0)
- **Design(AA primary)**: 20건 실배경 코드 추적→#8C5C13 CR 재계산 = **전부 AA(4.5) 통과**(최저 5.16·InboundInspection:126 `state-warning-bg`). 역방향 회귀 0(배경 전부 근백색 -50 스케일)·삼항 3건 정확·장식/아이콘/legend-dot 무오염·누락 0.
- **FE**: 20/20 byte-identical 순수 값 치환·삼항 의도분기만·문법 무결·장식 무오염·typecheck 안전.
- **BE**: services/** 표면 0.
- **DevOps**: CI `frontend-desktop`(1m30s)·arologis `desktop`(1m6s) typecheck 잡 이 SHA서 실제 PASS·인프라 0·base=main.
- **QA**: 회귀 표면 0 반증·다크모드 리스크 실측 배제(양 앱 data-theme 0건·도달불가)·대표 캡처 계획.

## 라이브 QA — 실서버 GUI (mock OFF·게이트웨이 :8080·arologis :8097·렌더러 :5191/:5291·dev_master)
개발책임자 "전 화면 strict 실캡처" 지시(2026-07-11)에 따라 **before(main)/after(브랜치) 실 GUI 대조**. Playwright real-qa(`clients/desktop/playwright/warning-token-aa-real-qa/`):
- **A. Aligo 주소록 배너**(`AligoAddressBookPage:148`, 무조건 렌더): warning-50 배경 안내문이 before 밝은 amber(#B47A1F) → after 진한 갈색(#8C5C13).
- **B. 권한 매트릭스 "생성"/"수정" 헤더**(`PermissionMatrixPage:621,628`): 딕셔너리 `headerColor` 패턴(SUMMARY_FG/CHIP_FG 등 4+파일 대표) before/after 대조.
- **C. 입고검수 다이얼로그**(`InboundInspectionDialog:126,433`): PENDING 검수를 실서버에 시드(get-or-create·slip 2026/03/31-1)→투명 롤백. 라인1 검수수량 99(예정 초과)→**DiffBadge ▲+89 warning-800(126)**, 타 라인 정상수량 0<예정→**433 warning-800**(구 `-600` 미정의 no-op 결함이 실제 활성화됨) 동시 시연.
- 700→800은 음영차라 육안은 미묘하나 **AA는 3.66→5.35로 유의미** → Design/QA의 독립 CR 계산이 권위.

### arologis D/E — 선존재 크래시로 라이브 렌더 차단 (개발책임자 승인: 버그 분리 + 계산-AA 커버)
strict 캡처를 위해 arologis 하네스를 신규 구축(렌더러 `vite.renderer.dev.config.ts`+프록시 rewrite `/api/arologis/**`→`/admin/arologis/**`·admin 인증·실데이터 200 도달)했으나, **`NotifyResultSection`(DispatchDetailPage.tsx:185)가 undefined notify 데이터에 `.length` 크래시**(React 에러바운더리 "Unexpected Application Error")로 DispatchDetailPage 자체가 브라우저 렌더 불가 — **warning-token PR과 무관한 선존재 arologis 버그**. 5개 arologis 사이트(전부 이 페이지)는 **동일 글로벌 토큰 + Design 계산-AA(5/5 통과)**로 커버하고, arologis 버그는 별도 이슈로 분리(개발책임자 결정 2026-07-11). 부수 발견: 렌더러 `/api/arologis/dispatches/{id}` 경로가 standalone에 미매핑(프로덕션 리버스프록시 의존)·예외핸들러 404→500 오매핑.

## 스코프 밖(후속 분리)
1. **NotificationHistoryPage SeverityBadge** — INFO/WARNING/CRITICAL 3종 solid bg+흰텍스트 패밀리(CR 최저 2.12, 이번 PR보다 더 심각) → 뱃지 패밀리 홀리스틱 재설계 필요. **후속 우선순위 HIGH**.
2. **다크모드 latent** — 다크 테마 warning 스케일 오버라이드 부재(현재 양 앱 data-theme 미배선·도달불가). 다크 팔레트=설계결정.
3. `AuditOverlaySection:140` fallback #92400E 잔재(패스 사이트·hygiene) · `DriverManagementPage` 비존재 토큰명 · 재발방지 lint/alias.
4. arologis-desktop real-qa 하네스 구축(renderer vite config + arologisAuth 스텁).

## 검증
`clients/desktop`·`clients/arologis-desktop` 각 `npm run typecheck` EXIT 0. diff = 20 insertions/20 deletions(순수 값 치환).
