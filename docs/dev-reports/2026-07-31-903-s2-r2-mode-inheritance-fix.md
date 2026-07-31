# PR #1007 / Issue #903 S2 fix 라운드 2 — mode 생략 수정 계승

- 작업일: 2026-07-31
- 대상 브랜치: `feat/903-template-authoring-s2`
- 기준 HEAD: `7d8fba449`
- 범위: 그룹웨어 결재 문서 양식의 저장/update 계약
- 제한 준수: git 쓰기, Docker 이미지 재빌드, 백엔드 서비스 재기동, 공유 DB write를 수행하지 않았다.

## 1. RED 원문

직전 BLOCK 판정의 재현 조건을 단위 테스트로 먼저 추가했다.

추가 테스트:

`DocumentTemplateTest.excelDraftUpdate_withoutMode_inheritsExistingModeAndSucceeds`

실행 명령:

```powershell
.\gradlew :services:groupware-service:test --tests com.samhanair.logis.groupware.domain.DocumentTemplateTest.excelDraftUpdate_withoutMode_inheritsExistingModeAndSucceeds --rerun-tasks --no-daemon
```

종료코드: **1**

핵심 실패 원문:

```text
DocumentTemplateTest > excelDraftUpdate_withoutMode_inheritsExistingModeAndSucceeds() FAILED
    com.samhanair.logis.common.exception.BusinessException at DocumentTemplateTest.java:58
1 test completed, 1 failed

FAILURE: Build failed with an exception.
BUILD FAILED
```

실패 원인은 `DocumentTemplate.updateDocument`가 `document.mode() == null`인 요청을 기존 mode로 계승하기 전에 `normalizedMode()`를 비교했기 때문이다. EXCEL 기존 양식에서 누락값은 WORD로 비교되어 422가 발생했다.

## 2. 변경 요지

`DocumentTemplate.updateDocument`에서 실제 mode 필드가 생략된 경우 기존 mode를 먼저 계승하도록 순서를 바꿨다.

- mode 생략: 기존 mode가 있으면 그대로 계승하고 정상 저장
- 명시된 다른 mode: 계승하지 않고 정규화 결과를 기존 mode와 비교하여 422
- legacy 양식의 mode 생략: mode 필드를 새로 JSONB에 추가하지 않고 기존 legacy payload 경계를 유지
- `DocumentPayloadValidator`의 #998 정규화 규칙은 변경하지 않음

추가 회귀 테스트:

- EXCEL 양식의 mode 생략 수정 성공 및 mode 보존
- 명시적 `null`, 빈 문자열, 대소문자 변형, 공백 포함 값의 WORD 정규화

## 3. 입력별 처리 표

| 입력 | “미지정” 여부 | validator 결과 | 기존 EXCEL 양식 update | 기존 WORD/legacy 양식 update |
|---|---|---|---|---|
| mode 키 없음 | 미지정 | `mode=null`인 typed payload, JSON 키 없음 | 기존 `EXCEL` 계승 후 **성공** | WORD 유지 후 **성공** |
| `mode: null` | 명시값 | `WORD` | mode 변경으로 **422** | WORD 유지 후 **성공** |
| `mode: ""` | 명시값 | `WORD` | **422** | **성공** |
| `mode: "word"`, `"Word"`, `"excel"` | 명시값 | `WORD` | **422** | **성공** |
| mode 값 앞뒤 공백 포함 | 명시값 | `WORD` | **422** | **성공** |
| `mode: "WORD"` | 명시값·유효값 | `WORD` | **422** | **성공** |
| `mode: "EXCEL"` | 명시값·유효값 | `EXCEL` | **성공** | 실제 mode 변경이므로 **422** |
| 그 밖의 값(`PDF`, 숫자 등) | 명시값·미지값 | `WORD` | **422** | **성공** |

핵심 구분은 JSON 키 자체가 없는 요청과 키가 있지만 값이 `null`인 요청이다. 전자는 구형/범용 클라이언트의 mode 미지정으로 보고 계승하며, 후자는 #998의 “정확한 두 값 외에는 WORD”에 따라 명시적 WORD로 정규화한다.

