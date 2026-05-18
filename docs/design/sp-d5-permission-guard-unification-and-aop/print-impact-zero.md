# SP-D5 인쇄 양식 100% 보존 확인서

**슬라이스**: SP-D5 PermissionGuard 단일화 + Counter.builder + AOP 통합  
**작성일**: 2026-05-19  
**담당**: UI/UX Designer agent  
**참조**: `docs/design/sp-10-2-insung-quick-vendor/print-impact.md` (패턴 일관)

---

## 결론: 인쇄 양식 영향 0 (Zero), legacy GAS parity 100% 보존

SP-D5 는 BE 인프라 전용 슬라이스이며, 인쇄 렌더링 경로와 전혀 무관하다.  
legacy GAS 동등 기능 (SP-08 parity) 인쇄 양식은 본 슬라이스 이후에도 픽셀 단위 동일하게 유지된다.

---

## 1. 인쇄 양식 영향 분석

### 인쇄 양식 대상 목록

| 인쇄 양식 | 담당 서비스 / 경로 | SP-D5 연관성 |
|----------|-----------------|------------|
| 배차 전표 (Dispatch 전표) | `slip-service` → 인쇄 HTML | 영향 없음 |
| 거래명세서 | `slip-service` → 인쇄 HTML | 영향 없음 |
| 세금계산서 | `slip-service` + NTS 연동 (SP-09-1) | 영향 없음 |
| 배차 완료 인쇄 (DispatchView A4) | `arologis-desktop` print CSS | 영향 없음 |
| 매출 거래명세서 (sales 전표) | `slip-service` | 영향 없음 |
| 매입 거래명세서 | `slip-service` | 영향 없음 |

### 인쇄 영향 없음 근거

SP-D5 의 변경 파일은 다음으로 제한된다:

1. `shared/security/` — `@RequirePermission` annotation, `PermissionAspect`, `DynamicPermissionClient`
2. 각 서비스 컨트롤러 — `@PreAuthorize` 제거, `@RequirePermission` 추가
3. `PermissionGuardMetrics` — Micrometer Counter 등록

위 파일 중 인쇄 HTML 렌더링, CSS, 인쇄 레이아웃과 관련된 파일은 **0개**이다.

---

## 2. legacy GAS parity 원칙 준수 확인

> **디자인 원칙**: "인쇄 양식은 docs/migration/legacy-print-forms/ 의 실 운영 PNG 와 픽셀 단위 일치. 임의 개선 금지."

| 확인 항목 | 상태 |
|---------|------|
| `docs/migration/legacy-print-forms/` 신규 파일 추가 | 없음 |
| 기존 인쇄 CSS 파일 수정 | 없음 |
| `slip-service` 인쇄 렌더링 로직 수정 | 없음 |
| 인쇄 typography (12px 명조계열) 변경 | 없음 |
| A4 print margin / layout budget 변경 | 없음 |

---

## 3. design-system 인쇄 토큰 보존 확인

`clients/web/design-system/src/tokens/tokens.css` 에 정의된 인쇄 관련 토큰은 SP-D5 이후에도 동일하다:

| 토큰 | 값 | SP-D5 후 |
|-----|---|---------|
| `--print-text-base` | 14pt | 동일 |
| `--print-text-sm` | 11pt | 동일 |
| `--print-text-xs` | 9pt | 동일 |
| `--print-text-md` | 12pt | 동일 |
| `--print-text-lg` | 18pt | 동일 |
| `--print-approval-w` | 38mm | 동일 |
| `--print-approval-h` | 22mm | 동일 |
| `--print-signature-w` | 80mm | 동일 |
| `--print-signature-h` | 35mm | 동일 |
| `--print-page-w` | 210mm (A4) | 동일 |
| `--print-page-h` | 297mm (A4) | 동일 |
| `--print-page-margin` | 12mm | 동일 |
| `--print-line-color` | #000 | 동일 |
| `--print-thead-bg` | #F0F0F0 | 동일 |

---

## 4. QA 확인 요청 사항

QA agent 는 SP-D5 PR 에서 인쇄 양식 회귀 없음을 다음 방식으로 확인한다:

1. `git diff --name-only origin/main` 결과에 print CSS 파일 미포함 확인
2. `slip-service` 관련 파일 변경 없음 확인
3. 기존 인쇄 Playwright 시나리오 (sales-form-polish, dispatch print) 회귀 없음 확인
4. `docs/migration/legacy-print-forms/` 디렉토리 변경 없음 확인

---

## 5. 인쇄 양식 iteration 비적용 선언

본 슬라이스는 `feedback_print_design_iteration` 규칙 (사용자 이미지 → mock → Edge 캡처 → 3~5회 iteration 의무) 의 적용 대상이 아니다.

이유: 인쇄 양식 변경 사항이 없으며, Designer 가 개입해야 할 인쇄 결과물이 없다.
