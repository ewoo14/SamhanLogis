# D-03 옵션 명칭 DB 속성축 통일 보고서

## 1. 과거 기록 정찰 결과

- 이슈 검색 `옵션 명칭`: #1259(중복 정찰), #1100(피커 회귀), #1140(가격 옵션 명칭), #1092(견적 메뉴).
- 이슈 검색 `리모컨 판넬 옵션`: #1093, #1100, #1089, #896. #896과 #1100에서 옵션 구성품·리모컨 저장 계약을 확인했다.
- 전체 로그 검색: `ae238d828 docs(recon): 옵션 명칭 통일 정찰`, `61078f7d9 memory: ...`.
- 이번 변경이 건드린 필드의 근거: 화면의 옵션 셀렉트는 세트 구성품의 `kind/componentKind`와 `feat/componentVariant`를 표시해야 한다. 기존 `HOME_DEFAULTS`, `SINGLE_DEFAULTS`, 저장 JSON은 읽기 호환 대상으로만 남겼다.
- 주문서웹 창고 결정(`인피니트` 포함)은 조사·변경하지 않았다.

## 2. RED 원문

최초 RED는 새 순수 함수 테스트가 아직 구현되지 않아 다음처럼 실패했다.

```text
Error: Cannot find module '../../option-naming/optionNaming'
Require stack:
- clients/web/estimate-app/test/d03-option-naming-unify.test.js
```

이후 RED 대상에 홈멀티 `기본` 3갈래, 동적 구성품 variant, 기존 문자열 읽기, 싱글 제외 우선순위를 포함하고 구현했다. 고정 배열을 새로 추가하는 방식은 폐기했다.

## 3. 설계와 통일 매핑

화면별 하드코딩 목록을 맞추지 않고, 선택 화면의 구성품 행에서 variant를 deduplicate해 셀렉트 옵션으로 만든다. 명시 필드 우선순위는 `componentVariant/variant` → 구성품 행의 `feat` → 기존 축 필드이며, 품목명·규격으로 새 옵션을 추론하는 fallback은 두 화면 모두 제거했다.

| 화면 | 기존 | 변경 후 |
|---|---|---|
| 홈멀티 리모컨 | 기본·유선·컬러·제외 고정 | 구성품 variant + 합성 `제외`; 실측 무선·유선·컬러·제외 4개 |
| 홈멀티 판넬 | 화면 고정 목록 | 구성품 variant + 합성 `판넬제외`; 실측 판넬제외·기본·공청 3개 |
| 싱글중대형 리모컨 | 유선리모컨·컬러유선리모컨 고정 | 구성품 variant; 실측 기본·컬러·유선 3개 |
| 싱글중대형 판넬 | 문자열 접미사 고정 | 구성품 variant + 합성 판넬제외; 실측 5개 |
| 상업멀티 | 제외·무선·유선·컬러유선 고정 | 구성품 variant + 합성 제외; 현재 `COMM_PARTS`·대체 카탈로그에서 해당 행 0건이라 제외 1개 |

`제외`/`판넬제외`는 구성품 variant가 아니라 선택하지 않음을 표현하는 합성 제어값이다. 구성품에 없는 실제 옵션은 넣지 않는다.

살린 작업은 순수 매핑 함수, 양방향 테스트, 홈멀티 3갈래 전개, 싱글 제외 우선, 세 화면의 동적 렌더 계약이다. 버린 작업은 `panel_type`에 인피니트·동작감지 값을 추가한 분류기 변경과 화면의 고정 canonical 배열이다.

## 4. GREEN

```text
node --test test/d03-option-naming-unify.node.cjs
9 passed, 0 failed

estimate-app npm test -- --runInBand
20 suites passed, 356 tests passed

estimate-app npm run typecheck
typecheck OK: 17 JavaScript files

product-service compileJava
통과. EstimateCatalogInternalControllerIT는 GatewayAttestationMockMvcConfig 초기화 환경 오류로 9건 실행 실패.

desktop npm run typecheck
통과

desktop npm run lint
0 errors, 기존 warnings 196건

order-app npm run typecheck
통과. lint는 기존 테스트 파일의 no-useless-escape/no-regex-spaces 3 errors로 실패했으며 이번 변경 파일과 무관하다.
```

