# PR #1262 fix 라운드 1 결과 보고

- 대상 브랜치: `chore/mask-sheet-identifier`
- 범위: 적대검증에서 지적된 증거 무결성 2건만 수정
- 커밋·푸시: 수행하지 않음

## ① 마스킹 누락 전수 결과

- 저장소 재검색 결과: **9파일·9건** 잔존
- 보류 분류: **9파일·9건**
  - 실행 코드: 1파일·1건
  - Spring 기본값: 3파일·3건
  - legacy GAS 원문: 5파일·5건
- 누락 분류: **0파일·0건**
- 이번 라운드에서 문서 1파일의 누락 1건과 QA 로그 1파일의 누락 17건을 마스킹했다.
- 문서·보고서·메모리·QA 산출물·테스트 fixture 영역의 잔존 누락은 0건이다.
- 식별자 값 자체는 이 보고서에 기록하지 않는다.

## ② fixture 모순 해소 근거

- 정본은 불변식에 따라 **legacy GAS 원문**으로 확정했다.
- fixture는 원문을 마스킹된 placeholder로 단정하지 않고, 실제 상수 선언이 placeholder가 아닌 형태로 보존되는지 정규식으로 검증하도록 수정했다.
- 원문의 시트 탭 계약 3개는 그대로 확인한다.
- 실행 코드·Spring 기본값·legacy GAS 원문은 수정하지 않았다.
- 별도 source contract check: **PASS**, 종료코드 0.

## ③ 보류 항목이 diff에 없다는 근거

- `git diff --name-only` 보호 경로 검사: **0파일**
- 보호 대상: 실행 코드, Spring 기본값, legacy GAS 원문
- `git diff --check`: 종료코드 **0**
- 변경 파일은 다음 3개다.
  - `clients/desktop/playwright/full-menu-contract/full-menu-contract.spec.ts`
  - `docs/qa/1241-luna-ci-fix-report.md`
  - `docs/qa/bundle-set-expansion-pr1/boot.log`

## ④ credential guard 재현

- 요청 명령 `bash scripts/check-credential-plaintext.sh`: WSL bash 경로에서 출력 없이 장시간 정지하여 회수함.
- 동일 스크립트 Git Bash 재실행: **PASS**, 종료코드 **0**
- 결과: `[PASS] 자격 평문 비공개 — 위반 없음`
- 정지 실행의 잔여 credential guard 프로세스: **0개**

## ⑤ Jest 전량 결과

- 명령: `clients/web/estimate-app`에서 `npm test -- --runInBand`
- 결과: **21 suites passed, 360 tests passed, 0 snapshots**
- 종료코드: **0**

## ⑥ 변경 파일

- 계약 fixture: legacy GAS 원문과 모순되던 masked expectation 제거
- QA 보고서: 누락 식별자 마스킹
- QA 로그: 누락 발생부 17건 마스킹
- 실행 코드·Spring 기본값·legacy GAS 원문 변경: **0파일**

## ⑦ 프로세스 회수

- 이번 라운드에서 기동한 Jest·credential guard·Playwright 검증 프로세스: 종료 또는 회수
- 최종 credential guard 잔여: **0개**
- 공유 컨테이너: 변경하지 않음
- 다른 워크트리: 접근·변경하지 않음
