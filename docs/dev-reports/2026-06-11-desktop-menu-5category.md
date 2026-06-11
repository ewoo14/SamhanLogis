# 좌측 메뉴 5대분류 재편 + 접기/펼치기 (PR #462)

> 2026-06-10 개발책임자 결정 ([[project_item_exposure_and_menu_5cat]] §2 + 2-보강): 좌측 메뉴를 **판매/구매/회계/그룹웨어/인사 5대분류 + 배차(arologis)·창고 운영 별도(실질 7그룹)** 로 재편하고, **홈**을 최상단 신규 항목으로 둔다. 권한 있는 메뉴만 노출(기성 보존). 추가 요구로 하위 메뉴 **접기/펼치기** 도입.
> spec: [docs/superpowers/specs/2026-06-11-desktop-menu-5category-spec.md](../superpowers/specs/2026-06-11-desktop-menu-5category-spec.md)

## 설계 결정

- **IA 재배치(컴포넌트 이동·그룹핑)만** — 라우트·page-code·권한 로직 무변경(메뉴 위치/라벨만). 비정규 평면(대시보드/창고관리/판매관리/구매관리/영수증OCR/재고이동/링크발송/배차 top-level + 비정규 그룹)을 7그룹으로 정리.
- **권한 필터 = 기성 완료 보존** — 전 메뉴가 `usePermissions().canAccess(pageCode, action)`(동적 RBAC, SP-D1~D4) 게이트. 재구현 불요, 그룹 헤더 노출도 동일 단일 소스(`dynamicCanAccess`) 기반.
- **접기/펼치기 기본 = 접힘** — 과도 메뉴 최소화. 활성 라우트가 속한 그룹만 자동 펼침. 사용자가 토글한 상태는 `localStorage` 영속.
- **단톡방 매핑 = 그룹웨어 단일화** — 기존 인사 셸(AdminLayout)과 AppLayout 그룹웨어 양쪽 중복 노출을 그룹웨어 단일 경로로 통일.
- **주문서 승인(`/sales/order-approvals`) 보안 게이트** — FE 사이드바 노출(`showPartnerOrderList`)과 동일 page-code(`sales.partner-order.list`)로 라우트 PermissionGuard + **BE partner-auth-service controller @RequirePermission** 신설. 가드 전에는 권한 없는 인증 직원(WAREHOUSE/DISPATCH/INVENTORY 등)이 URL 직접 진입으로 거래처 승인변경·비밀번호 강제초기화가 가능했던 fail-open 결함.

## 목표 IA 구조 (상단 고정 2 + 7 그룹)

**상단 고정 (그룹 미소속, 항상 표시)**
- **홈** (`/`, `NavLink end`) — 기존 '대시보드' 라벨 폐기, "홈" 단독(전원 노출).
- **알림 내역** (`/notifications`) — 상단 유지.

| # | 그룹 | 주요 항목 |
|---|---|---|
| ① | 판매 | 판매관리 · 견적서 · 주문서 · 주문서 승인 · 거래처 관리 · DC 설정 · 발송금지 · 전표 정리 · 내일자 전표 이미지 · vendor 발주 OCR · 품목 관리 · 시트 동기화 |
| ② | 구매 | 구매관리 · 영수증 OCR · 재고이동 관리 · 입고 검수 · 재고 실사 · DPS 입고 비교 |
| ③ | 회계 | 매출·매입전표 · 계정과목 · 분개장 · 세금계산서(3종) · 시산표 · 재무 보고서 · 매출 마감 · 월말 마감 · 거래명세서 일괄 · 거래처 원장 · 홈택스 · 공급자 설정 · 입금 매칭 · 일마감 · 원장 + **회계 관리자**(중첩 토글 유지) |
| ④ | 그룹웨어 | 링크발송 · 알리고 주소록 · 단톡방 매핑 |
| ⑤ | 인사 | 인사 관리 · 권한설정 · 권한 일괄 적용 · 그룹 권한 · 권한그룹 관리 · 권한 위임 |
| ⑥ | 배차(arologis) | 배차 메뉴 · 수동 배차 · 가배차 분류 · 미배차 리스트 · 배차안내 SMS · 발송 이력 · 실배차 비교 · 배차지역 관리 · 배차 admin |
| ⑦ | 창고 운영 | 창고관리 · 재고 현황 · 안전재고 알림 · 보상 실패 복구 · 전표 수정 요청 · 사진 감사 |

