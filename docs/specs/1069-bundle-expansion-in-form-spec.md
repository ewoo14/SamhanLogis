# #1069 판매전표 입력 화면의 세트 전개 — 기획

> 작성 2026-08-05 (집PC PM) · 이슈 `#1069`

## 1. 무엇이 문제인가

서버는 세트를 구성품으로 전개하는데(`SlipService.create → addSlipLinesExpanded`) **입력 화면은 전개하지 않는다.** 사용자는 세트 1줄만 보고 저장하며, 저장 결과가 화면과 다르다.

## 2. 🚩 이슈 제목의 수치는 폐기된 것이다 — 집PC 재실측

이슈 제목의 *"세트 111개는 구성품 미등록"* 은 **권위 아닌 테이블로 센 값**이라 이미 정정됐다(`products.parent_bundle_set_model` 로 계수한 것). 업무 구분의 권위는 `product_estimate_exposure` 이고 구성품의 권위는 `bundle_component` 다.

집PC 실측:

```sql
SELECT COUNT(*) FILTER (WHERE product_type='BUNDLE') FROM products WHERE is_deleted=false;
--  344

SELECT COUNT(*) AS rows, COUNT(DISTINCT bundle_product_id) AS bundles_with_components
  FROM bundle_component WHERE is_deleted=false;
--  rows 1588 · bundles_with_components 345

SELECT COUNT(*) FROM product_estimate_exposure e JOIN products p ON p.id=e.product_id
 WHERE e.is_deleted=false AND p.is_deleted=false AND p.product_type='BUNDLE';
--  344   (견적 노출 100%)
```

⟹ **구성품 미등록 세트는 0개다.** 전개할 데이터는 갖춰져 있다.

## 3. 개발책임자 확정 사양

```
① 세트품목을 입력하면  →  구성품 N개로 전개되고 세트품목 라인은 사라진다
   ⚠️ 현재 구현은 "첫 setHead + parentSetModel" 로 헤드를 남긴다 — 바꿔야 한다
② 구성품만 단독으로 입력하는 것도 허용한다
③ 전개 참조원 = 견적품목
     세트품목 식별  product_estimate_exposure 에 등록된 product_type='BUNDLE'
     구성품 조회    bundle_component (bundle_product_id → component_product_code)
④ 세트품목은 전표 라인으로 저장될 수 없다  (①과 같은 이야기)
```

## 4. 불변식 — 무엇이 참이어야 하는가

1. **화면에서 세트를 고르면 그 자리에서 구성품 N행으로 바뀐다.** 세트 라인은 남지 않는다.
2. **저장 결과가 화면과 같다.** 사용자가 본 행과 저장된 행이 일치한다(현재는 서버만 전개해 어긋난다).
3. **구성품 단독 입력은 계속 된다.**
4. **세트품목이 전표 라인으로 저장되지 않는다** — 화면·API 어느 경로로도.
5. **금액 계약이 유지된다** — 전개 후 합계가 세트 단가 기준과 어긋나면 안 된다. 어떤 규칙으로 배분·계산할지는 기존 서버 전개(`addSlipLinesExpanded`)와 **같은 결과**여야 한다.
6. **빈행 계약이 유지된다** — `#1063`(머지됨)이 세운 `autoBlankRow` 규약. 전개가 trailing 빈행을 먹거나 중복 생성하면 RED.
7. 구성품이 없는 세트(현재 0개)를 만나면 **조용히 사라지지 않는다** — 사용자에게 보이는 처리.

## 5. 양방향 RED

- **RED-A (되돌리면 안 되는 것)** — 일반 품목 입력·구성품 단독 입력·저장 후 상세 재조회가 그대로 동작 · `#1063` 자동 빈행 규약 유지 · 전개 후 합계가 서버 전개 결과와 일치.
- **RED-B (재발하면 안 되는 것)** — 화면에 세트 라인이 남으면 RED · 저장된 행과 화면 행이 다르면 RED · 세트품목이 전표 라인으로 저장되면 RED.

## 6. 범위 밖

- 견적 화면·분개·이동 화면 (판매전표부터)
- 세트 마스터 관리 화면
- 구성품 가격 정책 재설계
- 다른 트랙(`#1045` `#1057` `#1066`)

## 7. 검증

```powershell
.\gradlew.bat :services:slip-service:test --tests '*Bundle*' --tests '*SlipLine*' --console=plain
cd clients/desktop ; npx vitest run src/renderer/routes/SlipFormPage
```

라이브QA — 실서버에서 세트품목을 골라 전개되는 화면을 캡처하고, 저장 후 상세의 라인 수가 화면과 같은지 센다.
