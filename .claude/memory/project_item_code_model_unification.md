---
name: project_item_code_model_unification
description: 품목 식별 체계 — 순번코드에서 모델명=품목코드로 전환 · UUID(미노출)와 노출키는 분리 · 세 컬럼 실측 계약 (2026-07-30 개발책임자 결정)
metadata:
  type: project
---

# 품목 식별 체계 — 품목코드 = 모델명 으로 전환 (2026-07-30 개발책임자 결정)

## 결정

> *"원래는 이카운트 순번코드로 초창기 생성하다가 이제는 **모델명 = 품목코드 체계로 전환**되어서 그래. 하여 순번코드 방식을 쓰다가 전환되어 **2개의 같은 기초품목(관계설정)이 있는 경우**도 있고, 그냥 **예전 품목은 그 순번코드 방식으로 그대로 놔둔 경우**도 있어. 그렇기 때문에 우리 프로젝트에서는 **이 데이터들도 모두 현재 체계로 전환**할거야."*
>
> *"따라서 **품목코드와 모델명이 다른건 잘못되었으므로 이것도 품목코드로 합치되**, 견적서와 주문서같은 웹에서는 **모델명으로 표기**하는거지."*
>
> 🚨 *"**UUID는 미노출 서버키이므로 품목코드(노출용 키)와 합쳐서는 안돼**."*

## 두 축은 분리 유지

| 축 | 역할 | 노출 |
|---|---|---|
| **UUID** (`products.id`) | DB PK · 서비스 내부 식별·조인 | **미노출** |
| **품목코드 (= 모델명)** | 사용자 화면·문서·외부 연동 식별 | 노출 |

"통일" 의 대상은 **노출 키 계열 세 컬럼끼리**다. UUID 와의 통합이 아니다.
경계에서는 품목코드, 내부에서는 UUID — PR #985 의 `ConfirmLineRequest(productId, modelCode, ...)` 가 그 형태다.

## 🚨 현재 컬럼 계약 실측 (2026-07-30 · 집PC) — 구두 표현과 다르다

`products` 활성 1,220건 기준.

| 컬럼 | 담고 있는 값 | 보유 |
|---|---|---|
| `product_code` | **이카운트 품목코드** — 숫자 6자리(`010001`) | **100건** |
| `model_name` | **GAS 분류용 모델 토큰**(`AJ…`·`AM…`) | **1,220건 전부** |
| `model_code` | 모델 alias — 있는 행은 `model_name` 과 동일 | 1,120건 |
| `name` | 설명형 품목명(`실외기_3HP 다배관`) | — |

실 row 표본: `product_code=010001` · `model_name=AR05TXEAAWKNEU-01` · `name=삼성 윈드프리 5평형`.
활성 전체에서 `product_code` 가 `AJ`/`AM` 모델 토큰 형태인 값은 **0건**.

⟹ **"품목코드 = 모델명" 은 목표 상태이고, 현재 저장소 계약은 아직 그렇지 않다.** 코드를 읽을 때 이 차이를 전제할 것.

### 적재 경로가 둘이고 서로 다르다

```text
EcountProductImporter:296-301   같은 이카운트 :code 를 model_name·model_code·product_code 셋 다에 넣는다
ProductSheetSyncService         모델명을 model_name·model_code 에만 쓴다 — product_code 적재 코드가 없다
```

시트 계보 품목이 `product_code` 를 갖지 않는 이유가 이것이다.

## 전환 슬라이스 (PR #984 소관)

1. 두 계보 병합 — 모델코드 일치 = 같은 품목 (개발책임자 2026-07-29 결정)
2. **노출 키 통일** — `product_code` 를 모델명으로 맞추고 기존 순번코드는 `product_aliases` 로 보존. **`products.id`(UUID) 무변경**
3. 🚨 **`stock_instances.product_code` 키 이관** — 안 하면 기존 재고가 고아가 된다
4. `model_code` 중복 컬럼 정리 여부 판단
5. 웹(견적서·주문서) 표기 라벨을 **"모델명"** 으로 통일 확인

`product_aliases(alias_code, main_product_id, source DEFAULT 'ECOUNT_IMPORT')` 가 보존처로 이미 있다. 회사PC 임포트에서 alias 2,811건이 생성된 실적이 있다.

## 다른 트랙에 미치는 영향

- **전표 수락 400**(`productCode 는 필수`) = **데이터 미적재**. `SlipService:879` 의 컬럼 선택 오류가 아니다. inventory 는 `lookup-by-code` 로 재확인하므로 이카운트 품목코드를 기대한다
- serial 제품 1,214건 중 `product_code` 누락 **1,119건(92.18%)** — 전환 대상
- **#991 집계 키**는 `product_code` 가 아니라 **`model_name` 보존축의 정규화된 GAS 모델 토큰**. `product_code` 로 대체하면 숫자형 이카운트 코드와 모델 토큰을 혼동한다
- **#999** 재고 시리얼키·QR 은 `stock_instances.product_code` 를 쓰므로 이 전환과 순서를 정해야 한다

관련: [[project_ecount_product_identity_rule]] · [[feedback_uuid_no_user_visibility]] · [[project_serial_inventory_model]]