기존 문자열 방어선도 단정했다.

| 옛 문자열 | 읽기 값 |
|---|---|
| `유선리모컨` | `유선` |
| `컬러유선리모컨`, `컬러유선` | `컬러` |
| `기본판넬`, 빈 문자열 | `기본` |
| `블랙판넬` | `블랙` |
| `승강판넬` | `승강` |
| `공청판넬` | `공청` |

마이그레이션은 만들지 않았다. PM 실측 `bundle_set_options` 72행, `panelOption` 비null 0행, `remoteOption` 비null 0행이므로 소급 대상은 0건이다.

## 5. 홈멀티 `기본` 3갈래 유지 근거

`opt === '기본'` 분기를 유지했다. `REMOTE_360_DEFAULT`에는 360 카세트 수량, `R_CH/REMOTE_INF_DEFAULT`에는 AR-CH01 수량, `REMOTE_WIRELESS`에는 벽걸이·기타 수량을 각각 전달한다. `유선`·`컬러`는 전량 한 모델과 키트로 처리한다. 테스트는 예시 수량 `{360:2, AR-CH01:3, 벽걸이/기타:4}`가 `{R360:2, RCH:3, RW:4}`로 분리되고 `{RW:9}`로 축약되지 않음을 확인한다.

## 6. 라이브 캡처와 옵션 개수

Playwright Chromium, 직원 인증 방식 `?email=dev_master@samhan-air.com`, `clients/desktop` 내부 실행. 캡처는 모두 `resolveQaShotsDir()`에 `QA_ALLOW_OVERWRITE=1`을 명시해 커밋 증거 루트에 저장했다.

| 캡처 | 리모컨 | 판넬 |
|---|---:|---:|
| [01-estimate-home-default.png](01-estimate-home-default.png) | 4: 무선·유선·컬러·제외 | 3: 판넬제외·기본·공청 |
| [02-estimate-single.png](02-estimate-single.png) | 3: 기본·컬러·유선 | 5: 판넬제외·기본·블랙·승강·공청 |
| [03-estimate-commercial.png](03-estimate-commercial.png) | 1: 제외(구성품 0) | 1: 판넬제외(구성품 0) |

상업멀티 0건은 빈 셀렉트를 정상으로 세지 않고, 현재 bootstrap의 `COMM_PARTS`와 대체 `COMMULTI`에서 구성품 variant 행이 0건임을 기록한 결과다. 주문서웹은 거래처 인증 정보가 없는 현재 세션에서 인증 게이트가 열리지 않아 제품 옵션 증거로 사용하지 않았다. 화면 구현은 동일한 동적 계약을 적용했다.

위 캡처는 기존 실행 중 estimate-app의 variant 동적화 확인 증거다. 이번 `component_shape` API 추가 후 실행 중 컨테이너를 재배포하지 않았으므로 360판넬의 새 shape 목록은 라이브 캡처로 주장하지 않고, DB 실측·단위 테스트·소스 grep을 증거로 남긴다. 주문서웹도 인증 게이트 미개방으로 동일하게 캡처하지 못했다.

## 7. 개발책임자 판단 건

기존 두 결정 중 저장 문자열 매핑은 확정 반영했고, panel 축 확장은 최신 정정으로 보류 상태를 유지한다.

1. 판넬 축 확장: 개발책임자 정정 “component_variant에 그 값들이 아예 없다. 구현하지 말고, 그 값들이 화면에서 사라지는 것이 맞는지 질문으로 남겨라.” 따라서 `panel_type`/`ProductAttributeClassifier` 확장과 창고 로직 변경을 하지 않았다. 구성품 기반 화면에서는 해당 레거시 UI 값이 사라지는 상태이며, 별도 축으로 다시 살릴지는 질문으로 남긴다.
2. 저장 문자열: 개발책임자 결정 “마이그레이션 없이, 옛 문자열이 들어오면 읽기 단계에서 변환한다.” 대상 0건이므로 읽기 매핑만 유지했다.

