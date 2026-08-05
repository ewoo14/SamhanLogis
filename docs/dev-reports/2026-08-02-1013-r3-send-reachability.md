# PR #1059 재수렴 적대검증 R3 — 배차문자 발송 도달성

## 0. 결론

**판정: BLOCKING / 재수렴 실패.** 최근 fix는 mock/FE 안에서 `화면 건수 = buildSendEntries 길이`를 맞췄지만, 실 데이터가 preview에 도달하는 경로와 blocked 가드는 여전히 연결되지 않았다. 실 DB 활성 OUTBOUND 2,303건 중 전화번호 보유 1,911건은 현재 notification-service의 SMS 어댑터까지 **0건** 도달한다. 반대로 blocked 조회는 런타임 Noop이라, 실제 차단 행이 생기면 막아야 할 대상을 통과시킬 구조다.

본 라운드에서 실제 SMS 발송, send endpoint 호출, Docker 이미지 재빌드, DB 쓰기는 하지 않았다. dev/mock의 `SENT` 또는 `SUCCESS`는 실전달 성공으로 세지 않았다.

## 1. fix가 건드린 표면

`git log --oneline -15`에서 확인한 최근 fix 3건은 다음과 같다.

1. `755579b34` — 화면 `sendableCount`를 `preview.unmapped + recipientPhone 보유`로 바꾸고, 실제 payload 생성 함수 `buildSendEntries`와 모집단을 통일. 결과 상세를 항상 펼침.
2. `0ed84a4c0` — desktop mock preview의 미매핑 1건에 `message`, `recipientPhone`을 추가하고 mock send가 요청 entries를 결과로 되비추도록 변경. `room:`만 mock에서 `BLOCKED` 처리.
3. `d7bb8eabb` — `DispatchSmsPage.test.ts`의 전표번호 3건을 실제 `yyyy/MM/dd-N` 형식으로 정정.

재수렴 표면은 아래 전체다.

- FE: `DispatchSmsPage.tsx`의 preview 복원/건수/entry 생성/2중 확인/send mutation/결과 상세.
- FE 계약: `dispatchSmsApi.ts`의 preview/send DTO.
- mock: `mock.ts`의 preview/send 응답과 `DispatchSmsPage.test.ts` fixture.
- BE preview: `DispatchBatchPreviewService`, `SlipServiceClient`, 단톡방 매핑, blocked lookup.
- BE send: `DispatchBatchSendRequest` Bean Validation, `DispatchBatchSendService`, `NotificationService`/SMS adapter 진입.
- 실 데이터: `slip_db.slips`, `notification_db.partner_chat_room_mappings`, `partner_db.blocked_partners`, `notification_db.notification_requests` 및 발송 감사.
- 레거시 기준: `tools/legacy-gas/배차안내문자/Code.js`, `Index.html`.

## 2. 실측 기준과 실행 원문

공유 Postgres를 SELECT만 수행해 활성(`is_deleted=false`) OUTBOUND를 셌다.

```text
 total | no_partner_code | no_phone | with_phone | dates
-------+-----------------+----------+------------+-------
  2303 |            2003 |      392 |       1911 |    87
```

전화번호 보유 행은 두 날짜에만 존재했다.

```text
 slip_date  | body_entries | invalid_partner_code_entries
------------+--------------+------------------------------
 2026-06-07 |            3 |                            3
 2026-06-08 |         1908 |                         1908
```

단톡방/차단 실 DB 원문은 다음과 같다.

```text
active mappings=112, active blocked rows=0, outbound slips=2303
```

```text
 total_rows | active_rows | deleted_rows
------------+-------------+--------------
          0 |           0 |            0
```

현재 DB에 저장된 실제 배차 batch 요청/감사도 0건이다.

```text
 dispatch_batch_rows | status_sent | status_failed | distinct_recipients
---------------------+-------------+---------------+---------------------
                   0 |           0 |             0 |                   0
```

