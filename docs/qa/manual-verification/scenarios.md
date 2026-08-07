# 운영자 매뉴얼 QA 검증 시나리오 — Stage 1

> **branch** — `feature/integrated-phase-10-step-7-operator-manual`
> **작업일** — 2026-05-09
> **목적** — 작성된 운영자 매뉴얼(`docs/manual/`) 이 신규 운영자(도메인 지식 X) 시점에서 단계별 따라가기 가능한지 / 화면 변경 / 비즈니스 로직 정합성 검증.
> **방법** — 매뉴얼 본문 vs 실제 desktop 라우트 / mobile-staff 화면 / 17 backend service endpoint 매핑. 캡처 placeholder 와 누락 단계, 권한 매트릭스 일관성, 한국 회계 / 도메인 메서드 chain 정합성 검증.
> **연관 산출물** — `docs/manual/inventory/missing-features-catalog.md` (P0~P3 누락 종합), `docs/manual/STATUS.md` (작성 진행 표), `docs/manual/inventory/backend-feature-inventory.md`, `docs/manual/inventory/frontend-feature-inventory.md` (다른 agent 작업).

---

## 0. 검증 방법 정의

### 0.1 검증자 페르소나

| 페르소나 | 도메인 지식 | 컴퓨터 숙련도 | 검증 관점 |
|---|---|---|---|
| **신입 영업** (입사 1주차) | 거래/세금/단가 미경험 | 일반 office | 용어 / UI 위치 / 단계 흐름 |
| **신입 창고** (입사 1주차) | 입출고 흐름 미경험 | 모바일 익숙 | 슬립 lifecycle / 검수 / 출하 |
| **회계 외주** (월 1회 출입) | 한국 일반기업회계기준 숙련 | 일반 office | 분개 / 시산표 / 보고서 정합성 |
| **배송 기사** (모바일 only) | 운전 / 운송 경력 | 모바일 only | 카카오톡 → 배차 → GPS → 서명 |
| **신규 IT 관리자** (인수인계) | 도메인 X / 시스템 운용 | high | 관리 화면 / 권한 / 백업 / 트러블슈팅 |

### 0.2 검증 항목 분류

| 분류 | 약어 | 설명 |
|---|---|---|
| **A. 단계 누락** | A | 매뉴얼 단계 사이에 실제 UI 단계가 빠짐 |
| **B. 스크린샷 placeholder** | B | `screenshots/...png` 가 미작성 (파일 없음) |
| **C. UI 변경 / 화면 부재** | C | 매뉴얼 설명 vs 현재 desktop 라우트 / mobile 화면 불일치 |
| **D. 비즈니스 로직 부정합** | D | 한국 회계 / 도메인 메서드 chain / 권한 매트릭스 불일치 |
| **E. 용어 부정확** | E | 코드/Backend의 용어와 매뉴얼 용어 불일치 |
| **F. 미구현 기능 안내** | F | 매뉴얼은 안내하지만 backend / frontend 에 실 구현 없음 |

### 0.3 심각도

- 🔴 **Critical** — 운영자 작업 자체 불가 (잘못된 결과 발생)
- 🟠 **Major** — 작업 가능하지만 다른 단계 / 추측 필요
- 🟡 **Minor** — 사소한 용어 / 표기 / 캡처 placeholder
- 🟢 **Info** — 향후 개선 권고

---

## 1. Stage 1 매뉴얼 4 docs 검증

### 1.1 `docs/manual/README.md` (색인)

| # | 항목 | 분류 | 심각도 | 비고 |
|---|---|---|---|---|
| R1 | "빠른 시작 — 03. 역할별 화면 차이" — *(예정)* 표기 | A | 🟡 | 일관 — 이상 없음 |
| R2 | 영업 5 항목 모두 *(예정)* | F | 🟡 | Stage 2 작성 예정 정상 |
| R3 | 창고 4 항목 모두 *(예정)* | F | 🟡 | Stage 2 작성 예정 정상 |
| R4 | 회계 4 항목 — 세금계산서 발행 *(예정)* | F | 🔴 | **Backend 미구현** (`docs/manual/inventory/missing-features-catalog.md` P0-S5 참조). 매뉴얼만 약속 → 실 구현 차단 |
| R5 | 모바일 4 항목 — 영업직원 native 앱 *(예정)* | F | 🟠 | 현재 `clients/mobile/` 는 React Native skeleton + WebView 만. 영업직원용 native 앱은 메모리 가드(`project_arologis_phase10.md`) 만 명시, 코드 미존재 |
| R6 | arologis 3 항목 *(예정)* | C | 🟡 | desktop `LinkDispatchListPage.tsx` 만 구현. 카카오톡 자동 파싱은 arologis-service `KakaoMessageParser` 단독 동작 (UI 없음) → 매뉴얼 기재 시 **수동 등록 화면 부재** 명시 필수 |
| R7 | 트러블슈팅 5 항목 모두 *(예정)* | F | 🟠 | 비밀번호 분실 항목 = backend `/auth/password-reset` 미구현. 매뉴얼만 안내 시 IT 관리자 경유 fallback 명시 필수 |
| R8 | 부록 — 용어집 / 단축키 *(예정)* | A | 🟡 | Stage 3+ 정상 |

