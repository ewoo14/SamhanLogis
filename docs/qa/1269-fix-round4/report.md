# PR #1269 fix 라운드 4 — CODEX LUNA 결과

## ① 레거시 원문 인용과 정본 판단

재판정 보고서의 레거시 원문 `tools/legacy-gas/거래처 발송 주문서/index.html:3061-3072`를 기준으로 판단했다.

```text
3061: const baseL=setBasePriceRightFirst(s),basePanel=getBasePanelRow(s),chosenPanel=pickPanelRow(s),panelExcluded=(el('#ss_panel')?.value||'')==='판넬제외';
3062: let panelDelta=0;
3063: if(basePanel){const baseP=partUnitPrice(basePanel);if(panelExcluded) panelDelta-=baseP;else if(chosenPanel&&chosenPanel.model!==basePanel.model){panelDelta+=(partUnitPrice(chosenPanel)-baseP);}}
3064: const baseRemoteRows=getDefaultRemoteRows(s);let remoteDelta=0;
3066: const baseRemoteSum=baseRemoteRows.reduce((t,p)=>t+partUnitPrice(p),0);
3068: else if(remoteOpt&&allowRemoteChange_(s)){const cand=getOptionRemoteRow(s,remoteOpt);if(cand){const replace=baseRemoteRows.find(p=>/유선/i.test((p?.feat||'')+' '+(p?.name||'')))||baseRemoteRows[0];if(replace) remoteDelta+=(partUnitPrice(cand)-partUnitPrice(replace));else remoteDelta+=partUnitPrice(cand);}}
3069: const matIncludedTotal=materialsSumForSet(s);
3072: let setPrice=baseL+panelDelta+remoteDelta+matIncludedTotal;
```

따라서 판넬 정본은 옵션 lookup이 아니라 구성품 납품가 차액 전액이다. `product_db` 읽기 전용 실측에서 `AC060BS4PBH7SY` 세트 마스터는 `1,300,000원` 1행이고, 블랙 별도 세트 마스터는 없으며, `material_price`의 `D4/블랙판넬` lookup은 `50,000원`이었다. 구성품은 기본 `128,000원`, 블랙 `188,000원`이므로 정본 차액은 `60,000원`이다.

수정은 `clients/web/estimate-app/views/index.ejs:5253`에서 판넬 분기만 `fallback`(구성품 납품가 차액)을 직접 반영하도록 했다. `SINGLE_MAT` 우선 정책은 리모컨 축에만 남겼다. 10,000원을 임의로 추가하지 않았다.

## ② 수정 후 판넬 실측

실제 포트 5192 페이지에서 4way 세트를 선택하고 판넬 select의 `change` 이벤트를 기본 → 블랙 → 기본으로 수행했다.

| 상태 | 헤더 | 활성 상세 | 상세 소계 | 검증 |
|---|---:|---:|---:|---|
| 기본 | 1,300,000원 | 9행 | 462,000 + 694,000 + 16,000 + 128,000 = 1,300,000원 | 일치 |
| 블랙 | 1,360,000원 | 9행 | 462,000 + 694,000 + 16,000 + 188,000 = 1,360,000원 | 일치 |
| 기본 복귀 | 1,300,000원 | 9행 | 462,000 + 694,000 + 16,000 + 128,000 = 1,300,000원 | 일치 |

블랙의 기본 대비 증액은 `60,000원`, 구성품 차액도 `60,000원`이다.

## ③ 옵션값 ↔ 구성품 실제 차액 대조표 — 전축

현행 `calcSetUnitPrice`에서 별도 옵션값 테이블 `SINGLE_MAT`을 읽는 축은 판넬과 리모컨뿐이며, 자재는 구성품 합계를 직접 사용한다.

| 축 | 옵션 | 별도 옵션값 | 구성품 실제 차액 | 수정 후 | 판정 |
|---|---|---:|---:|---:|---|
| 판넬 | 블랙판넬 | 50,000원 | 60,000원 | 60,000원 | **기존 불일치 1건 → 해소** |
| 판넬 | 승강판넬 | 60,000원 | 60,000원 | 60,000원 | 일치 |
| 판넬 | 공청판넬 | 550,000원 | 550,000원 | 550,000원 | 일치 |
| 판넬 | 판넬제외 | 해당 없음 | -기본 판넬가 | -기본 판넬가 | 일치 |
| 리모컨 | 유선리모컨 | 40,000원 | 56,000−16,000 = 40,000원 | 40,000원 | 일치 |
| 리모컨 | 컬러유선리모컨 | 75,000원 | 91,000−16,000 = 75,000원 | 75,000원 | 일치 |
| 자재 | 포함 | 별도 옵션값 없음 | 자재 구성품 합계 130,000원 | 130,000원 | 일치 |

따라서 별도 옵션값과 구성품 실제 차액의 불일치는 수정 전 판넬 블랙 **1건**뿐이며, 수정 후 **0건**이다. 6종 구성품 sweep도 `INDOOR·OUTDOOR·PANEL·REMOTE·MATERIAL·ACCESSORY` 전부 실행했다.

## ④ RED 원문 — 양방향

추가한 회귀 테스트 `clients/web/estimate-app/test/code.test.js`는 먼저 다음 RED를 확인했다.

