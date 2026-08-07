# R28 — 계측 후 fix 보고서

## 판정

FE fix는 수행하지 않았다. 지시된 갈림에서 **서버 응답 불일치**가 실제로 확인되었고, 이번 라운드의 서버 변경 금지 조건에 따라 중단·보고한다.

## 1. 계측 원문

실행 조건: 올바른 번들, `HAS_MOCK false`, `AC060CS6PBH1SY`, 거래처 `2568700899`(threeSixty `₩70,000`).

① 전환 시점 `context.parentModelCode`

```text
"AC060CS6PBH1SY"
```

빈 문자열이 아니다. PM 미검증 가설은 틀렸다.

② `context.parentCatalogUnitPrice`

```text
"1660000"
```

③ 부모 메타데이터

```json
{
  "parentCategoryKey": "singleSets",
  "parentFixedDiscountRate": null,
  "parentHasVariableDiscount": true
}
```

④ `discountConfig`

```json
{
  "partnerCode": "2568700899",
  "companyName": "주식회사 제이앤피공조",
  "homeMultiDc": null,
  "commercialMultiDc": null,
  "threeSixty": "₩70,000",
  "fourWay": "₩70,000",
  "oneWay": "₩50,000",
  "stand": "₩70,000",
  "deluxe": null,
  "firstGrade": null
}
```

⑤ `calculateBundleParentDiscount` 반환값

```json
{
  "unitPrice": 1590000,
  "rate": 0,
  "source": "OPTION",
  "info": "거래처 싱글세트 정액DC 70000원 적용"
}
```

⑥ 네트워크 `POST /slips/expand-line` 본문

```json
{"parentModelCode":"AC060CS6PBH1SY","quantity":1,"unitPrice":"1590000"}
```

⑦ 네트워크 응답 구성행 단가 합계

```text
616,975 + 925,050 + 104,060 + 13,915 = 1,660,000
```

요청 본문은 `1,590,000`인데 응답 구성행 합계는 `1,660,000`이다. 따라서 FE 계산·전송은 올바르고, 응답 경계에서 단가 오버라이드가 사라진다. 서버 수정은 이번 라운드 금지이므로 고치지 않았다.

## 2. 새로 가능해진 상태·화면 조합과 결과

| 조합 | 결과 |
|---|---|
| S-A 부모 delivery price로 최초 전개 | PASS — 화면 합계 `1,660,000` |
| S-B `AC060CS6PBH1SY` → `2568700899` 전환 | FAIL — FE 계산은 `1,590,000`, expand 응답·화면은 `1,660,000` |
| S-C 구성행 1개 삭제 후 A→B 재전환 | 삭제 상태는 유지되나 합계 `734,950`; 서버 응답 단가 불일치가 잔존 |
| S-D 저장 | HTTP `201`; 저장 직전 화면은 `734,950` 상태이며 PM R27 재오픈도 `734,950`으로 불일치 |
| S-E `AM360AXVGHC1SY`(레거시 플래그 없음) → `2568700899` | PASS — 계산 `source=NONE`, 합계 `10,821,635` 유지 |

이번 계측으로 `parentModelCode=''`인 제3 경로는 배제됐다. 실제 제3의 문제는 서버가 요청의 `unitPrice`를 응답 구성행 재배분에 반영하지 않는 경계 불일치다.

## 3. 테스트 실행 결과

계측은 임시 코드였으며 원복했다. 임시 계측/QA 드라이버 변경은 저장하지 않았다. 서버(`services/`)는 변경하지 않았다.

- `npm run build`: PASS
- 라이브 R27 계측 시나리오: 전환 요청 본문 `1,590,000`, 응답 합계 `1,660,000` 재현
- `npm test -- --run src/renderer/utils/slipDiscount.bundle-parent.test.ts src/renderer/api/slip.test.ts src/renderer/routes/SlipFormPage.test.tsx`: PASS — 3 files, 105 tests
- `npm run typecheck`: PASS — TypeScript 및 real-QA scope 50 tests
- FE fix 및 테스트 추가: 서버 갈림 확인으로 수행하지 않음

### 신규 파일

- `docs/dev-reports/2026-08-07-1069-r28-instrumented-fix.md`
