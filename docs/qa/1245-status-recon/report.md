# PR #1245 상태 진단 정찰

- 정찰일: 2026-08-18 (Asia/Seoul)
- 정찰자: CODEX SOL
- 대상: PR #1245 / Issue #1234 / `data/legacy-csv-full-load`
- 안전 조건: 공유 PostgreSQL은 모든 조회를 `BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK;`으로 실행했다. import endpoint, DB write, 컨테이너 제어, 코드 수정, `git add/commit/push`는 수행하지 않았다.

## 먼저 보는 결론

**PR의 업무 목표는 아직 유효하다. 다른 트랙이 구조와 파서를 고쳤지만 실제 92개 누락·43개 drift 데이터는 채우지 않았다.** 다만 PR 브랜치에는 적재 구현이나 마이그레이션이 없고, 전량 원천 CSV와 유효한 사전 백업도 없다. 현재 상태로 머지하면 문서 4파일만 들어가며 데이터는 바뀌지 않는다.

공유 DB를 다시 센 결과, 2026-08-16에 고정한 원천 스냅샷 기준으로 DC 누락 **92코드가 그대로 92**, drift **43코드가 그대로 43**이다. DC 총 활성행이 210→211로 늘어난 것은 운영 적재가 아니라 `QA-ORDER-PORTAL` 1행이다. BLOCK 6, CHAT 2+1, REGION 19그룹/20필드도 그대로다.

## 【원래 목표】

Issue #1234와 브랜치 트랙 문서가 확정한 목표는 CSV(Notion)를 이관용 정본으로 삼아 **DC 누락 92코드와 drift 43코드/67필드를 한 번에 적재**하고, 적재 뒤에는 DB를 정본으로 삼는 것이다(`docs/tracks/1234-legacy-csv-full-load.md:3-11`). 완료 조건은 적재 전후 코드 수·총액 비교, 백업 파일, GUI 반영 증거다(`docs/tracks/1234-legacy-csv-full-load.md:26-28`).

범위는 DC만이 아니다. 원 정찰은 REGION/DC/CHAT/BLOCK 네 원천과 네 서비스 DB를 대상으로 했다(`docs/dev-reports/2026-08-16-legacy-data-load-gaps.md:5-12`). 당시 고정 원천 스냅샷은 REGION 20행, DC 304행, CHAT 114행, BLOCK 6행이었다(`docs/dev-reports/2026-08-16-legacy-data-load-gaps.md:38-45`).

적재 전 불변식은 다음과 같다.

- CSV와 다른 현행 DB 값 전량 백업: 사람이 수정한 값이 사라질 수 있다(`docs/tracks/1234-legacy-csv-full-load.md:13-17`).
- 금액 영향 126코드의 적재 전후 총액 비교(`docs/tracks/1234-legacy-csv-full-load.md:18-20`).
- 일회성 적재이며, 이후 원천 추종 구조는 별도 결정(`docs/tracks/1234-legacy-csv-full-load.md:21-21`).

## 【현재 격차】 실데이터 실측 숫자

### 실측 기준과 한계

원천 CSV 4개는 현재 워크트리에 없다. 기존 PR 산출물도 원천 부재 때문에 전량 목록을 만들지 못했다고 명시한다(`docs/qa/1245-legacy-load-gaps/pr-comment.md:36-46`). 따라서 아래에서:

- **이론상/원천 기준**은 2026-08-16 보고서에 행·해시와 함께 고정된 원천 스냅샷이다.
- **실데이터 기준**은 그 보고서의 92개·43개 코드 집합을 2026-08-18 공유 DB에서 다시 조회한 결과다.
- 원천 파일 자체의 2026-08-18 현재 내용은 **미조사**다. 파일이 없으므로 원천이 7월 28일 뒤 바뀌었는지는 확인할 수 없다.

### DC

| 항목 | 이론상/고정 원천 | 현재 공유 DB 실측 | 판정 |
|---|---:|---:|---|
| 원천 고유 거래처코드 | 301 | 비교 기준 고정 | 원 보고서 `304행/301코드`(`docs/dev-reports/2026-08-16-legacy-data-load-gaps.md:88-96`) |
| 활성 DC 전체 | — | **211행** | `LEGACY_CSV` 210 + `ADMIN_EDIT` 1 |
| 10자리 업무 거래처코드 DC | — | **210코드** | 나머지 1은 `QA-ORDER-PORTAL` |
| 원천 누락 92코드 중 현재 활성 | 92 대상 | **0코드** | **현재도 누락 92** |
| drift 43코드 중 현재 활성 | 43 대상 | **43코드** | 대상 소실 없음 |
| drift 43코드의 8/16 이후 수정 | — | **0코드** | 최신 수정 `2026-08-13 12:51:18`; **현재도 drift 43** |
| 현행-only `6973700076` | 원천 없음 | **1코드 존재** | 그대로 |