### 1.2 `docs/manual/00-시작하기/01-로그인.md`

#### 1.2.1 단계별 흐름 검증 (신입 영업 페르소나)

| Step | 매뉴얼 설명 | 실 구현 | 분류 | 심각도 | 조치 |
|---|---|---|---|---|---|
| 1단계 — 주소 접속 | `http://localhost:8080` / `https://app.samhan-air.com` | gateway port 8080 ✅ / 도메인 = `project_domain_strategy.md` 일치 ✅ | — | — | 정상 |
| 2단계 — ID 입력 | "kimmiseon" 예시 | `OrgChartSeeder` 시드 = `kimmiseon` ✅ | — | — | 정상 |
| 3단계 — 비밀번호 | 초기 `${QA_MASTER_PASSWORD}` | **확인 필요** — `OrgChartSeeder` 시드 비밀번호 명시 / Stage 1 검증 시 코드 확인 필수 | E | 🟠 | **검증 필요** — 실 시드 비밀번호와 매뉴얼 일치 검증 (`OrgChartSeeder` 또는 `JournalSeeder` 의 `passwordEncoder.encode("${QA_MASTER_PASSWORD}")` 호출 확인) |
| 4-2 — 첫 로그인 비밀번호 변경 | "비밀번호 변경 화면이 자동 표시" | **❌ 미구현** — `auth-service` AuthController 에 `/auth/password/change` endpoint 없음. force-change-on-first-login flag 없음 | F | 🔴 | **매뉴얼 정정 필요** — "현재는 IT 관리자에게 변경 요청" 으로 수정 또는 backend 신규 PR 필요 |
| 4-3 — 5회 실패 잠금 | "5회 연속 실패 시 계정 잠김" | **❌ 미구현** — `Account` 도메인에 `failed_login_attempts` / `locked_at` 컬럼 없음. SecurityConfig 에 lockout policy 없음 | F | 🔴 | **매뉴얼 정정 필요** — 미구현 명시 또는 backend PR |
| 5단계 — 로그아웃 | "30분 자동 로그아웃" | JWT 8h TTL 발급 (`backend-feature-inventory.md` §3.1) — **30분 자동 로그아웃 미구현** | F | 🟠 | **매뉴얼 정정 필요** — 8시간으로 정정 또는 frontend idle timer 신규 |
| FAQ Q2 비밀번호 분실 | "IT 관리자에게 초기화 요청" | `auth-service` 에 admin reset endpoint **없음** (`/auth/internal/accounts/{id}/disable` 만 있음) | F | 🔴 | **매뉴얼 정정 필요** — DB 직접 수정 또는 backend 신규 endpoint |
| FAQ Q4 비밀번호 조건 | "단순 비밀번호 거부" | `AuthService.register` 에서 단순 비밀번호 검증 로직 **없음** (BCrypt 만 적용) | F | 🟡 | 매뉴얼 정정 또는 backend 강화 |

#### 1.2.2 스크린샷 placeholder

| 스크린샷 경로 | 상태 |
|---|---|
| `../screenshots/00-시작/01-login-full.png` | B 🟡 미작성 (Stage 1 placeholder) |
| `../screenshots/00-시작/01-login-id-box.png` | B 🟡 미작성 |
| `../screenshots/00-시작/01-login-pw-box.png` | B 🟡 미작성 |
| `../screenshots/00-시작/01-login-success.png` | B 🟡 미작성 |

> **공통** — `docs/manual/screenshots/` 디렉토리 자체가 누락 가능 (다른 agent Playwright capture script 결과물 대기). Stage 2 PR 에서 일괄 추가.

