# 카테고리별 설정 데이터 마이그레이션 정찰

> 조사일: 2026-08-17  
> 범위: 선행 보고서, 애플리케이션 코드, 레거시 GAS·운영 시트 스냅샷, 공유 `product_db` 읽기, 공유 API 읽기. 코드·공유 DB·컨테이너·Issue/PR은 변경하지 않았다.  
> 용어: 이 보고서의 **옵션**은 `bundle_component.component_variant + component_shape + is_default` 튜플, **품목구분**은 `component_kind`, **수량동기화**는 `qty_mode`를 뜻한다.

## ① 한 장 요약 — 이전 행 수·충돌 건수·신규 생성 쌍·수량 바뀌는 세트 수

### 실행 판단에 쓰는 실측 숫자

| 항목 | 실측 |
|---|---:|
| 현재 활성 `bundle_component` | **1,598행 / 부모 346개** |
| 활성 부모 세트의 카테고리를 확정할 수 있는 원본 | **1,584행 / 343세트** |
| 카테고리를 확정할 수 없는 원본 | **14행 / 3부모** — 부모 제품이 모두 soft-delete, 활성 노출 0 |
| 부모 세트 축을 보존한 신규 설정행 | **1,584행** |
| `(카테고리, 구성품 SKU)`로 접은 키 | **401쌍** |
| 세 설정 전체를 손실 없이 펴는 distinct 튜플 | **403행** |
| 동일 `(구성품, 카테고리)` 안 수량방식 충돌 | **0쌍** |
| 동일 `(구성품, 카테고리)` 안 품목구분 충돌 | **0쌍** |
| 동일 `(구성품, 카테고리)` 안 옵션 충돌 | **2쌍** |
| 현재 다중 카테고리 노출 부모 세트 | **0개** |
| 설정 저장을 위해 `product_estimate_exposure`를 재사용할 때 부족한 노출쌍 | **354쌍** |
| 설정 전용 저장소를 쓸 때 필요한 신규 노출쌍 | **0쌍** |
| 정확 복사 shadow에서 수량계수·구성품 튜플이 바뀌는 활성 세트 | **0/343세트** |

`1,584 → 401` 축약에서 사라지는 것은 단순 중복만이 아니다. 옵션이 둘인 두 쌍 때문에 완전 튜플은 403행이며, 두 쌍 모두 옵션이 부모 세트에 귀속돼 있다. 부모 축을 버리면 어느 세트가 어느 옵션을 갖는지 복구할 수 없다.

### 충돌 2쌍

| 카테고리 / 구성품 | 값 A | 값 B | 원본 세트 분포 |
|---|---|---|---:|
| `COMMERCIAL_MULTI / AM100AXVHHR1` | `variant=S6-1111-MANUAL`, 기본 | `variant=NULL`, 기본 | **1세트 / 4세트** |
| `SINGLE_SET / AWR-WE13N` | `variant=기본`, 기본 | `variant=유선`, 비기본 | **3세트 / 62세트** |

두 쌍 모두 `qty_mode`와 `component_kind`는 같다. 현재 카테고리 확정 1,584행은 전부 `FOLLOW_SET`이다. 활성 매핑 세트의 초기 정확 복사에서는 수량 결과가 바뀌지 않는다. 옵션 충돌을 scalar 한 행으로 줄이는 경우에는 어떤 값을 남기는지에 따라 옵션 메타데이터가 달라지는 세트가 **최소 4개, 최대 66개**다. 이 범위는 선택에 따른 수치이고, 수량 결과 변화 수가 아니다.

### 선행 보고서의 26·11·19와 이번 충돌 수의 관계

선행 보고서의 홈↔상업 26, 홈↔싱글 11, 상업↔싱글 19는 **레거시 수량 규칙 target과 현재 옵션 SKU의 교집합**이다. 현재 세트→노출 카테고리 조인 결과는 HOME 0행이고, COMMERCIAL 구성품 43 SKU와 SINGLE 구성품 358 SKU의 직접 교집합도 **0 SKU**다. 따라서 26·11·19는 이번 `(구성품, 카테고리)` 축약 충돌의 원본이 아니다. 실제 축약 충돌은 위의 같은 카테고리 내부 2쌍이다.

