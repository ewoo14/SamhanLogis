# Samhan Public 운영자 매뉴얼 작성 진행 (STATUS)

> **branch (현재)** — `feature/integrated-phase-12-step-6-manual-rewrite` (Phase 12 step-6 — 매뉴얼 전체 재작성 ✅)
> **branch (이전 Stage 4)** — `feature/integrated-phase-12-step-5-manual-augmentation`
> **branch (이전 Stage 3)** — `feature/integrated-phase-10-step-7c-operator-manual-final`
> **branch (이전 Stage 2)** — `feature/integrated-phase-10-step-7b-operator-manual-stage2`
> **branch (이전 Stage 1)** — `feature/integrated-phase-10-step-7-operator-manual`
> **갱신일** — 2026-05-10 (Phase 12 step-6 ✅ — 9 카테고리 × 43 docs 본문 모두 7-section 패턴 일관 재작성 + 111 신규 PNG inline)
> **목적** — 운영자 매뉴얼 작성 stage 별 진행 / 화면 캡처 진행 / 누락 부분 한눈 추적.
> **연관 문서** —
> - `docs/manual/README.md` (사용자 색인 — 31 docs 활성 link)
> - `docs/manual/inventory/backend-feature-inventory.md` (17 service / 145 endpoint)
> - `docs/manual/inventory/frontend-feature-inventory.md` (3 client / 27 desktop 라우트 / 6 mobile)
> - `docs/manual/inventory/missing-features-catalog.md` (P0~P3 종합 누락 — Stage 3 갱신 = ~165 sub)
> - `docs/qa/manual-verification/scenarios.md` (Stage 1 검증 시나리오 — 31 항목)
> - `docs/qa/manual-verification/stage2-scenarios.md` (Stage 2 검증 시나리오 — 74 항목)
> - `docs/qa/manual-verification/stage3-final-scenarios.md` (Stage 3 검증 시나리오 — **~120 항목**)

---

## 0. 전체 stage 로드맵 (Stage 3 완료 갱신)

