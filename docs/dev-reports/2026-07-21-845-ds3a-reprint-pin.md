# #845 DS-3a 결재 문서 재인쇄 — 승인 당시 레이아웃 pin

## 0. 2026-07-21 CODEX LUNA 5.6 R2 fix 정정

> 이 절이 R1 기록보다 우선한다. 아래 R1 검증 수치는 R1 당시 기록이며 R2의 현재 검증 근거로 재사용하지 않는다.

- **미완·불확실**: Playwright 실행 셀의 최종 콘솔 원문은 세션 출력 절단으로 보존하지 못했다. 다만 실행 산출물 `clients/desktop/test-results/.last-run.json`은 `status: "passed"`, `failedTests: []`를 기록했다. 따라서 결과 상태는 PASS로 기록하되 콘솔의 `unexpected=0` 원문 자체는 주장하지 않는다.
- **BLOCKING fix**: `approval_lines.document_template_default_pinned`를 추가했다. 승인 시 ACTIVE가 없으면 `(document_template_id, document_template_revision) = (NULL, NULL)`과 함께 `true`를 저장하고 이후 새 ACTIVE가 생겨도 FE는 `GROUPWARE_DEFAULT`를 렌더한다. 과거 NULL 문서는 기본값 `false`로 남아 소급 각인하지 않는다.
- **M-1 fix**: V12 backfill은 `COALESCE(modified_*)`를 폐기하고 `created_at=CURRENT_TIMESTAMP`, `created_by=V12_BACKFILL_UNVERIFIED`, `is_backfilled=true`, `modified_* = NULL`로 기록한다. revision 생성 시각·작성자를 복원했다는 주장을 하지 않는다.
- **M-2 fix**: raw `EntityManager#persist`를 제거하고 최소 Repository marker에 `saveAndFlush`만 선택 노출했다. Spring Data 예외 변환 후 conflict를 typed `BusinessException(CONFLICT)`로 반환한다.
- **M-3 fix**: pin 조회 실패 배너가 실제 fallback인 `GROUPWARE_DEFAULT`를 명시하도록 수정했다.
- **M-4 fix**: PostgreSQL 순차 직렬화로 3건 모두 성공할 수 있음을 허용하고 비성공 결과만 typed conflict인지 검증한다.
- **LOW/spec**: ACTIVE-0 분기의 mutation RED를 실측했고 `D-DS3A-03` 철회와 `D-DS3A-07` 존재를 문서에 반영했다.

## 1. 실코드 재확인

| 확인 항목 | 실코드 결과 |
|---|---|
| 결재 문서 테이블 | `ApprovalLine`이 `@Table(name = "approval_lines")`로 매핑된다. |
| 기존 `template_id` | `approval_lines.template_id`는 입력 양식 `approval_templates` 참조이며 출력 레이아웃 참조가 아니다. |
| 승인 완료 전이 | `ApprovalLineBase.approve(...)`가 마지막 결재자 승인 때 `APPROVED`로 전이한다. HTTP 실경로는 `PUT /admin/groupware/approvals/{id}/approve` → `ApprovalLineService.approve(...)`다. |
| 기존 출력 조회 | desktop `ApprovalDocView`가 `documentType`으로 현재 ACTIVE 양식을 조회했다. |

기획 문서의 추정 테이블명은 실제 매핑과 일치했으므로 수정할 필요가 없었다.

## 2. 실측과 pin 선택

착수 전 로컬 `samhan-postgres`의 `groupware_db`를 읽기 전용으로 측정했다.

| 항목 | 실측 |
|---|---:|
| `approval_lines` 전체 | 40건 |
| `APPROVED` | 20건 |
| `REJECTED` | 5건 |
| `PENDING`/`IN_PROGRESS` | 15건 |
| 기존 승인 문서의 `document_type` 비NULL | 0건 |
| 기존 승인 문서의 레이아웃 pin | 0건 — 해당 DB는 V9 상태라 `document_templates` 자체가 아직 없음 |
| 기존 `approval_lines` relation size | 122,880 bytes |
| 승인 문서 `content` 평균 UTF-8 bytes | 68 bytes |