## ② 세트→카테고리 도출과 충돌 실측

### 2.1 도출식

읽기 전용 실측의 도출식은 다음과 같다.

```sql
bundle_component bc
JOIN product_estimate_exposure e
  ON e.product_id = bc.bundle_product_id
 AND e.is_deleted = false
WHERE bc.is_deleted = false
```

도출 결과:

| 카테고리 | 구성품 원본행 | 부모 세트 | 구성품 SKU |
|---|---:|---:|---:|
| `SINGLE_SET` | **1,447** | **271** | **358** |
| `COMMERCIAL_MULTI` | **137** | **72** | **43** |
| `HOME_MULTI` | **0** | **0** | **0** |
| `LEGACY` | **0** | **0** | **0** |
| 노출 없음 | **14** | **3** | **13** |

카테고리 확정 343부모는 모두 노출 카테고리가 정확히 1개다. 노출 없는 3부모는 제품 자체가 soft-delete돼 있으며 구성품 14행 가운데 `FOLLOW_SET` 12행, `FIXED` 2행이다.

### 2.2 이전 단위별 행 수

#### 부모 세트 축 보존

키를 `(estimate_category, bundle_product_id, component_product_code)`로 두면 현재 원본 **1,584행을 그대로 복사**한다. 수량방식·옵션·품목구분뿐 아니라 “어느 세트의 옵션인가”가 남는다.

#### 카테고리×구성품 축약

키를 `(estimate_category, component_product_code)`로 두면 **401쌍**이다. 다만 옵션 튜플을 별도 행으로 펴야 완전 설정은 **403행**이 된다.

```text
401 기본쌍
+ AM100AXVHHR1의 두 번째 옵션 1행
+ AWR-WE13N의 두 번째 옵션 1행
= 403 완전 튜플
```

403행으로 펴도 부모 축이 없으면 `AM220AXVHHR1SY`만 수동 variant였다는 사실과 `AWR-WE13N` 65부모의 3/62 분포는 보존되지 않는다.

### 2.3 다중 카테고리 세트

현재 실 DB의 다중 카테고리 세트는 **0개**다. 따라서 현재 backfill에는 “한 세트를 어느 한 카테고리에만 배정할지” 충돌이 없다.

기존 공유 설정을 카테고리 축으로 단순 전개하는 정의는, 부모가 가진 **모든 활성 노출 카테고리에 같은 초기값을 한 벌씩 복사**하는 것이다. 이후 카테고리별 편집이 생기기 전까지 기존 공유 동작과 동일하다. 한 카테고리에만 복사하면 나머지 카테고리는 기존 값을 잃는다. 현재 0건이라 이 규칙은 향후 다중 노출 부모가 생길 때에만 실행된다.

노출 없는 3부모/14행은 이 도출식으로 카테고리를 만들 수 없다. 임의 카테고리를 붙이지 않은 별도 미매핑 집합으로 남으며, 활성 판매 화면에 도달하는 부모는 현재 0개다.

## ③ 마이그레이션 단계와 되돌림

아래는 저장 키를 무엇으로 정하든 공통으로 필요한 단계다. 각 단계의 되돌림 가능 범위를 분리했다.

