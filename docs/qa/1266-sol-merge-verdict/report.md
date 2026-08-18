# PR #1266 CODEX SOL 적대검증 보고서

## ① 검증 SHA

- PR head: `f7c50fae40fe469879cbe29c15ce2e0cf793500b`
- PR base 및 main 대조 SHA: `61e86641e05edd449cb1570d317806b5d2cb88cf`
- 검증 브랜치: `fix/uuid-not-in-api-response`
- 라이브 QA는 위 head에서 직접 만든 `slip-service.jar`, `inventory-service.jar`, `groupware-service.jar`를 각각 격리 포트 `28086`, `28085`, `28092`에 띄우고, 공유 DB를 복제한 격리 PostgreSQL에만 기록했다. 공유 컨테이너의 main 이미지를 브랜치 백엔드 증거로 사용하지 않았다.

## ② 기능 손실 여부 — 경로별 실제 클릭 결과

### 실제 클릭 완료

| 경로 | 실제 결과 | 판정 |
|---|---|---|
| DPS 저장내역 목록 → 상세 복원 | 브랜치 저장 API 응답은 HTTP 200이며 `data` 키가 `savedAt`만 포함하고 `id`는 없었다. 이어 실제 화면의 저장내역 탭에 **1행**이 나타났고 그 행을 클릭하자 목록 응답의 wire `id`로 상세 GET 200, 복원 배너와 비교 결과가 표시됐다. | 기능 손실 없음 |
| 출고전표 목록 → 상세 | 실제 목록 **20행** 중 첫 행 `2026/08/16-2`를 클릭해 상세 화면, 전표 라인 **1행**, 거래처·배송지·메모를 확인했다. | 기능 손실 없음 |
| 코멘트 작성 → 목록 → 해결 → 삭제 | 상세 화면에서 고유 코멘트를 입력하고 `등록` 클릭 → 코멘트 **1행** 표시 → `해결` 클릭 후 성공 배지 표시 → `삭제` 클릭 후 코멘트 **0행** 및 “아직 코멘트가 없습니다.” 표시. 네트워크 응답은 작성 201, 목록 200, 해결 200, 삭제 후 화면 반영 성공이었다. | 기능 손실 없음 |

### 제거 필드 소비자 역추적

- `clients/desktop`, `clients/web`, `clients/mobile*`를 grep했다. 복원된 협업 comment/suggestion `id`는 데스크톱의 React key 및 resolve/delete path에서 실제 사용되며, 라이브 왕복으로 정상 동작을 확인했다.
- DPS/전표정리 저장 생성 함수의 반환값을 받는 호출부는 있으나 `result.id`를 읽는 곳은 없다. 자동 저장은 fire-and-forget이고, 수동 저장 성공 뒤 저장내역 탭으로 이동하여 **목록 행의 `id`**로 상세를 연다.
- `mobile-staff/src/screens/SlipDetailScreen.tsx`에는 별도 slip comment `id` 삭제 소비 코드가 남아 있으나, 현재 `AppRootNavigator`는 `EstimateWebViewScreen`만 진입시키고 해당 화면을 import·등록하지 않는다. 현재 실사용 진입점의 도달 결함으로 세지 않았다.
- 그룹웨어 일정 API를 호출하는 클라이언트 코드 및 화면 route는 지정 클라이언트에서 발견되지 않았다. 따라서 일정 상세는 실제 사용자가 들어갈 화면 자체가 없어 클릭 검증할 수 없었다.

**실제 클릭으로 관찰된 도달 결함: 0건.** 단, 아래 ⑧의 미검증 축을 0건에 포함하지 않는다.

## ③ 표시 축 유지 근거

