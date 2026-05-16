# SP-08 QA screenshot checklist

> 위치: `docs/qa/sp-08-legacy-gas-db-api-parity/screenshots/`

| # | 파일 | 목적 |
|---|---|---|
| 01 | `01-legacy-gas-coverage-matrix.png` | legacy GAS 전체 범위와 Samhan DB/API 전환 원칙 |
| 02 | `02-notion-db-api-source-map.png` | Notion-origin 데이터의 DB/API source-of-truth 지도 |
| 03 | `03-notion-derived-crud-four-pages.png` | 단톡방/발송금지/배차지역/DC CRUD 화면 문구 정렬 |
| 04 | `04-dispatch-gas-parity-flows.png` | 배차 GAS 후속 parity 범위 |
| 05 | `05-warehouse-dps-parity.png` | DPS 저장/복원 후속 parity 범위 |
| 06 | `06-accounting-gas-parity.png` | 회계 출력/마감 후속 parity 범위 |
| 07 | `07-vendor-ocr-aligo-parity.png` | vendor OCR/알리고 후속 parity 범위 |
| 08 | `08-quote-order-source-and-history.png` | 견적/주문 저장내역 date filter 보정 |
| 09 | `09-uuid-hidden-scan.png` | UUID/secret 비노출 조건 |
| 10 | `10-business-number-format-scan.png` | 사업자번호 표시 형식 조건 |
| 11 | `11-no-skip-verification-summary.png` | no-skip 검증 요약 |

공통 조건:

- desktop 1280x900 PNG.
- PNG size non-zero.
- UUID, raw token, private key, 전체 credential value 미노출.
- PR 본문에는 최종 commit SHA raw URL로 전부 인라인 첨부.
