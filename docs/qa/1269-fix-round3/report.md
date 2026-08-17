# PR #1269 fix 라운드 3 — 상한 보고서

## ① 왜 4way만 빠졌는가

원인은 4way 전용 계산식이 아니라 구성품 납품가 원천의 누락이었다. `componentDeliveryPrice_()`는 `LEGACY_COMPONENT_DELIVERY`에 등록된 모델만 구성품 납품가를 우선하고, 미등록 모델은 `priceFrom(p)`로 내려갔다. `PC4NUFK1NW`와 `PC4NBFK1NW`가 지도에서 빠져 `104,060원`·`150,040원`이라는 세트 배분 계산 중간값이 판넬 단가로 노출됐다. 같은 경로는 4way에만 국한되지 않으므로 DB 판넬 변형 전체를 같은 구성품 납품가 지도에 보강했다.

## ② 원인에 걸리는 판넬 변형 전수

DB `component_variant`/`component_kind` 기준 판넬 모델은 다음 16개를 확인하고 납품가 원천을 등록했다.

| 계열 | 모델 | 구성품 납품가 |
|---|---|---:|
| 1way·WIFI | PC1BWSK3NW, PC1NWSK3NW | 128,000원 |
| 1way·공기청정 | PC1BWCK3NW | 388,000원 |
| 1way·공기청정 | PC1NWCK3NW | 343,000원 |
| 4way·기본 | PC4NUFK1NW | 128,000원 |
| 4way·블랙 | PC4NBFK1NW | 188,000원 |
| 4way·승강 | PC4NUXK1NW | 188,000원 |
| 4way·공기청정 | PC4NUCK4NW | 678,000원 |
| 360·기본 | PC6NUNK1NW, PC6NUDK1NW | 128,000원 |
| 360·블랙 | PC6NBNK1NW, PC6NBDK1NW | 188,000원 |
| 360·공기청정 | PC6EUCK1NW, PC6NUCK1NW | 678,000원 |
| 360·승강 | PC6EUXK1NW, PC6NUXK1NW | 188,000원 |

따라서 화면 옵션명(기본·블랙·승강·공청·원형·사각·WIFI) 하나만 덧댄 것이 아니라 DB 구성품 모델 전체에 동일 원인을 적용했다. 스탠드·디럭스·승강·공기청정·블랙·WIFI 변형은 `component_kind`/`component_variant` sweep에서 누락 및 중간값 노출을 함께 확인했다.

## ③ RED 원문 — 양방향

추가한 실패 테스트:

```text
test('싱글 판넬 변형은 4way 구성품 납품가를 배분 계산가보다 우선한다', () => {
  const context = loadCurrentEstimateViewFunction('componentDeliveryPrice_', {
    PRICE_INC: { single: {} },
    priceFrom: (part) => part.price,
  });

  expect(context.componentDeliveryPrice_({ model: 'PC4NUFK1NW', price: 104060 })).toBe(128000);
  expect(context.componentDeliveryPrice_({ model: 'PC4NBFK1NW', price: 150040 })).toBe(188000);
});
```

수정 전 RED 원문은 `Expected: 128000 / Received: 104060`이었다. 같은 테스트에서 블랙도 `150040 → 188000`을 검증하며, 라이브에서는 기본→블랙→기본 복귀를 확인했다.

## ④ 고친 뒤 4way 실측

실제 `AC060BS4PBH7SY` 수량 1:

| 상태 | 헤더 | 실내기 | 실외기 | 무선 리모컨 | 활성 판넬 | 상세합 | 행 수 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 기본 | 1,300,000원 | 462,000원 | 694,000원 | 16,000원 | PC4NUFK1NW / 128,000원 | 1,300,000원 | 9행 |
| 블랙 | 1,350,000원 | 458,000원 | 688,000원 | 16,000원 | PC4NBFK1NW / 188,000원 | 1,350,000원 | 9행 |
| 기본 복귀 | 1,300,000원 | 462,000원 | 694,000원 | 16,000원 | PC4NUFK1NW / 128,000원 | 1,300,000원 | 9행 |

104,060원·150,040원은 더 이상 노출되지 않는다.

## ⑤ 천원 단위 배분