원 보고서가 세었던 원천-only 92, 현행-only 1, 공통 drift 43/67필드는 `docs/dev-reports/2026-08-16-legacy-data-load-gaps.md:88-98`에 있다. 92코드 중 91코드는 비기본 금액/표시 설정이 있다는 원문은 같은 파일 `:100-102`, 43코드 중 금액·표시 직접 영향은 34코드/53필드라는 원문은 `:249-249`다.

**결론:** 같은 고정 원천 스냅샷을 기준으로 지금 다시 세어도 제목의 **누락 92 · drift 43**은 그대로다. 다만 “금액 영향 126~127코드”는 원천 스냅샷 기반 이론 수치이며, 원천 CSV 부재로 적재 전후 총액을 이번 읽기 전용 정찰에서 재계산하지 않았다.

### BLOCK / CHAT / REGION

| 계열 | 이론상/고정 원천 | 현재 공유 DB 실측 | 현재 격차 |
|---|---:|---:|---:|
| 발송금지 | 6행 + GAS 별도 예외 1코드 | 활성 0, 전체 0 | **6행 전부 누락**, 별도 예외도 0 |
| 단톡방 | 누락 2 + 방명 drift 1 | 활성 112, 전체 114 | `2988801865`, `4238103359` 없음; `6068199542`는 기존 방명 유지 |
| 지역분류 | 20그룹 | 활성/전체 20 | **순서 drift 19그룹**, 인천 키워드 `서해구` 없음/`서구` 있음 = 합계 20필드 |

BLOCK 6코드 원문은 `docs/dev-reports/2026-08-16-legacy-data-load-gaps.md:62-73`, CHAT 3코드는 `:261-271`, REGION의 19개 순서와 인천 키워드는 `:273-299`다. 현재 실측은 그 코드와 그룹을 공유 DB에서 다시 직접 대조했다.

## 【이미 된 것】 이슈·PR 번호

GitHub의 전체 상태 검색(`gh issue list --state all --search`, `gh pr list --state all --search`)과 관련 PR 변경 파일을 대조했다. CLOSED/MERGED를 구현 완료로 간주하되, 실제 범위를 파일로 확인했다.

- **PR #115 MERGED**: REGION/DC/CHAT/BLOCK 네 CSV import 구조, 서비스 DB·관리 UI를 만들었다. 실제 적재 완료가 아니라 적재 경로 구현이다.
- **PR #453 MERGED**: DC import fidelity와 estimate-app 배선을 보강했다. 데이터 92/43의 현재 적재 완료는 아니다.
- **PR #233 MERGED**: production Notion runtime 의존을 zero로 잠갔다. 그래서 현행은 CSV import 뒤 DB 정본 구조다. 운영 스크립트도 네 CSV를 네 endpoint로 POST한 뒤 DB CRUD를 쓴다고 명시한다(`tools/operational-validation/import-notion-csv.ps1:3-15`).
- **PR #1228 MERGED**: DC `0.45` fraction 보존과 BLOCK ISO 시각 파싱 결함을 고쳤다. 현행 DC 파서는 `%`가 있을 때만 100으로 나눈다(`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/DcConfigImportService.java:256-270`).
- **Issue #1238 OPEN**: 2026-08-18 A-1 정찰 댓글도 “import 구조 #115·#453, runtime Notion zero #233, 실제 전체 재적재는 PR #1245 진행 중”이라고 기록했다. 즉 별도 완료 트랙을 가리키지 않는다.
- **PR #1267 MERGED**: `dc-config-service` V6로 로컬 거래처 UUID를 partner-service와 정렬하고 product importer 동명 품목을 고쳤다. `dc_configs`의 할인값 92/43을 적재하지 않았다. 현재 DB에서도 92 대상 활성 0, 43 대상 수정 0으로 확인됐다.
- **PR #1272 MERGED**: product-service의 카테고리별 견적품목 설정과 **V47**을 추가했다. 대상은 `bundle_component_estimate_setting` 계열이며 DC/BLOCK/CHAT/REGION 네 데이터와 겹치지 않는다.
- **PR #1262/#1266 MERGED**: 각각 시트 식별자 마스킹, UUID API 비노출 정비다. 대상 데이터 적재와 겹치지 않는다.

따라서 “구조·파서·런타임 정책”은 이미 구현됐지만, **실제 데이터 reconciliation은 다른 곳에서 끝나지 않았다.**

## 【충돌 규모】 파일 수·성격

지시대로 원격을 갱신한 뒤 `git merge origin/main --no-edit`를 실행했다.

