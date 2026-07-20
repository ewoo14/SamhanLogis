# #832 — #810 mock parity·감사 이력 정밀도 (백로그 번다운 B2-FE 잔여)

> 성격: **mock parity(테스트 품질·vitest false-green 제거) + 감사 표시 정밀도(D-03)**. 사용자 데이터 오염 아님(fail-safe·BE ITs·라이브QA genuine). PR #861 · 브랜치 `chore/832-mock-parity-audit-precision`.
>
> 워크플로우: OPUS 기획 → CODEX SOL 기획검수(R1 BLOCKING4→v2 GO) → CODEX LUNA 구현(`5646adf61`) → **OPUS 4.8 R1 5-agent 적대검증+라이브QA+fix** → CODEX SOL R2(fix=LUNA) → 0수렴 → PM 종합 → 머지·#832 close.

## 1. 구현 4항목 (D-832-01~04)
- **D-01** mock 거래처 status hydration — 비ACTIVE(SUSPENDED/TERMINATED/삭제/NOT_FOUND)→stale 집계·ACTIVE만 자동매칭. 목록/CODEF/CSV 3경로.
- **D-02** mock CODEF matchedCount 실계산 — 신규적재 non-dup 중 DEPOSITOR_MAPPING/PARTNER_CODE_EXACT 수(하드코딩 0 제거).
- **D-03**(BE) 감사이력 operationOrdinal/generation — 작업식별자 `(entityId,revisionNo)`·동일작업 필드행 동일 ordinal·oldest-first 채번·newest-first 반환·min(changedAt) 그룹·세대(entityId 최초등장 순). DTO+FE "작업 N"·mock 미러. **#830 revision allocator·entryKey 무변경**(표시용 파생).
- **D-04** mock 입금자명 정규화 BE 일치 — BOM(U+FEFF) 보존(`mockJavaTrim`≤U+0020·`MOCK_JAVA_UNICODE_SPACE`가 U+FEFF 제외) 5경로. BE `DepositorNameNormalizer` 무변경 + 계약테스트.

## 2. OPUS 4.8 R1 적대검증 (5차원 fresh·집PST dim2/3/5 API 500/529 FAILED→회사PC 전건 재수행)
BE production 파생 로직 **7항목 전부 통과·0 결함** 확증. 결함은 테스트 무결성·mock·시드·UX.

| ID | 심각도 | fix |
|---|---|---|
| **S1** 시드 미실재 거래처(개발책임자 "시드 임의·부정확") | BLOCKING(FE)/MED(QA) | `P-2026-0001`(삼한공조 A)·`P-2026-0002`(아로물류 B)·`P-SEJIN-003`(세진산업)을 `MOCK_ADMIN_PARTNERS`에 실재 ACTIVE 편입 + 시드 통장거래 matched* 정합. D-01 hydration stale 회귀 해소 |
| **H1** CSV/KFTC PARTNER_CODE_EXACT 역파리티(FE 단독 포착) | HIGH | `mockResolveBankTransaction` exact-match를 `CODEF_BANK\|CODEF_CARD`로 게이팅(BE `BankTransactionService.importCsv`엔 EXACT 폴백 없음·`CodefImportService` 전용, 소스 직접 대조) |
| **W1** 동시각 tiebreak 방향 false-green | MED(BE+DevOps+QA 3모델 수렴) | `DepositorMappingServiceTest` toString substring 독립매칭→record accessor 행-값 바인딩(`filteredOn`/`allSatisfy`)+fixture 결정화 |
| **W2** spec요구 실-Postgres IT 부재/퇴화 | MED(3모델) | `ControllerIT`에 jdbcTemplate 실 DB 시나리오 2건(분산 changedAt→동일 ordinal·2세대 동시각 tiebreak·비퇴화 ordinal·반복안정) |
| **dim4** mock ordinal/generation 파생 무단언 | MED | `mock.test`에 재생성 시나리오 ordinal 1..N유일·다필드동일·generation≥2 단언 |
| **UX1/2/3** 값컬럼 압착·반복행 그룹핑·라벨 부재 | HIGH/MED(Design) | 이력 모달 `xl` 승격·"작업/세대" 병합 컬럼·연속 필드행 그룹핑(첫 행만 표기+상단 구분선)+상단 범례+null 가드 |
| **LOW** | — | `mockPartnerIsActive` 대소문자무시(BE equalsIgnoreCase)·`normalize` C0 보존 파리티·D-04 update rawName BOM 단언·EXACT 픽스처 주석·generation tiebreak 주석 |

