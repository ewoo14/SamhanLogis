# 이카운트 품목 임포트 — 모델코드 일치 품목 병합

- 일자: 2026-07-29 (회사PC)
- 관련: [[project_ecount_product_identity_rule]] · [[project_ecount_native_fold]] · PR #973(대표품목 판정 규칙 결정)
- 발견 경로: 회사PC 로컬 실데이터 리뉴얼 중 실 임포트 실행

## 1. 무엇이 막혔나

회사PC 에만 있는 파일 3종(`품목-Excel다운로드.csv` 2,836행 · `품목관계-Excel다운로드.csv` · `품목계층그룹-Excel다운로드.csv`)을 모두 갖춘 상태에서 이카운트 품목 임포트를 실행했고, **HTTP 409** 로 막혔다.

```text
POST /admin/products/imports/ecount   (itemFile + relationFile + groupFile)
{"success":false,"code":"CONFLICT","message":"동시 편집 충돌 또는 제약 위반"}
HTTP=409

product-service 로그:
  DuplicateKeyException ... duplicate key value violates unique constraint "ux_products_model_name_active"
  at EcountProductImporter.upsertProduct(EcountProductImporter.java:261)
```

집PC 가 부딪혔던 벽(`422 MIG2_NO_MAIN_CANDIDATE`, 품목관계 파일 부재)은 **파일이 갖춰져 통과**했다. 그다음 벽이 이것이다.

> 🚩 집PC 핸드오프는 *"코드 변경은 아마 불필요하다 — 422 는 파일 부재 탓이지 규칙 미구현이 아니다"* 라고 적었다. 그 진단은 422 에 대해서는 옳았으나, **파일을 갖추면 코드 변경이 필요 없다는 함의는 틀렸다.**

## 2. 원인 — 같은 물건이 두 계보로 들어온다

`UPSERT_PRODUCT_SQL`(`EcountProductImporter.java:288~`)은

- `model_name` 과 `model_code` 에 **이카운트 품목코드(`:code`)** 를 넣고
- 충돌 처리는 **`ON CONFLICT (product_code) WHERE is_deleted = FALSE`** 하나뿐이다.

그런데 구글 시트에서 들어온 기존 활성 품목은 **`model_name` = 삼성 모델코드**를 갖고 **`product_code` 는 비어 있다.** 이카운트 품목코드가 바로 그 모델코드라, `product_code` 로는 충돌하지 않고 지나간 뒤 `model_name` 유니크에서 터진다.

### 실측 — 활성 품목 1,122건 중 **726건**이 이 형태

| model_name | DB name (시트 계보) | ECOUNT 품목명 |
|---|---|---|
| `AJ050MXHNBC1` | 실외기_5HP 단배관 | `AJ050MXHNBC1 (MX단배관)` |
| `AJ025RXH3BC1` | 실외기_2.5HP 다배관 | `AJ025RXH3BC1 (RX다배관)` |
| `AJ012BN1PBC2` | 실내기(1-Way) 무풍 소형 WIFI 내장 3평형 | `AJ012BN1PBC2 [홈-WIFI 모델-小]` |

726건 중 **`product_code` 가 이미 채워진 행은 0건** — 전부 시트 계보다.

### 재계수 방법 (재현 가능)

```text
1) 이카운트 CSV 품목코드 추출 (쉼표 구분, 각 필드 끝에 탭 포함, 1행은 메타 줄)
   → 2,836건
2) docker exec samhan-postgres psql -U samhan -d product_db -tAF'\t' \
     -c "SELECT coalesce(model_name,''), coalesce(product_code,''), left(coalesce(name,''),40)
         FROM products WHERE is_deleted=FALSE;"
   → 활성 1,120행 (model_name NULL 2건 제외)
3) 교집합(db.model_name ∈ ecount.품목코드) = 726
   그중 product_code == model_name 인 행 = 0
```

## 3. 롤백 품질 — 잔재 없음

409 직후 실측:

```text
products               1,122   (임포트 전과 동일)
products(ECOUNT_MIG2)      0
product_aliases            0
```

부분 반영 없음. 이 롤백 품질은 fix 후에도 유지되어야 한다(불변식 5).

## 4. 📌 개발책임자 결정 (2026-07-29)

> **모델코드가 일치하면 같은 품목이다. 기존 행에 병합한다.**

선택지와 버린 이유:

| 안 | 내용 | 판단 |
|---|---|---|
| **A (채택)** | 모델코드 일치 = 같은 품목 → 기존 시트 행에 이카운트 품목코드·출하가·입고단가·품목구분·계층그룹을 붙인다 | 행 수가 안 늘고, 품목 하나가 두 원천 정보를 함께 갖는다. 되돌리려면 붙인 필드만 지우면 된다 |
| B | 두 계보를 분리 유지(이카운트 행은 `model_name` 비움) | 같은 물건이 2행. 활성 1,122 → 약 3,900. 이후 어느 쪽이 정본인지 매번 판단해야 함 |
| C | 이번 리뉴얼에서 품목 임포트 제외 | 회사PC 에만 있는 파일로 끝낼 수 있는 일을 다시 미룸 |

## 5. 불변식 (구현자에게 하달 — 수단 미지시)

1. 이카운트 품목코드가 기존 활성 품목의 모델코드와 같으면 **그 품목이 갱신된다.** 같은 물건이 두 행이 되지 않는다
2. **임포트 때문에 사용자가 화면에서 보던 품목명이 바뀌지 않는다**
3. 이카운트가 정본인 값은 반영된다 — 품목코드·출하가·입고단가·품목구분·계층그룹이 병합 후 조회된다
4. 같은 파일로 두 번 돌려도 결과가 같다(멱등)
5. 실패하면 부분 반영이 남지 않는다(§3 롤백 품질 유지)
6. 기존 대표품목 판정 규칙(`resolveMainCandidate` ①품목관계 alias→대표 ②관계 등재 대표 ③DB 동명 ④유일명 ⑤fail-closed)이 이 변경으로 달라지지 않는다

## 6. 검증 계획

- **RED-first** — 결함을 재현하는 실패 테스트를 먼저 쓰고 RED 원문을 제출한 뒤 고친다
- **fixture 는 실 경로가 만들 수 있는 상태만** — 시트 sync 가 실제로 만드는 형태(`model_name` 채움 + `product_code` 비움). raw SQL 로 실 API 가 못 만드는 상태를 심지 않는다
- **라이브QA** — 실서버(`localhost:8084`)에 실제 파일 3종으로 임포트를 돌려 409 소멸 확인 + 행 수 재계수(`products` / `ECOUNT_MIG2` / `product_aliases` / 병합 표본의 `name`·`product_code`·`outbound_price`)

## 7. 이 문서가 다루지 않는 것

- **주문 확정 단가 드리프트** — 같은 세션 정찰에서 별건으로 확인됨(FE 표시 `15,979,260` vs 서버 확정 `15,107,664`, 차이 `871,596원`). 원인·범위가 다르므로 별도 트랙
- 시트 sync 로직 자체
- 기존 데이터를 마이그레이션으로 일괄 손질하는 일 (임포터 동작만 고친다)
