# SP-10-2 인성데이타 퀵프로그램 — 인쇄 양식 영향 범위 확인서

**슬라이스**: SP-10-2 인성데이타 퀵프로그램 vendor 통합  
**작성일**: 2026-05-19  
**Designer**: UI/UX Designer agent  
**참조**: `docs/planning/2026-05-19_sp-10-2-insung-quick-program.md` §1, §9 비범위

---

## 결론: 인쇄 양식 영향 0 (Zero)

SP-10-2 는 **vendor 통합 BE/FE/UX 전용 슬라이스**이다.  
인쇄 양식 (전표, 거래명세서, 세금계산서) 에 대한 변경 사항은 **없다**.

---

## 인쇄 양식 영향 없음 근거

### 범위 내 작업 (BE/FE/UX)

| 영역 | 내용 |
|---|---|
| BE | `InsungQuickDriverMatcher` / `InsungQuickClient` / webhook endpoint 3종 / Flyway V13 (`vendor_order_id` 컬럼) |
| FE | `VehicleMatchStatusBadge` / `InsungLbsPanel` / `DispatchDetailPage` 알림톡 row / vendorOrderId tooltip |
| UX | 4단계 badge 상태 시각화 / GPS 우선순위 패널 / 알림톡 발송 결과 row |
| DevOps | env template 갱신 / CI grep 가드 확장 |

위 모든 작업은 `arologis-desktop` 화면 내 **운영 UI** 에 국한된다.

### 인쇄 양식과 무관한 이유

| 인쇄 양식 | 담당 서비스 | SP-10-2 연관성 |
|---|---|---|
| 전표 (Dispatch 배차 전표) | `slip-service` | 영향 없음 — slip-service 변경 0 |
| 거래명세서 | `slip-service` | 영향 없음 — slip-service 변경 0 |
| 세금계산서 | `slip-service` + NTS 연동 | 영향 없음 — NTS 연동 (SP-09-1) 변경 0 |
| 배차 완료 인쇄 (DispatchView A4) | `arologis-desktop` print CSS | 영향 없음 — print CSS 변경 0 |

SP-10-2 Flyway V13 (`vehicle.vendor_order_id`, `vehicle.vendor_status`) 는 `arologis-service` DB 내부 컬럼 추가이며, 인쇄 렌더링 경로와 무관하다.

### 인쇄 디자인 원칙 (design-system 가이드 준수 확인)

> "인쇄 양식은 docs/migration/legacy-print-forms/ 의 실 운영 PNG 와 픽셀 단위 일치. 임의 개선 금지."  
> — UI/UX Designer 디자인 원칙 (legacy 100% 매칭)

SP-10-2 에서 위 원칙이 적용될 인쇄 양식 변경 사항은 없으므로, **iteration 주기 (3~5회) 적용 대상 아님**.

---

## 후속 슬라이스에서 인쇄 양식이 영향받는 경우 (이연 목록)

아래 항목은 SP-10-2 비범위이며 명시적으로 이연 처리된다:

| 항목 | 이연 대상 슬라이스 | 근거 |
|---|---|---|
| 배차 완료 전자서명 인쇄 반영 (`signatureSource`) | W10-4 (이미 완료) | §9 "slip-service signatureSource W10-4 머지 완료" |
| 모바일 GPS 좌표 인쇄 표기 | W10-3 별도 슬라이스 | §9 "모바일 어플 GPS 보강 정밀화 W10-3" |
| 인성 vendor 알림톡 발송 확인서 인쇄 | 비즈니스 협약 후 운영 task | §9 "인성 vendor 알림톡 템플릿 등록 절차" |

---

## QA 확인 사항 (인쇄 회귀 0 검증)

QA agent 는 SP-10-2 PR 에서 인쇄 양식에 대한 **회귀 없음**을 아래 방식으로 확인:

1. `QA-6` `insung-sidebar-no-impact.spec.ts` — 사이드바 메뉴 unchanged (인쇄 진입점 포함)
2. 기존 `DispatchView` A4 print CSS 변경 파일 없음 (`git diff --name-only` 인쇄 CSS 파일 미포함)
3. `docs/migration/legacy-print-forms/` 대조 대상 신규 파일 없음