- DPS 저장내역 1행의 컬럼은 작성시각·작성자·저장주제·구분·mismatch 수였고 UUID 컬럼/라벨이 없었다.
- 복원 화면은 저장주제와 업무 결과만 표시했고 목록 wire `id`를 본문에 표시하지 않았다.
- 출고전표 목록 20행은 전표번호·구분·상태·거래처·배송태그만 표시했다. 상세 및 코멘트 작성/해결/삭제 화면도 표준 UUID 정규식과 일치하는 문자열이 없었다.
- 복원한 협업 `id`는 React key와 resolve/delete URL에만 사용됐다. 실제 작성·해결·삭제 각 화면에서 UUID가 다시 노출되지 않았다.
- 실제 캡처 7장을 시각 검수했으며 UUID 라벨, `ID` 컬럼, tooltip 형태 노출은 관찰되지 않았다.
- 인쇄 양식은 실제 인쇄 클릭 검증을 하지 않았으므로 ⑧에 미검증으로 분리한다.

## ④ 테스트 약화 판정

- `DpsSaveHistoryIT`와 `SlipCleanupSaveHistoryIT`의 생성 응답 `$.data.id` 단언은 제거됐다. 주 성공 시나리오는 생성 뒤 **목록 API**를 호출해 `content[].id`를 얻고 상세를 여는 흐름으로 바뀌었으며, 이는 실제 데스크톱 화면과 동일하다. DPS는 라이브 화면에서 이 경로를 직접 확인했다.
- 지적된 `DpsSaveHistoryIT:166` 및 cleanup의 repository 직접 조회는 타 사용자 접근 거부·soft-delete 검증용 보조 시나리오다. 이 줄만으로 생성 응답 계약은 더 이상 검증하지 않지만, 사용자 화면의 id 획득 경로는 같은 테스트의 생성→목록→상세 흐름과 라이브 QA로 확인된다.
- `GroupwareAdminControllerIT`는 owner/participant 응답 단언을 제거했고 `MessageBulkSendIT`도 생성 batch 식별자 응답 계약을 줄였다. 지정 클라이언트에서 해당 제거 필드를 읽는 화면 호출부는 찾지 못했다.
- 결론: 응답 모양에 대한 단언은 약해졌으나, 확인한 실제 사용자 경로를 우회해 green으로 만든 도달 결함은 발견하지 못했다. 일정 화면 부재 때문에 일정 상세 자체는 미검증이다.

## ⑤ 타입 불일치 확인

- `clients/desktop/src/renderer/api/dpsSaveHistoryApi.ts:25-28`의 `DpsSaveHistorySaveResponse`와 `slipCleanupSaveHistoryApi.ts:26-29`의 동형 타입에는 여전히 `id: string`이 있다.
- 브랜치 백엔드 라이브 DPS 생성 응답에는 `id`가 없고 `savedAt`만 있어 타입은 사실과 다르다.
- 모든 호출부를 grep한 결과 반환값의 `.id`를 읽는 호출처는 0곳이다. 수동 저장의 `onSuccess`는 탭 이동/재조회만 하고, 상세 복원은 목록 row의 `id`를 사용한다.
- 따라서 **정적 타입 불일치는 확인**, **현재 사용자 도달 결함은 0건**으로 판정한다. cleanup 실제 복원 클릭은 미검증이다.

## ⑥ slip 실패 2건 main 대조

기존 보고의 `SlipCompensationAuditIT`, `SlipPartnerLedgerInternalControllerIT`를 같은 attestation과 같은 Gradle 명령으로 비교했다.

| 실행 | 결과 |
|---|---|
| PR head targeted 2클래스 | 5 tests, 0 failed, `BUILD SUCCESSFUL` |
| PR base/main `61e86641e` targeted 2클래스 | 5 tests, 0 failed, `BUILD SUCCESSFUL` |
| PR head slip 전량 | 1,937 tests, 1 failed — `SlipCutoffAdminControllerIT.crud_happyPath` |
| PR base/main `61e86641e` slip 전량 | 1,937 tests, 1 failed — `SlipSalesUpdateIT`의 R9 RED-A 시나리오 |