4way 기본은 실내기 462,000원·실외기 694,000원, 블랙은 실내기 458,000원·실외기 688,000원으로 모두 천원 단위다. 판넬 고정합계가 128,000원→188,000원으로 바뀌고 나머지만 배분되어 합계 차액도 50,000원으로 보존된다.

## ⑥ 판넬 변형 전수 카운트 및 6종 sweep

라이브 DB 기준 구성품 1,447행, 고유 `component_variant` 7종, 구성품이 있는 세트 207개를 대상으로 11상태(기본·판넬제외·블랙·승강·공청·유선·컬러유선·자재포함·360 원형·360 사각·기본복귀)를 실행했다. 총 2,277 세트-상태다.

| `component_kind` | 활성 행 | 배분 중간값이 단가에 온 건 | 비천원 고정 납품가 참고 |
|---|---:|---:|---:|
| INDOOR | 2,277 | 0 | 11 |
| OUTDOOR | 2,277 | 0 | 0 |
| PANEL | 580 | 0 | 0 |
| REMOTE | 1,668 | 0 | 0 |
| MATERIAL | 190 | 0 | 0 |
| ACCESSORY | 495 | 0 | 0 |

INDOOR 참고 11건은 `AP052CAPPBH1S`의 실내기 단독 구성품 납품가 1,094,500원 고정행이다. 실외기와 한 쌍으로 배분되는 행이 아니므로 배분 중간값 결함으로 세지 않았다. 실제 INDOOR·OUTDOOR 쌍의 배분 중간값은 0건이다.

## ⑦ 잃으면 안 되는 것 재현

- 360 판넬: 기존 재판정 실측 유지 — 기본 1,660,000원 / 공청 2,210,000원, 판넬 128,000원 / 678,000원.
- 자재: 별도 1,200,000원 → 포함 1,330,000원.
- 리모컨: 무선 1,660,000원 → 유선 1,700,000원 → 무선 1,660,000원, 무선 16,000원·유선 56,000원.
- 4way: 기본 1,300,000원 → 블랙 1,350,000원 → 기본 1,300,000원.
- 207세트 × 11상태 헤더=상세합 불일치는 이번 계산 sweep에서 0건으로 유지됐다.
- 로컬 테스트: 기존 369건 + 이번 회귀 1건 = 370/370.

## ⑧ 스크린샷 — 직접 열어 확인

`resolveQaShotsDir()` 경유 및 `QA_SHOTS_DIR` 지정 경로에 저장했다. PNG를 직접 열어 모델·단가·행 수를 확인했다.

- [4way 기본 — 9행, 헤더 1,300,000원, 판넬 128,000원](../1269-fix-round3-real-qa/01-AC060-4way-기본-세트상세.png)
- [4way 블랙 — 9행, 헤더 1,350,000원, 판넬 188,000원](../1269-fix-round3-real-qa/02-AC060-4way-블랙-세트상세.png)
- 원문: [results.json](../1269-fix-round3-real-qa/results.json)

## ⑨ 미검증 축

- 2,277 세트-상태를 사람 클릭으로 각각 캡처하지 않고 실제 계산 함수 전수 실행으로 검증했다.
- 공유 DB write 금지에 따라 견적 저장·전표 생성·재오픈·판매전표 교차 저장은 미검증이다.
- 공유 스택 24개 컨테이너는 변경하지 않았다.

## ⑩ 변경 파일

- `clients/web/estimate-app/views/index.ejs`: 판넬 구성품 납품가 원천 보강(4way만의 임시 분기 없음).
- `clients/web/estimate-app/test/code.test.js`: 4way 기본·블랙 RED 회귀 및 VM 의존성 추출 보강.
- `clients/web/estimate-app/scripts/qa-1269-fix-round3-real.mjs`: 실제 양방향 QA·6종 sweep 스펙.
- `docs/qa/1269-fix-round3/`: 본 보고서.
- `docs/qa/1269-fix-round3-real-qa/`: 실측 PNG 2장·results.json.

## ⑪ 프로세스 회수

- fix 라운드용 estimate-app 5192 프로세스 종료, 5192 LISTEN 0.
- Playwright 브라우저는 스펙 `finally`에서 종료.
- 격리 컨테이너 기동 0, 공유 컨테이너 24개 유지.
- 공유 DB write 0건.
- `git add`, `git commit`, `git push` 수행하지 않았다.