| 단계 | 수행 내용 | 이 시점의 읽기 | 되돌림 |
|---|---|---|---|
| 0. 기준선 고정 | 1,598/1,584/14, 343세트, 401/403, 충돌 2쌍, 카탈로그 목록 checksum 저장 | 기존 컬럼만 | 변경 전이라 즉시 가능 |
| 1. additive 스키마 | 새 테이블 또는 새 카테고리 설정 컬럼·인덱스·감사 7필드 추가. 기존 컬럼 유지 | 기존 컬럼만 | 새 쓰기가 없으면 스키마 제거 가능 |
| 2. idempotent 복사 | 1,584 parent-preserving 행 또는 403 축약 튜플을 migration actor/batch와 함께 적재. 14행은 미매핑으로 계수 | 기존 컬럼만 | batch 식별자로 신규행 soft-delete/제거 가능. 기존 원본 무변경 |
| 3. shadow 검증 | 새 저장소를 읽되 응답에는 쓰지 않고 old/new 튜플과 계산 결과 비교 | 기존 컬럼이 사용자 응답 정본 | 기능 플래그 OFF로 즉시 복귀 |
| 4. 읽기 전환 | 새 카테고리값 우선, 없으면 기존 `bundle_component` 값 fallback | dual-read | 새 전용 쓰기 전이면 플래그 OFF로 무손실 복귀 |
| 5. 쓰기 전환 | 기초품목은 세 필드 쓰기 중단, 견적품목은 새 카테고리 설정에 씀. 기존 컬럼은 호환 shadow 또는 동결 | 새 값 우선 + old fallback | 카테고리별 값이 갈라진 뒤에는 구형 컬럼 하나로 무손실 역변환 불가. 전환 직전 snapshot 또는 역이관 규칙 필요 |
| 6. old read 제거 | coverage 100%, fallback hit 0을 확인한 뒤 새 저장소만 읽음 | 새 저장소만 | 스키마를 남긴 동안 플래그 복귀 가능 |
| 7. 옛 컬럼 제거 | 보존기간 뒤 `qty_mode/component_kind/component_variant/component_shape/is_default` 중 이전 대상 제거 | 새 저장소만 | 백업 복원 또는 역마이그레이션 없이는 불가 |

### dual-read가 필요한 구간

PR #1241의 V45 선례는 `bundle_component.context_*_price`가 NULL이면 기존 전역 가격을 읽는 **새 값 우선 → 기존 값 fallback**이다. 이번에도 단계 2~6 사이에서 같은 형태를 적용할 수 있다.

```text
카테고리 설정행 존재 → 새 값
카테고리 설정행 없음 → 기존 bundle_component 값
```

rolling 배포로 새 reader와 구 reader가 함께 존재하거나 backfill이 부분 완료인 동안에는 dual-read가 빈 설정을 막는다. 반대로 전체 서비스를 정지한 단일 전환이면 dual-read 기간을 두지 않는 실행도 기술적으로 가능하다.

dual-read와 dual-write는 별개다. 새 UI가 카테고리별 값을 쓰기 시작한 뒤 구버전 writer가 기존 컬럼을 갱신하면 두 저장소가 달라진다. 또한 서로 다른 두 카테고리 값을 기존 단일 컬럼 하나에 동시에 dual-write할 수 없다. 따라서 혼재 기간에는 다음 중 어느 계약을 쓸지 실행 전에 정해져 있어야 한다.

- 구 writer를 먼저 차단하고 새 writer만 허용한다.
- 카테고리 값이 아직 동일한 기간에만 양쪽에 같은 값을 쓴다.
- 새 값을 정본으로 두고 기존 컬럼을 호환 shadow로만 갱신하되, 카테고리 분기 후에는 구 reader가 손실 표현임을 기록한다.

## ④ 노출 토글 354쌍 문제

### 4.1 부족한 쌍의 구성

설정 대상 401쌍을 구성품 SKU 자신의 `product_estimate_exposure`에 넣는 경우:

| 카테고리 | 필요한 쌍 | 이미 노출 | 부족 |
|---|---:|---:|---:|
| `COMMERCIAL_MULTI` | 43 | 43 | **0** |
| `SINGLE_SET` | 358 | 4 | **354** |
| 합계 | **401** | **47** | **354** |

354쌍은 모두 활성 제품이며 모델코드 미해소 0, 중복 활성 제품 0이다.