## 3. 검증 (genuine)
- **desktop**: typecheck 클린 · vitest **1004/0** (mock.test 104·DepositorMappingPage 10 포함).
- **BE accounting**(`--rerun-tasks --no-build-cache`): `BankDepositorPartnerMappingControllerIT` **7**·`DepositorMappingServiceTest` **19**·`DepositorNameNormalizerTest` **4** — **skipped=0·failures=0**(실 Postgres Testcontainers 실행).
- ci.yml `accounting-deposit-mapping-it` 잡에 3파일 기등재(필터 false-green 없음)·신규 IT 메서드 자동 실행.

## 4. 라이브 QA (실 게이트웨이 :8080·mock OFF·실 accounting_db·재배포 #832 accounting)
다세대 매핑 `QA-R1-매핑검증`을 API로 3세대 시드(create→update→delete ×2 + 재생성)·`/deposit-mappings/history` 실증:
- **operationOrdinal 1~7 유일·연속**(작업 단위·구 revisionNo #1 중복 해소) · **generation 1,2,3** · 동일작업 필드행 동일 ordinal · UUID 미노출.
- UI 이력 모달(스샷 `docs/qa/832-audit-precision/`): 병합 "작업 N / N세대" 컬럼·연속행 그룹핑(작업 라벨 7개 = 작업 수, 22행 아님)·상단 범례·xl 폭 값 가독성. `01-mapping-list`·`02-history-operation-ordinal`(작업5~7·2/3세대)·`03-history-full-generations`(작업1~3·1세대).

## 5. 환경 관찰 (#832 무관·회사PC)
- **design-system dist stale**(Jul 16·#825 슬2/3/4 이전) → `clients/web/design-system` 재빌드로 desktop typecheck 정상화. fresh 체크아웃 후 필수([[feedback_rename_filedep_junction]]).
- **실행 Docker 스택이 타 워크트리(wt761)에서 기동** → D-03 미포함. `docker compose -p infrastructure … up -d --no-deps --build accounting-service`로 #832 accounting 교체 배포.
- **권한 page-code 관찰**: 이 스택 auth 시드는 `accounting.deposit-match`(구명)만 보유하고 FE 가드가 쓰는 `accounting.deposit-mapping`(#810 신명)이 없어 매핑 화면 접근이 막힌다. 라이브QA는 `/auth/admin/permissions/my` 응답 주입으로 화면 표시만 확보(권한 enforcement 검증 아님). **실 배포 auth 시드의 page-code 정합은 별도 확인 필요**(#832 스코프 밖·후속).

## 6. 교훈
- **개발책임자 "시드 임의" 경고 실증**: mock parity 슬라이스에서 D-01 hydration이 미실재 거래처(`P-2026-000X`/`P-SEJIN-003`) 시드 비정합을 표면화. 시드 정합성은 mock 충실도의 1급 축.
- **FE 단독 포착 H1**: BE `importCsv` vs `CodefImportService` 실소스 대조로만 역방향 파리티 갭 발견 — 파리티 슬라이스는 양방향 대조 필수.
- **3모델 수렴(W1/W2)**: `toString().contains(varargs)` 독립매칭은 tiebreak 방향·행-값 바인딩을 놓쳐 false-green — record accessor 단언으로 교체([[feedback_reconvergence_before_merge]]).

## 7. CODEX SOL 5.6 R2 적대검증 (교차검증·fix=CODEX LUNA)
3차원(QA/테스트무결성·BE/DevOps·FE/Design) 적대 리뷰. **BLOCKING/HIGH 0**(production 로직 양 모델 건전 재확인). 신규 발견 disposition:

### FIX (in-scope·CODEX LUNA)
- **R2 이력 응답 정렬(production·BE+FE 2차원 수렴)**: `DepositorMappingService.history()`가 operationOrdinal은 작업 min(changedAt) 채번하면서 응답은 repository `changedAt desc` 순서 반환 → 레거시 필드행 changedAt이 작업 간 교차 시 ordinal `[1,2,1]`로 비연속→FE 그룹핑 중복. **fix**: BE·mock 응답을 **operationOrdinal DESC stable sort**(작업 내부 total-order 유지)로 작업 항상 연속. 교차 시각 회귀 테스트(BE·mock).
- **R2 시드 bizNo 자사 충돌(R1 S1 fix가 도입)**: P-2026-0001 `111-22-33333`이 자사 (주)삼한로지스 번호와 충돌 → **`911-22-33344` 고유값 교체**+시드 통장거래 matchedBizNo 동기. P-2026-0002/P-SEJIN-003는 비충돌 유지. self-consistency 테스트(전역상태 비의존).
- **R2 mock 정규화 파리티 완성**: create/update가 정규화를 **raw 원문에서**(선 trim 제거)·history/update/delete lookup 키를 **완전 canonical화**(BE parity). C0/NBSP 회귀 테스트.
- **R2 테스트 강화**: D-01 null/blank/ACTIVE 3경로·D-02 matchedCount 1매칭+1미매칭·dim4 정확 4작업 [1,2,3,4] 바인딩·min(changedAt)·generation 시간우선(BE).

### 바운드/노트 (PM disposition·effort 조절 [[feedback_pm_regulate_slice_effort]])
- **R2Q2 orphan NOT_FOUND 테스트 = 도달불가로 제거**: mock 생성 endpoint가 미실재 partnerCode를 404 거부하고 거래처 부재는 soft-delete로만 표현 → orphan 매핑 생성 불가. NOT_FOUND stale은 기존 `P-DELETED-004`(isDeleted) 경로가 커버.
- **R2 source×txnType 전 매트릭스 테스트 = 바운드**: 런타임 partner 생성 endpoint·특정 externalRef 형식 의존으로 fragile → 제거. H1 게이팅 핵심은 R1 H1 테스트(CSV 음성)+D-02(CODEF 양성)가 커버.
- **R2 self-consistency = robust 3-코드 축약**: 전역상태 의존 5행 GET 대신 3 거래처 ACTIVE·bizNo·자사 비충돌만 결정적 단언.
- **PRE·스코프 밖(노트)**: ①편집 모달이 null/blank/소문자 active를 비활성 취급(재선택 강제) — D-01(목록/mock)과 별개 FE 입력 이슈. ②FE `.trim()`이 제출 전 BOM 제거 → D-04 BOM 보존을 실사용자 경로서 무효화(D-04 스코프=mock parity·달성). ③교차표면 bizNo 불일치(P-2026-0001 채권 1234567890·P-SEJIN-003 입금보고서 3456789012·P-2026-0003 admin 404) — 비-depositor 픽스처(외상원장/채권/입금보고서)의 PRE 임의시드. ④전역 MOCK_* beforeEach reset 부재(순서의존). → 모두 **#832 스코프(depositor mock parity+D-03) 밖·후속 분리**(개발책임자 처분).

### R2 검증
desktop typecheck 클린·vitest **1010/0**·BE accounting IT/ServiceTest/NormalizerTest skipped=0. 라이브QA(작업 정렬·다세대) 재실증.
