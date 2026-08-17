# PR #1264 CI 실패 해소 및 라이브 QA 보고

## ① 실패 4건 원인 판정

| 검사 | 판정 | 근거 |
|---|---|---|
| Frontend Desktop | PR 변경과 무관한 기존 테스트의 재현성 있는 실패 | 실패 테스트는 `CodefImportScopeForm.test.tsx` 1건이다. PR의 데스크톱 변경은 일마감 화면이며 해당 테스트 파일은 diff에 없다. 동일 커밋 job 재실행도 같은 테스트에서 실패했으므로 flaky로 판정하지 않는다. |
| 빌드 + 테스트 (slip-units) | PR 변경이 만든 회귀 | `SlipQueryServiceTest` 2건에서 `DailyClosingQueryService`가 상품 벌크 조회 결과의 null 모델명을 `Map.of().get(null)`로 조회해 NPE. CI 로그와 로컬 재현이 동일했다. |
| JUnit 테스트 결과 (slip-units) | ②의 파생 실패 | 동일 `slip-units` 결과를 보고하는 Docs Guard JUnit 집계이며 독립 원인이 아니다. |
| GitGuardian | PR에서 자격 리터럴 추가 없음 | `git diff main...HEAD`의 추가 라인을 검사했고 시트 식별자·키·토큰·비밀번호 리터럴 추가는 없었다. 추가된 QA 코드는 자격 저장소 조회 함수만 호출하며 값은 기록하지 않는다. 기존 main의 시트 식별자 55파일 및 별도 PR #1262 마스킹 범위는 이 PR의 추가 원인이 아니다. |

## ② 고친 내용

`DailyClosingQueryService`에서 상품 클라이언트의 null 응답을 빈 결과로 처리하고, 상품 모델명이 null인 기존 라인 fixture는 상품 map을 조회하지 않도록 했다. 새 벌크 조회 동작은 유지하며 기존 호출자·테스트의 null 계약을 보존한다. 커밋·푸시는 수행하지 않았다.

로컬 검증:

```text
./gradlew :services:slip-service:test --tests com.samhanair.logis.slip.service.SlipQueryServiceTest
BUILD SUCCESSFUL
18 actionable tasks ...
```

수정 전 동일 명령은 8건 중 2건 실패했고, 수정 후 8건 모두 통과했다.

## ③ GREEN

현재 워크트리에서 확인한 GREEN은 위 `SlipQueryServiceTest` 8/8이다. 원격 PR 전체 GREEN은 PM이 수정 diff를 커밋한 뒤 CI를 다시 실행해야 확정할 수 있다. 동일 커밋 Frontend Desktop 재실행도 실패했으며, 새 코드 반영 후 별도 수정이 필요하다.

## ④ 격리 스택 구성

slip/product JAR는 각각 `bootJar`로 새로 생성했다. 공유 컨테이너와 공유 DB는 변경하지 않았다. 격리 compose 해석은 필수 환경변수(`MINIO_ROOT_USER`, Grafana 관리자 비밀번호 등)가 이 워크트리에 주입되지 않아 중단했다. 따라서 공유 auth-service를 사용한 유효한 격리 라이브 스택은 기동하지 않았다.

## ⑤ 라이브 캡처 목록과 행 수

이번 라운드의 유효한 라이브 캡처는 없다. 기존 브랜치 산출물의 캡처 2장은 새 격리 스택에서 생성한 증거가 아니므로 이번 결과로 재사용하지 않는다. 따라서 다음 4개 시나리오의 행 수도 미기록이다.

- 2026-08-03 출고(매출) 전표 회계전표 생성
- 2026-08-03 입고(매입) 전표 회계전표 생성
- 이미 생성된 전표의 중복 생성 차단
- 회계반영 뒤 금액 편집 잠김

## ⑥ GitGuardian diff 확인 결과

PR diff의 추가 라인에 자격값·시트 ID·키 값은 없다. `resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')` 참조만 있으며 실제 값과 토큰은 로그·보고서·캡처에 기록하지 않았다.

## ⑦ 프로세스 회수

이 라운드에서 시작한 서버 프로세스는 없다. 제한시간 초과한 전체 slip 테스트가 만든 Testcontainers PostgreSQL/Ryuk 컨테이너를 정확한 이름으로 회수했고, 공유 스택은 그대로 둔다. `bootJar`가 만든 JAR 두 개도 삭제했다.