따라서 이 로컬 DB에서는 기존 양식 행과 JSONB payload를 실측할 수 없었다. 이를 양식 payload가 0 bytes라고 해석하지 않고, **레이아웃 payload 실측 불가(구 스키마 DB)**로 기록한다. 테스트 canonical 양식의 전체 응답은 553 bytes, `document` JSON만 321 bytes였고, 최소 fixture는 40 bytes였다.

JSONB 전체 스냅샷 대안은 승인 완료 1건마다 payload를 복제한다. 반면 선택한 revision 이력은 양식 revision당 JSONB를 한 번만 저장하고 결재선에는 UUID 16 bytes와 revision INT 4 bytes, 컬럼/인덱스 오버헤드만 저장한다. 실제 승인 20건에 적용할 때도 같은 revision을 공유하면 복제 횟수가 20회에서 revision 수만큼으로 줄어든다. 운영 payload의 실제 평균/최대 크기는 V10 이상 운영 데이터가 있는 DB에서 별도 측정해야 하므로 임의 수치를 넣지 않았다.

최종 선택은 `document_template_revisions` append-only 이력 + `approval_lines.(document_template_id, document_template_revision)` 참조 각인이다. 기존 `document_templates`의 현재 상태는 V12에서 revision 1건씩 이력화하지만, 기존 승인 문서의 pin 컬럼은 NULL로 유지한다. 새 양식 create/update/activate 시 현재 revision 이력이 보장된다. 신규 ACTIVE-0 승인은 별도 `document_template_default_pinned=true` 사실 표식을 남긴다.

## 3. 구현 경계

- V12에서 `document_template_revisions`를 만들고 현재 양식 행을 backfill한다.
- DB trigger가 이력 UPDATE/DELETE를 차단한다(row-level `BEFORE UPDATE OR DELETE` trigger 정의상 TRUNCATE에는 발화하지 않는다 — IT 픽스처 리셋이 TRUNCATE를 쓰므로 이 경계를 정확히 인지하고 있어야 한다. FABLE5 R1). JPA entity도 수정/삭제 메서드를 제공하지 않는다. `DocumentTemplateRevisionRepository`는 Spring Data 최소 `Repository` marker에 `saveAndFlush`만 선택 노출해 delete 계열 메서드를 컴파일 타임에 봉쇄하고 Spring 예외 변환을 보존한다.
- 마지막 승인으로 `APPROVED`가 되는 순간 현재 ACTIVE 양식의 `(templateId, revision)`을 같은 `@Transactional` 경계에서 각인한다. ACTIVE가 없으면 `document_template_default_pinned=true`를 같은 경계에서 각인한다. 이력 저장 또는 각인 실패 시 승인도 함께 rollback된다.
- DRAFT/진행중에는 pin하지 않는다. 현재 도메인에는 반려된 동일 결재선을 재상신하는 별도 전이 메서드가 없으므로, 재상신 경로가 추가될 때 최종 `APPROVED` 전이를 기존 승인 서비스로 통과시키면 새 revision을 다시 각인할 수 있다.
- desktop은 유효한 pin이 있으면 revision endpoint를 조회하고, 기존 pin 없는 `APPROVED` 문서는 현재 ACTIVE fallback을 사용한다. 승인 시점 ACTIVE-0 표식이 있으면 active endpoint를 조회하지 않고 `GROUPWARE_DEFAULT`로 고정한다. 두 경우의 운영자 안내 배너를 구별한다.
- schema v1의 FIELD/TEXT·geometry/style/binding은 추가하지 않았다.
- 기존 `groupware.approval-templates` page-code를 유지하고 auth seed는 추가하지 않았다.
- `PrintLayout`은 변경하지 않았다.

## 4. 검증

### Fresh Postgres probe

PostgreSQL 16 fresh container에서 `DROP/CREATE` 후 Flyway V1~V12를 숫자 순서로 `psql -v ON_ERROR_STOP=1` 적용했다. V12 backfill과 legacy 승인 NULL pin, append-only 차단을 확인했다.