- 병합 전 HEAD: `0b5d2f6ac8cc3038ae47397717672c215bf09bc5`
- 병합 대상 `origin/main`: `3e4f44cc0e3312172a6f7ca8b3d87d875fd69428`
- 결과: **충돌 0파일**, `ort` 자동 병합 성공
- 충돌 성격: 해당 없음. 문서/로직/마이그레이션 어느 종류도 충돌하지 않았다.
- 생성 결과: 지시된 merge 명령이 로컬 merge commit을 만들었다. 별도 `git commit` 명령은 실행하지 않았다.

main 변경량은 컸지만 PR 고유 변경이 문서 계열뿐이라 충돌하지 않았다.

## 【이 PR 브랜치에 실제로 들어 있는 것】

`git diff origin/main...HEAD --stat` 결과:

```text
 .../qa/1245-legacy-load-gaps/current-db-backup.csv |  2 +
 docs/qa/1245-legacy-load-gaps/gap-list.csv         | 13 ++++
 docs/qa/1245-legacy-load-gaps/pr-comment.md        | 72 ++++++++++++++++++++++
 docs/tracks/1234-legacy-csv-full-load.md           | 28 +++++++++
 4 files changed, 115 insertions(+)
```

성격은 모두 문서/부분 CSV다.

- `gap-list.csv`는 헤더 포함 13줄이고 각 행에 “원천 CSV 부재”라고 적혀 있다(`docs/qa/1245-legacy-load-gaps/gap-list.csv:1-13`). 92+43 전량 ledger가 아니다.
- `current-db-backup.csv`는 실제 백업이 아니라 “전량 백업 미생성” 표시 1행뿐이다(`docs/qa/1245-legacy-load-gaps/current-db-backup.csv:1-2`).
- 이전 정찰도 적재·마이그레이션·격리 복제본·전후 비교를 수행하지 않았다고 명시한다(`docs/qa/1245-legacy-load-gaps/pr-comment.md:60-62`).

**브랜치 고유 마이그레이션: 0개.** 이미 적용된 마이그레이션 수정도 0개다. main의 product-service는 V47까지 갔지만 이 브랜치는 V47이나 과거 migration을 수정하지 않는다. #1267의 dc-config V6도 main 쪽 파일이며 충돌 없이 들어왔다.

## 【위험】 되돌릴 수 있는가

### 현재 PR 그대로 머지할 때

DB 변경은 없다. 문서 4파일만 들어가므로 데이터 관점에서는 되돌릴 것이 없다. 반대로 말하면 Issue #1234도 해결되지 않는다.

### 의도한 적재를 재개해 실행할 때

네 import는 하나의 분산 트랜잭션이 아니다. 운영 스크립트가 네 endpoint를 순서대로 호출한다(`tools/operational-validation/import-notion-csv.ps1:239-267`). 중간 서비스에서 실패하면 앞 서비스의 성공분만 남을 수 있다.

- **DC:** 기존 행의 비율·I호스·옵션 정액·단위처리·note·source를 덮고, 없는 행은 삽입한다(`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/DcConfigImportService.java:155-190`). 43 drift의 현행값은 백업 없이는 소실된다. 특히 원천 `roundTo`가 null이면 기존 rounding을 명시적으로 지우지 않는 경로가 있어 단순 전체 재import만으로 완전한 source fidelity를 보장하지 않는다(`:176-184`).
- **BLOCK:** 신규 차단을 행별 독립 transaction으로 넣는다(`services/partner-service/src/main/java/com/samhanair/logis/partner/service/PartnerBlockImportService.java:48-57`). 일부 행만 성공할 수 있다. 잘못 넣은 차단은 soft-delete로 비활성화할 수 있지만, 발송 차단이 즉시 업무에 영향을 준다.
- **CHAT:** `(partnerCode, chatRoomName)`이 같으면 갱신하고 아니면 새 행을 삽입한다(`services/notification-service/src/main/java/com/samhanair/logis/notification/service/ChatRoomImportService.java:179-198`). 방명이 바뀐 1코드는 단순 재import 시 기존 방을 교체하지 않고 새 mapping을 추가할 위험이 있어 명시적 정리 ledger가 필요하다.
- **REGION:** 같은 그룹의 `keywords`와 CSV 행 순서 기반 `sortOrder`를 직접 덮는다(`services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/RegionImportService.java:101-109`). 19개 순서와 인천 키워드를 한 번에 바꾼다.

**판정:** 기술적으로는 되돌릴 수 있지만, 자동·무손실 rollback은 현재 없다. 삽입행은 식별 가능한 ledger가 있으면 soft-delete/복원할 수 있으나, 기존값 overwrite는 정확한 preimage 백업 없이는 복원 불가다. 현재 브랜치의 `current-db-backup.csv`는 백업이 아니므로 지금 실행하면 안전하게 되돌릴 수 없다. 네 서비스 사이의 부분 성공도 별도 역적용이 필요하다.

