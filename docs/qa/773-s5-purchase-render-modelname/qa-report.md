# #773 S5 라이브 QA 리포트 — 매입(PURCHASE) 참고 노출 + modelName 채움

- **일시/환경**: 2026-07-13 (집PC). Docker 실서버 스택(mock OFF·실 게이트웨이 :8080·실 Postgres). dev_accountant(accounting.reports 실보유).
- **배포**: S5 브랜치 `feat/773-s5-purchase-render-modelname` @ `9f1eb98f` — accounting-service·product-service **양측 재빌드 jar** `docker cp`+restart.
- **웹**: `vite --config vite.web.config.ts --port 5199 --strictPort`(mock OFF·`VITE_API_BASE_URL=http://localhost:8080`)·BrowserRouter 실경로 `/accounting/daily-closings`.
- **실행**: `playwright.real-qa.config.ts` → `773-s5-purchase-render-real-qa/773-s5-real-qa.spec.ts` **1 passed (7.0s)**.

## 캡처 (단계별)
| # | 파일 | 내용 |
|---|---|---|
| 01 | `01-entry.png` | 일마감 조회 진입 |
| 02 | `02-sales-detail-model-column.png` | 매출 2026-05-03 세금계산서 상세 — 모델별 재검증 테이블(모델 컬럼) |
| 03 | `03-model-column-closeup.png` | 모델 컬럼 클로즈업 — 실 모델 토큰 vs 서비스행 '—' |
| 04 | `04-purchase-reference-banner.png` | 매입 전환 — 참고용 배너("판매(출고) 기준 참고용") |
| 05 | `05-purchase-detail-card.png` | 매입 상세 카드(배너 + 표) |

## 검증 결과 (S5 기능 실증)
- **② modelName 채움 (BE)**: 매출 05-03 상세에서 모델 컬럼이 **실 모델 토큰**(`AR09TXEAAWKNEU-04`)을 노출, 서비스 품목(관세납부 대행료·통관 수수료)은 `—`. `extractModelTokenOrNull` 이 실 모델 패턴만 노출·미매치 null→'—' 동작 라이브 확증.
  - API 실측: `GET /accounting/closings/daily?date=2026-05-03&kind=SALES&sourceKind=TAX_INVOICE` → 200, 모델행 `modelName=AR09TXEAAWKNEU-04`·`revalidationStatus=MISSING_REFERENT`(dev `price_history=0` → 정가결측). 서비스행 `modelName=null·NOT_FOUND`.
- **① 매입 참고 배너 (FE)**: 매입(PURCHASE) 전환 시 `role="note"` 참고 배너 렌더 — "매입 재검증은 **판매(출고) 기준 참고용**입니다. 정식 매입단가 감사가 아닙니다. 모델·일 합계 평균 기준 새니티 체크이며 개별 라인 단위 판정이 아닙니다." (warning DS 토큰·AA 준수). 배너는 데이터 무관 렌더(dev 매입 0행에서도 노출).
- **참고 마커('참고')**: dev 매입 데이터 0행(purchase_accounting_slips=0)이라 라이브 배지 행 캡처 불가 → **vitest 커버**(`DailyClosingPage.test.tsx`: verified 행 + null-verdict 행 모두 '참고' 마커 노출 단언, L278·L283). 정직 보고.

## 투명 QA 시드 (캡처 후 즉시 원복)
- 이 집PC dev 회계 DB 는 **최소 시드**(tax_invoices 13건 전부 운임/서비스·sales/purchase 슬립 0행)라 실 모델 품목 부재.
- 모델 컬럼 실증 위해 05-03 세금계산서 라인 1건(`c1d1e1f1-…-000000000201`) item_name 을 실 제품 마스터의 모델 라벨(`AR09TXEAAWKNEU-04 삼성 윈드프리 9평형`·product_db 실존)로 **일시 변경 → 캡처 → 즉시 원복**('특송 기본료'). 합성 데이터 아님(실 제품 모델·실서버 경유·실 캡처).

## ⚙️ 환경 발견 (코드 무관·운영 교훈)
- **stale product-service 이미지**: 최초 daily-detail 400(`product-service 조회 요청 오류: 404 NOT_FOUND`). 근본원인 = 실행 중 product-service 이미지(Jul 12 23:47)가 **구 `applicable-bulk` 단건-404 동작**(현 main 소스는 `findApplicableIfPresent` 부분성공). 정가 결측 productId 에 404 를 던져 accounting `postBulkReferent` 가 INVALID_INPUT(400) 전파 → 전체 상세 실패.
- **해소**: product-service 재빌드+재배포 → `applicable-bulk` 200 부분성공(빈 Map) → accounting price=null → **MISSING_REFERENT 정상 degrade** → daily-detail 200. 코드 변경 없음.
- **교훈**: #773 라이브 QA 는 **product + accounting 양측** stale 재배포 필요(accounting 단독 재배포 부족). 현 main 코드는 정가 결측을 per-line MISSING_REFERENT 로 정상 처리(프로덕션 리스크 없음).
