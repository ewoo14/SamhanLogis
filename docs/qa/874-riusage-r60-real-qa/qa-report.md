# R60 라이브QA 보고서 — PR #1057 · 이슈 #874

- 라운드: R60
- 기준 HEAD: `66694cb72`
- 일시: 2026-08-05 (KST)
- 작업 디렉토리: `C:\dev\Samhan-Public\.claude\worktrees\t874`
- 브라우저: 내장 브라우저 미사용. `clients/desktop`에서 `import { chromium } from '@playwright/test'` Node 드라이버 사용
- 렌더러: `VITE_API_BASE_URL=http://localhost:8080 node_modules/vite/bin/vite.js src/renderer --config vite.renderer.dev.config.ts --host localhost --port 5206 --strictPort`
- mock: OFF
- DB 쓰기: 직접 SQL/API 쓰기 없음. 협업 수정은 화면에서만 저장
- vendor 발송: 없음

## 사전 배포 상태

재배포하지 않았다. 컨테이너는 기존 실행 상태만 확인했다.

| 컨테이너 | created | started | 상태 |
|---|---|---|---|
| `samhan-slip-service` | `2026-08-05T14:17:51.44867138Z` | `2026-08-05T14:17:55.498813686Z` | running |
| `samhan-notification-service` | `2026-08-05T14:17:51.447681933Z` | `2026-08-05T14:17:55.497570987Z` | running |
| `samhan-api-gateway` | `2026-08-05T13:55:20.45079612Z` | `2026-08-05T13:55:30.333688993Z` | running |
| `samhan-auth-service` | `2026-08-03T14:34:20.226032107Z` | `2026-08-05T10:02:11.261460747Z` | running |
| `samhan-product-service` | `2026-08-05T10:17:39.747773714Z` | `2026-08-05T10:17:43.342187543Z` | running |
| `samhan-partner-service` | `2026-07-23T13:40:46.849980189Z` | `2026-08-05T10:02:11.264451964Z` | running |
| `samhan-dc-config-service` | `2026-07-29T15:14:34.210417664Z` | `2026-08-05T10:02:11.2910491Z` | running |

## 판정 요약

| 항목 | 판정 | 근거 / 캡처 |
|---|---|---|
| ① 편집자 MANAGER → 수신자 MASTER 알림 도달 | PASS | 화면 저장 201 응답 및 `03-manager-collab-saved.png`; MASTER 알림센터 `04-master-notification-center.png`, 벨 `05-master-notification-bell.png` |
| ② `notification_center` 대조 | PASS | 아래 SQL 원문 및 결과: R60 active 1건, target은 개발마스터 |
| ③ 편집자 본인 알림 제외 | PASS | 새 브라우저 컨텍스트의 MANAGER 알림센터에서 R60 본문 0회, `06-manager-notification-center.png` |
| ④ 세트·거래처 전역DC 화면 발화 조건 | 부분 확인 / riUsage 실행 미실시 | 세트 생성 화면 `11-product-create-set-form.png`, 기존 세트·구성품 `12-existing-bundle-components-row.png`, 전역DC 화면 `09-partner-dc-config-top.png` |
| ⑥ riUsage 실제 일마감 판정 | 미실시 | 일마감 상세 조회가 2026-08-01/03/05 모두 `상세 전표가 없습니다`; 마감 실행은 DB 쓰기이므로 수행하지 않음. `10-daily-closing-dates-probe.png` |

## ① 협업 수정 → 올바른 수신자 알림

1. `dev_manager / dev_p05_pass!`로 로그인했다.
2. 판매전표 `2026/08/05-9`에서 협업 수정을 열었다.
3. 메모를 `R60 LIVE QA COLLAB EDIT 2026-08-05 23:55`로 변경하고 수정 사유를 입력했다.
4. 화면의 `수정완료되었습니다.`를 확인했다.
5. 네트워크에서 `POST /api/v1/slips/5cdffe64-b7f5-43f1-b176-0e6e6c9d311c/collab/edits` 응답 `201`을 확인했다.
6. 새 브라우저 컨텍스트에서 `dev_master / dev_p05_pass!`로 로그인해 알림센터와 알림 벨에서 다음 1건을 확인했다.

```text
[전표 수정] 2026/08/05-9
[DEV-SEED] 개발매니저 님이 전표 2026/08/05-9 를 수정완료했습니다.
변경: memo: R59 LIVE QA COLLAB EDIT 2026-08-05 23:20 → R60 LIVE QA COLLAB EDIT 2026-08-05 23:55
```

## ② notification_center 읽기 대조

사용자 ID 확인 SQL:

