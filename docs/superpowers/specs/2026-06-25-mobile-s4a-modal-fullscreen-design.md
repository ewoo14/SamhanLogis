# 모바일 에픽 슬4a — 공용 Modal 모바일 풀스크린 (설계)

> 작성: 2026-06-25 · 에픽: ② 모바일 · 상위: 슬3 DataTable 카드화(PR #598 머지 main `1d195b74`)
> 상태: brainstorming 설계 확정(개발책임자 슬4a Modal 선택 + ScheduleWakeup loop 진행) → spec 검토 후 writing-plans

## 0. 개발책임자 결정
- 슬4(폼·모달·상세)는 분할. **슬4a = 공용 Modal 풀스크린부터**(레버리지 최대, 슬3 DataTable 패턴 동일). 폼 1열=슬4b, 상세=슬4c.
- 카드처럼 **모달 모양은 라이브 QA 스크린샷으로 추후 보정**([[feedback_print_design_iteration]]).
- **매 단계 ScheduleWakeup loop 체크포인트**([[feedback_autonomous_loop_schedulewakeup]]).

## 1. 목표 / 비목표
**목표:** 공용 `Modal`(32화면 사용)을 ≤768px(`--bp-md`)에서 **풀스크린**으로 렌더 → 작은 화면에서 모달이 넘치거나(특히 size-xl `min-width:980px`) 가운데 작게 떠 쓰기 불편하던 것 해소. **데스크탑(>768px) 무변동.** FE-only·Flyway 0·CSS-only(Modal.module.css @media 한 블록, Modal.tsx 무변경).

**비목표(후속):** 입력 폼 1열=슬4b. 상세 페이지=슬4c. bottom-sheet 변형·모달별 맞춤 레이아웃=후속(필요 시). 슬4a는 공용 Modal 일괄 풀스크린.

## 2. 정찰 근거 (file:line)
- 공용: `clients/web/design-system/src/components/Modal/Modal.module.css` — `.backdrop`(fixed inset:0·flex center·padding var(--space-4)·z-index 1000) + `.dialog`(width:100%·max-height calc(100vh - space-8)·border-radius lg·flex column) + size variants `.size-sm`360 / `.size-md`520 / `.size-lg`720 / `.size-xl`1080·**min-width:980px** + `.header`(닫기 sticky 아님) / `.body`(overflow-y auto) / `.footer`(flex-end 액션·bg-subtle). **반응형 @media 없음**(있는 @media는 prefers-reduced-motion뿐).
- `Modal.tsx`: backdrop>dialog>header(title+closeBtn)/description/body/footer 렌더. focus trap·ESC·aria-modal 기존 보유(확인). **본 슬라이스 TSX 무변경**.
- 사용처: 32화면(버전이력 패널 4·각종 SaveDialog·조회/상세 다이얼로그·CSV업로드 등). 슬3 셸 ≤768px Drawer 적용됨.
- 문제: 390px 화면에서 `.size-md`(520)·`.size-lg`(720)·`.size-xl`(min-width 980)은 backdrop 패딩으로 width 제약돼도 min-width/콘텐츠로 넘쳐 가로 클립·작게 뜸.

## 3. 설계

### 3.1 방식 (CSS-only, Modal.module.css `@media (max-width: 768px)` 신규 블록)
- `.backdrop { padding: 0; }` — 풀스크린(가운데 패딩 제거).
- `.dialog { width: 100%; height: 100%; max-width: none; min-width: 0; max-height: 100vh; max-height: 100dvh; border-radius: 0; }` — **size-sm/md/lg/xl 전부 풀스크린**, `.size-xl min-width:980px` override(min-width:0)로 클립 해소. `100dvh`로 모바일 주소창 동적 높이 대응(폴백 100vh 선행).
- `.header { position: sticky; top: 0; background: var(--color-bg); z-index: 1; }` — 닫기(X) 항상 보임.
- `.body { flex: 1 1 auto; }` — 잔여 높이 채우고 스크롤(기존 overflow-y:auto 유지).
- `.footer { position: sticky; bottom: 0; border-radius: 0; padding-bottom: max(var(--space-3), env(safe-area-inset-bottom)); }` — 액션 버튼 항상 보임 + 노치 safe-area. border-bottom-radius 0(풀스크린).
- (정확한 변수/클래스명은 현 module.css 대조 후 정합. 데스크탑 규칙은 @media 밖 불변.)

### 3.2 효과
- 공용 Modal module.css 1블록 → **32개 모달 자동 풀스크린**(폼 모달·조회·상세·CSV·버전이력). 닫기·액션 고정으로 풀스크린에서도 조작 가능. 콘텐츠는 body 스크롤.

### 3.3 무회귀
- 변경 = `Modal.module.css`(+@media 블록) **1파일**. 데스크탑(>768px) `.backdrop/.dialog/.size-*/.header/.body/.footer` 규칙 불변(신규는 @media max-width:768px 한정). prefers-reduced-motion·애니 무수정. Modal.tsx·Storybook 데스크탑 무변동.

## 4. 검증 (라이브 QA, [[feedback_no_fake_data_ever]])
- **mock gate(Desktop Playwright)**: Modal 변경이 기존 32모달 mock spec(데스크탑 viewport) 무회귀 — 로컬 mock Playwright 필수([[feedback_platform_branch_build_time_flag]]). 신규 풀스크린 spec 1개(≤768px viewport 에서 모달 열기→dialog 풀스크린[viewport 채움]·헤더/푸터 보임).
- **라이브 QA(웹, 390px)**: 대표 모달 2~3개(예 버전이력 패널·조회 모달·SaveDialog) 풀스크린·헤더 닫기·푸터 액션·body 스크롤 실 캡처 → 개발책임자 전달 → 보정.
- **데스크탑 무회귀**: >768px 모달 중앙 카드 그대로 캡처.
- typecheck 0·build:web 0.

## 5. 리스크 / 완화
| 리스크 | 완화 |
|---|---|
| 데스크탑 모달 회귀(@media 누수) | 전부 @media(max-width:768px) 한정, >768px 단언(라이브·mock) |
| sticky header/footer가 일부 모달 커스텀 콘텐츠와 충돌 | body flex/overflow 기존 유지, 라이브 대표 모달 검증·스샷 보정 |
| 100dvh 미지원 브라우저 | 100vh 폴백 선행 선언 |
| 모달 내부 DataTable(슬3 카드) 중첩 | 슬3 카드 @media 그대로 작동(독립), 라이브 확인 |
| mock gate 회귀(슬3 교훈) | 로컬 mock Playwright + 풀스크린 spec 등재 |

## 6. 슬라이스 경계 (단일 PR)
슬4a = `Modal.module.css`(@media 풀스크린) + 풀스크린 mock spec + 라이브 QA(스샷 보정). Flyway 0·BE 무변경·Modal.tsx 무변경. 후속: 슬4b(폼 1열)·슬4c(상세)·bottom-sheet 변형.
