# #30 Sheets→DB 전면 치환 (PR-1) — 실 QA 결과

- 일시: 2026-06-10 / branch `feat/30-sheets-to-db-catalog`
- 범위: estimate-app 카탈로그 9종(품목/단가/구성품/자재가/추천실외기/구형/인상전baseline)의 Google Sheets 직접 read → product-service 벌크 internal endpoint 치환. **CATALOG_SOURCE 스위치(기본 sheet, db opt-in)**.
- 방법: 실 product_db + 실 Docker product-service(본 PR 코드 재빌드) + estimate-app 실 bootstrap. 가짜 데이터 0.

## ① 벌크 internal endpoint (실 컨테이너 product-service, X-Internal-Token)

| endpoint | 실 DB 건수 |
|---|---|
| `/estimate-catalog/products?category=HOME_MULTI` | 119 |
| `…SINGLE_SET` | 276 |
| `…COMMERCIAL_MULTI` | 338 |
| `…LEGACY`(구형) | 38 |
| `/components?category=SINGLE_SET` | 1447 |
| `/components?category=COMMERCIAL_MULTI` | 137 |
| `/material-prices` | 28 |
| `/odu-recommendations` | 32 |
| `/branch-pipes` | 6 |
| `/price-baseline`(인상 전) | 146 |

## ② estimate-app DB-mode bootstrap E2E (CATALOG_SOURCE=db)

실 bootstrap 결과 카탈로그 9종 전부 legacy getter shape 로 렌더:
```
home 119 | single 276 | comm 338 | singleParts 1447 | commParts 137 | old 38
material 28 | recommend comm/home 24/8 | priceInc home/comm/single 57/86/0
```
- `home[0]`: `{model:"AJ060MXHNBC1", price:1611115(납품가), list:2929300(출고가), useK2:true, capacity:17, catL:"실외기", catM:"단배관", disp:"6HP", ...}` — **분류(classifyHome_)·표시명·변동DC·용량 파생 정상**.
- `single[0]`: `{id:"360 CST UV 단상형|30|0", size:"30", price:1950000, catL/catM ...}` — **평형(pyong_size) 적재 실증**.

## ③ sync 변동DC/pyong 배선 (ProductSheetSyncService)

기존 sync 가 적재하지 않던 변동DC 4컬럼 + 평형을 FORMULA render 수식분기로 적재:
- **pyong_size**: 271/276 안정 적재(이전 0 → getSingleSets size 갭 해소).
- **고정DC(fixed_discount_rate)**: ~167 안정.
- **구형 isDisc(legacy_discount_flag, $I$1)**: 30/38 안정(#451 estimate-app 실측 31/42 와 정합).
- **useK2($L$2)·matKey($D$4·7·8)**: 홈/싱글/구형 검출 동작 확인(예: 홈 useK2 107/119 ≈ 90%, #451 93/105 정합).

## ⚠️ 명시 갭 (차이 극명 공개 — 개발책임자 지시 정합)

1. **상업멀티 useK2 검출 parity 미달**: 대용량 탭(상업멀티 417행) FORMULA render 가 반복 standalone 재기동(수십 회) 환경에서 run별 변동(86 vs #451 353/389) — Google Sheets API 대용량 FORMULA read 가 빠른 반복 호출 시 부분 응답하는 외부 동작으로 추정(소용량 구형 44행/$I$1 은 안정). detector 로직·wiring 은 단위테스트로 정상 검증. **운영 단일 sync(1회) 에서의 parity 는 별도 확인 필요** → 이 때문에 **CATALOG_SOURCE 기본값 = sheet**(무회귀), 상업 useK2 parity 종결 후 db 전환.
2. **priceInc.single = 0**: 싱글 세트 인상 전 baseline 매핑 0건(home 57/comm 86 정상) — baseline 적재/카테고리 매핑 후속 점검.
3. **recommend homeEx**: OduRecommendationLookup 이 home/homeEx 미분리 → home 과 동일 set 반환(graceful).

## 테스트

- estimate-app jest **71/71**(db-catalog 8 신규 포함). product-service 컴파일/assemble green.
- 본 PR 기본 경로(sheet)는 무회귀. DB 경로는 opt-in 으로 endpoint·mapping·분류 파생 전 항목 실증.
