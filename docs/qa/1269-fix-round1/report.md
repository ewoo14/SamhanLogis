# PR #1269 fix 라운드 1 보고서

## ① 원인

`partUnitPrice()`의 변동단가 계산가(45,375원 등)를 세트상세 구성품 납품가와 실내기·실외기 배분의 고정합계 원천으로 재사용해, 구성품 단가와 #1241 천원 단위 배분이 동시에 오염됐다.

## ② RED 원문

수정 전 실패 테스트를 먼저 실행했다.

```text
FAIL test/code.test.js
● 순수 유틸 (Apps Script 호환) › 싱글 구성품 납품가는 옵션 계산가가 아니라 유선 56000원·무선 16000원 원천을 반환한다

componentDeliveryPrice_ not found
```

배분 RED도 추가해 고정 구성품을 45,375원으로 빼는 경로를 잡았다.

```text
ReferenceError: componentDeliveryPrice_ is not defined
```

양방향 기대값은 유선 선택 56,000원, 무선 복귀 16,000원이다.

## ③ 수정 후 4개 숫자 재현

실제 수정 서버 `:5190`에서 `AC060CS6PBH1SY`를 검색하고 수량 1 → 구성품 보기 → 리모컨 전환으로 확인했다.

| 상태 | 헤더 | 구성품 행 | 실내기 | 실외기 | 리모컨 |
|---|---:|---:|---:|---:|---:|
| 무선 기본 | 1,660,000원 | 13행 | 606,000원 | 910,000원 | 16,000원 |
| 유선리모컨 | 1,700,000원 | 13행 | 606,000원 | 910,000원 | 56,000원 |

자재 보유 세트도 기존 실측 계약을 유지한다: 별도 1,200,000원 → 포함 1,330,000원.

## ④ 천원 단위 배분 복구 근거

구성품 납품가를 먼저 고정하고, `setUnit - fixedSum` 잔액만 실내기·실외기에 배분하도록 변경했다. 테스트와 라이브 모두 다음 정본을 확인했다.

```text
1,660,000 - (128,000 판넬 + 16,000 무선리모컨) = 1,516,000
실내기 606,000 / 실외기 910,000

1,700,000 - (128,000 판넬 + 56,000 유선리모컨) = 1,516,000
실내기 606,000 / 실외기 910,000
```

## ⑤ 계열 sweep 결과

실제 `SINGLE_PARTS` 1,447행을 생산 함수로 6종 전수 분류해 확인했다.

```text
INDOOR    271행 조회
OUTDOOR   271행 조회
PANEL     250행 조회
REMOTE    315행 조회 — 45,375/13,915 잔재 0행
MATERIAL  273행 조회 — 45,375/13,915 잔재 0행
ACCESSORY 67행 조회 — 45,375/13,915 잔재 0행
```

AC060 실제 화면에서는 INDOOR·OUTDOOR·PANEL·REMOTE 4종을 13행으로 직접 확인했다. MATERIAL·ACCESSORY는 데이터 함수 sweep까지 검증했고 해당 세트의 별도 화면 캡처는 미검증으로 남긴다.

## ⑥ 스크린샷

- [무선 세트상세, 13행](1269-fix-round1-real-qa/_local/01-AC060-무선-상세.png)
- [유선 세트상세, 13행](1269-fix-round1-real-qa/_local/02-AC060-유선-상세.png)
- 결과 원문: [results.json](1269-fix-round1-real-qa/_local/results.json)

캡처 목적지는 모두 `resolveQaShotsDir()` 경유의 `-real-qa/_local`이다.

## ⑦ 미검증 축

- MATERIAL·ACCESSORY의 별도 세트를 화면에서 직접 열어 찍는 단계는 미검증.
- 공유 스택 컨테이너 교체 없이 로컬 estimate-app만 기동했으므로 배포 JAR 검증은 미검증.
- 브라우저 플러그인은 사용 가능한 브라우저가 없어 Playwright headless 실 서버 캡처로 대체했다.

## ⑧ 변경 파일

- `clients/web/estimate-app/views/index.ejs`
  - 구성품 납품가 원천 helper 및 legacy 납품가 맵
  - 고정합계·옵션 차액·세트상세 표시를 동일 원천으로 통일
- `clients/web/estimate-app/test/code.test.js`
  - 양방향 리모컨 RED/GREEN 테스트
  - 천원 단위 실내기·실외기 배분 테스트
- `clients/web/estimate-app/scripts/qa-1269-fix-round1-real.mjs`
  - 실제 서버 화면 캡처·행 수·6종 sweep 스크립트

검증: `21 suites / 368 tests` 통과. `git add`, commit, push는 수행하지 않았다.

## ⑨ 프로세스 회수

- 로컬 estimate-app 서버 PID 48964: 회수 완료, 잔여 0
- Playwright 브라우저: 스크립트 `finally`에서 종료, 잔여 0
- 이번 라운드 격리 컨테이너: 0개 기동·0개 잔여
- 공유 컨테이너 24개: 변경·중지하지 않음