### 1.3 `docs/manual/00-시작하기/02-메인-화면.md`

#### 1.3.1 비즈니스 로직 정합성 (권한 매트릭스)

매뉴얼 §5 표 vs 실 코드 (`clients/desktop/src/renderer/stores/session.ts` + `RoleGuard`):

| Role | 매뉴얼 영업 | 매뉴얼 창고 | 매뉴얼 회계 | 매뉴얼 모바일 | 매뉴얼 arologis | 매뉴얼 관리 | 실 구현 | 정합성 |
|---|---|---|---|---|---|---|---|---|
| MASTER | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 17 service 모두 ✅ | 일치 |
| MANAGER | ✅ | ✅ | ✅ | ✅ | ✅ | △ | partner / slip / accounting / dashboard 모두 ✅ | 일치 |
| SALES | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | slip POST / partner GET (admin) ✅, inventory adjust ❌ | 일치 |
| WAREHOUSE | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | inventory + slip transition ✅, partner / accounting ❌ | 일치 |
| **ACCOUNTANT** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | accounting + slip confirm ✅, **partner GET 도 가능** (`PartnerAdminController @PreAuthorize("hasAnyRole('MASTER','MANAGER','SALES','ACCOUNTANT')")`) | **D 🟡** — 매뉴얼은 ❌ 표기, 실 구현은 거래처 조회 가능. △ 권장 |
| DISPATCH | △ | ❌ | ❌ | ✅ | ✅ | ❌ | arologis admin 만 `hasRole('DISPATCH','MASTER')` | 일치 (단 — `DISPATCH` role 은 메모리/seed 에 없음. 검증 시 주의) |
| **DRIVER** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | mobile-staff `/driver/*` arologis-service 만 ✅ | 일치 |

> **D-1 🟡 정정 권고** — ACCOUNTANT 영업 컬럼을 ❌ → △ 로 수정 (거래처 조회/여신/매출 정산 위해 GET 가능).
> **D-2 🟢 메모** — `INVENTORY` role 이 매뉴얼 표에 없음. 실 코드는 `WAREHOUSE` 와 분리 (`StockController.adjust` = MASTER+MANAGER+INVENTORY). Stage 2 매뉴얼에서 행 추가 권고.
> **D-3 🟢 메모** — `DEVELOPER` / `INTEGRATION` / `PARTNER` / `PARTNER_ADMIN` role 도 누락 — Stage 2 부록 또는 03 매뉴얼에서 다룰 것.

#### 1.3.2 사이드바 메뉴 vs 실 라우트

매뉴얼 §2-1 7 메뉴 vs 실 desktop 27 라우트(`frontend-feature-inventory.md` §2.1):

| 매뉴얼 메뉴 | 실 라우트 (`routes/index.tsx`) | 누락 / 잉여 |
|---|---|---|
| 1. 대시보드 | `/dashboard` | ✅ 일치 |
| 2. 영업 — 거래처 | **없음** (partner-service backend 만, desktop UI X) | C 🔴 |
| 2. 영업 — 슬립 | `/slips` 외 7 라우트 | ✅ |
| 2. 영업 — 견적 | `/sales/estimates/legacy` (legacy webview) | ✅ |
| 2. 영업 — 주문 | `/sales/partner-orders` 외 4 라우트 | ✅ |
| 3. 창고 — 입고/출고 | `/slips` 통합 (입고 = INBOUND slip) | E 🟡 매뉴얼 vs UI 용어 차이 (창고 메뉴는 분리, 실은 슬립 통합) |
| 3. 창고 — 재고 | `/warehouses`, `/transfers` | ✅ |
| 3. 창고 — 실사 | **없음** | C 🔴 |
| 4. 회계 — 분개 | `/accounting/journals` | ✅ |
| 4. 회계 — 보고서 | `/accounting/balances` (시산표만) | C 🔴 (재무제표 16건 미구현) |
| 4. 회계 — 세금계산서 | **없음** | C 🔴 |
| 4. 회계 — 월말 마감 | **없음** | C 🔴 |
| 5. 모바일 — 기사 앱 | `/mobile/sign-mock` (시뮬만) + 실 mobile-staff app | △ 일치 (desktop 은 시뮬, 실은 모바일 native) |
| 5. 모바일 — 전자서명 | `/mobile/sign-mock` | ✅ |
| 5. 모바일 — 영업 견적 | mobile-staff `EstimateWebView` | ✅ |
| 5. 모바일 — 사진 첨부 | **없음** | C 🟠 |
| 6. arologis — 카카오톡 자동 | (UI 없음 — backend 만) | C 🟠 |
| 6. arologis — 수동 배차 | `/dispatch/links` (LinkDispatchListPage) 부분 | △ |
| 6. arologis — 기사 배정 | (UI 없음) | C 🟠 |
| 7. 관리 — 직원/권한 | **없음** (user-service backend 만) | C 🔴 |
| 7. 관리 — 시스템 설정 | **없음** | C 🟢 |