```text
[PROBE APPLY] V1__init_groupware.sql ... V12__pin_document_template_revisions.sql
[PROBE VERIFY] backfill and null historical pin
 revision_backfill_rows = 1
 document_template_id | document_template_revision
                       |              (blank/null)
 columns document_template_id, document_template_revision
[PROBE VERIFY] append-only UPDATE must fail
[PROBE UPDATE EXIT] 1
[PROBE VERIFY] append-only DELETE must fail
[PROBE DELETE EXIT] 1
ERROR: document_template_revisions is append-only
CONTEXT: PL/pgSQL function prevent_document_template_revision_mutation() line 3 at RAISE
ERROR: document_template_revisions is append-only
CONTEXT: PL/pgSQL function prevent_document_template_revision_mutation() line 3 at RAISE
```

UPDATE와 DELETE 각각 trigger의 `document_template_revisions is append-only` 예외로 실패했다. V9의 기존 constraint notice와 V11의 `SET LOCAL can only be used in transaction blocks` notice는 기존 migration notice였고, `ON_ERROR_STOP` 적용 자체는 V12까지 성공했다.

### anti-false-green 층별 mutation

- desktop pin 분기 제거: `ApprovalDocView`가 항상 ACTIVE revision 9를 읽도록 한 뒤 pinned test가 `expected 9 to be 4`로 RED(🚨 FABLE5 R1 LOW 정정 — 최초 기록이 vitest 인용을 역전해 `expected 4 to be 9`로 적었었다. vitest 단언은 `expect(actual).toBe(expected)` 이고 실측 문구는 "expected <actual> to be <expected>" 이므로, 뮤테이션으로 실제 렌더된 값(9)이 actual, 원래 기대값(4)이 expected다).
- backend pin 호출 제거: HTTP 승인 경로에서 `ApprovalLineService`의 두 `pinApprovedLayout` 호출을 제거한 뒤 `GroupwareAdminControllerIT`가 `$.data.documentTemplateId expected <UUID> but was <null>`로 RED.
- 두 mutation 모두 원복 후 정상 코드를 유지했다.
- ACTIVE-0 mutation: `ApprovalLineService`의 `ifPresentOrElse(..., line::pinDefaultDocumentTemplate)`를 일시적으로 `ifPresent(...)`로 되돌린 뒤 실 Postgres IT가 `documentTemplateDefaultPinned` 부재로 RED였다. 원 구현은 즉시 복원했다.

### 테스트 결과

- R2 관련 genuine Gradle IT: ACTIVE-0, V12 backfill, revision unique 충돌 경로와 전체 `DocumentTemplateIT`가 PASS했다. 최종 전수 명령의 원문은 본 보고서 검증 부록에 기록한다.
- 관련 desktop vitest: `134개 파일 / 1,029개 테스트 PASS`.
- `clients/desktop npm run typecheck`: design-system을 먼저 genuine build한 뒤 PASS.
- `clients/web/design-system npm ci` 및 `npm run build`: PASS.
- `PrintLayout` 무변경, 기존 golden 18 HTML 회귀 포함 관련 테스트 PASS(🚨 FABLE5 R1 정정 — 최초 기록이 정찰 보고의 "골든 17"을 검증 없이 인용했으나 `__goldens__/*.html` 실측은 18개다).
- Playwright 전량: 실행 산출물 `.last-run.json` 기준 `status=passed`, `failedTests=[]` (`unexpected=0`으로 해석 가능한 실패 0건). 최종 콘솔 원문은 확보하지 못해 원문 제출 요건은 미완.

### 4.1 R2 검증 원문 발췌

```text
BUILD SUCCESSFUL in 1m 12s
27 actionable tasks: 27 executed

Test Files  134 passed (134)
Tests       1029 passed (1029)

clients/desktop/test-results/.last-run.json
{
  "status": "passed",
  "failedTests": []
}
```

Gradle 명령은 `--rerun-tasks --no-build-cache`를 포함한 genuine 전수 실행이다. Playwright는 위 JSON artifact만 보존되어 콘솔 `unexpected=0` 한 줄은 제출하지 않는다.

## 5. 미pin 대상과 남은 우려

V12 적용 전 로컬 DB에서 승인 완료 문서 20건을 확인했고, 이들은 모두 pin 대상이 아닌 legacy NULL 상태로 남는다. V12 backfill은 양식 revision 이력만 만들며 결재 문서를 소급 pin하지 않는다.

