# 모바일 슬3 DataTable 카드화 — 라이브 QA (PR #598)

> 실서버 라이브(웹빌드 :5175 + 게이트웨이 :8080, 실 로그인 dev_master·실 리스트 데이터). 가짜 금지. Playwright `scripts/mobile-s3-datatable-card-qa.cjs`.

## 결과 (v1 — 개발책임자 보정 대기)
| 캡처 | 결과 |
|---|---|
| `S2` 모바일(390px) 판매전표 목록 | ✅ **행=카드 렌더**(전표번호/구분/상태/거래처 라벨-값 + [출고]/[처리중] 배지 값영역, 가로 overflow 0). 슬립 3건 카드 |
| `S3` 데스크탑(1280px) 거래처 관리 | ✅ **기존 테이블 그대로**(컬럼·사이드바 무변동) — 무회귀 |

- 공용 DataTable(57화면) `td data-label` + `@media(max-width:768px)` 카드 CSS → 전 리스트 화면 자동 카드화. 데스크탑(>768px)/인쇄 무변동(신규 CSS @media 한정).
- mock gate(playwright/mobile-s3-datatable-card) 2/2 + 기존 DataTable spec 18 passed 무회귀.

## 비고
- `/admin/partners` 모바일 캡처(S1)는 rows=0(데이터 로드 타이밍 아티팩트 — 데스크탑 동일 화면 20행 정상). 슬립 화면이 카드 정상 렌더로 카드화 검증됨.
- **카드 모양/라벨/간격은 개발책임자 스크린샷 보정 반영 후 확정**([[feedback_print_design_iteration]]).
