# PR #1260 SOL 적대검증 머지 판정

- 검증 일시: 2026-08-17 (KST)
- 검증 head: `713ba0d1c9f4c4d4221b14e9ea6efdd1111c863a`
- CI 재확인: 47 성공 · 실패 0 · 대기 0
- 판정: **머지 불가 — 실사용자 도달 결함 3건**
- 별도 예외 보고: **기존 증거 무결성 결함 1건**
- 금지사항 준수: 공유 DB 쓰기 0건, 공유 컨테이너 기동·중지·재시작 0건, `git add/commit/push` 0건

## ① PANEL 250건 판정 직접 재현

공유 PostgreSQL `product_db`를 `default_transaction_read_only=on`으로 직접 조회했다.

| component_variant | 실측 건수 | 지정값 |
|---|---:|---:|
| 기본 | 68 | 68 |
| 공청 | 68 | 68 |
| 블랙 | 57 | 57 |
| 승강 | 57 | 57 |
| 합계 | 250 | 250 |

결과는 지정값과 정확히 일치한다. 기존 250건의 판정은 불변이다.

## ② 홈멀티 `기본` 3갈래 확인

계산 분기 자체는 살아 있다.

- `node --test clients/web/estimate-app/test/d03-option-naming-unify.node.cjs`: 11/11 통과.
- `{360:2, 인피니트:3, 벽걸이/그외:4}`를 서로 다른 세 target으로 전개하는 순수 계약이 통과했다.
- 현행 `index.ejs`의 실제 계산부도 `REMOTE_360_DEFAULT`, `AR-CH01`, `REMOTE_WIRELESS` 세 갈래를 각각 집계한다.

그러나 **실사용자 경로는 깨졌다.** 라이브 홈멀티 리모컨 셀렉트에는 `기본`이 없고 `제외` 한 항목만 있다. 사용자는 `기본` 분기에 진입할 수 없으므로 360 카세트·인피니트·1way/벽걸이 표준 리모컨이 화면 계산에서 사라진다. 이는 도달 결함 1에 포함한다.

## ③ 인피니트 4종 화면 실측

분류기 자체는 다음 네 값을 구분한다.

- 인피니트 기본
- 인피니트 25년형
- 인피니트 공청
- 인피니트 공청+동작감지 AI

`ProductAttributeClassifierTest`를 `--rerun-tasks`로 다시 실행했고 6 tests · failures 0 · errors 0이다. 공유 DB에도 대상 네 대형 모델이 존재한다.

하지만 홈멀티 화면에서 인피니트 실내기 행을 수량 1로 실제 선택한 뒤 판넬 셀렉트를 읽은 결과는 `판넬제외` **1개뿐**이었다. 네 인피니트 옵션은 화면에 나오지 않는다.

근거: [02-infinite-home-panel-options.png](02-infinite-home-panel-options.png), [live-measurement.json](live-measurement.json)

## ④ legacy-quantity-golden 통과 확인

새 실행 결과:

- 견적 앱: 1 suite · 194 tests 통과
- 주문 앱 지정 회귀: 2 files · 75 tests 통과
- 지정 세 건의 실제 수량 map과 golden을 `isDeepStrictEqual`로 직접 비교: 모두 `MATCH=true`

| fixture | 핵심 판넬 결과 | 일치 |
|---|---|---|
| C-01-BLACK-PANEL | `PC4NBFK1NW: 1` | 예 |
| C-01-LIFT-PANEL | `PC4NUXK1NW: 1` | 예 |
| C-01-AIR-PANEL | 별도 판넬 target 없음, 총 7개 모델 | 예 |

golden 파일은 수정하지 않았다.

## ⑤ 싱글 `유선 선택 + 제외 체크` 우선순위

라이브 싱글 화면에서 리모컨 `유선`을 선택하고 `리모컨 제외`를 동시에 체크했다. 리모컨 구성품이 있는 실제 세트를 전개한 결과 emitted remote part는 0개였다. 제외가 선택보다 우선한다.

근거: [05-single-wired-exclusion-wins.png](05-single-wired-exclusion-wins.png), `live-measurement.json`의 `exclusion.emittedRemoteParts=[]`

## ⑥ 구성품 변경의 화면 반영

공유 DB를 수정하지 않고 브라우저 메모리의 싱글 구성품 snapshot 한 행만 격리 변경했다.

- 변경 전 리모컨: `기본 · 컬러 · 유선` — 3개
- 구성품 `componentVariant`를 `SOL-화면격리-동적옵션`으로 변경 후: 해당 값 + 기존 3개 — 4개
- 화면 셀렉트에 새 값이 즉시 표시됨

따라서 동적 렌더 계약은 **싱글에서는 실제 작동**한다.

반면 홈·상업은 구성품 variant 입력 경로가 화면까지 연결되지 않는다.

- 홈은 `HOMEMULTI` 상품 행을 `d03ConfiguredVariants_`에 넘기지만, 이 함수는 먼저 `componentKind/kind === REMOTE|PANEL`을 요구한다. `HOMEMULTI`는 상품 endpoint 출력이라 해당 kind가 없다.
- 상업은 활성 구성품 137건 중 REMOTE/PANEL kind가 0건이다. fallback인 `COMMULTI`도 상품 행이므로 같은 kind 필터에서 전부 탈락한다.
- DB 상품 속성에는 실제 값이 있다: HOME_MULTI `remote_type` 무선 5·유선 2, `panel_type`에는 일반·공청·360·인피니트 4종이 존재한다. 즉 DB가 빈 것이 아니라 프론트 입력축 연결이 끊겼다.

