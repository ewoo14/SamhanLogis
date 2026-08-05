# PR #1063 R39 mock hard gate 회귀 판정·스펙 갱신 보고

작성일: 2026-08-05  
이슈: #1062  
작업 브랜치: `fix/1062-line-input-ux`  
작업 HEAD: `e3f94ebe3`

## 결론

이번 실패의 제품 동작은 R29가 의도한 새 계약과 일치한다. `ProductAutocomplete`는
후보가 정확히 1건이면 listbox를 렌더하지 않고 즉시 `pick`하여 modelName과 선택 상태를
확정한다. 후보가 2건 이상이면 `품목 검색 결과` modal을 열고, 일반 autocomplete의
listbox는 단일 자동확정이 꺼진 소비처에서만 남는다.

따라서 제품 코드는 수정하지 않았다. 실패한 스펙은 단정을 제거하거나 skip하지 않고,
단일 후보 자동확정·다건 modal·선택 후 업무값 반영을 새 계약으로 단정하도록 갱신했다.

## 전체 게이트 최초 재현 원문

design-system `dist`를 R29 소스에 맞게 먼저 빌드하지 않은 로컬 산출물 기준으로는 다음과
같았다. 이 결과의 AC-2 4건은 stale `dist`가 R29 소스를 반영하지 않은 별도 산출물 문제였고,
CI fresh build와 동일한 판정에 사용하지 않았다.

```text
Running 655 tests using 2 workers
  5 failed
  650 passed (6.7m)
```

design-system을 `npm run build`로 갱신한 뒤 CI와 동일한 fresh dist로 영향군을 재실행한
원문은 다음과 같다.

```text
Running 41 tests using 1 worker
  12 failed
  29 passed (3.3m)
```

## 12건별 판정

| 실패 | ① 현재 제품 동작 | ② 의도 근거 | ③ 판정·조치 |
|---|---|---|---|
| `ac-b1b-ds-a11y-layout.spec.ts:65` | 품목 `AJ040` 단일 후보는 inline listbox/option 없이 즉시 확정된다. `AJ` 다건은 품목 검색 결과 modal이다. | R23 보고서의 “후보 1건은 종전 inline list에서 바로 선택되고, 2건 이상만 결과 선택 모달” 및 R29의 “`resultSelectionMode="single"`에서도 후보 1건 `pick`” | 의도된 변경. 단일 후보 listbox 기대를 다건 modal의 모델명·품목명 열, UUID 비공개 단정으로 갱신. 거래처 inline badge 단정은 유지. |
| `ac-b1b-ds-a11y-layout.spec.ts:80` | 위와 동일하게 품목 단일 후보 option은 렌더되지 않는다. | R23·R29 동일 근거 | 의도된 변경. 1440px 품목 표면을 다건 modal의 모델명/품목명/행 값/UUID 비공개로 단정. |
| `bundle-set-options.spec.ts:85` | `AJ040` 한 건이 자동 확정되고 단품 옵션 행은 없다. | R29 후보 1건 즉시 확정 계약 | 의도된 변경. helper가 입력값 `AJ040RXH4BC1` 자동 확정을 단정한 뒤 단품 옵션 부재를 검증. |
| `bundle-set-options.spec.ts:96` | `SET-HM2WAY` 한 건이 자동 확정되고 BUNDLE 옵션 행이 표시된다. | R29 후보 1건 즉시 확정 계약; 기존 bundle 불변식 | 의도된 변경. 자동 확정 후 세트 옵션 UI를 계속 검증. |
| `bundle-set-options.spec.ts:115` | BUNDLE 자동 확정 후 옵션 토글이 동작한다. | R29 자동확정 + 기존 세트 옵션 계약 | 의도된 변경. 선택 방식만 자동확정으로 갱신하고 토글 단정 유지. |
| `bundle-set-options.spec.ts:132` | BUNDLE 자동 확정 후 판넬/자재 옵션 입력이 동작한다. | R29 자동확정 + 기존 세트 옵션 계약 | 의도된 변경. 옵션 입력 단정 유지. |
| `bundle-set-options.spec.ts:155` | 자동 확정 후 옵션 화면에 UUID가 노출되지 않는다. | R29 자동확정 + UUID 사용자 비공개 불변식 | 의도된 변경. listbox 클릭을 제거하고 선택 후 UUID 비노출 단정 유지. |
| `bundle-set-options.spec.ts:172` | BUNDLE/SINGLE 자동 확정 후 POST의 `setOptions` 계약이 유지된다. | R29 자동확정; bundle 저장 payload 기존 계약 | 의도된 변경. 두 선택의 입력값 자동확정 후 payload 단정 유지. |
| `bundle-set-options.spec.ts:256` | BUNDLE 자동 확정 후 재고조회 세트 전용 안내가 표시된다. | R29 자동확정; 재고조회 bundle-only 계약 | 의도된 변경. 자동확정 후 재고조회 경로 단정 유지. |
| `bundle-set-options.spec.ts:286` | BUNDLE/SINGLE 자동 확정 후 혼합 재고조회에서 제외 세트 캡션과 단품 matrix가 표시된다. | R29 자동확정; 혼합 재고조회 계약 | 의도된 변경. 자동확정 후 혼합 결과 단정 유지. |
| `product-catalog.spec.ts:365` | 구성품 modal의 `AJ052` 단일 후보는 option 클릭 없이 자동 확정되고 추가 버튼이 활성화된다. | R29 후보 1건 즉시 확정 계약 | 의도된 변경. 입력값 자동확정 단정 후 구성품 추가·행 증가 단정 유지. |
| `slip-form-v20-matching.spec.ts:349` | 전표의 `AJ040` 단일 후보는 listbox/ArrowDown 없이 자동 확정되고 저장 payload에 반영된다. | R29 후보 1건 즉시 확정 계약; V20 payload 불변식 | 의도된 변경. 자동확정과 저장 payload 단정 유지. |

