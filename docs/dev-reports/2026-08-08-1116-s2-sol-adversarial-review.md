# #1116 S2 SOL 1차 적대검증 — 과차단 도달로 중단

- 대상 PR: #1138
- 대상 HEAD: `2a25e9f902fe372b18e089c6524e11aa6ba4e77b`
- 판정: **BLOCKING 1건**
- 중단 사유: 검증 전제와 다른 기존 정상 사용처가 실제로 차단됨. 사용자 지시("전제가 틀리면 고치지 말고 중단·보고")에 따라 나머지 각도는 실행하지 않았다.
- Docker: 조회·재기동·변경 없음
- 커밋된 QA/매뉴얼 증거: 덮어쓰기 없음

## 결함 1 — `docs` 축이 기존 매뉴얼 증거 승격 경로를 차단한다

### 도달성

기존 도구 `tools/manual-capture/sync-screenshots.js`는 다음 계약을 코드로 갖고 있다.

- 22행: 공용 `resolveQaShotsDir`를 import
- 29~31행: 기본 출력은 `docs/manual/screenshots/_local`, 실제 매뉴얼 갱신 시 `QA_SHOTS_DIR`로 `docs/manual/screenshots`를 명시적으로 opt-in
- 248~251행: `QA_SHOTS_DIR`가 있으면 커밋 대상 승격 완료를 출력하고, 없으면 `QA_SHOTS_DIR=docs/manual/screenshots`로 재실행하라고 안내

이 경로는 변경 전 보호축 `docs/qa` 밖이어서 통과했지만, 현재 보호축 `docs` 안이므로 `QA_ALLOW_OVERWRITE=1`을 추가하지 않으면 차단된다. 기존 도구가 안내하는 정확한 호출 경로를 현재 HEAD에서 실행했다.

```text
QA_SHOTS_DIR=<repo>/docs/manual/screenshots
node tools/manual-capture/sync-screenshots.js

EXIT=1
Error: [QA 출력 경로 가드] 커밋된 QA 증거 경로로 overwrite 시도를 차단했습니다:
<repo>\docs\manual\screenshots.
명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.
    at resolveQaShotsDir (...\scripts\lib\qa-shots-dir.cjs:146:11)
    at Object.<anonymous> (...\tools\manual-capture\sync-screenshots.js:31:25)
```

가드는 모듈 초기화 중 throw 했으므로 복사·placeholder 생성 전에 종료됐다. 실행 전후 `git status --short -- docs/manual docs/qa docs/qa-shots`는 모두 빈 출력이었다.

### 영향받는 기존 비-QA `docs/` 사용처 수

공용 resolver에 `docs/manual/screenshots` 계열을 committedDir로 넘기는 기존 실행 도구는 **3개**다.

1. `tools/manual-capture/sync-screenshots.js` → `docs/manual/screenshots`
2. `tools/manual-capture/capture-manual-all.js` → `docs/manual/screenshots`
3. `tools/manual-capture/generate-mobile-placeholders.js` → `docs/manual/screenshots/04-모바일`

세 도구 모두 기본 실행은 각 committedDir 아래 `_local`을 사용하므로 기본 경로는 계속 도달 가능하다. 차단되는 것은 기존 커밋 매뉴얼 증거로의 명시적 승격 경로다. 그중 1번은 파일 자체가 정확한 `QA_SHOTS_DIR=docs/manual/screenshots` 재실행법을 안내하므로 추정 호출이 아니라 저장소에 선언된 운영 계약이다.

### PM의 “실제 설정 지점 0” 재현 결과 — 셋째 가능성

- 테스트·문서 문자열을 제외하고 프로덕션 코드가 `process.env.QA_SHOTS_DIR = ...` 또는 `$env:QA_SHOTS_DIR = ...`처럼 환경변수를 **직접 대입하는 지점**: 0
- 기존 도구가 환경변수를 **소비하며 명시적으로 안내하는 실제 승격 호출**: 1
- 그 승격 값의 영향을 받는 비-QA `docs/manual` resolver 소비자: 3

따라서 “직접 대입 0”이라는 좁은 grep 결과는 재현되지만, 이를 “실제로 막히는 기존 사용처 0”으로 확장한 증거는 무결하지 않다. 이 PR은 기존 매뉴얼 갱신 계약을 도달 불가능하게 만든다.

## 실행 및 프로세스 회수

- `node tools/manual-capture/sync-screenshots.js`는 resolver throw로 exit 1 완료
- 브라우저·Docker·백그라운드 프로세스 시작 전 종료
- 이 라운드가 시작한 잔류 프로세스 없음
- 신규 파일: 본 보고서 1개
- 제품 코드·테스트 코드 수정 없음, 커밋·push 없음

## 이 라운드가 보지 않은 것

전제 불일치 시 중단하라는 지시에 따라 다음은 판정하지 않았다.

- 6종 구현의 전체 동일 입력 집합 대조
- UNC·junction·subst 계약의 현재 HEAD 재실행
- `docs/qa-evidence` 신규 루트 차단 대조
- 옛 축 복원 뮤테이션의 반열거 울타리 RED 확인
- H-2 가드 전수, design-system, Desktop mock 격리 스위트
- 기본 경로와 `QA_ALLOW_OVERWRITE=1`의 6종 전체 실행 대조