> top-level 이동: 창고관리→⑦, 판매관리→①, 구매관리/영수증OCR/재고이동→②, 링크발송→④, 배차→⑥. 매출 마감 판매 중복 제거(회계 단일). 품목 관리/시트 동기화 → ① 판매(기존 비정규 그룹 통합).

## FE (clients/desktop)

| 항목 | 내용 |
|---|---|
| `AppLayout.tsx` | 7그룹 IA 재배치(7 `SidebarCategory`) + 홈·알림내역 상단 고정. 기존 `dynamicCanAccess`/`show*` 변수·page-code **보존(이동만)**. `SidebarLink`/`NavLink` 그대로 |
| `SidebarCategory({label, show, activeTargets, testId, children})` | 그룹 헤더를 **토글 버튼**(`SidebarGroupToggle`)으로 일반화. `show`(자식 권한 1개라도 true) false 시 그룹 헤더+자식 완전 미렌더. `open` 기본 false(접힘), 활성 라우트(`activeByRoute`) 시 `useEffect` 로 자동 펼침. `localStorage['samhan.sidebar.group.<label>']` 영속(`readSidebarGroupOpen`/`writeSidebarGroupOpen`, 접근 차단 환경 try/catch 폴백). 접근성 = `role=heading`/`aria-level=2` + `aria-expanded`/`aria-controls` + `role=group`/`aria-labelledby`. 회계 관리자 중첩 토글 유지 |
| 그룹 OR 보정 | `showAccounting` OR 에 세금계산서 batch/inbound 추가(해당 권한 단독자 회계그룹 숨김 갭). `showAdminHrGroup` 에서 고아 `admin.users` 제거(빈 인사그룹 방지). `showArologisGroup = showDispatchBoard ‖ showArologis ‖ showRegionMgmt`(배차지역 단독 권한자 그룹 숨김 갭 해소) |
| 라벨 정정 | 배차 그룹 라벨 `arologis`(코드명) → **'배차'**(업무 라벨). 홈 = '대시보드' → '홈' |
| `AdminLayout.tsx` | 단톡방 매핑 `AdminNav`(`admin-nav-chat-rooms`) 제거 → 그룹웨어 단일화(인사 사이드바 7→6 entry). 라우트·권한 가드 유지 |
| `routes/index.tsx` | `/sales/order-approvals` 를 `PermissionGuard pageCode="sales.partner-order.list" action="view"` 로 래핑(사이드바 노출↔진입 역전 갭 차단) |

## BE — 주문서 승인 보안 게이트 (services/partner-auth-service)

| 항목 | 내용 |
|---|---|
| `PartnerApprovalsController` | 3 endpoint @RequirePermission(`sales.partner-order.list`): 목록=VIEW, 상태변경(PATCH)/비번초기화(POST)=UPDATE. `partnerSelfService` 미지정(기본 false → 거래처 본인 deny). FE 사이드바 게이트(`showPartnerOrderList`)와 page-code 정확 일치 |
| `build.gradle` | `implementation project(':shared:security')` 의존 신설 — `PermissionAspect`/`RequirePermission`/`DefaultDynamicPermissionClient` 사용 |
| `DynamicPermissionClientConfig`(신규) | `DynamicPermissionClient` bean 명시 등록. 본 서비스에 `loadBalancedRestClientBuilder` bean 부재 → `PermissionSecurityAutoConfiguration#defaultDynamicPermissionClient`(@ConditionalOnBean) 비활성 → bean 부재 시 aspect 가 fail-secure 로 **전 직원 deny=정상 영업직원 lockout**. partner-order-service 와 동일하게 base URL 기반(Eureka loadbalancer 비의존) bean 등록으로 **lockout 방지** |
| `application.yml` | `samhan.auth-service.url`(13 service 표준) + `app.security.internal.token`(= `SAMHAN_INTERNAL_TOKEN`, auth-service `/auth/internal/**` 가드 통과용 X-Internal-Token) 추가 |
| `PartnerApprovalsPermissionControllerIT`(신규) | `@WebMvcTest` slice(Testcontainers 불필요 → Windows 로컬 + CI Linux 양쪽 실행). 실 `PermissionAspect`(AOP) + `HeaderAuthenticationFilter` 통과. **grant→!403 / deny→403 + deny counter 증가(fail-open 차단) / MASTER bypass / PARTNER deny / @RequirePermission page·action 계약 박제** ([[feedback_enforcement_real_http_test]] 계약 변경 차원 실 HTTP 회귀). `DynamicPermissionClient` @MockBean 격리(auth-service 호출 차단, SP-D2 P04 트랩 회귀 방지) |

