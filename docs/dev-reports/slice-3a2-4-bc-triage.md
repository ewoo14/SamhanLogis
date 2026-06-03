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

## 4. 확인된 드리프트 패턴 (다음 세션 핵심 단서)

supplier-profile 정밀 진단 결과 **명확한 스펙 드리프트** 2종 확인 — 다른 B/C 스펙도 동일 점검 권장:

1. **HashRouter URL 누락**: `page.goto(\`${BASE_URL}/accounting/supplier-profiles\`)` — `/#/` 가 빠져 SPA 가 라우트를
   인식 못 하고 홈/로그인으로 떨어짐 → 대상 페이지 콘텐츠 "미표시". 올바른 형태는 `${BASE_URL}/#/accounting/...`.
   (sp-d2/sp-d3/sp-09 정상 스펙은 모두 `/#/` 사용 — 회귀 가드도 `/#/` 패턴 강제.)
2. **seed 값 드리프트**: 스펙 `SEED_BUSINESS_NUMBER='2148720659'` vs 현 mock seed `'1112233333'`(㈜삼한공조시스템/김미선).
   mock 데이터 갱신분과 스펙 기대값 불일치.

→ 다음 세션은 각 격리 스펙에서 (a) goto URL `/#/` 정합 (b) mock seed 기대값 정합 (c) data-testid 존재 여부
   부터 점검하면 drift 분이 빠르게 green 전환될 것으로 보인다(실 기능 갭은 그 후 분리).

### supplier-profile 부분 정정 결과 (본 슬라이스에서 착수, 격리 유지)

- 적용: ① 7개 goto URL `/#/` 정합 ② `SEED_BUSINESS_NUMBER` 2148720659→1112233333(현 mock seed) ③ TC-SP-1
  사업자번호 포맷(formatBizNo `000-00-00000`) 허용. → **5/7 pass**(broken→5/7 개선, 스펙 개선분 커밋).
- 잔여(격리 유지): **TC-SP-3**(신규 추가 → list size 2) = `add → 폼 → save` 상호작용 흐름 드리프트 —
  `supplier-profile-add-btn` 클릭 후 저장 버튼 셀렉터(`supplier-profile-save`)가 흐름과 불일치(click timeout).
  실 UI 플로우 대조 후 셀렉터/스텝 재작성 필요. (TC-SP-1 도 포맷 정정 후 재확인 권장.)
- 교훈: **URL `/#/` 정정으로 페이지가 실제 로드되면, 그동안 가려졌던 상호작용 TC 실패가 새로 표면화**된다
  (페이지 미로드 시엔 트리비얼 통과/단순 실패였던 것). 각 스펙은 URL 정정 후 상호작용 TC 재검증이 필수다.

### tax-invoice-batch 부분 정정 결과 (본 슬라이스 착수, 격리 유지)

- 적용: 7개 goto URL `/#/` 정합 + `test.skip(!ok)`→`expect(ok).toBe(true)`(SP-09 패턴). → **6/7 pass**.
- 잔여(격리 유지): **TC-TIB-1**(4탭 visible) = 기대 4탭["미리보기 생성/결과 페이지/전표 필터/저장 내역"] 전부 미발견.
  🔑 `TaxInvoiceBatchPage.tsx` 주석: **"PR #161 4탭 UI 는 HometaxExportPage(`/accounting/hometax-export`)로 흡수됨"**
  — TC-TIB-1 은 **이전된 기능**을 검증하므로 단순 라벨 수정이 아닌, batch 페이지 현행 UI 기준 재작성 또는
  hometax-export 페이지로 대상 변경이 필요(실 기능 재배치 반영).

### ⑥ 본 세션 종합

- ✅ 재게이트: **sp-d4(20 TC)**.
- 🔧 부분 정정(격리 유지, 개선분 커밋): supplier-profile(5/7), tax-invoice-batch(6/7) — `/#/` 드리프트 정정.
- 📋 잔여 8스펙 + 위 2스펙의 잔여 TC = 다음 세션 per-spec verify-then-fix(드리프트 패턴 + 기능 재배치/흐름 대조).
