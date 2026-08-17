# PR #1269 CODEX SOL 재판정 3회차

## ① 검증 SHA

- 브랜치: `fix/single-remote-price-delta`
- 검증 SHA: `67c647e78242b7fa57b27a33b757c54672aeac12`
- PR head와 로컬 HEAD 일치 확인
- 판정: **머지 불가 — 실사용자 화면 도달 결함 1건**
- 코드·Git index 수정 0건, 공유 DB write 0건

## ② 레거시 원문 인용과 차액 규칙 결론

레거시 정본 `tools/legacy-gas/거래처 발송 주문서/index.html`은 다음과 같이 계산한다.

```text
3061:  const baseL=setBasePriceRightFirst(s),basePanel=getBasePanelRow(s),chosenPanel=pickPanelRow(s),panelExcluded=(el('#ss_panel')?.value||'')==='판넬제외';
3062:  let panelDelta=0;
3063:  if(basePanel){const baseP=partUnitPrice(basePanel);if(panelExcluded) panelDelta-=baseP;else if(chosenPanel&&chosenPanel.model!==basePanel.model){panelDelta+=(partUnitPrice(chosenPanel)-baseP);}}
3064:  const baseRemoteRows=getDefaultRemoteRows(s);let remoteDelta=0;
3066:  const baseRemoteSum=baseRemoteRows.reduce((t,p)=>t+partUnitPrice(p),0);
3068:  else if(remoteOpt&&allowRemoteChange_(s)){const cand=getOptionRemoteRow(s,remoteOpt);if(cand){const replace=baseRemoteRows.find(p=>/유선/i.test((p?.feat||'')+' '+(p?.name||'')))||baseRemoteRows[0];if(replace) remoteDelta+=(partUnitPrice(cand)-partUnitPrice(replace));else remoteDelta+=partUnitPrice(cand);}}
3069:  const matIncludedTotal=materialsSumForSet(s);
3072:  let setPrice=baseL+panelDelta+remoteDelta+matIncludedTotal;
```

따라서 레거시는 판넬 변경 시 **선택 판넬 납품가 − 기본 판넬 납품가 전액**을 세트가에 더한다. 4way 블랙은 `188,000 − 128,000 = 60,000원` 전액이어야 한다. 별도 비율·흡수 규칙은 원문에 없다.

## ③ 1,300,000원 / 1,350,000원의 성격

읽기 전용 `product_db` 실측 결과:

- `products`에는 `AC060BS4PBH7SY` 세트 마스터가 1행뿐이며 `delivery_price=1,300,000`이다.
- 블랙 1,350,000원짜리 별도 세트 마스터 행은 없다.
- `material_price`에는 범용 옵션 lookup `D4 / 블랙판넬 / 50,000원`이 있다.
- 현행 `index.ejs:5216-5223`은 세트의 서버 계산가를 기본가로 읽고, `:5228-5231`은 `SINGLE_MAT[option]`을 구성품 차액보다 우선하며, `:5247-5253`에서 그 값을 판넬 차액으로 더한다.

즉 **1,300,000원은 독립 세트 마스터값**, **1,350,000원은 같은 세트에 블랙 옵션 lookup 50,000원을 더한 계산값**이다. 1,350,000원이 독립 설정된 세트 납품가라는 해석은 DB·코드 모두에서 성립하지 않는다.

라이브 비교도 이를 확정한다.

| 4way 옵션 | 헤더 | 기본 대비 | 구성품 차액 | 결과 |
|---|---:|---:|---:|---|
| 기본 | 1,300,000원 | 0 | 0 | 기준 |
| 블랙 | 1,350,000원 | +50,000원 | +60,000원 | **10,000원 부족** |
| 승강 | 1,360,000원 | +60,000원 | +60,000원 | 일치 |
| 공청 | 1,850,000원 | +550,000원 | +550,000원 | 일치 |