## R23·R26·R29 근거 원문 위치

- `docs/dev-reports/2026-08-05-1062-r23-sol-defects-fix.md:91-97`: 판매·구매
  `resultSelectionMode="single"`, 1건 inline/2건 이상 modal 계약.
- `docs/dev-reports/2026-08-05-1062-r23-sol-defects-fix.md:206-209`: 다건 후보와
  규격 열의 불변식 표.
- `docs/dev-reports/2026-08-05-1062-r26-reverse-direction-fix.md:38-48`: 공용
  자동완성의 draft/선택 경합과 입력 동작을 별도 계약으로 보존.
- `docs/dev-reports/2026-08-05-1062-r29-sol-directive-fix.md:18-22`: 후보 1건을
  `resultSelectionMode="single"`에서도 `pick`하고 `ProductAutocomplete` 기본
  `autoSelectSingleResult=true`로 연결.
- `docs/dev-reports/2026-08-05-1062-r29-sol-directive-fix.md:46-53`: 단일 후보
  자동확정 회귀 테스트의 RED 계약.

## 수정 파일

- `clients/desktop/playwright/ac-b1b-ds-a11y-layout.spec.ts`
- `clients/desktop/playwright/bundle-set-options/bundle-set-options.spec.ts`
- `clients/desktop/playwright/product-catalog/product-catalog.spec.ts`
- `clients/desktop/playwright/slip-form-v20/slip-form-v20-matching.spec.ts`
- `docs/dev-reports/2026-08-05-1062-r39-mock-gate-regression.md` (신규)

design-system `dist`는 `.gitignore` 대상 로컬 빌드 산출물이며 커밋 대상 신규 파일이 아니다.
백엔드와 다른 트랙 파일은 수정하지 않았다.

## 영향군 검증

fresh dist 빌드 후 R39 영향군을 실행했다.

```text
Running 26 tests using 1 worker
  26 passed (36.3s)
```

product-catalog 전체도 별도 실행했다.

```text
Running 15 tests using 1 worker
  15 passed (23.6s)
```

## 전체 hard gate 최종 검증

design-system을 R29 소스 기준으로 fresh build한 뒤 전체 hard gate를 끝까지 실행했다.

```text
Running 655 tests using 2 workers
  655 passed (6.2m)
```

Playwright 종료 뒤 출력된 기존 범위 밖 진단 로그는 테스트 실패가 아니며, 최종 집계는
`655 passed` / `0 failed`이다.
