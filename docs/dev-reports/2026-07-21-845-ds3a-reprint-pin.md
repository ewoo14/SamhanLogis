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
- DB trigger가 이력 UPDATE/DELETE를 차단한다. JPA entity도 수정/삭제 메서드를 제공하지 않는다.
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

- desktop pin 분기 제거: `ApprovalDocView`가 항상 ACTIVE revision 9를 읽도록 한 뒤 pinned test가 `expected 4 to be 9`로 RED.
- backend pin 호출 제거: HTTP 승인 경로에서 `ApprovalLineService`의 두 `pinApprovedLayout` 호출을 제거한 뒤 `GroupwareAdminControllerIT`가 `$.data.documentTemplateId expected <UUID> but was <null>`로 RED.
- 두 mutation 모두 원복 후 정상 코드를 유지했다.

### 테스트 결과

- `./gradlew :services:groupware-service:test --no-daemon`: `BUILD SUCCESSFUL in 1m 7s`, 21 XML suites / 148 tests, failed 0, skipped 0.
- 관련 desktop vitest: 4 files, 144 tests PASS.
- `clients/desktop npm run typecheck`: PASS.
- `clients/web/design-system npm ci` 및 `npm run build`: PASS.
- `PrintLayout` 무변경, 기존 golden 17 HTML 회귀 포함 관련 테스트 PASS.
- Playwright 전량: `Running 590 tests using 2 workers`, `590 passed (9.2m)`, `[guard] expected=590 unexpected=0 skipped=0 flaky=0`.
- 전량 실행으로 변경된 `docs/qa/**`와 `clients/desktop/playwright/**/screenshots/**`를 기준 상태로 원복했고, `test-results`, `playwright-report`, `playwright-json`도 제거했다.

## 5. 미pin 대상과 남은 우려

V12 적용 전 로컬 DB에서 승인 완료 문서 20건을 확인했고, 이들은 모두 pin 대상이 아닌 legacy NULL 상태로 남는다. V12 backfill은 양식 revision 이력만 만들며 결재 문서를 소급 pin하지 않는다.

남은 운영 우려는 V9 로컬 DB에 V10 이후 실제 document template payload가 없어 운영 payload 평균/최대 저장비용을 산출할 수 없었다는 점이다. 배포 전 V10/V12가 적용된 운영 데이터에서 `pg_column_size(document)` 분포를 재측정해야 한다. 또한 현재 코드베이스에는 반려→재상신 전이가 별도 구현되어 있지 않아 해당 도메인 경로의 재-pin 실증은 후속 재상신 기능과 함께 확인해야 한다.