남은 운영 우려는 V9 로컬 DB에 V10 이후 실제 document template payload가 없어 운영 payload 평균/최대 저장비용을 산출할 수 없었다는 점이다. 배포 전 V10/V12가 적용된 운영 데이터에서 `pg_column_size(document)` 분포를 재측정해야 한다. 또한 현재 코드베이스에는 반려→재상신 전이가 별도 구현되어 있지 않아 해당 도메인 경로의 재-pin 실증은 후속 재상신 기능과 함께 확인해야 한다.

## 6. FABLE5 R1 6-agent 적대검증 + 라이브QA — SONNET5 fix

FABLE5 R1(PR #865 코멘트)이 BLOCKING 0 · HIGH 2 · MED 5 · LOW 7로 미수렴 판정했다. 아래는 그 fix 내역이다.

### HIGH
- **H-1 미pin 배너가 종이 출력물에 인쇄됨**: `.approval-reprint-unpinned-notice`가 CSS 정의 0건·`no-print` 없이 원시 텍스트로만 존재했다. `no-print` 클래스를 부여하고, `global.css`에 실제 스타일(경고색 계열, `--color-warning-800`(#8C5C13) on `--color-warning-50`(#FEF6E7) 실측 대비 5.35:1 — AA 4.5:1 충족)을 신설했다.
- **H-2 pinned revision 조회 실패 시 무고지 DEFAULT 인쇄**: `hasPinnedLayout`이 true면(각인은 있음) 조회 실패(`isError`) 여부와 무관하게 미pin 배너 조건(`!hasPinnedLayout`)이 항상 false라 어떤 고지도 뜨지 않았다. `role="alert"` 신규 배너(`--color-danger-800`(#7F1D1D) on `--color-danger-50`(#FFF1F1) 실측 대비 9.12:1) + 재시도 버튼(`layoutDecided` 리셋 후 `refetch()`)을 추가했다. malformed 응답(`isSuccess && data===null`)도 동일하게 고지 대상에 포함했다. spec `D-DS3A-06`을 이 비대칭이 기획 공백이었음을 명시하며 정정했다.

### MED
- **M-1 Playwright pin 시나리오 미이행(dead code)**: mock 결재 픽스처에 `documentTemplateId`가 0건이라 신규 revision 핸들러가 한 번도 실행되지 않았다. `mock.ts`에 `GROUPWARE_QA_DS3A_PIN` docType(활성 rev2 + 과거 rev1 이력 `MOCK_DOCUMENT_TEMPLATE_REVISION_HISTORY`)과 pinned/무pin 대조 승인 2건(`...0004`/`...0005`, 시드 `77777777-` 접두 컨벤션 준수)을 추가하고, `clients/desktop/playwright/ac-845-ds3a-reprint-pin/`에 4개 테스트(pin 렌더 실증·무pin 대조군·H-1 print 매체·pin 대조군 print 매체)를 신설했다(590→594).
- **M-2 잠복 delete 표면**: R1의 `EntityManager#persist`는 Spring 예외 변환을 우회해 충돌을 generic 500으로 만들 수 있었다. R2에서는 최소 marker에 `saveAndFlush`만 선택 노출하고 `DocumentTemplateRevisionService`가 repository proxy를 사용하도록 고쳤다. delete류 메서드는 계속 컴파일 타임에 봉쇄하며, 실 Postgres 동시 insert 충돌은 typed `BusinessException(CONFLICT)`로 수렴한다.
- **M-3 문서 게이트**: 루트 `README.md` 진척률에 DS-3a 반영, `migration/decisions/DECISIONS.md`에 `#845 DS-3a` 절 + `D-DS3A-01~06` 기록(D-DS3A-01은 저장비용이 아닌 5가지 근거로 교체).
- **M-4 `V12`에 `SET LOCAL lock_timeout='5s'` 추가**: 레포 전역 컨벤션은 아니지만(`D-848-02`는 #848이 한 일의 기록일 뿐이고 accounting `V60~V63`은 미사용) `approval_lines`가 핵심 감사 테이블이라 권고로 추가했다. 적용된 마이그는 불변이므로 머지 전인 지금이 유일한 기회다.
- **M-5 spec 내부 모순**: 이력 조회 권한이 `:74`(page-code 재사용)와 `:96`(인증-only)로 상충했다. 구현(인증-only)이 옳으므로 spec을 구현에 맞춰 정정했다.

### LOW
- `ix_document_template_revisions_template_revision` 제거 — `ux_` UNIQUE 제약의 backing 인덱스와 완전 중복.
- backfill의 `COALESCE(modified_at, created_at)`/`COALESCE(modified_by, created_by)` 지시는 R2에서 철회했다. 정확한 revision 작성 시각·작성자를 복원할 수 없으므로 `V12_BACKFILL_UNVERIFIED`와 `is_backfilled=true`로 검증 불가 상태를 표시한다.
- `docType=null` 문서에 미pin 배너가 뜨던 문제 — `shouldShowUnpinnedNotice`에 `Boolean(docType)` 가드를 추가(레이아웃 pin 개념 자체가 없는 구식/독립형 결재는 고지 대상에서 제외).
- dev-report(본 문서) §4의 vitest 인용 역전 오기(`expected 4 to be 9` → `expected 9 to be 4`) 정정, §4 "golden 17" → "golden 18" 정정.
- PR 본문 진행 체크박스 갱신, spec `:116`(현 §4) "골든 17" → "골든 18" 정정.
- latch 고정으로 마운트 중 승인 전이 시 pin 미반영(edge) — spec §6에 "발생 조건이 좁고 완화책(재진입)이 있어 현행 latch 설계를 수용, 별도 fix 없음"으로 명시 기록.
- R2 LOW mutation 보강: `ApprovalDocView.test.tsx`에서 malformed `null` revision 응답의 `role="alert"` 경로와 세 고지의 `no-print` 클래스를 직접 단언해 해당 분기를 제거하거나 인쇄 제외 클래스를 제거하면 RED가 나도록 했다.

### PM disposition (spec/문서 기록만)
- TRUNCATE 가드는 이월. row-level trigger가 TRUNCATE에는 발화하지 않아 이 PR의 IT 리셋이 정확히 그 우회로 픽스처를 초기화하고 있음을 `DocumentTemplateIT`/`GroupwareAdminControllerIT`의 TRUNCATE 지점에 주석으로 명시했다. "DB가 append-only를 강제한다"는 표현이 UPDATE/DELETE에 한정된 것임을 본 문서 §3에도 명시했다.
- ACTIVE-0 창구 승인 영구 무pin 수용 결정은 개발책임자 결정으로 철회했다. 승인 시점에 `document_template_default_pinned=true`를 각인하고 이후 `GROUPWARE_DEFAULT`로 고정한다. 과거 승인 문서에 대한 소급 추정은 계속 금지한다.

### 검증(SONNET5 본인 실행 원문은 PR 코멘트에 게시)
- `./gradlew :services/groupware-service:test`, `clients/desktop`(`npm run typecheck` + vitest), Playwright 전량, fresh Postgres probe 재실행 — 결과 전문은 이 fix 라운드의 PR 코멘트를 참조한다. 이 세션에서는 Gradle·Vitest·typecheck의 원문을 확보했고, Playwright는 `.last-run.json` 상태만 보존됐다.

## 7. R3 라이브QA + 5차원 적대검증 + SONNET5 fix

- **R3 라이브QA**(OPUS 4.8, QA SHA `c5dc70d0c`): 실서버 실캡처 12장 + 뮤테이션 RED. 캡처·원문은
  `docs/qa/845-ds3a-r3-liveqa/`(스크린샷 12장 + `00-raw.txt`)에 보존. PR 코멘트("🟢 R3 라이브QA")에
  전문 게시.
- **R3 5차원 적대검증**(BE/FE/Design/DevOps/통합보안, SHA `c5dc70d0c`): BLOCKING 0 · HIGH 1 · MED 9 ·
  LOW ~20. PR 코멘트("🟠 OPUS 4.8 R3 재수렴 적대검증")에 종합 게시.
- **SONNET5 fix**: HIGH-1/MED-1/MED-2(캐시 freshness + latch 묶음) · mock parity + CI 게이트 ·
  감사 무결성(V13 신규 마이그레이션) · 스펙/결정문 drift · false-green 테스트 · CI skip 가드 · LOW 다수.
  RED→GREEN 원문 전문은 PR 코멘트에 게시.