이 0은 “실전달 성공/실패” 판정이 아니라, `DISPATCH_BATCH` 요청 엔티티 자체가 생성된 적 없다는 뜻이다.

선택 테스트 실행 원문:

```text
> Task :services:notification-service:test

BUILD SUCCESSFUL in 22s
18 actionable tasks: 1 executed, 17 up-to-date
```

```text
✓ DispatchSmsPage.test.ts > 배차문자 발송 모집단 > 화면 건수와 실제 요청이 같은 미매핑·인수자번호 대상 집합을 사용한다
Test Files  1 passed (1)
Tests       1 passed (1)
```

이 GREEN은 mock/단위 경로의 계약만 증명한다. 실제 slip/blocked client bean 연결은 증명하지 않는다.

## 3. 각도 1 — 화면 건수와 실제 요청 대상 건수

### 3.1 FE 내부 수렴

`countSendableEntries`와 `buildSendEntries`는 모두 `preview.unmapped`에서 truthy `recipientPhone`만 고른다(`DispatchSmsPage.tsx:74-95`). 따라서 **preview가 이미 주어졌다는 전제**에서는 화면 수와 HTTP body entry 수의 차이는 0건이다. mock도 화면 1건/body 1건으로 GREEN이다.

### 3.2 실 데이터 도달성

그러나 현재 HEAD에는 실제 `/internal/slips/outbound` 호출 구현이 없다. 등록된 구현은 `NoopSlipServiceClient`뿐이고, 호출 시 `IllegalStateException("/internal/slips/outbound client is not configured")`을 던진다(`NoopSlipServiceClient.java:18-29`). 따라서 실 DB 2,303건은 preview 화면 모집단에 **0건 도달**한다.

DB를 현행 preview/FE 규칙으로 읽기 전용 투영하면 2,303건 모두 단톡방 미매핑이고, 전화번호 보유 1,911건이 화면/send body 후보다. 하지만 이 1,911건은 모두 `partnerCode`가 null/blank다. FE preview 타입은 `partnerCode: string`으로 선언하지만 BE preview는 null을 허용하고(`DispatchBatchPreviewService.java:73-81`), send DTO는 entry마다 `@NotBlank partnerCode`를 요구한다(`DispatchBatchSendRequest.java:22-38`). Controller가 `@Valid`를 적용하므로(`DispatchBatchAdminController.java:70-75`) 전송 서비스 진입 전에 배치 전체가 거절된다.

실 데이터 수치는 다음과 같이 구분해야 한다.

| 날짜/범위 | 화면/body 후보 | 유효한 BE send entry | SMS adapter 도달 | 차이(화면 대비 adapter) |
|---|---:|---:|---:|---:|
| 2026-06-07 | 3 | 0 | 0 | 3 |
| 2026-06-08 | 1,908 | 0 | 0 | 1,908 |
| 전체 87일 | 1,911 | 0 | 0 | 1,911 |
| 최신 데이터일 2026-08-01 | 0(4건 모두 번호 없음) | 0 | 0 | 0 |

즉 최근 fix의 “화면 N = 실제 요청 N”은 **FE가 만들려는 body 길이**까지만 참이고, 실 SMS 요청 도달성 기준으로는 1,911건 불일치다.

## 4. 각도 2 — 수신번호 없는 대상

실 DB에서는 활성 OUTBOUND 2,303건 중 392건이 번호 없음이다. 최신 데이터일 2026-08-01은 4/4건이 번호 없음이며 화면/send body 후보는 0건이다.

현행 FE는 번호 없는 unmapped 행을 preview 목록에는 남기지만 `buildSendEntries`에서 `continue`하여 개별 결과 없이 제외한다(`DispatchSmsPage.tsx:81-88`). 배치 전체를 실패시키지는 않는다. 다만 행별 “번호 없음/미발송” 상태가 아니라 상단 일반 문구만 있어 운영자가 어느 행이 빠졌는지 결과 상세에서 확인할 수 없다.

