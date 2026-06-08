# arologis 백오피스 Phase C 회계 — 풀스택 Docker 실화면 QA 증빙 (PR #429)

> 2026-06-08. 실 auth-service(8181, V51)+arologis-service(8197, V15)+Postgres(2DB)+렌더러+admin 로그인 end-to-end. 가짜 데이터 0 ([[no-fake-data-ever]]).

## ✅ 실 HTTP
- 계정과목(V15 seed 14): 현금/보통예금/미지급금/운송수입/기타수입/급여 등.
- 거래 4건 생성(수입 2 + 지출 2, 실 API).
- **월집계(2026-06)**: incomeTotal=2,350,000.00 / expenseTotal=3,120,000.00 / **balance=-770,000.00** / count=4. BigDecimal 정확(단식 잔액=수입-지출).

## ✅ 실화면 (cashbook.png)
현금출납장: 집계 카드 4종(수입 2,350,000 초록/지출 3,120,000 빨강/잔액 -770,000 음수 빨강/4건) + 거래 DataGrid 4행(일자/유형 badge 수입 초록·지출 빨강/계정명 한국어/거래처/금액 ±부호+천단위콤마/적요/수정·삭제) + 회계 네비(권한 게이팅) + 월별 기간·유형 필터.
- P1 fix(월별 summary 단일소스) + 금액 콤마/부호/색 + 계정 한국어 라벨 + UUID 비노출 실화면 실증.

## 검증
실 HTTP/DB + 실화면 = 전 계층 실데이터. dual review(Claude+cross-check, Codex 다운 대체) 수렴. CI green.
