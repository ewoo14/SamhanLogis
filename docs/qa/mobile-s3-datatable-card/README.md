# 모바일 슬3 DataTable 카드화 — 라이브 QA (PR #598)

> 실서버 라이브(웹빌드 :5175 + 게이트웨이 :8080, 실 로그인 dev_master·실 데이터). 가짜 금지. Playwright `scripts/mobile-s3-datatable-card-qa.cjs` + `scripts/mobile-s3-wide-qa.cjs`.

## 카드화 (일반 리스트) — ✅ 견고
| 캡처 | 결과 |
|---|---|
| `S1` 모바일 거래처 관리(7컬럼) | ✅ 카드(거래처코드/상호/사업자번호/전화/상태/신용한도/미수금 라벨-값), 가로overflow 0 |
| `S2` 모바일 판매전표 목록 | ✅ 카드(전표번호/구분/상태/거래처 + 배지). 제목 "(legacy)" 제거됨 |
| `S3` 데스크탑 거래처 관리 | ✅ 기존 테이블 그대로(무회귀) |
| `W2` 모바일 외부기사/배송사 | ✅ ④fix(이메일 긴값 줄바꿈·잘림0) + ⑤fix(관리 수정/삭제 우측정렬) |

## 듀얼리뷰 fix (④ Opus + ⑤ Codex)
- ④ MINOR: 카드 값 긴 토큰(이메일/URL/코드) 줄바꿈 보장(`min-width:0; overflow-wrap:anywhere`). W2 이메일 확인.
- ⑤ MINOR: 빈 헤더 액션셀 우측정렬(`.td[data-label=""]{justify-content:flex-end}`). W2 관리행 수정/삭제 우측 확인.

## ⑤ MAJOR(와이드 고정폭 래퍼) — 라이브QA로 슬4 재분류
- `W1` 월별손익분석 모바일 = **데이터 없음 에러**(와이드 표 미렌더). scrollWidth=390 = **페이지 가로스크롤 없음**(슬2 `.app-main overflow-x:hidden` 클립).
- ~7개 와이드 회계 보고서(월별손익 1760·홈택스 1400·채권채무 1280·DC설정 1500·PhotoAudit 1120)는 의도적 와이드 매트릭스 → **데이터 있을 때 카드 클립 가능**. 12개월 매트릭스는 카드화 자체가 별도 설계 필요 → **슬4(화면별 모바일) 범위**. 슬3 공용 카드화(~50 일반 리스트)는 견고.

## 검증
mock gate(playwright/mobile-s3-datatable-card) 2/2 + 기존 DataTable spec 18 passed 무회귀. 데스크탑(>768px)/인쇄 무변동(신규 CSS 전부 @media max-width:768px 한정).