## 4-라운드 다모델 리뷰 경위

조기 PR(spec push) 후 Codex(gpt-5.5) 구현 → 라운드별 다모델 5-agent 리뷰 + fix 누적.

| 라운드 | 리뷰어 | 확정 | 핵심 fix |
|---|---|---|---|
| A | Opus 5-agent + QA | **5확정**(원지적 6, 1 기각) | 신규 7그룹 IA 단언 3종이 `full-menu-contract`(testIgnore)에 있어 CI 미수집=**false-green** → CI-실행 신규 `menu-relocate/menu-ia-contract.spec.ts` 로 이전 + NavLink 한정·categoryBlock 경계 단언 강화. AppLayout dead vars(`showInventoryGroup`/`showWarehouseOps`) 삭제. arologis OR 에 `showRegionMgmt` 추가. `menu-relocate` TC-M5 stale + soft→hard. QA 7역할 9컷 |
| B | Codex(gpt-5.5) 5-agent | **7확정** | `showAccounting` OR 세금계산서 batch/inbound 추가. `showAdminHrGroup` 고아 `admin.users` 제거. 배차 라벨 `arologis`→'배차'. **단톡방 그룹웨어 단일화**(AdminLayout 중복 제거). `SidebarCategory` 접근성(role=heading/group, aria-labelledby). `menu-ia-contract` hard 단언(route 미단언 갭). `permission-groups-c5-followup` 선재 broken 단언 정정 |
| C | Fable5 4축 | **14확정** (Opus·Codex 미적발 적발) | **[P1 CI-RED 2]** `purchase-inspection-cta` 구 NavLink 리터럴 4건·`sp-d3` '대시보드' sentinel = IA 재배치/홈 리라벨 파급(변경 모듈 전체 suite 미완주 회고) + 접힘 파급 3 spec expand-first. **[P1 보안 1]** 주문서 승인 fail-open → 라우트 PermissionGuard + BE @RequirePermission 게이트 신설. **[P2/P3]** `menu-ia-contract` 홈최상단 JSX-bind(vacuous 주석 제거)·OR 구성원 정적 박제·대시보드 regex / real-qa `GROUP_GATE_CODES` 동기화 / `admin-hr`·`menu-relocate` 그룹소속 실검증 |

> Fable5(Round C)가 Opus·Codex 양쪽이 놓친 CI-RED 2건 + 보안 1건을 적발 — 다모델 cross-check 가치 실증.

## QA (Docker 실서버 — mock OFF, 실 계정/실 권한 매트릭스)

증빙: [docs/qa/menu-5category/](../qa/menu-5category/) (PNG 13장) + 라운드별 real-qa spec 3종.

