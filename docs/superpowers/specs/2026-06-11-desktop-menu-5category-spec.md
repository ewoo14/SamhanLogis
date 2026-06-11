# 좌측 메뉴 5대 분류 재편 + 홈 최상단 (clients/desktop AppLayout)

> 개발책임자 결정 ([[item-exposure-and-menu-5cat]] §2 + 2-보강, 2026-06-10): 좌측메뉴를 **판매/구매/회계/그룹웨어/인사 5대분류 + 배차(arologis)·창고운영 별도(실질 7그룹)**. 권한 있는 메뉴만 표시(기성). 홈 최상단 신규. 알림 내역만 상단 유지.

## 0. 정찰 사실 (현 AppLayout.tsx)
- **권한 필터 = 기성 완료**: 전 메뉴가 `usePermissions().canAccess(pageCode,'view')`(dynamicCanAccess) 게이트. SP-D1~D4. **재구현 불요 — 보존**.
- 현 구조: top-level(대시보드/알림내역/창고관리/판매관리/구매관리/영수증OCR/재고이동/링크발송/배차) + 비정규 그룹(판매/회계/arologis/창고운영/알림매핑/메신저/품목/설정/인사). 그룹 헤더는 `app-sidebar-group` div(uppercase 라벨).
- **본 슬라이스 = IA 재배치(컴포넌트 이동·그룹핑)만**. 라우트·page-code·권한 로직 **무변경**(메뉴 위치만).

## 1. 목표 구조 (상단 고정 2 + 7 그룹)

**상단 고정 (그룹 밖, 권한 무관 또는 기존 게이트)**
- **홈** (`/`) — 기존 '대시보드' 리라벨(전원 노출).
- **알림 내역** (`/notifications`) — 유지.

**① 판매** — 판매관리(`/sales`) · 견적서 관리 · 주문서 관리 · 주문서 승인 · 거래처 관리 · 거래처 DC 설정 · 발송금지 거래처 · 전표 정리 · 내일자 전표 이미지 · vendor 발주 OCR · **품목 관리**(견적/주문 피드 — 🟡 개발책임자 확인: 판매 기본, 별도 '기준정보' 가능) · 시트 동기화

**② 구매** — 구매관리(`/purchases`) · 영수증 OCR · 재고이동 관리(`/transfers`) · 입고 검수 · 재고 실사 · DPS 입고 비교 · 품목별 DPS 분석

**③ 회계** — (기존 회계 그룹 전체) 매출전표·매입전표·계정과목·분개장·세금계산서(3종)·시산표·재무 보고서(서브)·**매출 마감**(판매서 이동)·월말 마감·거래명세서 일괄·거래처 원장·홈택스·공급자 설정·입금 매칭·일마감·원장 + **회계 관리자**(collapsible 유지)

**④ 그룹웨어** — 링크발송(판매서 이동) · 알리고 주소록 · 단톡방 매핑

**⑤ 인사** — 인사 관리 · 권한설정 · 권한 일괄 적용 · 그룹 권한 · 권한그룹 관리 · 권한 위임

**⑥ 배차 (arologis)** [별도] — **배차 메뉴**(`/dispatch-board`, top-level서 이동) · 수동 배차 · 가배차 분류 · 미배차 리스트 · 배차안내 SMS · SMS 발송 이력 · 실배차 비교 · 배차지역 관리 · 자동 매칭 · 배차 관리 · 기사 배정

**⑦ 창고 운영** [별도] — 창고관리(`/warehouses`, top-level서 이동) · 재고 현황 · 안전재고 알림 · 보상 실패 복구 · 전표 수정 요청 · 사진 감사

## 2. 구현 (AppLayout.tsx)
- 그룹 헤더 컴포넌트 추출: `SidebarCategory({label, children})` — 기존 inline `app-sidebar-group` div 스타일 재사용, **그룹 내 자식 중 1개라도 `show=true`면 헤더 노출**(현 `showAccounting`/`showArologis` 패턴 일반화 — 빈 그룹 헤더 미노출).
- 모든 기존 `dynamicCanAccess`/`show*` 변수·page-code **보존**(이동만). `SidebarLink`/`NavLink` 그대로.
- 홈: `<NavLink to="/" end>홈</NavLink>`(라벨만 '대시보드'→'홈'). 알림 내역 유지.
- top-level 이동: 창고관리→⑦, 판매관리→①, 구매관리/영수증OCR/재고이동→②, 링크발송→④, 배차→⑥. 매출마감 판매중복 제거(회계 단일).
- 품목/시트동기화 → ① 판매(또는 결정 시 별도). 설정 그룹(시트동기화 fallback)은 품목 그룹과 통합.
- 회계 관리자 collapsible·재무 보고서 서브 들여쓰기 보존.

## 3. QA (실서버 Docker — 라운드별 QA agent 스크린샷)
- 역할별(MASTER/SALES/ACCOUNTANT/WAREHOUSE/DISPATCH) 로그인 → 5대분류+배차·창고운영 그룹 노출·권한필터(없는 메뉴 미노출) 실 캡처. 홈 최상단·알림내역 상단 확인. 각 메뉴 클릭→라우트 정상(redirect 없음).

## 4. 테스트
- Playwright menu spec 갱신: `full-menu-contract`·`menu-relocate`·`permission-overhaul/applayout` 등 기존 메뉴 계약 spec을 새 그룹 구조로 갱신(testid 보존). 권한별 그룹 노출 단언.

## 5. 비스코프
- 권한 로직·page-code·라우트 변경 / 홈 대시보드 화면 자체 개편(라벨만). order-app 카테고리 탭(별도 대기).
