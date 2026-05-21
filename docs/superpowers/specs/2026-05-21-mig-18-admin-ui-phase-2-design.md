# MIG-18 admin UI 2단계 보강 — Design Spec

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-18-admin-ui-phase-2`
> 입력: MIG-14 Designer-MIN-2 + MIG-17 D-MIG-17-03 이연

---

## 1. 개요

MIG-17 머지 후 PM 자율 연속 — **E admin UI 2단계 보강** (FE + Designer 중간 슬라이스).

- baseline: MIG-1~17 머지
- 옵션 C 21단계

---

## 2. 보강 항목

### 2.1 필터 chip + reset UI (MIG-14 Designer-MIN-2)
- admin 7 화면 (Cash 2 + Order 2 + Aging 1 + Ledger 2) 의 필터 패턴 통일
- 적용된 필터 chip 표시 + 개별 chip 제거 + "전체 초기화" 버튼
- `FilterChipBar.tsx` 신규 컴포넌트 (재사용)

### 2.2 AGING 페이지네이션 UI (MIG-16 BE 보강 후 FE 활용)
- MIG-16 에서 `/aging-snapshot` Pageable BE 지원됨
- FE PartnerAgingSnapshotPage 에 페이지네이션 컴포넌트 + 페이지 사이즈 선택 (50/100/200/500)

### 2.3 스크린샷 Linux 재캡처 (MIG-14 QA-MIN-1)
- `docs/qa/mig-14-admin-ui/screenshots/` 4 PNG 가 Windows EPERM mock fallback
- Linux CI dev server 에서 Playwright 캡처 → 실 화면 PNG 갱신

### 2.4 사이드바 메뉴 그룹화
- admin 7 메뉴 → 회계 admin 그룹 collapse/expand 패턴
- 권한 캐시 false 시 hidden (MIG-16 일관)

---

## 3. 산출 예정 (25~40 file, 약 800~1.2K LOC)

| 영역 | 변경 |
|---|---|
| clients/desktop | FilterChipBar 신규 + 7 admin 화면 적용 + AGING pagination + Sidebar 메뉴 그룹화 |
| docs/qa/mig-14-admin-ui/screenshots/ | 4 PNG Linux 재캡처 |
| docs/design/mig-14-admin-ui/ | chip + reset 패턴 mockup 갱신 |
| dev-report + DECISIONS | D-MIG-18-01~04 |

---

## 4. 결정 (D-MIG-18-XX)

- D-MIG-18-01 `FilterChipBar` 신규 컴포넌트 (admin 재사용)
- D-MIG-18-02 7 admin 화면 일괄 적용 (Cash 2 + Order 2 + Aging 1 + Ledger 2)
- D-MIG-18-03 AGING pagination FE 컴포넌트 + 사이즈 선택 (50/100/200/500)
- D-MIG-18-04 스크린샷 Linux 재캡처 의무 (Playwright dev server)
- D-MIG-18-05 사이드바 메뉴 그룹화 (회계 admin 7 메뉴 collapse/expand)
- D-MIG-18-06 옵션 C 21단계 + PM 자율 연속

---

🤖 PM Claude (Opus 4.7) — 2026-05-21 자율 연속
