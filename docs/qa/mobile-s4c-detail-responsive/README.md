# 모바일 슬4c — 상세 페이지 반응형 라이브 QA

> PR #602 · 브랜치 `feat/mobile-s4c-detail-responsive` · 2026-06-25
> 실서버 라이브 캡처([[feedback_no_fake_data_ever]]) — :5175(vite preview dist/web) + 게이트웨이 :8080, `dev_master` 실 로그인. 가짜 없음.

## 검증 방법
`clients/desktop/scripts/mobile-s4c-detail-qa.cjs` — Playwright 로 mobile(390)·desktop(1280) 각 컨텍스트에서 실 로그인 → 리스트→행클릭으로 상세 페이지 진입 → `.detail-grid`/`.audit-detail-meta`/`.tax-invoice-totals` 등 **computed CSS(grid-template-columns 트랙수·display·flex-wrap) ground-truth 측정** + 전체화면 스크린샷.

## 결과 (12/14 PASS — 진입 6페이지, 신규 5클래스 전부 입증)

| 상세 페이지 | 클래스 | mobile(390) | desktop(1280) | 판정 |
|---|---|---|---|---|
| 판매전표 상세 | `.detail-grid` ×5 | grid **1 track**(1열) | grid 4 track(auto-fit) | ✅ |
| 주문서 상세 | `.detail-grid` | grid **1 track** | grid 4 track | ✅ |
| 견적 상세 | `.detail-grid` + `.estimate-totals` | 1 track + **flex wrap** | 4 track + grid | ✅ |
| 분개 상세 | `.detail-grid` + `.journal-totals` | 1 track + **flex wrap** | 4 track + grid 5track | ✅ |
| 재고실사 상세 | `.audit-detail-meta` | grid **1 track** | grid 4 track | ✅ |
| 세금계산서 상세 | `.tax-invoice-totals` | **flex + wrap**(금액 미클리핑) | grid 4 track | ✅ |

- **`.detail-grid` 모바일 1열 전환 입증**(전표·주문·견적·분개 메타 다수 인스턴스, 시각 캡처 = 라벨-값 세로 스택, 가로 overflow 0).
- **합계 행 3종 모두 모바일 flex-wrap 입증**(`.tax-invoice-totals`·`.estimate-totals`·`.journal-totals` — 금액 미클리핑·우측정렬·tabular-nums 보존) — ④ overflowX 트랩 fix 확인.
- **`.audit-detail-meta`(재고실사 120px 라벨고정폭 복원) 모바일 1열 입증** — FormGrid 오이관 되돌림 fix 확인.
- 데스크탑(>768px) 모든 클래스 무회귀(auto-fit/grid 다열) 확인.
- ⚠️ 이동전표 상세 = `.detail-grid` 미사용(범위 외, 대상 클래스 없음). (⑤ Codex 지적으로 견적/분개/재고실사 라우트 정정 후 실진입 — 초기 라우트 오류로 "데이터없음" 오보고했던 것 교정.)

## 🔴 후속 fix 진행 중 — 페이지 가로 overflow (개발책임자 라이브 QA 적발)
`.detail-grid`/합계는 1열/wrap 정상이나, **slip 상세 페이지 전체에 우측 클리핑 잔존**(app-main overflow-x:hidden): ①전표 진행 단계 스텝퍼(w=720) ②상단 액션 버튼 행(w=529, "메뉴 넘어감") ③커스텀 `table.slip-line-table`(w=702, 공용 DataTable 아님). → 버튼 flex-wrap·스텝퍼/와이드테이블 가로 스크롤(CSS클래스+@media)로 후속 fix + 페이지 레벨 overflow 재QA 예정. (진단: `scripts/s4c-overflow-diag.cjs`)

## 캡처
- `mobile-slip.png` / `desktop-slip.png` — 전표 상세(.detail-grid 1열/4열)
- `mobile-tax-invoice.png` / `desktop-tax-invoice.png` — 세금계산서(합계 flex-wrap/grid)
- `mobile-partner-order.png` / `desktop-partner-order.png` — 주문서 상세

## ④ 리뷰 fix 반영 확인
FormGrid 오이관 되돌림 + 인라인 grid→CSS클래스+@media + overflowX 제거 후, 위 측정/캡처로 모바일 1열·합계 flex-wrap·데스크탑 무회귀 모두 정상.