근거: [06-isolated-component-change-reflected.png](06-isolated-component-change-reflected.png)

## ⑦ 라이브 캡처 목록과 옵션·행 개수

직원 인증은 지정된 `/auth/login` 호출 후 `window.samhanAuth`를 `addInitScript`로 주입했다. 종합견적서는 직원 전용 서버 인증 경로도 함께 통과해 HTTP 200을 확인했다. 세 화면은 버튼으로 실제 전환했다.

| 화면 | 전체 행 | 가시 행 | 리모컨 | 판넬 | 360 판넬 |
|---|---:|---:|---|---|---|
| 홈멀티 | 107 | 107 | 1: 제외 | 1: 판넬제외 | 해당 없음 |
| 상업멀티 | 310 | 310 | 1: 제외 | 1: 판넬제외 | **0: 빈 셀렉트** |
| 싱글중대형 | 851 | 133 | 3: 기본·컬러·유선 | 5: 판넬제외·기본·블랙·승강·공청 | **0: 빈 셀렉트** |

싱글의 전체 851행에는 필터/세트 전개로 숨겨진 행이 포함되며 실제 가시 행은 133행이다. 빈 360 셀렉트를 정상으로 세지 않았다.

캡처:

1. [01-home-multi-remote-panel-options.png](01-home-multi-remote-panel-options.png)
2. [02-infinite-home-panel-options.png](02-infinite-home-panel-options.png)
3. [03-commercial-multi-remote-panel-options.png](03-commercial-multi-remote-panel-options.png)
4. [04-single-remote-panel-options.png](04-single-remote-panel-options.png)
5. [05-single-wired-exclusion-wins.png](05-single-wired-exclusion-wins.png)
6. [06-isolated-component-change-reflected.png](06-isolated-component-change-reflected.png)
7. [live-measurement.json](live-measurement.json)

## ⑧ 증거 무결성 점검

기존 `docs/qa/d03-option-naming-unify` 증거는 그대로 재현되지 않는다.

- 기존 PNG 3장의 SHA-256이 모두 `45CAB977...F7A55`로 완전히 동일하다.
- 기존 JSON 3장의 SHA-256도 모두 `E68BE3E5...642BA`로 완전히 동일하다.
- 기존 라이브 스펙은 화면 전환 없이 같은 URL을 이름만 바꿔 세 번 캡처한다.
- 기존 보고 수치 홈 리모컨 4·판넬 3은 이번 동일 head의 새 라이브 실측 1·1과 다르다.
- 기존 보고서는 360판넬을 `component_shape` 동적으로 바꿨다고 적었지만, 이번 요구의 정본은 “360판넬 하드코딩 유지”이며 실제 화면에서는 상업·싱글 360 셀렉트가 0개다.

따라서 기존 세 PNG를 세 화면의 독립 실측 증거로 사용할 수 없다. 이번 라운드에서 실제 화면 전환, 행 수, 옵션 배열, 별도 PNG로 정정했다.

## ⑨ 머지 판정 — 머지 불가, 도달 결함 3건

### 도달 결함 1 — BLOCKER: 홈멀티 리모컨·판넬 옵션 붕괴

실사용자 화면에서 리모컨은 `제외` 1개, 판넬은 `판넬제외` 1개다. `기본` 3갈래 분기에 진입할 수 없고 인피니트 네 옵션도 선택할 수 없다. PR의 핵심 목적이 홈멀티에서 도달하지 않는다.

### 도달 결함 2 — BLOCKER: 상업멀티 리모컨·판넬 옵션 붕괴

상업멀티 310행이 정상 렌더됐지만 리모컨·판넬은 각각 합성 제외값 1개뿐이다. DB 상품에 유선 리모컨과 일반·공청·블랙·승강·360 판넬 속성이 존재해도 셀렉트로 전달되지 않는다.

### 도달 결함 3 — BLOCKER: 하드코딩 유지 대상 360 판넬 셀렉트가 비어 있음

상업멀티와 싱글중대형의 360 판넬 셀렉트 옵션 수가 모두 0이다. 사용자는 원형·사각을 선택할 수 없다. `component_shape` 채움률이 낮으므로 하드코딩을 유지한다는 요구와 반대되는 도달 회귀다.

결론: CI 47/47과 golden 통과만으로 머지할 수 없다. 위 3건을 수정하고 새 실측에서 홈·상업 옵션, 인피니트 4종, 360 원형·사각이 실제 셀렉트에 나타난 뒤 재판정해야 한다.

## ⑩ 프로세스 회수

- 이 라운드에서 기동한 estimate-app 5183 프로세스 트리 3개 회수.
- 이 라운드의 Playwright/Chromium 프로세스 회수.
- 최종 5183 listener: 0개.
- 작업 식별 문자열 기준 잔여 프로세스: 0개.
- 새로 기동·중지·재시작한 컨테이너: 0개.
- 공유 컨테이너: 시작 전후 동일 24개 실행 중이며 모두 기존 공유 스택이다.
- QA 산출물 중 100MB 초과 파일: 0개. 자격·토큰·키·시트 ID는 기록하지 않았다.