**결론: 결함이다.** 블랙만 `SINGLE_MAT['블랙판넬']=50,000`이 구성품 정본 차액 60,000원을 덮어쓰고, 부족한 10,000원이 실내·실외기에서 빠진다. 테스트 `clients/web/estimate-app/test/code.test.js:293-300`도 현재 이 우선순위(블랙 fallback보다 50,000 우선)를 명시적으로 고정하므로 370/370 green만으로 계약 정합을 증명하지 못한다.

## ④ 판넬 변형 16개 보강 충분성

공유 DB를 읽기 전용으로 `bundle_component.component_kind='PANEL'`과 `component_variant` 기준 전수 조회했다.

- 활성 싱글 세트 판넬 링크: 250행
- 고유 판넬 모델: **16개**
- 고유 variant: 기본·블랙·승강·공청 **4종**
- 코드 지도 판넬 모델: **16개**
- DB에는 있으나 지도에 없는 모델: **0개**
- 지도에는 있으나 DB 판넬에 없는 모델: **0개**

따라서 이번 16개 보강의 **모델 범위는 충분**하다. 지도 전체 19개 중 나머지 3개는 리모컨 모델이다.

## ⑤ 6종 sweep 카운트

실제 화면 계산 함수를 207세트 × 11상태 = 2,277회 다시 실행했다. `component_kind` 원문은 정확히 `INDOOR·OUTDOOR·PANEL·REMOTE·MATERIAL·ACCESSORY` 6종이었다.

| component_kind | 활성 행 | 비천원 행 | 고정 구성품 자리에 배분 중간값 노출 |
|---|---:|---:|---:|
| INDOOR | 2,277 | 11 | 0 |
| OUTDOOR | 2,277 | 0 | 0 |
| PANEL | 580 | 0 | 0 |
| REMOTE | 1,668 | 0 | 0 |
| MATERIAL | 190 | 0 | 0 |
| ACCESSORY | 495 | 0 | 0 |

INDOOR 11행은 `AP052CAPPBH1S`의 2,737,500원을 레거시 함수대로 1,094,500 + 1,643,000으로 잔액 보정한 결과다. `docs/qa/1241-271-diff-analysis/REPORT.md:55-66`은 마지막 보정이 끝전을 다시 만들 수 있으며 주석이 아닌 실행 코드를 따른다고 명시한다. 판넬의 104,060/150,040/153,670/611,050원 계열처럼 **고정 구성품 단가 자리에 배분 중간값이 샌 건은 6종 모두 0건**이다.

## ⑥ 잃으면 안 되는 것 재현

- 360 판넬: 기본 1,660,000원 / 공청 2,210,000원, 판넬 128,000원 / 678,000원, 각 13행.
- 리모컨: 무선 1,660,000원 / 유선 1,700,000원, 16,000원 → 56,000원 차액 40,000원 전액 반영, 13행.
- 자재: 별도 1,200,000원 / 포함 1,330,000원, FPH-1412XS3 130,000원 전액 반영, 3행.
- 4way: 기본 1,300,000원 → 블랙 1,350,000원 → 기본 1,300,000원 복귀.
- 4way 승강·공청 정상 경로: 1,360,000원 / 1,850,000원, 구성품 차액 전액 반영.
- 헤더=상세합: 207세트 × 11상태 **불일치 0건**.
- #1241 배분: 레거시 잔액 보정과 일치. 고정 구성품 중간값 노출 0건.
- 원문: [기본 sweep 결과](../1269-sol-reverdict-3-real-qa/results.json), [추가 옵션 실측 결과](../1269-sol-reverdict-3-real-qa/extra-results.json).

정상 경로는 유지됐지만 블랙 판넬의 세트 차액 계약만 남아 있다.

## ⑦ 커밋 캡처 2장 검증

두 PNG를 원본 해상도로 직접 열어 확인했다.

- [커밋된 4way 기본](../1269-fix-round3-real-qa/01-AC060-4way-기본-세트상세.png): 헤더 1,300,000원, 실내 462,000원, 실외 694,000원, 무선 16,000원, 기본 판넬 128,000원, **구성 9행**.
- [커밋된 4way 블랙](../1269-fix-round3-real-qa/02-AC060-4way-블랙-세트상세.png): 헤더 1,350,000원, 실내 458,000원, 실외 688,000원, 무선 16,000원, 블랙 판넬 188,000원, **구성 9행**.