```sql
SELECT login_id,display_name,id
FROM accounts
WHERE login_id IN ('dev_master','dev_manager');
```

결과:

```text
dev_master  [DEV-SEED] 개발마스터  a0000000-0000-0000-0000-000000000001
dev_manager [DEV-SEED] 개발매니저  a0000000-0000-0000-0000-000000000003
```

알림 원문 SQL (`notification_db`):

```sql
SELECT id,target_user_id,title,body,created_at,is_deleted,deleted_at
FROM notification_center
WHERE body LIKE '%R60 LIVE QA COLLAB EDIT 2026-08-05 23:55%'
ORDER BY created_at DESC;
```

결과: `id=f1e7b93b-f773-46ec-88f3-0b621329dead`, `target_user_id=a0000000-0000-0000-0000-000000000001`, `title=[전표 수정] 2026/08/05-9`, `is_deleted=false`, `created_at=2026-08-05 23:41:11.759737`.

활성·중복 대조 SQL:

```sql
SELECT COUNT(*) AS active_r60_rows,
       COUNT(DISTINCT target_user_id) AS targets
FROM notification_center
WHERE is_deleted=false
  AND body LIKE '%R60 LIVE QA COLLAB EDIT 2026-08-05 23:55%';
```

결과: `active_r60_rows=1`, `targets=1`.

`auth_db`와 `notification_db`는 별도 PostgreSQL database라 cross-database JOIN은 사용하지 않고, 위처럼 계정 ID와 알림 row를 각각 읽어 대조했다.

## ③ 편집자 자기 알림 제외

R60 저장 후 새 브라우저 컨텍스트로 `dev_manager`에 로그인했다. 화면 헤더는 `MANAGER`였고, 알림센터 본문에서 R60 식별 문자열 출현 횟수는 `0`이었다. 기존 알림(개발마스터가 편집한 R59 알림)은 별도 존재하므로 전체 알림 건수만으로 판정하지 않고 R60 본문을 정확히 대조했다.

## ④·⑥ 세트 riUsage 및 거래처 전역DC

### 화면에서 확인한 발화 조건

- `기초품목 관리 → 품목 등록` 화면에 `품목 종류: 단일 / 세트`가 있어 세트 품목 생성 경로는 존재한다. 저장하지 않았다.
- `견적품목 관리` 화면에 기존 `TEST-BUNDLE-SET-01`이 노출되고 `세트 · 2`, `구성품`이 표시된다. 즉 실 화면에 세트 마스터와 구성품 2개가 이미 있다.
- `거래처 DC 설정` 화면에 `전체 210건`, 홈멀티DC·상업멀티DC, 유연호스I형·360·4WAY·1WAY·스탠드·디럭스·1등급, 단위처리·특이사항, 행별 `저장`이 노출된다. 전역DC는 실 화면에서 설정 가능한 상태다. 저장하지 않았다.

### riUsage 실제 실행을 미실시한 이유

일마감 화면에서 매출전표 source를 선택하고 날짜를 `2026-08-01`, `2026-08-03`, `2026-08-05`로 각각 조회했으나 세 날짜 모두 `상세 전표가 없습니다`, `모델별 재검증 결과가 없습니다`였다. 따라서 세트/전역DC를 실제 일마감 재검증에 태울 원천 행이 화면에 없었다.

재현 절차:

1. `dev_master` 로그인
2. `회계 → 일마감`
3. `매출전표` 선택
4. 위 세 날짜를 각각 입력
5. 결과: 상세 전표 0건

`마감 실행`은 DB 쓰기를 발생시키므로 이번 라운드의 DB 쓰기 금지 가드레일에 따라 실행하지 않았다. 따라서 riUsage PASS/FAIL을 주장하지 않고 미실시로 판정한다.

## 새 파일 목록

이번 라운드에 동일 디렉터리에 작성한 파일은 다음과 같다.

- `qa-report.md`
- `01-manager-slip-detail-before.png`
- `02-manager-collab-edit-open.png`
- `03-manager-collab-saved.png`
- `04-master-notification-center.png`
- `05-master-notification-bell.png`
- `06-manager-notification-center.png`
- `07-product-catalog.png`
- `08-estimate-items.png`
- `09-partner-dc-config.png`
- `09-partner-dc-config-top.png`
- `10-daily-closing-2026-08-05-bundle-riusage.png`
- `10-daily-closing-dates-probe.png`
- `11-product-create-set-form.png`
- `12-existing-bundle-components-row.png`

저장소 경로는 `docs/qa/874-riusage-r60-real-qa/`이며, 지정된 `clients/desktop/playwright/874-riusage-real-qa.spec.ts`는 수정하지 않았다.