레거시 GAS 원문은 다음과 같다.

- 번호 추출 실패 시 빈 문자열 유지: `Code.js:299-305`.
- 그래도 결과 행을 버리지 않고 `인수자 번호`, `발송멘트`, `단톡방`을 포함해 push: `Code.js:381-397`.
- 단톡방과 번호가 모두 없으면 행별 `N_<index>` 그룹으로 유지: `Index.html:1154-1168`.
- 빈 연락처 셀도 결과 표에 렌더: `Index.html:1303-1312`.
- GAS 자체에는 SMS/알리고 전송 호출이 없고 선택 셀 TSV 복사만 존재: `Index.html:880-914`; `Code.js`의 `UrlFetchApp.fetch`는 인증/Notion 저장·조회뿐이다(`Code.js:43,509,537,594,629,671`).

따라서 레거시와 맞는 안전 동작은 **번호 없는 단건은 외부 전송 대상에서 제외하되, 행을 명시적 오류/미발송 상태로 남기고 나머지 건은 계속 처리**하는 것이다. 전체 배치 실패가 레거시 동작은 아니다. 현행은 “전체 실패 아님”은 맞지만 “조용히 제외”에 가까워 가시성이 불완전하다.

## 5. 각도 3 — 중복 발송 경로

### 5.1 같은 전표

실 DB의 `(slip_date, slip_no)` 중복은 0그룹/추가 0행이다.

```text
 duplicate_date_slip_groups | duplicate_extra_rows
----------------------------+---------------------
                          0 |                    0
```

현행 FE는 unmapped 배열을 그대로 순회하며 slipNo 기준 dedupe를 하지 않는다(`DispatchSmsPage.tsx:81-88`). 따라서 upstream이 같은 전표를 중복 반환하면 그대로 중복 entry가 된다. 또한 send endpoint에는 idempotency key나 동일 요청 재전송 방지가 없어 같은 payload를 다시 POST하면 재처리된다. 이번 라운드는 실제 POST를 금지했으므로 재전송 실행 검증은 하지 않았다.

### 5.2 같은 수신번호 과다 발송 — 실 데이터에서 더 큰 위험

2026-06-08의 전화번호 보유 1,908건은 distinct 수신번호 1개, 2026-06-07의 3건도 distinct 수신번호 1개다. 현행은 전표 1건당 SMS entry 1개라, partnerCode 단절만 고치면 같은 번호에 각각 1,908건/3건을 요청할 수 있다.

레거시는 단톡방이 없으면 같은 인수자 번호를 그룹 키로 사용하고(`Index.html:1154-1168`), 그룹의 여러 라인을 하나의 병합 문구로 만든다(`Index.html:1170-1188`). 따라서 현행의 전표별 entry는 레거시 수신자 그룹 단위와 다르다. 실 DB 기준 잠재 초과 요청은 2026-06-08에 1,907건, 2026-06-07에 2건이다. 현재는 preview/validation 단절 때문에 실제 발송 0건이지만, 선행 단절을 고치면 즉시 오발송 위험으로 전환된다.

## 6. 각도 4 — blocked 판정

레거시는 결과 조립 전에 거래처명 정규화 blocklist를 만들고(`Code.js:161-168`), 거래처가 blocklist에 있으면 번호/단톡방 유무와 무관하게 `발송금지 업체입니다.` 오류 행으로 만들고 계속한다(`Code.js:269-293`).

현행은 두 겹으로 실패한다.