```text
● 싱글 판넬 선택은 SINGLE_MAT 옵션값이 아니라 구성품 납품가 차액 전액을 반영하고 기본 복귀한다

Expected: 1360000
Received: 1350000
```

테스트는 블랙 선택 `1,360,000원`과 기본 복귀 `1,300,000원`을 양방향으로 검증한다. 수정 후 해당 테스트는 PASS다.

## ⑤ 잃으면 안 되는 것 재현

- 리모컨: 무선 `1,660,000원` / 유선 `1,700,000원`, 구성품 `16,000 → 56,000원`, 차액 `40,000원` 정확.
- 자재: 별도 `1,200,000원` → 포함 `1,330,000원`, `FPH-1412XS3 130,000원` 전액.
- 판넬: 360 기본 `1,660,000원` / 공청 `2,210,000원`, 판넬 `128,000 → 678,000원`.
- 4way: 기본 `1,300,000원` → 블랙 `1,360,000원` → 기본 `1,300,000원`.
- 4way 승강·공청: `1,360,000원` / `1,850,000원` 정상.
- 헤더=상세합 전수: `207세트 × 11상태 = 2,277회`, 불일치 `0건`.
- 6종 sweep: 고정 구성품 단가 자리에 배분 중간값 노출 `0건`.

수정 후 sweep 원문 `docs/qa/1269-fix-round4-real-qa/results.json`:

```text
stateRuns=2277
INDOOR activeRows=2277 nonThousand=11
OUTDOOR activeRows=2277 nonThousand=0
PANEL activeRows=580 nonThousand=0
REMOTE activeRows=1668 nonThousand=0
MATERIAL activeRows=190 nonThousand=0
ACCESSORY activeRows=495 nonThousand=0
```

INDOOR 11건은 기존 #1241 레거시 잔액 보정 결과이며, 판넬·리모컨·자재·ACCESSORY의 비천원 행은 0건이다.

## ⑥ 천원 단위 배분

`#1241` 배분 로직과 테스트를 변경하지 않았다. 수정 전후 2,277회 sweep에서 고정 구성품 자리에 배분 중간값 노출은 6종 모두 0건이며, 실내기에서 기존 레거시 잔액 보정 11건만 유지된다.

## ⑦ 스크린샷 — 직접 열어 확인

모든 캡처는 `resolveQaShotsDir()` 경유 경로이며, `QA_SHOTS_DIR`를 `C:\dev\Samhan-Public\.claude\worktrees\wsrd\docs\qa\1269-fix-round4-real-qa`로 지정했다. `resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')`를 사용했고, PNG를 직접 열어 확인했다.

- [4way 기본 — 헤더 1,300,000원, 상세 9행](../1269-fix-round4-real-qa/01-AC060-4way-기본-세트상세.png)
- [4way 블랙 — 헤더 1,360,000원, 상세 9행](../1269-fix-round4-real-qa/02-AC060-4way-블랙-세트상세.png)
- 결과 원문: [results.json](../1269-fix-round4-real-qa/results.json)

두 PNG 모두 462,000원 실내기, 694,000원 실외기, 16,000원 무선리모컨과 선택된 판넬의 수량·소계를 직접 확인했다.

## ⑧ 테스트·미검증 축

- 로컬 estimate-app: **21 suites / 371 tests 통과**. (이번 회귀 테스트 1건 포함)
- PR 기존 검증 SHA `67c647e78`의 CI: **47/47 성공**. 이번 로컬 변경은 아직 커밋/푸시하지 않았으므로 새 CI 결과는 없음.
- 미검증: 공유 DB write를 금지했으므로 견적 저장·전표 생성·재오픈, 데스크톱 판매전표 교차 저장.
- 전수 계산은 실행했지만 2,277개 상태를 모두 사람 클릭·개별 캡처하지는 않았다. 실제 클릭 증거는 4way 기본/블랙/기본 복귀다.

## ⑨ 변경 파일 — `git status --porcelain` 원문

```text
 M clients/web/estimate-app/test/code.test.js
 M clients/web/estimate-app/views/index.ejs
?? clients/web/estimate-app/scripts/qa-1269-fix-round4-real-qa/
?? docs/qa/1269-fix-round4/
?? docs/qa/1269-fix-round4-real-qa/
?? docs/qa/1269-sol-reverdict-3-real-qa/
?? docs/qa/1269-sol-reverdict-3/
```

마지막 두 라운드 3 경로는 작업 시작 당시부터 존재한 미추적 산출물이며 삭제·덮어쓰지 않았다. PM은 위 목록 전체를 확인해 커밋해야 한다. 본 세션에서는 `git add`, `git commit`, `git push`를 실행하지 않았다.

## ⑩ 프로세스 회수

- 이번 세션이 기동한 estimate-app 포트 5192 프로세스 회수 완료.
- 종료 확인: 포트 5192 LISTEN `0`.
- Playwright 브라우저는 스펙 `finally`에서 종료.
- 기동한 격리 컨테이너 `0개`.
- 공유 `samhan-*` 컨테이너 `24개`는 stop/start/recreate하지 않았다.
- 공유 DB write `0건`.