산술은 각각 `462+694+16+128=1,300천원`, `458+688+16+188=1,350천원`으로 맞는다. 동시에 블랙에서 본체 합이 10,000원 감소한 사실도 이미지에서 재현된다.

## ⑧ 검증자 스크린샷

`resolveQaShotsDir()`와 `resolveQaCredential()`을 사용한 격리 포트 5192 라이브 스펙에서 실제 옵션 change 이벤트로 찍고, PNG를 직접 열었다.

- [검증자 4way 기본](../1269-sol-reverdict-3-real-qa/01-AC060-4way-기본-세트상세.png): 헤더 1,300,000원, 기본 판넬 128,000원, **9행**.
- [검증자 4way 블랙](../1269-sol-reverdict-3-real-qa/02-AC060-4way-블랙-세트상세.png): 헤더 1,350,000원, 블랙 판넬 188,000원, **9행**.

추가 승강·공청·360·리모컨·자재 DOM 실측은 `extra-results.json`에 남겼다. 추가 페이지 캡처 7장은 환영/전표작성 화면을 찍어 행 증거로 부적합했으므로 직접 확인 후 삭제하고 보고 증거에서 제외했다. 미검증 이미지를 정상 캡처로 세지 않았다.

## ⑨ 미검증 축

- 2,277상태의 계산 함수는 전수 실행했지만 각 상태를 사람 클릭으로 모두 캡처하지는 않았다.
- 공유 DB write 금지에 따라 견적 저장·전표 생성·재오픈은 미검증이다.
- 데스크톱 판매전표 교차 저장은 미검증이다.
- 추가 7장 시각 증거는 부적합으로 폐기했으며 결함 0 근거로 사용하지 않았다.

## ⑩ CI

- 로컬 estimate-app 전체: **21 suites / 370 tests 통과**.
- GitHub REST check-runs: SHA `67c647e78` 기준 **47/47 completed/success**, 실패·대기 0.
- `gh pr checks` GraphQL은 조회 시점 GitHub 503이었으나 동일 SHA의 REST check-runs 47개 이름·상태·결론을 전수 확인했다.

## ⑪ 머지 판정과 수렴 의견

**머지 불가 — 도달 결함 1건.**

사용자가 4way 기본에서 블랙판넬을 선택하면 레거시·구성품 정본 차액은 60,000원인데 세트가는 50,000원만 증가한다. 10,000원이 실내·실외기에서 흡수되어 상세합만 맞춘다. 이는 독립 세트 마스터 결정이 아니라 범용 블랙 옵션 lookup이 구성품 차액을 덮어쓴 결과다.

fix 상한 3회 사용 후에도 도달 결함 1건이 남았다. 다만 이 축은 **수렴하고 있다**. 라운드 2의 16개 판넬 중간값 누출은 0건으로 닫혔고, 남은 원인은 `configuredSingleOptionDelta_`의 블랙 50,000 우선이라는 한 지점으로 좁혀졌다. 승강·공청·리모컨·자재는 모두 전액 차액과 일치한다. 되돌릴지, 상한 예외로 이 한 지점을 바로잡을지는 개발책임자 결정 사항이다.

## ⑫ 프로세스 회수

- 이번 검증에서 기동한 estimate-app 5192 프로세스 2회 모두 종료, 최종 5192 LISTEN 0.
- 모든 Playwright 브라우저는 `finally`에서 종료.
- 이번 검증이 기동한 컨테이너 0개, 격리 컨테이너 잔여 0개.
- 공유 `samhan-*` 컨테이너 **24개 유지**, stop/start/recreate 0.
- 공유 DB write 0건.
- 부적합 추가 PNG 7장만 삭제. 유효 캡처·결과 JSON·본 보고서는 보존.
- `git add`, `git commit`, `git push` 수행하지 않음.
