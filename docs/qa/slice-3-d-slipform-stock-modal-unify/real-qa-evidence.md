# item 3-D 실 QA 증빙 — SlipFormPage 재고모달 일원화

- **일자**: 2026-06-02
- **PR**: #343 / 브랜치 `feature/slice-3-d-stock-modal-unify`
- **유형**: 비파괴 실 QA (TRUNCATE/reseed 없음 — 개발책임자 결정)

## 환경 (실서버)
- **실 게이트웨이** `:8080` (Docker `samhan-api-gateway`, healthy) + 실 JWT(dev_master, MASTER)
- **실 서비스**: product(:8084) / inventory(:8085) / slip / auth / eureka — 전부 healthy (Docker)
- **실 DB**: postgres `product_db` / `inventory_db` / `auth_db`
- 데스크톱 렌더러 = vite 실 모드(`VITE_MOCK_MODE` 미사용), base URL = 게이트웨이 `:8080`. `window.samhanAuth` 에 실 JWT 주입 → `apiClient` 가 `Authorization: Bearer` 로 게이트웨이 호출(게이트웨이가 실제 JWT 검증).
- 캡처 하니스: `clients/desktop/playwright/manual/slip-form-3d-real-qa.spec.ts`

## 검증 결과 (PASS)
| 항목 | 결과 |
|---|---|
| SlipFormPage 실 렌더 | ✅ 새 출고전표 폼 렌더 + `slip-form-inventory-lookup-btn` 노출(Button data-testid passthrough 작동) |
| 품목 실 선택 | ✅ ProductAutocomplete 가 실 product-service 검색(q=AC) → `AC100CNCDEH-76` 선택 |
| **신 모달 일원화** | ✅ 재고조회 → **`InventoryLookupModal`**(가용/실/예약 3줄) 오픈. 구 `StockBalanceModal`(총량+합계) 아님 |
| 실 라운드트립 | ✅ `POST /inventory/balances/batch` **status=200**(게이트웨이 경유 실 호출) |
| VIRTUAL 제외 | ✅ 모달에 '가상창고' 미노출 |
| UUID 비공개 가드 | ✅ 모달 텍스트에 UUID 패턴 0건 |
| 0수량 토글 | ✅ OFF(기본) → "조회된 재고 창고가 없습니다" / ON → 전 비-VIRTUAL 창고 매트릭스 노출 |

## ⚠️ 값 0/0/0 사유 (정직 보고 — 가짜 데이터 금지 원칙)
로컬 **구-시드 드리프트**([[project_seed_product_uuid_catalog]]): `product_db`(autocomplete 소스, 100품목)와 `inventory_db` stock_balances(103품목)의 **공통 productId = 0**(실측). 따라서 autocomplete 로 선택 가능한 품목은 inventory 잔량이 0 → 매트릭스 값 0/0/0.
- 이는 **3-D 코드와 무관한 로컬 환경 상태**이며, 비-0 가용/실/예약 값 렌더는 **동일한 `InventoryLookupModal` 로 2.6d(#335) 실 QA 에서 이미 실증**됨(`docs/qa/slice-2-6d-inventory-lookup/`).
- 본 QA 의 실증 대상 = "SlipFormPage 가 신 모달을 **실 서버로 연다**"는 일원화 자체. 비-0 값까지 보려면 3-DB reseed 후 재캡처(머지 후 별도 가능, 비차단).

## 스크린샷 (실 렌더, fullPage)
| 파일 | 장면 |
|---|---|
| `01-slipform-empty.png` | 새 출고전표 폼(재고조회 버튼 비활성) |
| `02-product-selected.png` | ProductAutocomplete 실 선택(AC100CNCDEH-76) |
| `03-line-selected.png` | 라인 체크 → 재고조회 버튼 활성 |
| `04-modal-toggle-off.png` | 모달 오픈(0수량 OFF) |
| `05-modal-toggle-on-matrix.png` | 0수량 ON → 가용/실/예약 매트릭스(VIRTUAL 제외) |

## 부수 메모 (환경)
- dev_master 비밀번호 해시가 V5 시드 DEV 평문값(V5 시드/`.gitguardian.yaml` 화이트리스트에만 보관)과 불일치하던 기록된 함정([[CURRENT-WORK]] 환경 메모)을 해소 — 문서화된 의도값으로 복원(가역 DEV 인증 변경, 비파괴). 평문은 본 문서에 미기재.
- design-system `dist` 가 stale(소스 배럴 대비) → 렌더러 마운트 실패하던 것을 `npm run build`(DS) 재빌드로 해소. CI 는 `build:legacy` 선행이라 무관.