| 현재 `usage_scope` | 부족 쌍 | 노출행만 직접 INSERT할 때 웹 영향 |
|---|---:|---|
| `BOTH` | **8** | SINGLE_SET 종합견적서·주문서 카탈로그에 즉시 추가 대상 |
| `NONE` | **346** | 현재 web 내부 카탈로그의 usage scope 필터로 계속 제외 |

즉 **노출행만 직접 적재**하면 즉시 웹에 새로 나타나는 것은 8개다. 8개는 현재 HOME/COMMERCIAL에 노출된 판넬이며 SINGLE_SET에는 노출되지 않은 모델이다.

그러나 현재 정식 `PATCH /api/v1/products/{modelCode}/usage`는 `usageScope=NONE`이면 노출행을 모두 soft-delete하고, 노출 카테고리를 만들려면 `ESTIMATE` 또는 `BOTH`로 바꾼다(`ProductService.java:1371-1425`). 이 API로 354쌍을 만들면 346개도 scope가 바뀌므로 **354개 전부가 웹 노출 대상**이 된다. 설정행과 판매 노출행을 같은 테이블·API로 만드는 경우의 실제 영향이다.

현재 사용자 화면과 API의 역할은 이미 분리돼 있지 않다.

- 데스크톱 `EstimateItemsCatalogPage.tsx:402-412, 424-426`의 견적 토글은 `usageScope`와 카테고리 목록을 함께 PATCH한다.
- 웹 카탈로그 `ProductRepository.java:310-323`은 exposure, status, usageScope를 모두 통과한 제품만 반환한다.
- live 인증 GET에서 SINGLE_SET 데스크톱 카테고리 목록은 **288행**이었고, 같은 DB 조건의 종합견적서/주문서 가시 행은 **224행**이다.

설정 전용 테이블을 쓰면 기존 867노출행과 노출 토글 계약을 그대로 두므로 신규 exposure는 0쌍이다. `product_estimate_exposure`를 설정 저장소로 재사용하면 위 354쌍의 노출 의미를 별도로 분리하지 않는 한 카탈로그 membership이 함께 변한다.

## ⑤ 단종 여부의 카테고리 축 필요성 — 근거만

### 현재 DB

`products.status`는 제품 단일값이며 카테고리 컬럼이 없다.

| 상태 | 활성 제품 |
|---|---:|
| `ACTIVE` | **2,982** |
| `DISCONTINUED` | **83** |
| `NOT_FOR_SALE` | **16** |
| `OUT_OF_STOCK` | **3** |

둘 이상의 exposure를 가진 제품은 71개이며 `ACTIVE` 65개, `DISCONTINUED` 6개다. 웹 카탈로그 쿼리는 `DISCONTINUED`, `NOT_FOR_SALE`를 모든 카테고리에서 제외하고 `OUT_OF_STOCK`은 제외하지 않는다.

### 2026-08-17 운영 시트 스냅샷 전수 대조

운영 정본 탭의 `비고=단종/미판매`를 `STOPPED`, 그 밖을 `SOLD`로 정규화했다.

| 카테고리 | SOLD | STOPPED |
|---|---:|---:|
| 홈멀티 | 109 | 14 |
| 상업멀티 | 404 | 26 |
| 싱글 세트 | 224 | 64 |
| 구형 | 40 | 0 |

둘 이상의 카테고리 탭에 등장하는 모델 **71개**를 비교했을 때 카테고리별 상태가 다른 실사례는 **1개**였다.

| 모델 | 상업멀티 | 구형 | 현재 DB 상태·노출 | 현재 결과 |
|---|---|---|---|---|
| `AM120MXVRHC1` | `단종` | 판매행 | `DISCONTINUED`, `COMMERCIAL_MULTI+LEGACY` | 전역 status 때문에 두 웹 카테고리에서 모두 제외 |

