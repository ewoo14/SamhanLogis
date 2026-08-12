# 2026-08-13 #910 Flyway 불변 가드 fix — LUNA

## 변경 원문

확인 명령:

```text
git diff origin/main -- services/dashboard-service/src/main/resources/db/migration/V7__app_release_client_identity.sql
```

수정 전 원문 diff:

```diff
@@ -18,6 +18,7 @@ ALTER TABLE app_release
             'SAMHAN_ESTIMATE_WEB',
             'SAMHAN_MOBILE_PUBLIC_WEB',
             'AROLOGIS_DESKTOP',
+            'INTERNAL_CHAT_DESKTOP',
             'WEB',
             'MOBILE'
```

V7은 위 한 줄을 제거해 `origin/main`과 복원했다. Git blob 확인 결과:

```text
current=4495256ba457b115de84c4fe426be08e55a486b9
origin=4495256ba457b115de84c4fe426be08e55a486b9
git diff --exit-code ...V7... => 0
```

## 이관 위치와 번호 근거

V7에서 잃지 않은 `INTERNAL_CHAT_DESKTOP` 허용 계약을
`services/dashboard-service/src/main/resources/db/migration/V8__add_internal_chat_desktop_client_type.sql`로 이관했다.
V8은 기존 제약을 `DROP CONSTRAINT IF EXISTS`로 제거하고, 같은 전체 허용 집합에
`INTERNAL_CHAT_DESKTOP`을 포함한 제약을 조건부로 추가한다.

번호를 세 곳에서 확인했다.

- 이 브랜치: dashboard migration V1–V7, V8 신규 추가.
- `origin/main`: dashboard migration V1–V7.
- 머지되지 않은 열린 PR #1196, #1195, #1189, #1188, #1187, #1181, #1180, #1162: 전체 파일 목록을 확인했으며 dashboard migration 추가/변경 없음.

따라서 dashboard-service의 충돌 없는 다음 번호는 V8이다.

## 기존 DB / fresh DB 동등성

- 기존 DB: V7의 기존 `ck_app_release_client_type`을 제거하고 V8의 전체 집합으로 재생성한다.
- fresh DB: V1–V7 적용 후 같은 V8을 적용하므로 동일한 최종 제약을 얻는다.
- V8의 `DROP CONSTRAINT IF EXISTS`와 조건부 `pg_constraint` 조회는 재실행 시 중복 생성도 피한다.
- 최종 허용 집합에는 기존 10개 값과 `INTERNAL_CHAT_DESKTOP`이 모두 포함된다.

## 검증 원문

`pwsh`는 이 머신에 설치되어 있지 않아 요청된 명령은 다음 오류로 직접 실행하지 못했다.

```text
pwsh : The term 'pwsh' is not recognized as the name of a cmdlet...
```

동일 스크립트를 Windows PowerShell로 실행한 결과:

```text
FAIL: 적용된 Flyway 마이그레이션은 수정·삭제·이름변경할 수 없습니다.
변경된 파일:
  M services/dashboard-service/src/main/resources/db/migration/V7__app_release_client_identity.sql
```

이는 현재 작업 트리에 V7이 origin/main과 동일해도, 아직 PM 커밋 전이라 가드가
`origin/main...HEAD`의 기존 브랜치 커밋을 비교하기 때문이다. `check-applied-migrations.test.ps1`도
동일한 `current main state: expected exit 0, got 1`로 종료했다. PM이 V7 복원과 V8 추가를 커밋한 뒤 두 가드를 재실행해야 최종 CI 게이트를 확인할 수 있다.

dashboard-service 전량:

```text
./gradlew.bat :services:dashboard-service:test --no-daemon
BUILD SUCCESSFUL in 1m 10s
```

Vitest 전체 재현:

```text
264 passed
2281 passed | 2 skipped
```

Vitest worker unexpected exit은 재현되지 않았다. 따라서 해당 결함은 수정하지 않았다.
실행 중 컨테이너 수는 47개였으나 이번 실행은 정상 종료되어 자원 경합으로 판단할 근거가 없다.

## 라운드 종료 점검

- `tools/.s24-build-only/build/deep/tracked-writer.mjs`: 테스트 부산물로 삭제되었으나 HEAD 원문으로 복원했다.
- `docs/qa` 아래 새 드라이버 스크립트: 추가하지 않았다.
- 공유 Docker 스택: 중지하지 않았다.
