# Issue #903 / PR #1007 — S2 저작 방식 저장·revision 보존 구현 보고서

- 작성일: 2026-07-31
- 작업 브랜치: `feat/903-template-authoring-s2`
- 담당 슬라이스: S2 mode 저장·조회·update·revision round-trip
- 파일럿 범위: 그룹웨어 결재 문서 양식 한 종류
- 작업 규칙: git 쓰기, Docker 이미지 재빌드·서비스 재기동, 공유 DB write를 수행하지 않음

## 1. RED-first 검증 원문

구현 전에 새 불변식을 먼저 테스트로 고정했다. 아래 실패는 구현 누락을 확인한 원문이다.

### 1.1 백엔드 mode normalize·보존 RED

실행 명령:

```text
.\gradlew :services:groupware-service:test --tests 'com.samhanair.logis.groupware.service.DocumentPayloadValidatorTest' --rerun-tasks
```

구현 전 실패 원문:

```text
DocumentPayloadValidatorTest.java:68: error: cannot find symbol
validator.validate(...).mode()
symbol:   method mode()
location: class DocumentPayload
DocumentPayloadValidatorTest.java:72: error: cannot find symbol
validator.validate(...).mode()
symbol:   method mode()
location: class DocumentPayload
DocumentPayloadValidatorTest.java:74: error: cannot find symbol
validator.validate(...).mode()
symbol:   method mode()
location: class DocumentPayload

3 errors
BUILD FAILED
```

### 1.2 데스크톱 parser/revision upcast RED

의존성 설치 후 parser의 신규 mode 호출자를 잠시 제거한 동일한 제품 코드 상태에서 실행했다.

실행 명령:

```text
npm run test -- --run src/renderer/print/templateSchema.test.ts
```

구현 전 실패 원문:

```text
templateSchema.test.ts (23 tests | 2 failed)
× ... EXCEL ... expected undefined to be 'EXCEL'
× ... v1 ... expected undefined to be 'EXCEL'

Test Files 1 failed (1)
Tests 2 failed | 21 passed (23)
```

초기 `npm run test`는 제품 기능 RED에 도달하기 전에 `electron-updater`, design-system declaration, Electron `out/main/index.js`가 없는 환경 오류로 중단됐다. 의존성을 설치하고 targeted Vitest로 다시 실행해 위의 실제 mode 보존 RED를 확인했다.

## 2. 구현 요지

### 2.1 저장 위치와 legacy JSON 보존

- mode의 단일 권위는 기존 `document_templates.document` 및 `document_template_revisions.document` JSONB 내부다. 새 컬럼과 Flyway migration은 추가하지 않았다.
- 백엔드 `DocumentPayload`에 선택적 `mode`를 추가하고, `@JsonInclude(NON_NULL)`로 legacy 입력의 mode 누락을 JSON에 소급 추가하지 않는다.
- `DocumentPayloadValidator`는 명시된 값만 정규화한다. 정확히 `EXCEL`이면 `EXCEL`, 그 밖의 명시 값은 `WORD`로 저장한다. mode가 아예 없던 legacy JSON은 mode 필드를 추가하지 않고 읽을 때 `normalizedMode()`가 `WORD`를 반환한다.
- 데스크톱 `parseEnvelope()`와 `useTemplateDraft.toDraft()`가 `normalizeTemplateAuthoringMode()`를 실제 호출한다. legacy mode 누락은 런타임에서 `WORD`로 읽되, JavaScript 객체의 mode 속성을 non-enumerable로 두어 기존 `JSON.stringify` 결과에는 mode가 나타나지 않게 했다. 명시된 `EXCEL`과 미지 값에서 정규화된 `WORD`는 저장 JSON에 남는다.

따라서 mode가 없던 v1/v2 양식의 저장 JSON은 소급 변경되지 않으며, 기존 밴드 데이터와 렌더 경로도 그대로 유지된다.

### 2.2 create · update · get · revision 보존

- create/update 입력은 백엔드 validator를 거쳐 mode를 JSONB에 저장한다.
- response와 get은 같은 JSONB를 반환하므로 `EXCEL`이 손실되지 않는다.
- revision은 기존 구현처럼 document JSONB를 통째로 pin하므로, revision 조회도 생성 당시 mode를 반환한다.
- `DocumentTemplate.updateDocument()`는 기존 document와 incoming document의 정규화 mode를 비교한다. 서로 다르면 HTTP 422 BusinessException으로 거절한다.
- 기존 클라이언트가 명시 mode를 생략하고 update해도 현재 저장된 명시 mode를 이어 붙여 accidental downgrade를 막는다. legacy `WORD` 문서는 기존처럼 mode 필드 없이 유지된다.

### 2.3 renderer·UI 범위

이번 변경에는 mode 선택 UI, Excel grid, XLSX import/export, renderer mode 분기를 추가하지 않았다. `DocumentRenderer.tsx`와 `PrintLayout.tsx`는 수정하지 않았고, 기존 WORD 밴드 출력만 계속 사용한다. EXCEL ACTIVE 출력은 다음 슬라이스 범위 밖이다.

## 3. 확정 결정 기록

