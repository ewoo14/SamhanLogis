재배포 컨테이너 시각 — `samhan-slip-service`: Created `2026-08-05T14:17:51.44867138Z`, StartedAt `2026-08-05T14:17:55.498813686Z`

재배포 컨테이너 시각 — `samhan-notification-service`: Created `2026-08-05T14:17:51.447681933Z`, StartedAt `2026-08-05T14:17:55.497570987Z`

# R59 라이브QA 보고서 — PR #1057 · 이슈 #874

## 배포 확인

- HEAD: `d1ac4d802`
- Gradle `:services:slip-service:bootJar :services:notification-service:bootJar`: 성공
- 두 이미지 build 및 `up -d --no-deps` 재기동: 성공
- api-gateway: 재배포하지 않음

## 실측 대상

- 계정: `dev_master`
- 전표: `2026/08/05-9` (판매전표, 기존 R57 실표본)
- 전표 UUID는 사용자 화면에 표시하지 않고 내부 요청 대조에만 사용함.
- renderer: `http://localhost:5219`, `VITE_API_BASE_URL=http://localhost:8080`, mock OFF
- 브라우저: Playwright `chromium` Node 드라이버

## 판정 요약

| 항목 | 판정 | 근거 / 캡처 |
|---|---|---|
| ① 협업 수정 알림이 dev_master 알림센터에 표시 | **FAIL** | 실 협업 수정은 201로 성공했으나 알림센터에는 해당 행이 없음. [05-notification-history-after-save-1.png](05-notification-history-after-save-1.png), [06-notification-bell-after-save-1.png](06-notification-bell-after-save-1.png) |
| ② 저장 응답이 빠름 | **PASS** | `POST .../collab/edits` 201, **234ms**. 외부 vendor 발송 대기는 관찰되지 않음. [04-after-save-1.png](04-after-save-1.png) |
| ③ 중복 없음 | **PASS** | 첫 저장으로 revision 1건·notification_center 1행. 같은 값으로 두 번째 저장 시 POST 미발생, 화면에 `변경된 필드가 없습니다.` 표시. [08-second-identical-save.png](08-second-identical-save.png) |
| ④ DB 대조 | **PASS(행 생성), FAIL(수신자 계약)** | 아래 SQL 결과: 동일 source_ref_id 행 1건이지만 target_user_id는 dev_master가 아닌 개발매니저. |
| ⑤ 저장 차단/지연 없음 | **PASS** | 협업 수정 저장 201/234ms, 화면 반영 및 revision 증가 확인. 단, 알림 수신자 오류는 ① FAIL로 별도 판정. [04-after-save-1.png](04-after-save-1.png) |
| ⑥ 세트 riUsage·거래처 전역DC | **미실시** | 실 화면에서 기존 품목 `삼성 윈드프리 9평형`과 거래처 `대한화물서비스(주)`는 확인했으나, 이번 라운드는 ① 알림 결함 재검증을 우선했고 해당 조건을 새로 생성·변경하는 추가 저장은 수행하지 않음. |

## 시나리오 상세

첫 번째 협업 수정은 메모를 `R57 live QA ...`에서 `R59 LIVE QA COLLAB EDIT 2026-08-05 23:20`으로 변경하고 저장 사유를 입력했다. 서버 응답은 `201 Created`, 측정 시간은 234ms였다. 응답 changeSet에는 메모 변경 1건이 포함됐다.

두 번째로 동일한 값과 동일한 사유를 실 화면에서 다시 저장했다. 추가 `POST /collab/edits`는 발생하지 않았고, 폼은 `변경된 필드가 없습니다.`를 표시했다. 따라서 동일 저장으로 중복 revision/알림을 만들지 않는 동작은 확인했다.

## DB 읽기 조회

쓰기 없이 `samhan-postgres`의 `notification_db`에 다음 조회만 수행했다.

```sql
SELECT id, channel, severity, target_user_id, target_role, title, body,
       source_service, source_ref_id, created_at, read_at, is_deleted
FROM notification_center
WHERE source_ref_id = '578ea683-c7e6-46b2-80ea-c2701d4354e1'
ORDER BY created_at DESC;
```

결과:

```text
id                                      | channel   | severity | target_user_id                            | title              | source_service | source_ref_id                           | is_deleted
34365f7f-7f38-4e0c-bf23-f0ccf5dd1005    | MESSENGER | INFO     | a0000000-0000-0000-0000-000000000003      | [전표 수정] 2026/08/05-9 | slip-service | 578ea683-c7e6-46b2-80ea-c2701d4354e1 | f
```

본문은 `[DEV-SEED] 개발마스터 님이 전표 2026/08/05-9 를 수정완료했습니다.`였으나, `target_user_id`는 현재 로그인한 `dev_master`(`...0001`)가 아니라 `...0003` 개발매니저였다. 동일 source ref의 active 행 수는 `1`이다.

## 새 파일 목록

- `docs/qa/874-riusage-r59-real-qa/qa-report.md`
- `docs/qa/874-riusage-r59-real-qa/01-initial.png`
- `docs/qa/874-riusage-r59-real-qa/02-slip-detail.png`
- `docs/qa/874-riusage-r59-real-qa/03-collab-form.png`
- `docs/qa/874-riusage-r59-real-qa/04-after-save-1.png`
- `docs/qa/874-riusage-r59-real-qa/05-notification-history-after-save-1.png`
- `docs/qa/874-riusage-r59-real-qa/06-notification-bell-after-save-1.png`
- `docs/qa/874-riusage-r59-real-qa/08-second-identical-save.png`
- `docs/qa/874-riusage-r59-real-qa/live-observations.txt`
- `clients/desktop/test-results/r59-vite.out.log`
- `clients/desktop/test-results/r59-vite.err.log`

`clients/desktop/playwright/874-riusage-real-qa.spec.ts`는 변경하지 않았다. DB 쓰기와 실제 vendor 발송은 수행하지 않았다.
