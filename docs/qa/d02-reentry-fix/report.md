# PR #1264 도달 결함 수정 보고

## ① RED 원문 — 재진입 재현

서버에 회계전표 링크가 있는 행과 링크가 없는 행을 각각 준비하고 `render → 탭 진입 → unmount → 재렌더 → 탭 재진입`으로 검증했다.

수정 전 재진입 테스트의 실패 원문:

```text
FAIL src/renderer/routes/DailyClosingPage.test.tsx
  서버 정본 재진입 잠금
    × 재진입하면 서버에 연결된 전표의 생성 버튼과 금액 입력을 잠근다
      AssertionError: expected button to be disabled
      Received: enabled
    × 재진입해도 연결되지 않은 전표는 생성·금액 입력이 가능하다
      AssertionError: expected input.disabled to be false
      Received: true
```

첫 번째 실패는 서버 연결 상태를 재조회하지 않아 로컬 생성 상태가 초기화된 결함을 재현한다. 두 번째 케이스는 정상 미생성 경로의 과잉 차단을 방지하기 위해 함께 고정했다.

## ② 원인 — 서버 상태를 왜 안 읽었나

기존 화면은 생성 직후에만 로컬 `accountingCreated` 집합에 키를 넣었다. 화면을 unmount하고 다시 들어오면 이 집합은 빈 상태로 초기화된다.

기존 slip-service의 `accountingPostedAt` 조회는 `postedAt IS NOT NULL`인 전표만 반환한다. 따라서 새로 생성된 DRAFT 전표는 allocation이 있어도 `accountingPostedAt=null`로 보였다. DB의 중복 차단은 정상이나, 화면이 DRAFT allocation을 정본으로 읽지 않은 것이 원인이다.

## ③ 고친 내용

- `accountingSlipLinkApi`의 서버 정본 eligibility batch를 일마감 원천행 조회 후 호출한다.
- `readModel.linkedSlips`가 있는 원천 전표를 서버 생성 완료로 판정한다.
- 서버 판정과 기존 로컬 생성 상태를 합쳐 생성 버튼을 disabled 처리하고 `이미 생성됨`으로 표시한다.
- 동일 판정을 금액 input의 `disabled`에 적용한다.
- 잠금 표시는 조건부 `수정 불가` span을 제거하고, #1270 계약대로 disabled input의 `title` 툴팁만 사용한다.
- 정상 미생성 원천행은 eligibility의 빈 결과에서 생성 버튼과 금액 input이 계속 활성이다.
- accounting 테스트 fixture의 변경된 `SlipServiceClient(Builder, InternalAuthProperties, slipServiceBaseUrl)` 생성자 인자를 보완했다.

## ④ CI red 원인과 처리

CI accounting 컴파일 실패 원문:

```text
SlipServiceClientTest.java:39: error: constructor SlipServiceClient ... cannot be applied
required: Builder,InternalAuthProperties,String
found: Builder,InternalAuthProperties
```

브랜치 본체가 direct slip URL 인자를 추가했는데 해당 테스트 fixture만 2인자 생성자를 사용하고 있었다. 테스트에서 `http://slip-service`를 명시해 계약을 맞췄다. 운영 코드의 생성자 계약은 변경하지 않았다.

## ⑤ GREEN

- `npx vitest run src/renderer/routes/DailyClosingPage.test.tsx --reporter=dot`: 29/29 통과
- `npx vitest run src/renderer/routes/DailyClosingPage.test.tsx -t "서버 정본 재진입 잠금"`: 2/2 통과
- `npm run typecheck`: 통과
- `npm run lint`: 오류 0건, 기존 경고 196건
- `npm run build`: 통과
- `./gradlew :services:accounting-service:test --tests "*SlipServiceClientTest" --no-daemon`: 통과
- `git diff --check`: 통과

## ⑥ 재진입 캡처와 행 수

이번 수정 라운드에서는 공유 DB에 쓰지 않기 위해 격리 accounting stack을 새로 기동하지 않았다. 따라서 새 라이브 화면 PNG를 성공 증거로 가장하지 않았다. 재진입 동작의 실제 증거는 위의 화면 unmount/remount 테스트이며, 행 수는 생성 전 1행·생성 후 1행·재진입 후 1행, 미생성 재진입 1행으로 단정했다.

기존 격리 라이브 검증(`docs/qa/d02-isolated-accounting-live/`)은 별도 라운드에서 매출 4행·매입 16행, 1,739,100원·allocation 4건, 양방향 생성·DB 중복 차단·금액 잠금을 이미 확인했고, 이번 변경으로 그 산출물을 덮어쓰지 않았다.

## ⑦ 기존 검증분 무손상

- 1,739,100원과 allocation 4건 계약 유지
- OUTBOUND/INBOUND 방향 유지
- DB 레벨 중복 차단 유지
- 일마감 금액 편집 및 양방향 할인율 동기화(#1250) 코드 미변경
- desktop typecheck/lint/build 통과
- 기존 라이브 캡처·공유 컨테이너·공유 DB 미변경

## ⑧ 프로세스 회수

이번 라운드에서 기동한 장기 프로세스와 격리 컨테이너는 없다. Gradle과 npm 검증 프로세스는 각 명령 종료와 함께 종료됐다.

최종 확인 기준 잔여:

- 이번 라운드 격리 컨테이너: 0
- 이번 라운드 명명 격리 volume/image: 0
- Docker 전체에서 문자열 `d02`가 우연히 들어간 기존 익명 volume 1개가 있었으나, 2026-08-16 생성된 라벨 없는 기존 항목으로 확인해 삭제하지 않음
- 이번 라운드 서비스/JAR 프로세스: 0
- 공유 `samhan-*` 컨테이너: 유지, 중지·변경하지 않음
- git add/commit/push: 수행하지 않음
