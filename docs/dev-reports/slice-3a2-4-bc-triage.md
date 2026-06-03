# Slice: 3-A2-④ B/C그룹 재게이트 — sp-d4 재게이트 + 잔여 triage

> branch `feat/3-a2-4-bc-regate` / 2026-06-03 / clients/desktop. ⑤(A그룹) 후속, 개발책임자 "⑥ 계속" 지시.
> B/C 11 스펙(sp-d4 포함)을 un-ignore 후 실 mock dev server 로 triage.

## 1. Triage 결과 (52 passed / 28 failed)

| 스펙 | 실패 | 분류 |
|---|---|---|
| **sp-d4-remaining-pages** | **0** | ✅ 전체 green(20) — **재게이트 완료** |
| phase-2-5-partner-order-hold | 1 | ON_HOLD 상태 필터 행 표시 |
| sp-09-1-nts-etax-emit-shell | 1 | eTaxExternalId 화면 표시 |
| supplier-profile | 1 | TC-SP-1 seed 7 필드 표시 |
| tax-invoice-batch | 1 | TC-TIB-1 4탭 visible |
| sp-08-6-6-tax-invoice-emit | 2 | 발행 CTA/"신규 작성" 버튼·한국어 라벨 |
| sp-09-3-ocr-receipt-shell | 3 | OCR shell |
| sp-09-4-kftc-shell | 3 | KFTC shell |
| sp-09-5-vendor-integration | 3 | vendor shell |
| sp-09-2-aligo-sms-real-send | 5 | 알리고 SMS |
| phase-2-6c-inventory-deduction | 8 | 재고 현황 모달 visible |

## 2. A그룹과의 차이 (개별 verify-then-fix 필요)

A그룹(sp-d2/sp-d3)은 **단일 redirect-차단 단언 패턴**(이중 가드)이라 sp-d4 패턴 일괄 교정으로 해결됐으나,
B/C 실패는 **각 기능별 콘텐츠/상호작용 이슈**다 — modal click timeout, button toBeEnabled, 특정 콘텐츠
("재고 현황"/"4탭"/"seed 7 필드") toBeVisible timeout, 권한 CTA 노출 등. 공통 패턴이 아니라 스펙별 실 기능/
mock 데이터 검증이 필요하다(드리프트 vs 실 기능 갭 분류 포함).

## 3. 본 슬라이스 산출 + 후속

- **sp-d4 재게이트**(20 TC) — testIgnore 해제. 무변경(스펙 자체 green).
- 나머지 9 스펙은 각 1~8 실패로 **개별 verify-then-fix 가 필요**해 격리 유지(triage 표 + failure 분류 기록).
  다음 세션에서 스펙별로 (1) 실 mock 동작 진단 → (2) 드리프트면 단언 교정 / 실 기능 갭이면 별도 구현 슬라이스 분리.
- 우선순위 제안: 단일 실패(phase-2-5/sp-09-1/supplier-profile/tax-invoice-batch) → sp-08-6-6 → sp-09-2~5 → phase-2-6c(최다).
