# PR #1262 fix 라운드 3 (마지막) — 식별자 마스킹 보고서

## ① 앞선 두 번이 축약형을 놓친 이유

앞선 라운드는 전체 문자열 정확 일치와 장문 토큰 중심으로 세었고, 3차 판정에서 발견된 문서·주석·스크린샷 데이터의 앞·뒤 조각 표기는 별도 표기 형태로 열거·집계하지 않았다. 따라서 실행 코드의 정당한 보류 8건을 확인하는 동안, 같은 식별자의 축약 표기 3파일·6줄을 누락 0건으로 오판했다. 이번에는 검색 전에 표기 축을 모두 열거하고, 실행 코드·문서·주석·생성 데이터까지 같은 기준으로 훑었다.

## ② 사전 열거한 식별자 표기 형태 전체

- 전체 문자열
- 축약 접두 조각
- 축약 접미 조각
- 앞·뒤 조각 결합 표기
- 앞뒤 일부만 남긴 표기
- 대소문자 변형
- 구분자 제거
- 구분자 치환
- URL 경로·쿼리 표기
- URL 퍼센트 인코딩
- JSON/JS 문자열 리터럴
- YAML 및 Spring placeholder/default
- 셸 환경변수 대입
- 이스케이프된 문자열
- 주석 및 Javadoc
- Markdown 문서
- fixture·스냅샷·스크린샷 표시 데이터
- 파일명 자체
- 대상 확장자 `.md`, `.java`, `.ts`, `.js`, `.json`, `.yml`, `.sql` 및 기타 저장소 파일

## ③ 형태별 전수 검색 결과

추적 파일 기준 결과이며, 값 자체는 기록하지 않는다.

| 형태 | 추가 누락 | 기존 허용 보류 |
|---|---:|---:|
| 전체 문자열 | 0 | 8건·8파일 |
| 대소문자 변형 | 0 | 0 |
| 축약 접두·접미·앞뒤 조각 결합 | 0 | 0 |
| 앞·뒤 일부만 남긴 표기 | 0 | 0 |
| 구분자 제거·치환 | 0 | 0 |
| URL 경로·쿼리·퍼센트 인코딩 | 0 | 0 |
| JSON/JS·YAML·Spring·셸 리터럴 | 0 | 0 |
| 이스케이프 변형 | 0 | 0 |
| 주석·Javadoc·Markdown | 0 | 0 |
| fixture·스냅샷·스크린샷 데이터·파일명 | 0 | 0 |

전체 문자열 8건은 실행 상수 6건과 Spring 기본값 2건으로, 이번 라운드의 보호 대상이다. 빌드 산출물 바이너리는 추적 파일이 아니며 수정하지 않았다.

## ④ 보류·누락 분류와 근거

보류는 지시된 세 범주만 적용했다.

- 실행 코드: 6건 — 웹 실행 상수 1건과 legacy GAS 실행 원문 5건이 실제 시트 접근을 참조하므로 보류.
- Spring 기본값: 2건 — 런타임 주입 기본값이며 시트 동기화에 전달되므로 보류.
- legacy GAS 원문: 위 실행 코드 6건 중 5건 — 원문 실행 상수/URL이므로 보류.

누락 6건은 다음과 같았다. 모두 실행 코드·Spring 기본값·legacy GAS 원문이 아니므로 보류하지 않고 마스킹했다.

- `docs/dev-reports/sp-08-8-credential-plaintext-guard.md:137,143,147` — 문서 3줄
- `scripts/check-credential-plaintext.sh:257,272` — 주석 2줄
- `scripts/generate-sp-07-google-sheets-source-screenshots.mjs:53` — 스크린샷 표시 데이터 1줄

## ⑤ 마스킹한 곳

위 3파일·6줄의 식별자 축약 표기를 모두 `[비공개]`로 치환했다. 실행 코드·Spring 기본값·legacy GAS 원문은 손대지 않았다.

## ⑥ 보호 대상 diff

`git diff origin/main...HEAD`를 확인했다. 보호 대상 8개 경로와 이번 변경의 교집합은 0파일이다. 기본값 제거·실행 코드 변경·legacy GAS 원문 변경은 없다. 따라서 시트 동기화 IT 5건을 깨뜨렸던 기본값 제거 패턴을 재현하지 않았다.

## ⑦ credential guard·Jest

- credential guard: PASS, 종료코드 0
- Jest: 21 suites passed, 360 tests passed, 0 snapshots, 종료코드 0
- 두 종료코드는 각 명령 직후 별도로 수집했다.

## ⑧ 변경 파일

- `docs/dev-reports/sp-08-8-credential-plaintext-guard.md`
- `scripts/check-credential-plaintext.sh`
- `scripts/generate-sp-07-google-sheets-source-screenshots.mjs`
- `docs/qa/1262-fix-round3/report.md`

커밋·push·add는 수행하지 않았다.

## ⑨ 프로세스 회수

이번 라운드에서 기동한 guard Git Bash와 Jest/Node 프로세스는 정상 종료했다. 작업 종료 확인 시 이번 라운드 기동 Node 잔여는 0개다. 시스템 전체 Node는 55개였으나 모두 기존 다른 워크트리·공유 프로세스로 판단하여 건드리지 않았다. 공유 컨테이너 24개에는 조회·중지·재시작 명령을 실행하지 않았다.
