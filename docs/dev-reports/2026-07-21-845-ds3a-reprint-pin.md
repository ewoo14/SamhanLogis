# #845 DS-3a 결재 문서 재인쇄 — 승인 당시 레이아웃 pin

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

최종 선택은 `document_template_revisions` append-only 이력 + `approval_lines.(document_template_id, document_template_revision)` 참조 각인이다. 기존 `document_templates`의 현재 상태는 V12에서 revision 1건씩 이력화하지만, 기존 승인 문서의 pin 컬럼은 NULL로 유지한다. 새 양식 create/update/activate 시 현재 revision 이력이 보장된다.

## 3. 구현 경계

- V12에서 `document_template_revisions`를 만들고 현재 양식 행을 backfill한다.
- DB trigger가 이력 UPDATE/DELETE를 차단한다(row-level `BEFORE UPDATE OR DELETE` trigger 정의상 TRUNCATE에는 발화하지 않는다 — IT 픽스처 리셋이 TRUNCATE를 쓰므로 이 경계를 정확히 인지하고 있어야 한다. FABLE5 R1). JPA entity도 수정/삭제 메서드를 제공하지 않는다(R1 M-2로 `DocumentTemplateRevisionRepository`를 `JpaRepository`에서 Spring Data 최소 `Repository` 마커로 좁혀 delete 계열 메서드 자체를 컴파일 타임에 봉쇄했다).
- 마지막 승인으로 `APPROVED`가 되는 순간 현재 ACTIVE 양식의 `(templateId, revision)`을 같은 `@Transactional` 경계에서 각인한다. 이력 저장 또는 각인 실패 시 승인도 함께 rollback된다.
- DRAFT/진행중에는 pin하지 않는다. 현재 도메인에는 반려된 동일 결재선을 재상신하는 별도 전이 메서드가 없으므로, 재상신 경로가 추가될 때 최종 `APPROVED` 전이를 기존 승인 서비스로 통과시키면 새 revision을 다시 각인할 수 있다.
- desktop은 유효한 pin이 있으면 revision endpoint를 조회하고, pin이 없는 기존 `APPROVED` 문서는 현재 ACTIVE fallback을 사용한다. 이 경우 `승인 당시 레이아웃 정보가 없어 현재 양식으로 표시됩니다.` 운영자 안내 배너를 표시한다.
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

### 테스트 결과

- `./gradlew :services:groupware-service:test --no-daemon`: `BUILD SUCCESSFUL in 1m 7s`, 21 XML suites / 148 tests, failed 0, skipped 0.
- 관련 desktop vitest: 4 files, 144 tests PASS.
- `clients/desktop npm run typecheck`: PASS.
- `clients/web/design-system npm ci` 및 `npm run build`: PASS.
- `PrintLayout` 무변경, 기존 golden 18 HTML 회귀 포함 관련 테스트 PASS(🚨 FABLE5 R1 정정 — 최초 기록이 정찰 보고의 "골든 17"을 검증 없이 인용했으나 `__goldens__/*.html` 실측은 18개다).
- Playwright 전량: `Running 590 tests using 2 workers`, `590 passed (9.2m)`, `[guard] expected=590 unexpected=0 skipped=0 flaky=0`.
- 전량 실행으로 변경된 `docs/qa/**`와 `clients/desktop/playwright/**/screenshots/**`를 기준 상태로 원복했고, `test-results`, `playwright-report`, `playwright-json`도 제거했다.

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
- **M-2 잠복 delete 표면**: `DocumentTemplateRevisionRepository`가 `JpaRepository`(delete류 전부 노출)를 상속해, 미래 호출이 컴파일이 아니라 DB trigger의 런타임 500으로만 걸러졌다. Spring Data 최소 마커 `org.springframework.data.repository.Repository`로 좁혀 delete 메서드 자체를 컴파일 타임에 없앴다. `saveAndFlush`도 파생 쿼리로 유도 불가능해 저장소에서 제거하고, `DocumentTemplateRevisionService`가 `EntityManager#persist`를 직접 호출하도록 바꿨다(항상 신규 insert만 하므로 append-only 의도와 더 정확히 일치).
- **M-3 문서 게이트**: 루트 `README.md` 진척률에 DS-3a 반영, `migration/decisions/DECISIONS.md`에 `#845 DS-3a` 절 + `D-DS3A-01~06` 기록(D-DS3A-01은 저장비용이 아닌 5가지 근거로 교체).
- **M-4 `V12`에 `SET LOCAL lock_timeout='5s'` 추가**: 레포 전역 컨벤션은 아니지만(`D-848-02`는 #848이 한 일의 기록일 뿐이고 accounting `V60~V63`은 미사용) `approval_lines`가 핵심 감사 테이블이라 권고로 추가했다. 적용된 마이그는 불변이므로 머지 전인 지금이 유일한 기회다.
- **M-5 spec 내부 모순**: 이력 조회 권한이 `:74`(page-code 재사용)와 `:96`(인증-only)로 상충했다. 구현(인증-only)이 옳으므로 spec을 구현에 맞춰 정정했다.

### LOW
- `ix_document_template_revisions_template_revision` 제거 — `ux_` UNIQUE 제약의 backing 인덱스와 완전 중복.
- backfill의 `created_at`/`created_by`를 `COALESCE(modified_at, created_at)`/`COALESCE(modified_by, created_by)`로 변경 — 여러 차례 수정을 거친 양식의 이력 행에 항상 최초 생성 시각만 찍히던 문제를 교정.
- `docType=null` 문서에 미pin 배너가 뜨던 문제 — `shouldShowUnpinnedNotice`에 `Boolean(docType)` 가드를 추가(레이아웃 pin 개념 자체가 없는 구식/독립형 결재는 고지 대상에서 제외).
- dev-report(본 문서) §4의 vitest 인용 역전 오기(`expected 4 to be 9` → `expected 9 to be 4`) 정정, §4 "golden 17" → "golden 18" 정정.
- PR 본문 진행 체크박스 갱신, spec `:116`(현 §4) "골든 17" → "골든 18" 정정.
- latch 고정으로 마운트 중 승인 전이 시 pin 미반영(edge) — spec §6에 "발생 조건이 좁고 완화책(재진입)이 있어 현행 latch 설계를 수용, 별도 fix 없음"으로 명시 기록.

### PM disposition (spec/문서 기록만)
- TRUNCATE 가드는 이월. row-level trigger가 TRUNCATE에는 발화하지 않아 이 PR의 IT 리셋이 정확히 그 우회로 픽스처를 초기화하고 있음을 `DocumentTemplateIT`/`GroupwareAdminControllerIT`의 TRUNCATE 지점에 주석으로 명시했다. "DB가 append-only를 강제한다"는 표현이 UPDATE/DELETE에 한정된 것임을 본 문서 §3에도 명시했다.
- ACTIVE-0 창구 승인 시 영구 무pin은 설계 정합으로 수용 — spec `D-DS3A-03`에 결정으로 명시했다(소급 각인 금지 원칙의 연장 — 배너로 고지되므로 별도 코드 변경 없음).

### 검증(SONNET5 본인 실행 원문은 PR 코멘트에 게시)
- `./gradlew :services:groupware-service:test`, `clients/desktop`(`npm run typecheck` + vitest), Playwright 전량(`unexpected=0`), fresh Postgres probe 재실행 — 결과 전문은 이 fix 라운드의 PR 코멘트를 참조.