홈멀티와 싱글 세트 사이에서 한쪽만 단종/미판매인 중복 모델은 **0개**였다. 홈↔상업↔싱글 중복에서도 상반 상태 사례는 없었고, 확인된 1개는 상업↔구형이다. 싱글 구성품 탭은 부모별 구성품 데이터이며 같은 status 열을 갖지 않아 이 전수의 판매상태 축에는 포함하지 않았다.

이 수치는 “카테고리별 단종 컬럼을 둘지”에 대한 판정이 아니라, 현재 DB가 표현하지 못하는 레거시 상반 상태가 **실제로 1개 존재한다**는 근거다.

## ⑥ 검증 방법 — 무엇이 같아야 하고 무엇이 달라져야 하나

### 6.1 초기 데이터 이전 직후 같아야 하는 것

1. **판매 노출 membership**
   - exposure 활성행: HOME 123, COMMERCIAL 416, SINGLE 288, LEGACY 40 유지.
   - 현 web 가시 모델: HOME 107, COMMERCIAL 382, SINGLE 224, LEGACY 39 유지.
   - 설정 이전만으로 354 exposure를 만들지 않는 경로에서는 각 카테고리 modelCode 목록 checksum이 같아야 한다.
2. **세트 구성 설정**
   - 활성 343세트/1,584행에 대해 `(부모 모델, 카테고리, 구성품 모델, defaultQty, qtyMode, kind, variant, shape, isDefault, order)` multiset이 old/new에서 같아야 한다.
   - 미매핑 3부모/14행은 누락으로 숨기지 않고 별도 계수 14를 유지한다.
3. **수량 계산**
   - parent-preserving exact projection shadow 비교의 변경 세트는 **0/343**이다.
   - 현재 매핑 1,584행은 전부 `FOLLOW_SET`이므로 `세트수량 × default_qty` 계수도 같다.
4. **옵션 목록**
   - 초기 backfill은 새 기능 적용이 아니라 현재값 복사이므로, 각 부모 세트에서 보이는 옵션 후보와 기본 선택은 같아야 한다.
   - 2개 충돌쌍을 scalar 한 값으로 축약한 결과는 이 동일성 검사를 통과할 수 없다.

### 6.2 카테고리별 편집 후 달라지는 것이 정상인 범위

명시적으로 수정한 `(부모 세트 또는 구성품, 카테고리)`의 다음 값만 변경 대상이다.

- 해당 카테고리의 옵션 후보·기본 여부·형상
- 해당 카테고리의 품목구분 표시
- 해당 카테고리에서 그 설정을 소비하는 수량 계산 결과

같은 SKU의 다른 카테고리, 수정하지 않은 부모 세트, `product_estimate_exposure` membership, 제품 전역 status는 같이 바뀌면 안 된다. 검증 결과는 “전체 전후 diff 0”이 아니라 **명시한 변경 ledger와 실제 diff가 정확히 일치**하는지로 판정한다.

### 6.3 수량 변화 세트 사전 계수

현재 데이터만 정확 복사하는 단계에서는 SQL shadow projection으로 **0/343**을 미리 셀 수 있다. 전환 전에는 old reader와 new reader의 전개 결과를 다음 안정키로 전수 비교할 수 있다.

```text
부모 modelCode + 구성품 modelCode + 등장순서
→ quantity, qtyMode, defaultQty, kind, variant, shape, isDefault
```

레거시 68계열은 현재 DB에 활성 규칙 1계열만 있어 DB만으로 68계열 전체의 변경 세트 수를 실측할 수 없다. HOME/LEGACY의 `bundle_component`도 0행이다. 68계열 적재와 evaluator가 준비된 뒤에는 기존 legacy golden fixture를 양쪽 evaluator에 넣고 다음을 계수할 수 있다.

- 옵션을 바꾸지 않은 fixture: 결과 diff 0
- 한 카테고리 옵션만 바꾼 fixture: 그 카테고리의 명시 target만 diff
- 같은 SKU가 다른 카테고리에 있는 fixture: 비수정 카테고리 diff 0