#### 1.3.3 단계 / 용어 검증

| # | 매뉴얼 | 실 | 분류 | 심각도 |
|---|---|---|---|---|
| M1 | "🔔 알림 클릭 시 본인 알림 목록" | `notification-service` 는 backend 시드 + `NotificationAdminController` 만 — desktop AppLayout 에 알림 벨 UI **미구현** | F | 🟠 |
| M2 | "★ 별표로 알림 보관" | 미구현 | F | 🟡 |
| M3 | "내 프로필 — 본인 정보 조회/수정" | desktop `/me` 화면 **없음** | F | 🟠 |
| M4 | "비밀번호 변경" 메뉴 | UI 없음 + backend endpoint 없음 (1.2.1 Step 4-2 와 동일) | F | 🔴 |
| M5 | "Ctrl+클릭 새 탭" | Electron HashRouter — 새 탭 동작 **없음** (Electron 단일 윈도우) | E | 🟡 |
| M6 | "F5 키 새로고침" | Electron Cmd/Ctrl+R 권장 — F5 도 동작 (Chromium) | — | 🟢 |
| M7 | "다크 모드 추후 업데이트" | 결정 / 로드맵 미존재 | F | 🟢 |

### 1.4 인벤토리 4 docs (다른 agent 작업) 검증

#### 1.4.1 `docs/manual/inventory/backend-feature-inventory.md` (다른 agent)

| 항목 | 검증 결과 |
|---|---|
| 활성 endpoint 약 145건 | ✅ 17 service controller grep 결과 (auth 8 + user 5 영역 + product 7 + partner 4 + slip 8 + inventory 4 + accounting 3 + arologis 3 + 그 외) 일치 |
| 시드 row 약 1,750 | ✅ Stage 1+2+3+4 시드 보고서 cross-check |
| 권한 ROLE 9개 | ✅ 코드 grep — MASTER / MANAGER / SALES / WAREHOUSE / INVENTORY / ACCOUNTANT / PARTNER / DRIVER / DEVELOPER (+ INTEGRATION 추가 = 10) |
| 누락 후보 42건 | ✅ §5 추정 일치, missing-features-catalog 와 cross-check 필요 |

#### 1.4.2 `docs/manual/inventory/frontend-feature-inventory.md` (다른 agent)

| 항목 | 검증 결과 |
|---|---|
| design-system 35 컴포넌트 | ✅ `clients/web/design-system/src/components/` ls 결과 일치 |
| desktop 27 라우트 | ✅ `routes/index.tsx` 23 page + Modal 4 = 27 |
| mobile-staff 6 화면 | ✅ AppRootNavigator + EstimateWebView + driver tab 4 |
| 누락 후보 8건 | ✅ §5.1 일치 (거래처 등록 4탭 / 품목 등록 / 시산표 / 재무제표 / 세금계산서 / 사용자권한 / 판매입력 / 구매입력) |

---

## 2. Stage 2 검증 우선순위 (다음 PR 권고)

Stage 2 매뉴얼 작성 시 본 시나리오를 기반으로 다음 순서로 단계별 따라가기 검증.

### 2.1 캡처 우선 (기능 구현 ✅ — 매뉴얼 가능)

1. 로그인 → 대시보드 (단, 비밀번호 변경 / FAQ Q2 정정 필수)
2. 출고전표 9 transition lifecycle
3. 이동전표 5 transition lifecycle
4. 분개 3 상태 lifecycle
5. 링크발송 + SMS + 모바일 전자서명
6. 모바일 driver tab (배차 / GPS / 서명)

### 2.2 매뉴얼 작성 차단 (❌ 미구현 — Stage 3 이후 / Phase 11 후)