## 【선택지】

### ① 재개한다 — 무엇부터

원래 범위 전체를 유지한다.

1. 원천 4개 CSV를 다시 확보하고 SHA-256/행 수를 고정한다. 기존 스냅샷 해시와 같지 않으면 92/43을 원천부터 재계산한다.
2. 4개 DB의 변경 대상 전량 preimage를 거래처코드/업무키 기준으로 백업하고 checksum을 남긴다.
3. 미결정 5축(`2291465974`, `6973700076`, audit 있는 `4348703365`, 인천 키워드, BLOCK 6+예외)의 처분을 확정한다. 기존 목록은 `docs/qa/1245-legacy-load-gaps/pr-comment.md:52-58`에 있다.
4. 공유 DB가 아닌 격리 복제본에서 4단계 적재와 역적용을 리허설하고, 코드 수·금액·GUI 증거가 맞을 때만 운영 실행한다.

장점은 Issue #1234를 한 번에 닫는 것이다. 단점은 현재 PR이 사실상 구현 전 상태라 다시 만드는 양이 크고 overwrite 위험이 가장 크다는 점이다.

### ② 범위를 줄여 재개한다

**304행 전체 재import를 하지 않고, 현재 남은 차이만 명시한 forward-only delta ledger로 바꾼다.**

1. 원천 재확보·재계산·preimage 백업은 ①과 동일하게 선행한다.
2. 먼저 add-only 후보(DC 누락 92, CHAT 누락 2)를 별도 ledger로 적재한다. BLOCK 6은 현재도 유효한 차단인지 승인된 코드만 넣는다.
3. overwrite 후보(DC drift 43/67필드, CHAT 방명 1, REGION 19그룹/20필드)는 코드·필드별 승인값과 역적용값을 한 행씩 고정한다.
4. `6973700076` 삭제, `2291465974` 중복값, `4348703365` 현행 audit 값, 인천 `서해구/서구`는 결정 전까지 보존한다.
5. 서비스별 forward/rollback 검증을 한 뒤 하나의 통합 PR에서 순차 적용한다.

장점은 이미 맞는 209개 공통 DC와 20개 지역행 전체를 불필요하게 다시 쓰지 않고, rollback 대상을 정확히 제한한다는 점이다. 단점은 “전체를 한 번에”라는 초기 실행 방식은 바뀌지만 최종 격차 해소 목표는 유지된다.

### ③ 닫는다 — 그래도 되는 이유

PR **브랜치만** 놓고 보면 닫아도 된다. 현재는 문서 4파일뿐이고 구현·원천·백업이 없어 머지 가치가 낮다. 단, 다음 조건이 필요하다.

- Issue #1234를 닫으면 안 된다. 현재 실데이터의 누락 92·drift 43, BLOCK/CHAT/REGION 격차가 그대로 남아 있다.
- 대체 이슈/PR을 즉시 열어 현재 보고서와 원 정찰을 인계해야 한다.
- 금액 영향과 발송금지 미적용을 명시적으로 수용하지 않는 한 “불필요해져서 종료”라고 기록할 수 없다.

즉 **대체 트랙 없이 PR과 Issue를 함께 닫는 선택은 근거가 없다.**

## 【PM 권장】

**② 범위를 줄여 PR #1245를 재개한다.**

근거:

1. 현재 DB 재실측에서 핵심 격차가 그대로라 업무 목표는 폐기할 수 없다.
2. #115/#453/#233/#1228/#1267/#1272는 구조·파서·인접 스키마를 만들었을 뿐 대상 데이터를 채우지 않았다.
3. 현재 브랜치는 문서뿐이고 전량 원천·백업이 없어 ①을 즉시 실행할 준비가 안 됐다.
4. 전체 CSV 재import는 이미 맞는 행까지 덮고, CHAT 방명 drift를 중복 mapping으로 만들며, 네 서비스 부분 성공을 남길 수 있다.
5. 코드·필드별 delta와 preimage를 고정하면 영향 범위와 rollback을 검증할 수 있다.

**재개 첫 작업은 코드 작성이 아니라 원천 4파일 재확보 → 해시/행 수 고정 → 현재 DB와 전량 diff 재생성 → preimage 백업이다.** 그 전에는 적재 endpoint를 호출하면 안 된다.

## 프로세스·컨테이너 회수

- 이번 정찰에서 새로 기동한 장기 프로세스: **0개**
- 회수 대상/회수 완료: **0개 / 0개**
- 정찰 종료 시 실행 컨테이너: **26개** = 지시된 공유 스택 **24개 유지** + 기존 격리 PostgreSQL 2개
- 컨테이너 stop/restart/remove: **0건**
- 잔여 신규 프로세스: **0개**

## `git status --porcelain` 원문

```text
?? docs/qa/1245-status-recon/
```