- **Round A** (`menu-5category-real-qa.spec.ts`): 7역할(MASTER/MANAGER/SALES/ACCOUNTANT/WAREHOUSE/INVENTORY/DISPATCH) 실 계정 실서버 메뉴 9컷 — DOM 그룹 헤더 == 실 권한 매트릭스 **정확 일치**(DISPATCH = 배차 그룹 단독). 각 메뉴 클릭→라우트 정상(redirect 없음, link 샘플 2컷).
- **Round B** (`roundB-targeted-real-qa.spec.ts`): 배차 라벨('배차') + 단톡방 MASTER 그룹웨어 단일 노출 타깃 재캡처 2컷.
- **Round C** (`roundC-collapsible-real-qa.spec.ts`): 접기/펼치기 4/4 — (a)기본 접힘(7그룹 헤더만, 자식 숨김) (b)판매 토글→자식 11종 노출(타그룹 접힘 유지) (c)`/sales` 진입 시 판매 자동 펼침 (d)`localStorage` 영속(새로고침 유지). 권한필터 8/8(역할별 그룹 헤더 == 실 권한매트릭스, 접힘이어도 헤더 노출). `roundC-collapsed.png`·`roundC-expanded.png`. pageerror 0.

## 검증

- desktop mock 전체 suite **468 pass / 0 fail / 0 skip**, typecheck 0, eslint 0.
- partner-auth-service `BUILD SUCCESSFUL` — `PartnerApprovalsPermissionControllerIT` 13/13(기존 Testcontainers 잡은 CI Linux 커버).
- 전체 Playwright suite 로컬 실행 시 무관 슬라이스 QA PNG 재생성분은 커밋 전 PNG 한정 경로 `git restore` 원복.

## 변경 파일 매트릭스

**FE (clients/desktop)**
- `src/renderer/components/AppLayout.tsx` (7그룹 IA + SidebarCategory 토글화, 1047행 diff)
- `src/renderer/components/AdminLayout.tsx` (단톡방 그룹웨어 단일화)
- `src/renderer/routes/index.tsx` (`/sales/order-approvals` PermissionGuard)
- Playwright 신규: `menu-relocate/menu-ia-contract.spec.ts`, `menu-5category-real-qa/{menu-5category-real-qa, roundB-targeted-real-qa, roundC-collapsible-real-qa}.spec.ts`
- Playwright 갱신: `menu-relocate/menu-relocate.spec.ts`, `full-menu-contract`, `permission-overhaul/applayout`, `purchase-inspection-cta`, `accounting-close-menu-gap`, `admin-hr/admin-hr-guard`, `compensation-failures`, `permission-groups-c5-followup`, `sp-d2/d3/d4-*-permission-migration`

**BE (services/partner-auth-service)**
- `controller/PartnerApprovalsController.java` (@RequirePermission 3 endpoint)
- `config/DynamicPermissionClientConfig.java` (신규 — lockout 방지 bean)
- `build.gradle` (`:shared:security` 의존), `application.yml` (auth-service URL + internal token)
- `src/test/.../it/PartnerApprovalsPermissionControllerIT.java` (신규 enforcement IT)

**문서/QA**
- `docs/superpowers/specs/2026-06-11-desktop-menu-5category-spec.md`
- `docs/qa/menu-5category/*.png` (13컷)

## 회고 메모

- **변경 모듈 전체 suite 미완주 false-green** — IA 재배치/홈 리라벨이 `purchase-inspection-cta`·`sp-d3` 등 무관해 보이는 spec 의 구 NavLink 리터럴/'대시보드' sentinel 을 깨뜨림(Round C CI-RED 2건). 신규 IT 타깃만 실행하지 말고 변경 모듈 전체 suite 완주 후 push ([[feedback_changed_module_full_test_before_push]]).
- **테스트 위치가 false-green 좌우** — IA 단언이 `testIgnore` 잡(`full-menu-contract`)에 있어 CI 미수집(Round A). 계약 단언은 CI 수집 잡으로 이전 + `--list` 수집 확인 필수.
- **AppLayout 단독 변경처럼 보이는 보안 게이트** — FE 라우트 가드만으로는 URL 직접 진입을 막지 못함. BE @RequirePermission 동반 + `:shared:security` 의존 신규 도입 시 `DynamicPermissionClient` bean 부재 lockout 함정(fail-secure 전직원 deny) 사전 차단 필요([[feedback_enforcement_real_http_test]]).