## 4. 실 데이터 실측 — 이번 fix가 막는 건수

공유 DB에 대해 아래 읽기 전용 집계를 실행했다. INSERT/UPDATE/DELETE/TRUNCATE는 수행하지 않았다.

```powershell
docker exec samhan-postgres psql -U samhan -d groupware_db -P pager=off -c "SELECT ... FROM document_templates UNION ALL SELECT ... FROM document_template_revisions; SELECT ...;"
```

종료코드: **0**

실측 결과:

| 대상 | 전체 | mode 누락 | mode 존재 | WORD | EXCEL | 미지값 |
|---|---:|---:|---:|---:|---:|---:|
| `document_templates` | 330 | 330 | 0 | 0 | 0 | 0 |
| `document_template_revisions` | 369 | 369 | 0 | 0 | 0 | 0 |

추가 집계는 visible 양식 1건, visible ACTIVE 양식 1건, soft-deleted ACTIVE 양식 4건이었다.

따라서 현재 실데이터에서 이번 결함이 막는 기존 EXCEL 양식의 정상 mode 생략 수정은 **0건**이다. 현재 EXCEL 양식 자체가 0건이므로 실제 차단 행은 없지만, 향후 EXCEL 양식이 생성된 뒤 mode를 생략하는 클라이언트 수정 요청은 fix 전 100% 422가 될 경로였고 이제 계승 성공한다. 반대로 현재 WORD/legacy 330건에 대한 `EXCEL` 명시 요청은 의도된 mode 변경이므로 330건 모두 422 대상이며, 이번 fix로 허용하지 않았다.

## 5. 검증 결과

| 검증 | 명령 | 종료코드 | 결과 |
|---|---|---:|---|
| RED 재현 | `.\gradlew :services:groupware-service:test --tests ...excelDraftUpdate_withoutMode_inheritsExistingModeAndSucceeds --rerun-tasks --no-daemon` | 1 | 예상한 BusinessException으로 실패 |
| fix 대상 단위 테스트 | `.\gradlew :services:groupware-service:test --tests com.samhanair.logis.groupware.domain.DocumentTemplateTest --rerun-tasks --no-daemon` | 0 | BUILD SUCCESSFUL |
| 백엔드 모듈 전체 | `.\gradlew :services:groupware-service:test --rerun-tasks --no-daemon` | 0 | 241 tests, failures 0, errors 0, skipped 0 |
| 데스크톱 전체 | `cd clients/desktop; npm run test` | 0 | 186 files, 1,693 tests passed |
| 데스크톱 typecheck | `cd clients/desktop; npm run typecheck` | 0 | TypeScript 및 real-QA scope 검사 성공 |
| diff 공백 검사 | `git diff --check` | 0 | 출력 없음 |

Gradle 검증은 모두 `--rerun-tasks --no-daemon`으로 실행했으며 `UP-TO-DATE`/`FROM-CACHE` 결과를 통과로 세지 않았다.

## 6. 신규 파일 목록

- `docs/dev-reports/2026-07-31-903-s2-r2-mode-inheritance-fix.md`

## 7. 이번에 안 본 것

- UI 선택 화면과 Excel 편집기(S3)
- Excel 의존성 및 Excel renderer 분기(S3~S5)
- Excel ACTIVE 출력 열기(S5)
- 기존 양식의 브라우저 실제 편집/인쇄 픽셀 비교
- 공유 DB에 쓰는 실제 PUT 호출
- 대상 HEAD로 재빌드·재기동한 백엔드의 live HTTP update 결과
- Docker 이미지 재빌드, 백엔드 서비스 재기동
- #845 에픽 이관, 88mm 정책, #998 공통 계약 재설계

## 8. 작업 트리 확인

실행 명령:

```powershell
git status --porcelain
```

원문:

```text
 M services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentTemplate.java
 M services/groupware-service/src/test/java/com/samhanair/logis/groupware/domain/DocumentTemplateTest.java
 M services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/DocumentPayloadValidatorTest.java
?? docs/dev-reports/2026-07-31-903-s2-r2-mode-inheritance-fix.md
```

종료코드: **0**