| Stage | 범위 | 상태 | PR | 시한 |
|---|---|---|---|---|
| **Stage 1** | 색인 + 시작하기 (로그인/메인) + Inventory + Catalog + 검증 plan | ✅ **완료** | W10-7 (#107) | 2026-05-09 |
| **Stage 2** | 영업 5 + 창고 3 + 시작하기 1 (역할별 권한) + QA plan + Catalog 갱신 + STATUS | ✅ **완료** | W10-7b (#110) | 2026-05-09 |
| **Stage 3** | 회계 4 + 모바일 4 + arologis 3 + 트러블슈팅 5 + 부록 3 + Stage 3 안내 3 (견적/매출 마감/실사) = **22 docs** + QA 120 항목 + Catalog 갱신 + README/STATUS 색인 활성화 | ✅ **완료** | W10-7c | 2026-05-09 |
| **Stage 4 (Phase 12 보강)** | Phase 12 실시간 협업 시리즈 (PR-H1 → PR-H4c) 종결 후 신규 카테고리 [08-실시간-협업/](08-실시간-협업/) 10 docs 작성. 기존 33 docs 중 audit 적용 8 docs 는 PR-H4c commit `0e3b247` 에서 이미 보완 완료 (점검 결과 추가 보완 불필요). README + STATUS + missing-features-catalog 갱신. | ✅ 완료 | Phase 12 step-5 | 2026-05-10 |
| **Phase 12 step-6 (매뉴얼 전체 재작성 — 본 PR)** | 9 카테고리 × **43 docs 본문 모두 7-section 패턴 일관 재작성** (1.구현 상태 / 2.대상 독자 / 3.학습 내용 / 4.본문 / 5.화면 미리보기 / 6.FAQ / 7.관련 매뉴얼). placeholder 안내 톤 → 실 사용자 가이드 톤 전환. **111 신규 PNG inline** (Phase B 산출 — `docs/manual/screenshots/<카테고리>/`, mock 모드 한국어 라벨 100% / placeholder 47건 모두 교체). README + STATUS + catalog 갱신. | ✅ **완료 (본 PR)** | Phase 12 step-6 | 2026-05-10 |
| **Stage 5 (Phase 11 후)** | 백업·복원 운영 매뉴얼 부속 + Phase 11 진입 후 P0 PR 머지 시 안내 docs 정식 본문으로 교체 (매출 마감 / 실사 / 회계 14 보고서 / 영업 모바일 / 사진 첨부 / 기사 배정 / 카카오톡 UI 등) | ⏳ Phase 11 진입 후 | W11+ | Phase 11 후 |

> **Stage 3 변경 요약** — Stage 1/2 의 "Stage 4 예정" 으로 표시되었던 회계/모바일/arologis/트러블슈팅/부록은 Stage 3 본 PR 에서 모두 작성 완료. 매출 마감 / 실사 / 영업 모바일 등 미구현 슬라이스도 "안내 docs" 형태로 작성하여 매뉴얼 색인 100% 활성화. Stage 4 는 Phase 11 P0 PR 머지 후 안내 docs → 정식 본문 교체 작업으로 축소.
>
> **Stage 4 변경 요약 (본 PR)** — Phase 12 실시간 협업 시리즈 종결 (PR-H1 → PR-H4c) 후 신규 카테고리 [08-실시간-협업/](08-실시간-협업/) 10 docs 작성. 본문 33 → **43 docs**. 매뉴얼 본문에서 PR-H4c commit `0e3b247` 가 이미 7 docs 에 inline audit overlay section 추가하였으므로 추가 보완 불필요. 기존 [02-창고/02-출고-처리.md](02-창고/02-출고-처리.md) §2-9, §2-10 의 시드 패턴이 신규 10 docs 의 reference 임. 안내 docs → 정식 본문 교체는 별도 Stage 5 (Phase 11 P0 후) 로 이관.

---

## 1. Stage 1 산출물 — ✅ 완료 (PR #107)

### 1.1 매뉴얼 본문 (3 docs)

| # | 파일 | 상태 | 캡처 |
|---|---|---|---|
| 1 | `00-시작하기/01-로그인.md` | ✅ | ✅ 4 PNG (login full / id / pw / success) |
| 2 | `00-시작하기/02-메인-화면.md` | ✅ | ✅ 3 PNG (main full / header / sidebar) |
| 3 | `00-시작하기/03-역할별-권한.md` | ✅ Stage 2 작성 (backlog 해소) | 📸 Stage 4 캡처 후속 |

### 1.2 Inventory / Catalog / Plan

| # | 파일 | 상태 | 작성자 |
|---|---|---|---|
| 1 | `inventory/backend-feature-inventory.md` (17 service 145 endpoint) | ✅ | BE agent |
| 2 | `inventory/frontend-feature-inventory.md` (3 client 27 라우트 6 mobile) | ✅ | FE agent |
| 3 | `inventory/missing-features-catalog.md` Stage 1 (P0 50 + P1 37 + P2 27 + P3 17 = 131 sub) | ✅ | TM |
| 4 | `qa/manual-verification/scenarios.md` (Critical 10 / Major 7 / Minor 11 / Info 3 = 31 항목) | ✅ | TM |
| 5 | `STATUS.md` 초안 | ✅ | TM |

---

## 2. Stage 2 산출물 — ✅ 완료 (PR #110)

### 2.1 매뉴얼 본문 (영업 5 + 창고 3 + 시작하기 1 = 9 docs)

| # | 파일 | 상태 | 캡처 | 비고 |
|---|---|---|---|---|
| 1 | `01-영업/01-거래처-등록.md` | ✅ | 📸 placeholder (P0-6 UI 부재) | 4 탭 mock + 우회 절차 |
| 2 | `01-영업/02-거래처-조회.md` | ✅ | 📸 placeholder | 검색 / 페이지네이션 / 신용 history |
| 3 | `01-영업/03-전표-발행.md` | ✅ | 📸 placeholder | 11 status 흐름 도표 + 인쇄 / 모바일 서명 |
| 4 | `01-영업/04-전표-결재-라인.md` | ✅ | 📸 placeholder | 권한 매트릭스 + 거절 / 취소 / 자동 분개 |
| 5 | `01-영업/05-거래처-주문.md` | ✅ | 📸 placeholder | idempotency-key + draft → confirm → slip 자동 |
| 6 | `02-창고/01-입고-처리.md` | ✅ | 📸 placeholder | 검수 UI 부재 (P0-9) 우회 안내 포함 |
| 7 | `02-창고/02-출고-처리.md` | ✅ | 📸 placeholder | 9 transition 흐름 |
| 8 | `02-창고/03-재고-조회.md` | ✅ | 📸 placeholder | balances/transfers/movements/lots |
| 9 | `00-시작하기/03-역할별-권한.md` (Stage 1 backlog) | ✅ | 📸 placeholder | 9 ROLE × 14 service + 전표 11 status × ROLE |

### 2.2 QA plan / Catalog 갱신 / STATUS

| # | 파일 | 상태 | 비고 |
|---|---|---|---|
| 1 | `qa/manual-verification/stage2-scenarios.md` | ✅ | 74 검증 항목 (🔴 15 / 🟠 29 / 🟡 16) |
| 2 | `inventory/missing-features-catalog.md` Stage 2 갱신 | ✅ | 131 → 150 sub (+19 / +P0-9 +P2-6) |
| 3 | `STATUS.md` Stage 2 진행 갱신 | ✅ | TM |

---

## 3. Stage 3 산출물 — ✅ 완료 (현재 PR W10-7c)

### 3.1 매뉴얼 본문 (회계 4 + 모바일 4 + arologis 3 + 트러블슈팅 5 + 부록 3 + Stage 3 안내 3 = 22 docs)

#### 3.1.1 회계 (4 docs)

| # | 파일 | 상태 | 의존 / 차단 | 비고 |
|---|---|---|---|---|
| 1 | `03-회계/01-분개-입력.md` | ✅ | `accounting-service` `/journals` POST ✅ | 한국 일반기업회계기준 표준 계정과목 코드 + 차변/대변 입력 흐름 |
| 2 | `03-회계/02-보고서.md` | ✅ (시산표 ✅ + 14 미구현 안내) | P0-1 14 미구현 | 시산표 조회 + 14 미구현 보고서 안내 + Phase 11 PR 일정 |
| 3 | `03-회계/03-세금계산서.md` | ✅ (미구현 안내 docs) | P0-4 미구현 | 미구현 안내 + 우회 (수기 발행 / NTS 별도 시스템) |
| 4 | `03-회계/04-월말-마감.md` | ✅ (미구현 안내 docs) | P2-3 미구현 | 미구현 안내 + 임시 우회 (분개 lock 수동) |

#### 3.1.2 모바일 (4 docs)

| # | 파일 | 상태 | 의존 / 차단 | 비고 |
|---|---|---|---|---|
| 1 | `04-모바일/01-기사-앱.md` | ✅ | mobile-staff `/driver/*` ✅ | 로그인 / 전표 list / 배차 수신 / GPS |
| 2 | `04-모바일/02-전자-서명.md` | ✅ | `/sign-mock` + 실 서명 ✅ | 서명 collection + 전표 DELIVERED transition |
| 3 | `04-모바일/03-영업-앱.md` | ✅ (미구현 안내 docs) | P1-4 미구현 | 영업직원 native 앱 미구현 + legacy WebView 임시 안내 |
| 4 | `04-모바일/04-사진-첨부.md` | ✅ (미구현 안내 docs) | 신규 P1 | 현장 사진 첨부 미구현 (검수 사진 P0-9 / 배송 완료 사진 / 영업 방문 사진) |

#### 3.1.3 arologis (3 docs)

| # | 파일 | 상태 | 의존 / 차단 | 비고 |
|---|---|---|---|---|
| 1 | `05-arologis/01-카카오톡-배차.md` | ✅ (UI 부재 안내) | P1-5 UI 미구현 | backend `KakaoMessageParser` ✅ / UI ❌ — 우회 안내 |
| 2 | `05-arologis/02-수동-배차.md` | ✅ | `LinkDispatchListPage` ⏳ | 수동 등록 흐름 + 인성데이타 vendor 안내 |
| 3 | `05-arologis/03-기사-배정.md` | ✅ (미구현 안내) | 미구현 | 드래그 자동 배정 미구현 + 수동 배정 우회 |

#### 3.1.4 트러블슈팅 (5 docs)

| # | 파일 | 상태 | 비고 |
|---|---|---|---|
| 1 | `06-트러블슈팅/01-로그인-실패.md` | ✅ | P0-2 (비밀번호 재설정 미구현) → IT 관리자 우회 안내 |
| 2 | `06-트러블슈팅/02-화면-표시-안됨.md` | ✅ | gateway / service health check 안내 |
| 3 | `06-트러블슈팅/03-인쇄-안됨.md` | ✅ | 브라우저 인쇄 / Edge / Chrome 권장 + 양식 미구현 안내 |
| 4 | `06-트러블슈팅/04-모바일-접속-오류.md` | ✅ | mobile-staff WebView / Expo / 도메인 안내 |
| 5 | `06-트러블슈팅/05-기타.md` | ✅ | 권한·세션·기타 일반 안내 |

#### 3.1.5 부록 (3 docs)

| # | 파일 | 상태 | 비고 |
|---|---|---|---|
| 1 | `07-부록/01-FAQ.md` | ✅ | Stage 1~3 통합 FAQ |
| 2 | `07-부록/02-용어집.md` | ✅ | 한국 회계 / 한국 ERP / Samhan Public 도메인 메서드 명 |
| 3 | `07-부록/03-단축키.md` | ✅ | desktop electron-vite 단축키 일람 |

#### 3.1.6 Stage 3 placeholder/안내 docs (3 docs 모두 작성 완료)

| # | 파일 | 상태 | 차단 | 비고 |
|---|---|---|---|---|
| 1 | `01-영업/06-견적서.md` | ✅ (legacy 안내) | legacy v4 webview | Node.js + Express + EJS estimate-app 안내 + Excel 우회 |
| 2 | `02-창고/04-매출-마감.md` | ✅ (placeholder) | P2-4 / P0-1 미구현 | 회계 + 영업 합동 우회. Phase 11 후 정식 본문 교체 |
| 3 | `02-창고/05-재고-실사.md` | ✅ (placeholder) | P2-6 미구현 | 한국 회계 표준 의무 안내 + 우회. Phase 11 후 정식 본문 교체 |

### 3.2 QA plan / Catalog 갱신 / README + STATUS

| # | 파일 | 상태 | 비고 |
|---|---|---|---|
| 1 | `qa/manual-verification/stage3-final-scenarios.md` | ✅ | **~120 검증 항목** (회계 30 + 모바일 22 + arologis 18 + 트러블슈팅 25 + 부록 12 + Stage 3 안내 13). 페르소나 5 (영업/창고/회계/기사/IT) |
| 2 | `inventory/missing-features-catalog.md` Stage 3 갱신 | ✅ | 150 → ~165 sub. 모바일 사진 첨부 P1 신규 + 영업 모바일 native 앱 마이그레이션 P2 신규 |
| 3 | `README.md` 색인 활성화 (22 docs link) | ✅ | "(예정)" → 작성 완료. "Samhan Public 운영자 매뉴얼" 정확 표시 + 빠른 검색 가이드 |
| 4 | `STATUS.md` Stage 3 완료 갱신 | ✅ | 본 파일 |

---

## 4. 매뉴얼 본문 docs 종합 list (32 docs)

### 4.1 작성 완료 ✅ / 미구현 안내 ⚠️ / 후속 캡처 필요 📸

| # | 영역 | 파일 | 본문 | 캡처 |
|---|---|---|---|---|
| 1 | 시작하기 | `00-시작하기/01-로그인.md` | ✅ | ✅ 4 PNG |
| 2 | 시작하기 | `00-시작하기/02-메인-화면.md` | ✅ | ✅ 3 PNG |
| 3 | 시작하기 | `00-시작하기/03-역할별-권한.md` | ✅ | 📸 |
| 4 | 영업 | `01-영업/01-거래처-등록.md` | ⚠️ (P0-6 UI 부재) | 📸 |
| 5 | 영업 | `01-영업/02-거래처-조회.md` | ✅ | 📸 |
| 6 | 영업 | `01-영업/03-전표-발행.md` | ✅ | 📸 |
| 7 | 영업 | `01-영업/04-전표-결재-라인.md` | ✅ | 📸 |
| 8 | 영업 | `01-영업/05-거래처-주문.md` | ✅ | 📸 |
| 9 | 영업 | `01-영업/06-견적서.md` | ⚠️ (legacy webview 안내) | 📸 |
| 10 | 창고 | `02-창고/01-입고-처리.md` | ✅ (P0-9 검수 UI 부재 안내) | 📸 |
| 11 | 창고 | `02-창고/02-출고-처리.md` | ✅ | 📸 |
| 12 | 창고 | `02-창고/03-재고-조회.md` | ✅ | 📸 |
| 13 | 창고 | `02-창고/04-매출-마감.md` | ⚠️ placeholder (P2-4 미구현) | — |
| 14 | 창고 | `02-창고/05-재고-실사.md` | ⚠️ placeholder (P2-6 미구현) | — |
| 15 | 회계 | `03-회계/01-분개-입력.md` | ✅ | 📸 |
| 16 | 회계 | `03-회계/02-보고서.md` | ✅ + ⚠️ (14 미구현 안내) | 📸 |
| 17 | 회계 | `03-회계/03-세금계산서.md` | ⚠️ (미구현 안내) | — |
| 18 | 회계 | `03-회계/04-월말-마감.md` | ⚠️ (미구현 안내) | — |
| 19 | 모바일 | `04-모바일/01-기사-앱.md` | ✅ | 📸 |
| 20 | 모바일 | `04-모바일/02-전자-서명.md` | ✅ | 📸 |
| 21 | 모바일 | `04-모바일/03-영업-앱.md` | ⚠️ (P1-4 미구현 안내) | 📸 |
| 22 | 모바일 | `04-모바일/04-사진-첨부.md` | ⚠️ (신규 P1-8 미구현 안내) | — |
| 23 | arologis | `05-arologis/01-카카오톡-배차.md` | ⚠️ (UI 미구현 안내) | 📸 |
| 24 | arologis | `05-arologis/02-수동-배차.md` | ✅ | 📸 |
| 25 | arologis | `05-arologis/03-기사-배정.md` | ⚠️ (미구현 안내) | 📸 |
| 26 | 트러블슈팅 | `06-트러블슈팅/01-로그인-실패.md` | ✅ | 📸 |
| 27 | 트러블슈팅 | `06-트러블슈팅/02-화면-표시-안됨.md` | ✅ | 📸 |
| 28 | 트러블슈팅 | `06-트러블슈팅/03-인쇄-안됨.md` | ✅ | 📸 |
| 29 | 트러블슈팅 | `06-트러블슈팅/04-모바일-접속-오류.md` | ✅ | 📸 |
| 30 | 트러블슈팅 | `06-트러블슈팅/05-기타.md` | ✅ | — |
| 31 | 부록 | `07-부록/01-FAQ.md` | ✅ | — |
| 32 | 부록 | `07-부록/02-용어집.md` | ✅ | — |
| 33 | 부록 | `07-부록/03-단축키.md` | ✅ | — |
| 34 | 실시간 협업 (Stage 4) | `08-실시간-협업/00-실시간-협업-개요.md` | ✅ | ✅ 8 PNG (PR-H1~H4c 작동 캡처 인용) |
| 35 | 실시간 협업 | `08-실시간-협업/01-실시간-동기화.md` | ✅ | ✅ 2 PNG |
| 36 | 실시간 협업 | `08-실시간-협업/02-수정-이력-보기.md` | ✅ | ✅ 5 PNG |
| 37 | 실시간 협업 | `08-실시간-협업/03-수정-횟수-카운트.md` | ✅ | — (시각 layout ASCII) |
| 38 | 실시간 협업 | `08-실시간-협업/04-수정-복원.md` | ✅ | — (시각 layout ASCII) |
| 39 | 실시간 협업 | `08-실시간-협업/05-수정-요청-워크플로우.md` | ✅ | ✅ 4 PNG |
| 40 | 실시간 협업 | `08-실시간-협업/06-잠금-정책.md` | ✅ | — (4단계 표) |
| 41 | 실시간 협업 | `08-실시간-협업/07-창고-직원-수락.md` | ✅ | ✅ 1 PNG |
| 42 | 실시간 협업 | `08-실시간-협업/08-모바일-실시간-알림.md` | ✅ | — (mobile 텍스트 layout) |
| 43 | 실시간 협업 | `08-실시간-협업/09-적용-범위.md` | ✅ | ✅ 6 PNG (매트릭스) |

> **요약 (Stage 4 갱신)** — 작성 완료 본문 **43** (시작하기 3 + 영업 6 + 창고 5 + 회계 4 + 모바일 4 + arologis 3 + 트러블슈팅 5 + 부록 3 + **실시간 협업 10**). 미구현 안내/placeholder(⚠️) 9 / 정식 본문(✅) 34. 신규 10 docs 모두 본 PR 에서 작성. 캡처 필요 (📸) 약 22 docs (Stage 5 일괄 캡처 PR 예정 — 단, 신규 08-실시간-협업/ 10 docs 는 PR-H1~H4c 작동 캡처 raw URL 활용으로 캡처 불필요).
> **README 색인 표시 = 43 항목** (08-실시간-협업/ 10 docs 신규 카테고리 추가).

### 4.2 미구현 안내 / placeholder docs (9건) — Stage 4 정식 교체 대상

| # | 파일 | 차단 P 슬라이스 | Stage 4 정식 교체 PR 권고 |
|---|---|---|---|
| 1 | `01-영업/06-견적서.md` | (legacy v2 — 마이그레이션 미정) | Phase 11 후 |
| 2 | `02-창고/04-매출-마감.md` (placeholder) | P2-4 매출 마감 / P0-1 회계 14 보고서 | Phase 11+1주 |
| 3 | `02-창고/05-재고-실사.md` (placeholder) | P2-6 재고 실사 | Phase 11+3개월 |
| 4 | `03-회계/02-보고서.md` (시산표 ✅ + 14 미구현 안내 부분) | P0-1 14건 | Phase 11-2주 (P0 의무) |
| 5 | `03-회계/03-세금계산서.md` | P0-4 세금계산서 | Phase 11-2주 (P0 의무) |
| 6 | `03-회계/04-월말-마감.md` | P2-3 월말 마감 | Phase 11+1개월 |
| 7 | `04-모바일/03-영업-앱.md` | P1-4 영업 모바일 native | Phase 11+1개월 |
| 8 | `04-모바일/04-사진-첨부.md` | 신규 P1 사진 첨부 (검수/배송/영업) | Phase 11+1개월 |
| 9 | `05-arologis/01-카카오톡-배차.md` (UI 부재) | P1-5 카카오톡 UI | Phase 11+1개월 |
| 10 | `05-arologis/03-기사-배정.md` | P1-5 기사 배정 UI | Phase 11+1개월 |

### 4.3 후속 캡처 필요 (📸) — Stage 4 일괄 캡처 PR

| 영역 | 캡처 PNG 추정 |
|---|---|
| 시작하기 (역할별 권한) | ~3 |
| 영업 5 docs | ~25 (각 ~5) |
| 창고 3 docs | ~15 |
| 회계 2 docs (분개 / 보고서 시산표) | ~8 |
| 모바일 2 docs (기사 / 서명) | ~8 |
| arologis 2 docs (수동 배차 / 카카오 안내) | ~6 |
| 트러블슈팅 4 docs | ~10 |
| **합계** | **~75 PNG** |

> Stage 4 캡처 PR 시 사용자 (개발책임자) PC 별도 실행 후 추가 PR 권고. Stage 1 의 7 PNG (login + main) 캡처 패턴 동일.

---

## 5. Stage 3 검증 종합 (`stage3-final-scenarios.md`)

### 5.1 영역별 검증 항목 카운트

| 영역 | docs | 검증 항목 | 🔴 Critical | 🟠 Major | 🟡 Minor |
|---|---|---:|---:|---:|---:|
| 회계 | 4 | 30 | 8 | 14 | 8 |
| 모바일 | 4 | 22 | 4 | 10 | 8 |
| arologis | 3 | 18 | 3 | 9 | 6 |
| 트러블슈팅 | 5 | 25 | 5 | 12 | 8 |
| 부록 | 3 | 12 | 0 | 5 | 7 |
| Stage 3 안내 | 3 | 13 | 5 | 6 | 2 |
| **합계** | **22** | **120** | **25** | **56** | **39** |

> **🔴 Critical 25건** — 매뉴얼만 약속 시 운영 차단 (회계 14 보고서 / 세금계산서 / 월말 마감 / 영업 모바일 / 사진 첨부 / 기사 배정 / 카카오톡 UI 등 미구현 안내가 대부분)
> **🟠 Major 56건** — 우회 안내 / 차후 정정 필수
> **🟡 Minor 39건** — Stage 4 캡처 / 용어 / 표기 정정

### 5.2 페르소나 별 점검 영역

| 페르소나 | 주 점검 docs |
|---|---|
| **신입 영업** (입사 1주차) | 영업 7 + 모바일 1 영업앱 안내 |
| **신입 창고** (입사 1주차) | 창고 4 + 모바일 1 사진 첨부 안내 |
| **회계 외주** (월 1회 출입 / 한국 일반기업회계기준 숙련) | 회계 4 + 영업 매출 마감 안내 |
| **배송 기사** (모바일 only) | 모바일 2 (기사앱/서명) + arologis 2 (배차 수신 측면) |
| **신규 IT 관리자** (인수인계 / 시스템 운용) | 트러블슈팅 5 + 부록 3 + 모든 docs 권한 매트릭스 일관성 |

---

## 6. Stage 3 신규 발견 누락 (catalog 입력)

`stage3-final-scenarios.md` 의 신규 검증 row → catalog sub 단위 ~15건 추가:

| 분류 | sub 카운트 | 메인 슬라이스 |
|---|---|---|
| 🟠 P1 신규 슬라이스 | +5 | **신규 P1 — 모바일 사진 첨부 (검수/배송/영업 방문)** |
| 🟡 P2 신규 슬라이스 | +5 | **신규 P2 — 영업 모바일 native 앱 마이그레이션 (legacy WebView → Expo native)** |
| 🟠 P1 보강 | +3 | P1-5 arologis (기사 배정 드래그 / 카카오톡 UI / 인성데이타 vendor 연계 깊이 안내) |
| 🟡 P2 보강 | +2 | P2-2 부록 단축키 / 권한 매트릭스 시각화 |

**→ catalog Stage 2 → Stage 3: 150 → ~165 sub (+15). P1 슬라이스 7 → 8 (+모바일 사진 첨부). P2 슬라이스 6 → 7 (+영업 모바일 마이그레이션).**

---

## 7. Stage 4 backlog list (Phase 11 진입 후)

### 7.1 매뉴얼 본문 (안내 docs → 정식 본문 교체)

| 영역 | 교체 docs | 차단 PR |
|---|---|---|
| 영업 | `07-매출-마감-안내.md` → 정식 본문 | P2-4 PR 머지 후 |
| 창고 | `04-실사-안내.md` → 정식 본문 | P2-6 PR 머지 후 |
| 회계 | `02-보고서.md` 14 미구현 안내 → 정식 14 보고서 본문 | P0-1 PR 머지 후 |
| 회계 | `03-세금계산서.md` → 정식 본문 | P0-4 PR 머지 후 |
| 회계 | `04-월말-마감.md` → 정식 본문 | P2-3 PR 머지 후 |
| 모바일 | `03-영업-앱.md` → 정식 native 앱 본문 | P1-4 PR 머지 후 |
| 모바일 | `04-사진-첨부.md` → 정식 본문 | 신규 P1 PR 머지 후 |
| arologis | `01-카카오톡-배차.md` → 정식 UI 본문 | P1-5 PR 머지 후 |
| arologis | `03-기사-배정.md` → 정식 본문 | P1-5 PR 머지 후 |

### 7.2 신규 docs (Stage 4)

| 영역 | docs | 비고 |
|---|---|---|
| 운영 | `08-운영/01-백업-복원.md` | P0-8 의존 — Phase 11 RDS auto backup 정책 결정 후 |
| 운영 | `08-운영/02-장애-대응.md` | RTO / RPO 운영 가이드 |
| 운영 | `08-운영/03-사용자-관리.md` | P0-5 사용자/권한 UI PR 머지 후 |

### 7.3 캡처 PR (Stage 4)

| 항목 | 진행 |
|---|---|
| ~75 PNG 일괄 캡처 PR | ⏳ 사용자 PC 별도 실행 |
| `screenshots/README.md` 캡처 가이드 | ⏳ Stage 4 |

---

## 8. 의존 / 차단 매트릭스 (Stage 3 갱신)

| Stage | 차단 P0/P1 슬라이스 | 우회 가능 여부 |
|---|---|---|
| Stage 2 영업 | P0-6 거래처 4 탭 / P0-7 품목 7 탭 | ❌ 차단 (Stage 2 안내) |
| Stage 2 창고 | P0-9 입고 검수 UI | ❌ 차단 (Stage 2 안내) |
| Stage 3 회계 | P0-1 14 보고서 / P0-4 세금계산서 | ⚠️ 미구현 안내 docs 로 회피 |
| Stage 3 회계 | P2-3 월말 마감 | ⚠️ 미구현 안내 docs |
| Stage 3 모바일 | P1-4 영업 native 앱 | ⚠️ legacy WebView 안내 |
| Stage 3 모바일 | 신규 P1 사진 첨부 | ⚠️ 미구현 안내 |
| Stage 3 arologis | P1-5 카카오톡 UI / 기사 배정 | ⚠️ 미구현 안내 + backend 만 |
| Stage 4 운영 | P0-2 비밀번호 재설정 / P0-5 사용자 권한 UI / P0-8 백업 운영 | ❌ Phase 11 진입 전 의무 |

> **Stage 3 결정** — 모든 미구현 영역은 "안내 docs" 형태로 매뉴얼 본문에 포함하여 사용자가 색인에서 발견하면 즉시 미구현 사실 + Phase 11 후 출시 일정을 알 수 있도록 함. Stage 4 에서 Phase 11 P0/P1 PR 머지 후 정식 본문으로 일괄 교체.

---

## 9. 변경 이력

| 일자 | Stage | 변경 | PR |
|---|---|---|---|
| 2026-05-09 | Stage 1 | 색인 + 로그인 + 메인 + Inventory 4 docs + Catalog (131 sub) + Scenarios (31 항목) + STATUS 작성 | W10-7 (#107) |
| 2026-05-09 | Stage 1 캡처 | 7 PNG (login 4 + main 3) 첫 캡처 + 깨진 link placeholder 29건 일괄 처리 | #108 / #109 |
| 2026-05-09 | Stage 2 | QA plan stage2-scenarios.md (74 항목) + Catalog 갱신 (131 → 150 sub, +P0-9 +P2-6) + STATUS Stage 2 진행. writer agent 9 docs 작성 (영업 5 + 창고 3 + 시작하기 1 — 역할별 권한) | W10-7b (#110) |
| 2026-05-09 | Stage 2 후속 | gateway /auth/** legacy routing 추가 + 프로그램명 삼한로지스 → Samhan Public + 회사명 (주)삼한공조시스템 + 매뉴얼 재캡처 | #111 / #112 |
| 2026-05-09 | **Stage 3** | 매뉴얼 본문 22 docs 작성 완료 (회계 4 + 모바일 4 + arologis 3 + 트러블슈팅 5 + 부록 3 + Stage 3 안내 3). README 색인 100% 활성화. STATUS Stage 3 완료. QA stage3-final-scenarios.md ~120 항목. Catalog 갱신 (150 → ~165 sub, 신규 P1 사진 첨부 + 신규 P2 영업 모바일 마이그레이션). | W10-7c |
| 2026-05-09 ~ 2026-05-10 | Phase 12 시리즈 | PR-H1 (SSE infra) → PR-H2 (audit overlay) → PR-H3 (수정 요청 워크플로우 + 잠금 정책) → PR-H4a (shared-realtime module) → PR-H4b (BE 13 service 일괄) → PR-H4c (FE 50+ desktop page + mobile-staff 일괄). PR-H4c commit `0e3b247` 가 기존 매뉴얼 8 docs 에 inline audit overlay section 추가. | PR #123 ~ #128 |
| 2026-05-10 | **Stage 4 (본 PR)** | Phase 12 종결 후 신규 카테고리 [08-실시간-협업/](08-실시간-협업/) 10 docs 작성 (00-개요 + 01-동기화 + 02-이력 + 03-카운트 + 04-복원 + 05-요청 + 06-잠금 + 07-창고 수락 + 08-모바일 + 09-적용 범위). 본문 33 → **43 docs**. README + STATUS + missing-features-catalog 갱신. PR-H1~H4c 작동 캡처 raw URL commit-pinned 활용. | **Phase 12 step-5** |