1. preview는 단톡방 매핑이 없는 행을 먼저 unmapped로 보내고 continue하므로 blocked 조회 자체를 하지 않는다(`DispatchBatchPreviewService.java:83-94`). 실제 SMS 후보는 바로 이 unmapped 집단이므로 화면의 `blockedCount`는 SMS 후보의 차단 수가 아니다.
2. notification-service의 유일한 런타임 구현은 항상 `false`를 반환하는 `NoopBlockedPartnerLookupClient`다(`NoopBlockedPartnerLookupClient.java:9-27`). send 서비스가 재확인해도 실제 partner DB를 읽지 않는다(`DispatchBatchSendService.java:95-109`). lookup 예외도 false를 유지하여 전송 쪽으로 진행한다(`DispatchBatchSendService.java:96-103`).

mock도 positive blocked 계약을 검증하지 못한다. preview의 `P-002 blocked=true`는 매핑 집단이라 FE SMS entry에서 제외되고, mock send는 partnerCode가 아니라 `recipientPhone.startsWith('room:')`만 차단한다(`mock.ts:11686-11735`). 최근 fix의 정상 FE 요청은 `room:`을 만들지 않는다.

실 `partner_db.blocked_partners`는 전체 0행/활성 0행이라 이번 DB에서 “막혀야 할 실제 행” 수는 0건이며, “막히면 안 되는 행을 잘못 막은 수”도 0건이다. 그러나 이는 blocked 가드 정상성 증거가 아니다. 활성 차단 행이 추가되는 순간 현행 Noop은 0건을 막는다. 따라서 positive blocked 판정은 **미구현**이다.

## 7. 최종 판정

### 발송되어야 할 것이 발송되지 않는가

그렇다. 실 DB 기준 전화번호 보유 후보 1,911건이 preview client 부재로 화면에 도달하지 않고, DB 직접 투영 기준으로도 전부 partnerCode 필수 검증에 걸려 adapter 도달 0건이다. 현재 저장된 `DISPATCH_BATCH` request/audit도 0건이다.

### 발송되면 안 되는 곳에 발송되는가

현재는 선행 단절 때문에 실 발송 0건이라 관측된 오발송은 없다. 그러나 blocked client가 항상 false이고, 선행 단절 해소 시 같은 번호에 전표별 1,908/3건을 만드는 경로가 있으므로 안전하게 수렴했다고 판정할 수 없다.

### 리뷰 결론

- FE fixture 수준의 모집단 통일: PASS.
- 실 DB → preview 도달: FAIL (2,303 → 0).
- 실 전화번호 후보 → 유효 send/adapter 도달: FAIL (1,911 → 0).
- 번호 없음 개별 가시성: PARTIAL (392건 제외, 행별 미발송 상태 없음).
- 같은 전표 실 DB 중복: PASS (0건), endpoint idempotency: FAIL/미구현.
- 수신번호 그룹 단위 레거시 계승: FAIL (잠재 초과 1,909건).
- blocked 실연결: FAIL (DB positive 표본 0건, 구현은 Noop false).

따라서 PR #1059는 외부 발송 안전성 관점에서 승인할 수 없다.

## 8. 이 라운드가 보지 않은 것

- 실제 SMS/Aligo 전송 및 `/dispatch-batch/send` 실제 POST: 금지 조건 때문에 실행하지 않음.
- Docker 이미지 재빌드/재배포 및 공유 스택 변경: 실행하지 않음.
- 운영 production DB/운영 Aligo delivery receipt: 접근·조사하지 않음. 수치는 현재 공유 dev Postgres 실 행 기준이다.
- 1,911건의 전화번호가 실제 사람에게 귀속되는지: PII를 출력하지 않았고 조사하지 않음. DB에서는 두 날짜 각각 distinct 번호 1개라는 cardinality만 셌다.
- 메시지 본문 완전계승, 하차일/기사번호/주소 포맷의 의미 정합성: 이번 발송 도달성 범위 밖이라 재검증하지 않음.
- 권한/감사 화면 전 범위와 실제 gateway response receipt: 조사하지 않음.

## 9. 새로 만든 파일

- `docs/dev-reports/2026-08-02-1013-r3-send-reachability.md`
