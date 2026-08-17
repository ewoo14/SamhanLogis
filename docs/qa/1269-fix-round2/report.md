# PR #1269 fix 라운드 2 — CODEX LUNA 실측 보고

## ① 라운드 1이 절반만 고쳐진 이유

라운드 1은 `componentDeliveryPrice_()`를 도입해 세트 헤더 계산과 구성품 납품가의 원천을 분리했지만, 세트상세의 옵션 활성 행은 별도 로직이었다. 유선 선택 시 `component_variant` 후보를 찾고도 기본 무선 행을 활성 목록에서 제거하지 않아, 헤더 차액만 `+40,000원`으로 맞고 상세는 계산가(무선 13,915원·유선 45,375원)와 무선 행 잔재를 보였다. 라운드 1 보고서의 56,000원 주장은 원문 실측과 불일치했고, 캡처도 빈 전표작성 화면이었다.

## ② RED 원문 — 양방향

새 RED 테스트 `싱글 리모컨 옵션은 기본 무선 행을 제거하고 유선 행만 활성화한다`를 먼저 추가했다.

```text
FAIL test/code.test.js
resolveSingleRemoteRows_ not found
Tests: 1 failed, 46 passed, 47 total
```

실패 원인은 새 동작이 아직 구현되지 않았기 때문이며, 기존 테스트를 새 기대값으로 바꾼 것이 아니다. 구현 후 같은 테스트는 `47 passed, 0 failed`가 됐다.

## ③ 수정 후 실제 실측

수정본을 이 워크트리의 estimate-app만 포트 5190에서 기동하고, 공유 컨테이너·공유 DB write 없이 `싱글중대형 → AC060CS6PBH1SY → 수량 1 → 구성 펼침` 경로를 실행했다.

| 상태 | 헤더 | 활성 리모컨 행 | 단가 | 수량 | 화면 행 수 |
|---|---:|---|---:|---:|---:|
| 무선 기본 | 1,660,000원 | AR-EH05 무선 | 16,000원 | 1 | 13 |
| 유선 선택 | 1,700,000원 | AWR-WE13N 유선 | 56,000원 | 1 | 13 |
| 무선 복귀 | 1,660,000원 | AR-EH05 무선 | 16,000원 | 1 | 13 |

유선 화면에서 AR-EH05는 수량 0, AWR-WE13N은 수량 1이다. 즉 옵션 행은 `component_variant` 정본에 따라 활성 행이 교체되고, 헤더에는 납품가 차액 40,000원만 추가된다. 실내기 606,000원·실외기 910,000원도 양 상태에서 유지됐다.

자재 세트 `AP060BAPPBH2S`의 기존 실측 증거는 자재 별도 1,200,000원 → 포함 1,330,000원(+130,000원)이며, 이번 변경으로 `materialsSumForSet()`의 구성품 납품가 원천이 유지된다.

## ④ #1241 천원 단위 배분

`splitIndoorOutdoorToK()` 양방향 테스트와 라이브 AC060 상세에서 실내기 606,000원·실외기 910,000원·기본 판넬 128,000원·무선 리모컨 16,000원 원천을 확인했다. 유선은 고정 구성품이 168,000원(판넬 128,000 + 리모컨 56,000)으로 바뀌고, 실내외 배분은 각각 606,000원·910,000원으로 유지된다.

## ⑤ 6종 sweep

라이브 카탈로그를 INDOOR·OUTDOOR·PANEL·REMOTE·MATERIAL·ACCESSORY로 분류해 전수 확인했다.

```text
INDOOR    271행 — 원천 확인, AC060 실측 완료
OUTDOOR   271행 — 원천 확인, AC060 실측 완료
PANEL     250행 — 납품가 원천 250행 확인
REMOTE    315행 — 납품가 원천 315행 확인, 양방향 실측 완료
MATERIAL  273행 — 납품가 원천 273행 확인, AP060 기존 실측 유지
ACCESSORY  67행 — 납품가 원천 67행 확인
```

리모컨 행 교체는 REMOTE 축에만 적용되는 규칙이며, PANEL·MATERIAL은 기존 차액/포함 계산 경로를 보존했다.

## ⑥ 스크린샷 목록 — 직접 열어 확인

두 PNG를 생성 후 직접 열어 화면 내용을 확인했다. 둘 다 빈 전표작성 화면이 아니라 `싱글중대형` 탭의 AC060 세트상세이며, 각 장의 구성 행은 13개다.

- `docs/qa/1269-fix-round2-real-qa/01-AC060-무선-세트상세.png` — 헤더 1,660,000원, AR-EH05 16,000원·수량 1, 구성 행 13개.
- `docs/qa/1269-fix-round2-real-qa/02-AC060-유선-세트상세.png` — 헤더 1,700,000원, AWR-WE13N 56,000원·수량 1, AR-EH05 수량 0, 구성 행 13개.

캡처 경로는 `resolveQaShotsDir()`를 통과했고 `QA_SHOTS_DIR`를 확정 커밋 경로로 지정했다. 인증은 `resolveQaCredential()`로 확인했다.

## ⑦ 미검증 축

6종 전체의 모든 모델에 대해 옵션 전환을 라이브로 반복한 것은 아니다. 이번 라운드의 최우선 양방향 대상인 AC060 REMOTE는 실측 완료했고, PANEL·MATERIAL의 대표 헤더/구성품 실측은 기존 라운드 증거로 대조했다. INDOOR·OUTDOOR·ACCESSORY의 개별 옵션 전환은 미검증으로 남긴다.

## ⑧ 변경 파일

- `clients/web/estimate-app/views/index.ejs` — `resolveSingleRemoteRows_()` 추가 및 `explodeSetParts()` 활성 리모컨 해석 연결.
- `clients/web/estimate-app/test/code.test.js` — 유선→무선 양방향 행 교체 RED/GREEN 회귀 테스트 추가.
- `clients/web/estimate-app/scripts/qa-1269-fix-round2-real.mjs` — 인증·확정 캡처 경로·세트상세 실측·6종 sweep 하네스.
- `docs/qa/1269-fix-round2/` — 본 보고서 및 `docs/qa/1269-fix-round2-real-qa/` 실측 결과/PNG.

검증: `npm test -- --runInBand test/code.test.js` → 47/47 통과.

## ⑨ 프로세스 회수

이번 라운드가 기동한 워크트리 estimate-app 포트 5190 프로세스와 Playwright 브라우저를 종료했다. 격리 컨테이너는 기동하지 않았다. 공유 컨테이너 24개와 공유 DB는 그대로 유지했다. `git add`, `git commit`, `git push`는 수행하지 않았다.
