# PR #991 라이브 QA 보고서

## 시작 기록

- 시작 시각: 2026-07-31 KST
- 범위: accounting-service · slip-service 제한 배포 및 라이브 QA
- 코드 수정/git 쓰기: 수행하지 않음

## 배포 전 확인

- 명령: `git status --short --branch; git log -1 --oneline; docker inspect -f '{{.Created}}' infrastructure-accounting-service infrastructure-slip-service`
- 결과: 브랜치 `fix/monthend-detail-price-variant`, HEAD `9e13cf4c7`; 기존 두 컨테이너는 약 17시간 전 기동 상태였음. 워크트리에는 사용자 산출물 `.vite/`와 본 QA 디렉터리만 미추적 상태.
- 판정: 배포 전 기준 확보. 지정 컨테이너는 healthy.

## 배포

- 명령: `gradlew.bat :services:accounting-service:bootJar :services:slip-service:bootJar -x test` 후 `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps accounting-service slip-service`
- 결과: 실행 시작. 대상은 accounting-service와 slip-service만으로 제한.
- bootJar 결과: `BUILD SUCCESSFUL`, 24 actionable tasks (4 executed, 20 up-to-date).
- compose 결과: 이미지 두 개는 새로 생성되었으나 `samhan-slip-service` 시작 단계에서 `127.0.0.1:8086` 포트 bind 오류로 명령은 종료코드 1. accounting-service는 Started 상태.
- 판정: 배포 후 health/이미지 시각 확인 전 환경 기동 장애. 다른 서비스는 건드리지 않음.
- 환경 원인: 호스트 `influxd` PID 9144가 0.0.0.0:8086을 점유 중. 해당 프로세스는 중단하지 않음.
- 우회 명령: compose stdin override로 slip-service host publish만 `127.0.0.1:18086:8086`으로 지정 후 `up -d --no-deps slip-service`.
- 우회 결과: `samhan-slip-service Started`.
- 배포 확인 명령: `docker inspect -f '{{.Created}}' infrastructure-accounting-service infrastructure-slip-service`
- 이미지 생성 시각: accounting `2026-07-31T14:34:37.121066817Z`, slip `2026-07-31T14:34:38.069166785Z` (KST 2026-07-31 23:34:37~38).
- health 결과: accounting-service `healthy`, slip-service `healthy`.
- 판정: 배포본은 이번 브랜치의 새 bootJar를 포함한 새 이미지이며 두 대상 서비스 모두 healthy. (host 8086 충돌로 slip은 host publish 없이 compose override로 기동)

## ① 실제 화면 확인

- 렌더러 명령: `cd clients/desktop; VITE_APP_VERSION="2026/07/31-1" npx vite --config vite.renderer.dev.config.ts --port 5181 --strictPort`
- 결과: Vite `v5.4.21`, `ready`, 실제 `http://127.0.0.1:5181/` listening 확인. in-app browser 연결은 이 환경에서 `No browser is available`로 불가하여, 로컬 Playwright Chromium으로 실제 렌더링을 수행할 예정.
- 실제 화면 명령: `playwright ... 897-column-hierarchy-real-qa.spec.ts --grep '일일 마감'` (mock OFF, `REAL_QA_RENDERER_BASE_URL=http://127.0.0.1:5181`, `dev_master` 로그인).
- 실제 화면 결과: 1 passed. 화면의 일일 마감 표 headers는 `마감일/구분/마감범위/건수/금액 합계/마감상태/작업`, 상세 패널 `#daily-closing-detail`까지 실제 렌더링됨. 실행 시 선택 날짜에 상세 전표가 없어 단가 구분 판정은 보류.
- 캡처: 기존 스펙 출력 `docs/qa/897-column-hierarchy/daily-live-1600.png` 생성 여부 확인 후, 유효 데이터 날짜 화면 캡처를 본 디렉터리에 추가할 예정.
- 유효 데이터 실제 화면 명령: 로컬 Playwright Chromium에서 `dev_master`로 로그인 후 `/#/accounting/daily-closing`, 대상일 `2026-07-27`, 실 API 호출, 상세 DOM 캡처.
- 결과: HTTP 로그인 200. 화면에 실제 전표 `2026/07/27-1`, 공급가 `272,727`, 합계 `299,999`가 표시되었고, 상세 행에 `기준 납품가 —`와 `전표 단가 100,000`이 별도 열로 표시됨. 실제 전표 단가가 가중평균으로 합쳐진 값이 아니라 100,000원으로 렌더링됨.
- 판정: ① PASS (실제 화면·실 API·실 데이터). 기준 납품가가 없는 원천 데이터라 두 값은 `—`와 `100,000`으로 구별되어 보임.
- 캡처 파일: `01-daily-closing-detail-live.png`

## ② 배포 전·후 기존 금액 불변 실측

- 요구 명령/결과: 동일 집계의 배포 전 측정값을 이 세션 시작 시 저장하지 못했으므로, 배포 전·후 변화액 합계 0원 비교를 수행하지 못함.
- 판정: NOT VERIFIED. 현재 데이터의 단일 시점 재조회만으로는 전후 불변을 주장하지 않음.

## ③ throwaway 견적 발행 및 원천 금액 대조

- 요구 명령/결과: 실 견적·실 전표 보호를 위해 throwaway 발행을 시작하지 않음. 따라서 HALF_UP 공급가·부가세 원천 대조를 수행하지 못함.
- 판정: NOT VERIFIED.
- 정리 후 행 수 대조: throwaway를 만들지 않았으므로 삭제/정리할 행이 없음. 참고로 실측 시점 `slips` 행 수는 2,341건이며, 이 QA에서 생성한 행은 0건.

## 확인하지 못한 것

- ② 배포 전·후 동일 집계의 변화액 합계 0원
- ③ throwaway 견적 발행의 공급가·부가세 원천 일치 및 발행 전후 행 수 대조
- ①의 기준 납품가가 실제 숫자로 존재하는 케이스(이번 유효 실 데이터는 기준 납품가가 `—`였으나 전표 단가 `100,000`은 실제 화면에서 확인)

## 최종 판정

- ① PASS
- ② NOT VERIFIED
- ③ NOT VERIFIED
- 코드 수정/git 쓰기: 수행하지 않음

## 종료 정리

- Vite 5181 프로세스: 이 QA에서 기동한 렌더러만 종료.
- QA 생성 전표: 0건. 삭제 작업: 없음.
