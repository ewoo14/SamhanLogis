---
name: slip-shipout-print-form
description: 출고전표 출력/조회 양식 1:1 재현 + 전자서명 양식 내 정확 배치 + 사원 서명 등록 (2026-06-10 개발책임자 지시)
metadata:
  type: project
---

# 출고전표·거래명세서 양식 1:1 + 전자서명 배치 + 사원 서명 등록 (2026-06-10)

## 개발책임자 지시 (원문 요지)
1. 출고전표 **출력** 또는 **조회**(편집 창이 아닌 창고·배송기사·인수자가 보는 문서양식) 시 제공된 샘플 양식 그대로 보여야 함. **양식 전혀 변동 없이 정확하게.**
2. **전자서명이 해당 양식에 정확히 반영**되어야 함 (용달기사 서명 / 인수자 서명 란).
3. **사원등록 메뉴에서 해당 사원의 서명**(추후 전자서명 활용) 등록 가능해야 함 → 양식의 출고인/검수인/담당자 결재란 스탬프로 활용.

## 샘플 원본 (⚠️ public repo 비커밋)
- 위치: `.claude/tmp/slip-form-sample/20260610_173747.png` (gitignore — 실거래처명/휴대번호/주소 포함이라 docs/sample 에서 이동)
- 익명화 mock: `docs/qa/slip-shipout-print-form/mocks/01_shipout_v1.html` (Edge 캡처 1차 — 원본 근접 일치)

## 양식 구조 (샘플 분해)
SAMSUNG 로고(청색) → [거래처명 대형박스 | 결재표(담당부서/담당자/출고인/검수인/결제 5열 2행)] → [전표번호 `YYYY/MM/DD -N` | 출고창고(적색)] → 품목표(월/일·품목명·규격·수량, 굵은 행, 총합계 italic) → 배송주소(대형 볼드 2줄) → 연락처 → 특이사항 → 안내문 → 서명박스(※경고문 + 용달기사 서명 | 인수자 서명) → 책임고지 2줄.

## 기존 자산 (정찰 2026-06-10)
- 인쇄 패턴: `clients/desktop/src/renderer/print/PrintLayout.tsx` + PurchaseSlipPrintPage 등 5종 (A4 portrait)
- 서명: Slip 엔티티에 인수자(signaturePng/Hash/signedAt/signerName)+기사(driverSignature*) bytea 저장 완비. SignaturePad/SignatureViewer 컴포넌트 존재. 공개 조회 `GET /public/signatures/{shareToken}` (+30일).
- 출고인/검수인: 현재 timestamp 만 (PNG 없음) → 사원 서명 등록으로 스탬프 공급.
- 기사 조회: arologis-mobile DriverSlipDetailScreen (서명/인쇄 없음).

## 거래명세서 양식 (2026-06-10 추가 첨부)
SAMSUNG 로고+「거래명세서」제목 → [공급받는자 박스(거래처貴中/주소/☎) | 공급자 표(세로 '공급자' 라벨 + 일련번호·TEL/사업자등록번호·성명/상호/주소) + 적색 인감 스탬프 overlay] → 배송지(적색 볼드) → 금액(한글 금액 정 + ₩숫자) → 품목표(월/일·품목명·수량·단가·공급가액·부가세, 빈행 filler) → 합계행(수량/공급가액/VAT/합계/인수·인) → 계좌 푸터(적색 — **계좌번호 실데이터, 비커밋 주의**). mock v1 = `docs/qa/slip-shipout-print-form/mocks/02_statement_v1.html`. 기존 SalesTransactionStatementPrintPage(SP-08-6-4) 와 이 샘플 차이 정렬 필요.
※ docs/sample = gitignore 드롭 폴더화(README 만 추적) — 샘플 자유 투입 가능, 커밋 불가.

## 가변 길이 + 한 A4 자동 비율 (2026-06-10 개발책임자 추가 — 출고전표·거래명세서 공통)
품목이 많아지면 전표/명세서 길이가 길어질 수 있음. **가급적 하나의 A4 에 들어오도록 자동 비율 조정** 원함.
구현: 콘텐츠 높이 측정(useLayoutEffect+ref) → `zoom = min(1, A4가용높이/콘텐츠높이)` 자동 축소(Chromium/Electron zoom 은 layout 반영).
가독 하한(약 0.5) 미만으로 떨어질 품목 수면 그때만 다페이지 fallback: 품목행 `page-break-inside: avoid`,
`thead` 페이지 반복, 서명·합계·계좌 블록은 통째 이동(`break-inside: avoid`).

## 기존 구현 검토 결론 (2026-06-10 — "이미 구현됨, 원본 양식으로 개선" 지시)
- **DispatchView**(`/sales/:id/print/dispatch`) = 출고전표. 전자서명 PNG 렌더 이미 구현. 샘플과 차이: 품목표 4열(모델명/품목명/규격/수량)→샘플은 **월/일|품목명(모델+명 결합)|규격|수량**(PR#21 의 '월/일 제거' 결정을 원본 양식 지시가 대체), 결재칸 `*`→`결 제`+MMDD.
- **SalesTransactionStatementPrintPage**(`/sales/:id/print/statement`) = 거래명세서. 현 구현(3열 헤더/8컬럼/audit 푸터)은 샘플과 전혀 다름 → 샘플 구조로 전면 재설계(공급받는자박스+공급자표+인감/배송지적색/한글금액/6컬럼/합계행/계좌푸터). 공급받는자 주소·전화 = `getPartnerFull(partnerCode)`.
- 인감 스탬프·실계좌번호 = public repo 비커밋(위조/사기 위험) → env/설정 주입 + placeholder fallback.

## 슬라이스 계획
- **A. 출고전표 문서양식 컴포넌트** (desktop print + 조회 read-only 공용): 양식 1:1, [[feedback_print_design_iteration]] 3~5회 캡처 반복 의무.
- **B. 전자서명 양식 배치**: 용달기사/인수자 PNG sig-area 렌더 + 공개 share 조회뷰 동일 양식.
- **C. 사원 서명 등록**: user-service Employee 에 signature PNG(bytea+hash) + 사원등록 메뉴 SignaturePad 등록 UI → 양식 결재란(담당자/출고인/검수인) 자동 스탬프.

관련: [[order-slip-conversion]], [[feedback_print_design_iteration]], [[feedback_no_fake_data_ever]]