따라서 이 보고서의 **수량 바뀌는 세트 0**은 현재 343 활성 세트의 초기 데이터 복사에 한정하며, 아직 DB에 없는 68계열의 미래 변경 수를 포함하지 않는다.

## ⑦ 판단이 필요한 지점 — 선택하지 않음

1. **저장 키**: `(카테고리, 부모 세트, 구성품)` 1,584행인지, `(카테고리, 구성품, 옵션)` 403행인지.
2. **부모 귀속 보존**: 403행 축약에서 충돌 2쌍의 1/4·3/62 부모 분포를 어디에 둘지.
3. **수량 규칙 경계**: 이미 카테고리 축이 있는 `quantity_sync_rule`과 세트 구성의 `qty_mode`를 같은 설정 화면에서 어떻게 구분할지.
4. **미매핑 14행**: soft-delete 부모 3개의 카테고리를 부여할지, 이전 대상 밖으로 유지할지.
5. **향후 다중 카테고리 세트**: 모든 노출 카테고리에 초기 복사한 뒤 분기할지, 최초 생성 때 카테고리별 입력을 요구할지.
6. **354 exposure**: 설정 저장행과 판매 노출행을 같은 것으로 취급할지. 같은 것으로 취급하면 direct INSERT와 `/usage` API의 웹 노출 수가 각각 8/354로 다르다.
7. **단종 축**: 레거시 상반 상태 1개를 카테고리 상태로 보존할지, 현재 전역 status로 계속 접을지.
8. **dual-read 종료 조건**: coverage 100%, fallback hit 0, 343세트 diff 0 중 어떤 조합을 cutover gate로 둘지.
9. **되돌림 기준시점**: 카테고리별 첫 divergent write 전까지만 무손실 rollback으로 볼지, 역이관 snapshot을 계속 유지할지.
10. **옛 컬럼 제거 시점**: 보존기간과 구버전 reader 종료를 무엇으로 증명할지.

## ⑧ 프로세스 회수

### 조사 중 변경·기동

- 애플리케이션 코드 수정: **0**
- 공유 DB write: **0** — 실행 SQL은 `SELECT`만 사용
- git add/commit/push: **0/0/0**
- Issue/PR 게시: **0**
- 신규/재시작/중지한 컨테이너: **0/0/0**
- 신규 백그라운드 서버·브라우저: **0/0**
- 일회성 전경 프로세스: `psql`, `node` live GET, PowerShell CSV 분석 — 모두 종료
- 조사자가 기동한 장기 프로세스 잔여: **0**

### 공유 스택 종료 상태

- 공유 컨테이너: **24개 실행 / 24개 healthy**
- 공유 컨테이너 stop/restart: **0**
- live 인증: 로그인 **HTTP 200**, SINGLE_SET 데스크톱 카탈로그 GET **HTTP 200 / 288행**
- 화면 캡처: 신규 기동·캡처 없음. 선행 정찰의 기존 실캡처를 다시 생성하지 않았다.

### 주요 근거

- 선행 보고서: `docs/dev-reports/2026-08-17-category-settings-migration-recon/report.md`
- 운영 시트 스냅샷: `docs/dev-reports/2026-08-17-legacy-sheets-snapshot/{report.md,home-multi.csv,commercial-multi.csv,single-set.csv,legacy.csv}`
- 저장 구조: `BundleComponent.java`, `ProductEstimateExposure.java`, `QuantitySyncRule.java`, `QuantitySyncTarget.java`
- 노출·status 필터: `ProductRepository.java:303-323`
- `/usage` 노출 동기화: `ProductService.java:729-740, 1371-1425`
- 견적 토글: `EstimateItemsCatalogPage.tsx:402-426, 1084-1093, 1164-1169`
- dual-read 선례: PR #1241 `V45__bundle_component_context_prices.sql`, `BundleExpander`, `EstimateCatalogInternalController`