즉, “전량의 같은 기존 2건이 main에서도 실패한다”는 기존 보고는 이번 대조에서 재현되지 않았다. 양쪽 전량이 서로 다른 단일 실패를 냈고, 보고된 두 클래스는 양쪽 targeted에서 모두 통과했다. 이는 결함 개수에 넣지 않고 **증거 무결성 정정**으로 기록한다.

## ⑦ 스크린샷 — 행 수와 경로

캡처 디렉터리는 `resolveQaShotsDir()`로 해석한 `docs/qa/1266-sol-merge-verdict-real-qa/_local`이다.

| 파일 | 실데이터 행/상태 |
|---|---|
| `01-dps-history-list-1rows.png` | DPS 저장내역 1행 |
| `02-dps-history-restored.png` | 저장내역 행 클릭 후 복원 배너, 출고전표 3라인/DPS 3행 결과 |
| `03-slip-list-20rows.png` | 출고전표 목록 20행 |
| `04-slip-detail-opened.png` | 첫 목록 행 상세, 전표 라인 1행 |
| `05-comment-created-1row.png` | 작성 후 코멘트 1행 |
| `06-comment-resolved-1row.png` | 해결 후 코멘트 1행 및 `해결` 성공 배지 |
| `07-comment-deleted-0rows.png` | 삭제 후 코멘트 0행 |

## ⑧ 미검증 축

- 전표정리(`SlipCleanupPage`) 저장내역의 실제 목록→복원 클릭은 미검증. 정적 호출 추적만 완료했다.
- 그룹웨어 일정 상세는 지정 클라이언트에 일정 API 호출/route가 없어 실제 클릭 미검증.
- 인쇄 양식과 hover tooltip의 전 화면 전수 클릭/출력은 미검증.
- `mobile-staff`의 비진입 `SlipDetailScreen`은 실제 앱 화면 실행 미검증.
- 위 항목은 도달 결함 0건 계산에서 제외했다.

## ⑨ CI

검증 종료 시 PR head `f7c50fae4`의 GitHub checks는 red다.

- `빌드 + 테스트 (slip-it-core)`: 실패 — `SlipCutoffAdminControllerIT.crud_happyPath`, 741 tests 중 1 failed. 로컬 PR head 전량에서도 같은 클래스 실패를 재현했다.
- `phase9-10 (groupware+notification+dashboard)`: action 다운로드 429로 setup 실패.
- `arologis-service`: action 다운로드 502/429로 setup 실패.
- 프런트 데스크톱, mock Playwright, mobile 계열, GitGuardian 등 나머지 확인된 checks는 통과했다.

CI hard gate가 green이 아니므로 현재 상태로는 머지할 수 없다.

## ⑩ 머지 가능/불가 — 도달 결함 N건

**판정: 머지 불가. 실제 사용자가 화면에서 재현할 수 있는 도달 결함은 확인 범위에서 0건이며, 미검증 축은 0건에 산입하지 않았다.**

머지 불가 사유는 화면 도달 결함이 아니라 현재 GitHub CI red 3잡이다. 특히 slip-it-core는 실제 테스트 실패이므로 green 재실행 또는 원인 회수 전에는 머지 gate를 충족하지 않는다.

## ⑪ 프로세스 회수

- 종료: Playwright Chromium, Vite `5126`, branch inventory `28085`, slip `28086`, groupware `28092`, QA attestation proxy `28100`.
- 삭제: 격리 PostgreSQL 컨테이너 `sol1266-pg`, main 대조 임시 아카이브 `sol1266-main-61e86641`.
- 회수 후 위 QA 포트 listener 0, 격리 컨테이너 0, 임시 아카이브 0을 확인했다.
- 공유 `samhan-*` 컨테이너는 검증 전 24개, 회수 후 24개로 그대로 유지했다.
- 코드 수정, `git add`, commit, push는 수행하지 않았다.