## 8. 360 판넬 shape 조사 및 반영

실 DB(product_db, `is_deleted=false`) 조사 결과:

| 항목 | 건수 |
|---|---:|
| 활성 `bundle_component` | 1,598 |
| `component_shape` NULL | 1,528 |
| `component_shape=원형` | 30 |
| `component_shape=사각` | 40 |
| `component_shape` 채움률 | 70/1,598 = 4.38% |
| 360 판넬 품목명에 `원형` 포함 | 9 |
| 360 판넬 품목명에 `사각` 포함 | 9 |

`bundle_component.component_shape` 컬럼은 실제 존재하며 값도 있으므로 품목명 추론을 정본으로 삼지 않았다. product-service의 구성품 응답에 `componentShape`를 추가하고 web catalog가 이를 보존한다. estimate/order의 360 판넬 셀렉트는 `d03ConfiguredShapes_`로 구성품 `PANEL` 행의 `componentShape`만 deduplicate한다. 따라서 `component_variant`에 없는 `원형·사각`을 variant 축에 섞지 않는다. 구성품 shape가 없는 상업멀티 현재 bootstrap은 합성 옵션을 만들지 않고 0개로 둔다.

360 판넬 품목명 18건(원형 9, 사각 9)은 조사 근거로만 기록했다. 품목명에서 `원형·사각`을 추론하는 코드와 `panel_type` 확장 코드는 구현하지 않았으며, 실제 화면 옵션의 정본은 채움된 `component_shape`다.

## 9. 문자열 분기 정합성

- `wantAir`는 동적 PANEL variant의 canonical `공청`을 우선 비교하고 기존 `공청판넬`은 읽기 호환으로만 허용한다.
- `컬러`는 구성품 variant canonical 값이며 모델 선택은 `컬러`를 기준으로 한다. `컬러유선리모컨·컬러유선`은 기존 저장값을 읽는 호환 매핑이다.
- estimate/order 양쪽의 싱글·상업·홈 계산부에 같은 정합성을 반영했다.
- 홈멀티 `기본` 3갈래와 싱글 제외 우선 테스트는 기존대로 통과했다.

## 10. 배열 리터럴 전수 grep

실행 명령:

```text
rg -n -U "sel\\([^\\n]*\\n?\\s*\\[" clients/web/estimate-app clients/web/order-app clients/desktop
```

결과에서 옵션 관련 `sel` 배열 리터럴은 모두 제거했다. 남은 배열은 다음 이유로 유지한다.

| 위치/목록 | 사유 |
|---|---|
| `['판넬제외', ...configuredPanels]`, `['판넬제외', ...d03ConfiguredVariants_(...)]` | variant가 아닌 “선택 안 함” 합성 제어값 |
| `[..., configuredRemotes, '제외']` | variant가 아닌 “선택 안 함” 합성 제어값 |
| `['포함','별도']` | 구성품 variant가 아닌 자재 포함 여부라는 별도 boolean-like 업무축 |

`360판넬`은 estimate/order 모두 `d03ConfiguredShapes_` 결과를 사용한다. desktop은 `sel()` 호출을 사용하지 않으며, 전역 기본값 편집 화면에는 선택 세트 식별자가 없어 특정 bundle의 `component_shape`를 읽을 문맥이 없다. 따라서 desktop의 `renderSelect` 도메인 후보는 이 슬라이스의 세트별 옵션 셀렉트가 아니며, 임의의 DB 전체 union으로 바꾸지 않았다.

## 11. 프로세스 회수

실행한 estimate/order 로컬 서버와 자식 Node 프로세스를 회수했다. 이 작업에서 새로 시작한 컨테이너는 0개다. `_local` 캡처와 주문서 인증 실패 잔여 캡처는 제거했으며, JAR·바이너리·마이그레이션은 산출하지 않았다. 회수 후 작업 포트 3002/5173/5180/5183 리스너 잔여는 0개다. 3000은 기존 Docker Grafana가 점유한 공유 포트로 이번 작업에서 시작하거나 종료하지 않았다.