| 결정 | 코드에 반영한 방식 |
|---|---|
| mode 저장 단일 권위 | 별도 컬럼 없이 `document` JSONB 내부에 저장. revision도 같은 document JSONB를 통째로 pin. |
| 생성 후 mode 불변 | update 시 normalized mode가 다르면 422. 다른 방식이 필요하면 새 DRAFT 복제 정책을 사용하며, 이번 슬라이스에는 복제 UI/API를 만들지 않음. |
| legacy v1/v2 기본값 | mode 누락은 읽을 때 `WORD`. 누락 필드는 원본 JSON에 소급 추가하지 않음. |
| 미지 값 fail-safe | #998 계약과 동일하게 정확히 `WORD` 또는 `EXCEL`이 아닌 명시 값은 `WORD`. 백엔드 저장 시에도 `WORD`로 정규화. |
| 출력 회귀 경계 | mode를 기존 renderer에 전달하거나 renderer 분기를 추가하지 않음. 기존 양식 출력은 기존 경로를 그대로 통과. |

## 4. 실 데이터 실측

공유 PostgreSQL은 read-only `psql -c` 조회만 수행했다. 기존 `document`를 정규화한 기대 JSON과 현재 JSON을 비교했으며, 결과는 다음과 같다.

| 대상 | 전체 행 | mode 누락 | mode 존재 | WORD | EXCEL | 미지 값 | 정규화 시 JSON 변경 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `document_templates` | 330 | 330 | 0 | 0 | 0 | 0 | 0 |
| `document_template_revisions` | 369 | 369 | 0 | 0 | 0 | 0 | 0 |

`document_templates` 330건에는 soft-deleted 행이 포함되고, visible non-deleted는 1건, ACTIVE는 1건이었다. revision 369건은 모두 mode 누락 legacy JSON이었다. 따라서 이번 변경이 기존 저장 JSON을 소급 변경해야 하는 실데이터 행은 0건이다.

출력 변화 건수도 0건으로 판정했다. 이유는 실데이터의 모든 mode가 누락 legacy이고, 누락 mode는 저장 JSON에 추가되지 않으며, 이번 diff에 renderer 파일 변경이나 mode 분기가 없기 때문이다. 전체 양식을 브라우저로 하나씩 재출력하는 작업은 수행하지 않았고, 이 판정은 JSON diff 0건, renderer 무변경, 기존 renderer 테스트 및 전체 데스크톱 테스트를 근거로 한 코드 경로 측정이다. 공유 DB에는 어떤 보정 write도 하지 않았다.

## 5. 검증 결과

모든 Gradle 검증은 `--rerun-tasks`로 실행하여 `UP-TO-DATE`/`FROM-CACHE`를 성공 근거로 사용하지 않았다.

- 백엔드 validator·aggregate 단위 테스트: 성공.
- 신규 HTTP 통합 테스트: `EXCEL` create → get → update → revision 보존 및 `WORD` 전환 422 검증 성공.
- groupware-service 전체 테스트: `32` test files, `239` tests, failures `0`, errors `0`, skipped `0`.
- 데스크톱 targeted parser 테스트: `1` file, `23` tests passed.
- 데스크톱 전체 Vitest: `186` files, `1693` tests passed.
- 데스크톱 `npm run typecheck`: exit code `0`.
- design-system build 및 데스크톱 build: 성공.
- `git diff --check`: 오류 없음.

`npm run typecheck` 출력에 있던 real-QA 50/50 결과와 LF/CRLF 및 기존 untracked QA 파일 경고는 타입 오류가 아닌 기존 작업환경 출력이다.

## 6. 신규 파일과 변경 파일

### 신규 파일

- `docs/dev-reports/2026-07-31-903-s2-mode-persistence.md` — 본 보고서

새 fixture, migration, UI 파일, Excel 의존성 파일은 만들지 않았다.

### 기존 파일 변경

- `clients/desktop/src/renderer/print/templateSchema.ts`
- `clients/desktop/src/renderer/print/templateSchema.test.ts`
- `clients/desktop/src/renderer/components/documentTemplate/useTemplateDraft.ts`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentPayload.java`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentTemplate.java`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/DocumentPayloadValidator.java`
- `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/DocumentTemplateIT.java`
- `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/DocumentPayloadValidatorTest.java`

## 7. 이번에 안 본 것

- S3의 mode 선택 UI 및 새 DRAFT 복제 UX
- Electron 셀 그리드 라이브러리 선정·도입
- `.xlsx` import/export
- EXCEL DRAFT 편집·preview 및 EXCEL ACTIVE 출력
- S4/S5 renderer dispatch, headless print, 재인쇄 전용 검증
- 그룹웨어 결재 문서 외 다른 문서유형으로의 파일럿 확장
- #845 문서 양식 디자이너 에픽 이관 또는 R3/R4 중복 구현
- 88mm 인쇄 정책 변경
- 공유 DB write, Docker 재빌드, 서비스 재기동
- 운영 데이터 330건을 실제 브라우저에서 전부 렌더링하는 시각 회귀

## 8. 작업 트리 원문

사용자 지시에 따라 git add/commit/push/checkout/stash는 수행하지 않았다. 최종 `git status --porcelain` 원문은 다음과 같다.

```text
 M clients/desktop/src/renderer/components/documentTemplate/useTemplateDraft.ts
 M clients/desktop/src/renderer/print/templateSchema.test.ts
 M clients/desktop/src/renderer/print/templateSchema.ts
 M services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentPayload.java
 M services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentTemplate.java
 M services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/DocumentPayloadValidator.java
 M services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/DocumentTemplateIT.java
 M services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/DocumentPayloadValidatorTest.java
?? docs/dev-reports/2026-07-31-903-s2-mode-persistence.md
```
