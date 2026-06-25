# 모바일 슬4c — 상세 페이지 반응형 라이브 QA

> PR #602 · 브랜치 `feat/mobile-s4c-detail-responsive` · 2026-06-25
> 실서버 라이브 캡처([[feedback_no_fake_data_ever]]) — :5175(vite preview dist/web) + 게이트웨이 :8080, `dev_master` 실 로그인. 가짜 없음.

## 검증 방법
`clients/desktop/scripts/mobile-s4c-detail-qa.cjs` — Playwright 로 mobile(390)·desktop(1280) 각 컨텍스트에서 실 로그인 → 리스트→행클릭으로 상세 페이지 진입 → `.detail-grid`/`.audit-detail-meta`/`.tax-invoice-totals` 등 **computed CSS(grid-template-columns 트랙수·display·flex-wrap) ground-truth 측정** + 전체화면 스크린샷.

## 결과 (진입 가능 상세 페이지 — ④ fix 검증)

| 상세 페이지 | 클래스 | mobile(390) | desktop(1280) | 판정 |
|---|---|---|---|---|
| 판매전표 상세 | `.detail-grid` ×5 | grid **1 track**(1열) | grid 4 track(auto-fit) | ✅ |
| 주문서 상세 | `.detail-grid` | grid **1 track** | grid 4 track | ✅ |
| 세금계산서 상세 | `.tax-invoice-totals` | **flex + wrap**(금액 미클리핑) | grid 4 track | ✅ |

- **`.detail-grid` 모바일 1열 전환 입증**(전표·주문 메타 7+ 인스턴스, 시각 캡처 = 라벨-값 세로 스택, 가로 overflow 0).
- **합계 행 `.tax-invoice-totals` 모바일 flex-wrap 입증**(공급가액/부가세/총합 금액 미클리핑·우측정렬·tabular-nums 보존) — ④ 리뷰 overflowX 트랩 fix 확인.
- ⚠️ **미진입(데이터 없음/범위 외, 정직 보고)**: 견적·분개 상세 = 로컬 DB 리스트 비어 미진입(`.estimate-totals`/`.journal-totals`는 `.tax-invoice-totals`와 **동일 @media flex-wrap 규칙** → tax-invoice로 입증). 이동전표 상세 = `.detail-grid` 미사용(범위 외). 재고실사 상세(`.audit-detail-meta`) = 리스트 미진입(클래스 정의는 `.detail-grid`와 동일 @media 1열 패턴).

## 캡처
- `mobile-slip.png` / `desktop-slip.png` — 전표 상세(.detail-grid 1열/4열)
- `mobile-tax-invoice.png` / `desktop-tax-invoice.png` — 세금계산서(합계 flex-wrap/grid)
- `mobile-partner-order.png` / `desktop-partner-order.png` — 주문서 상세

## ④ 리뷰 fix 반영 확인
FormGrid 오이관 되돌림 + 인라인 grid→CSS클래스+@media + overflowX 제거 후, 위 측정/캡처로 모바일 1열·합계 flex-wrap·데스크탑 무회귀 모두 정상.