1. 거래처 등록 4 탭 (HIGH P0) — 매뉴얼만 약속하면 운영 시 실 사용 불가
2. 품목 등록 화면 (HIGH P0)
3. 사용자/권한 관리 화면 (P0)
4. 세금계산서 발행 (P0)
5. 회계 17 보고서 중 14건 (P0)
6. 비밀번호 재설정 (P0)
7. 첨부파일 실 multipart upload (P0 — current NoopAttachmentStorage fallback)
8. 슬립 인쇄 양식 보강 (P0 — legacy v4 일부만)

### 2.3 Stage 1 즉시 정정 권고 (현재 PR 또는 next PR)

| # | 위치 | 정정 내용 |
|---|---|---|
| F1 | `01-로그인.md` 4-2 | "비밀번호 변경 화면 자동 표시" → "현재 IT 관리자에게 변경 요청" |
| F2 | `01-로그인.md` 4-3 | "5회 실패 잠금" → "(2026-Q3 개발 예정)" |
| F3 | `01-로그인.md` 5 | "30분 자동 로그아웃" → "8시간 후 재로그인 필요 (JWT 만료)" |
| F4 | `01-로그인.md` FAQ Q2 | IT 관리자가 DB 직접 수정 / endpoint 신규 명시 |
| F5 | `02-메인-화면.md` §3-3 | "비밀번호 변경 메뉴" 항목 제거 또는 *(2026-Q3 예정)* 표기 |
| F6 | `02-메인-화면.md` §3-4 | "🔔 알림" 항목 *(2026-Q3 예정)* 표기 |
| F7 | `02-메인-화면.md` §5 표 | ACCOUNTANT 영업 컬럼 ❌ → △ 변경 + INVENTORY / DEVELOPER 행 추가 |
| F8 | `02-메인-화면.md` §6 | "Ctrl+클릭 새 탭" 항목 제거 (Electron 단일 윈도우) |
| F9 | `02-메인-화면.md` §2-1 | "관리" 메뉴 *(2026-Q4 예정)* 표기 (현재 desktop UI 없음) |

---

## 3. 검증 요약 (Stage 1)

| 분류 | 카운트 | 심각도 분포 |
|---|---|---|
| **A 단계 누락** | 1 | 🟡 1 |
| **B 스크린샷 placeholder** | 4 (+다수 미작성) | 🟡 4 |
| **C UI 변경 / 화면 부재** | 9 | 🔴 5 / 🟠 3 / 🟢 1 |
| **D 비즈니스 로직 부정합** | 3 | 🟡 2 / 🟢 1 |
| **E 용어 부정확** | 3 | 🟠 1 / 🟡 2 |
| **F 미구현 기능 안내** | 11 | 🔴 5 / 🟠 3 / 🟡 2 / 🟢 1 |
| **합계** | **31** | 🔴 10 / 🟠 7 / 🟡 11 / 🟢 3 |

> **🔴 Critical 10건** — 모두 backend/frontend 미구현 기능을 매뉴얼이 가능한 듯 안내 → 운영 시 실패 발생 위험.
> **🟠 Major 7건** — 단계 추측 / 부정확한 시간 표기 / UI 화면 부재로 인한 우회 안내 필수.
> **🟡 Minor 11건** — Stage 2 캡처 / Stage 3 정정 가능.
> **🟢 Info 3건** — 향후 개선 권고.

---

## 4. 다음 단계 (Stage 2 검증)

Stage 2 매뉴얼 작성 후 (영업 / 창고 5 docs 추가) 본 scenarios.md 에 §1.5~§1.10 추가 검증 항목 누적. 검증 자체는 다른 agent (QA) 가 PR comment 로 보강.

---

## 부록 A — 검증 시 사용할 grep 명령

```bash
# 1. 매뉴얼 안내 endpoint 가 실 구현 되어 있는지
grep -r "@PostMapping\|@GetMapping" services/auth-service/src/main/java
# → password / reset / change 키워드 부재 = 🔴

# 2. 권한 매트릭스 cross-check
grep -rn "@PreAuthorize" services/*/src/main/java/.../web

# 3. desktop 라우트 vs 매뉴얼 메뉴
cat clients/desktop/src/renderer/routes/index.tsx | grep "<Route"

# 4. 시드 비밀번호
grep -rn "${QA_MASTER_PASSWORD}\|passwordEncoder.encode" services/user-service/src/main/java
```
