```text
git -C . rev-parse --show-toplevel     # D:/dev/Samhan-Public/.claude/worktrees/w1057
git -C . branch --show-current         # feat/874-set-riusage-global-dc
git -C . rev-parse HEAD                # e013fbd584176a1b56f4c40e02958bda048e4d47 이어야 함
```

# R39 SOL 적대검증 — 협업 잠금·대시보드 재수렴

## 최종 판정

**머지 비권고. 사용자 도달 결함 1건이 있다.**

R37의 lost update, 협업 구역명, 대시보드 PageCode 불일치 자체는 R38에서 닫혔다. 그러나 R38이
전표 행에 `PESSIMISTIC_WRITE`를 얻은 뒤, 같은 저장 트랜잭션 안에서 수신자 조회와 푸시 전송까지
동기 실행한다. 이 외부 호출이 3초 이상 지연되는 동안 두 번째 사용자의 정상 협업 저장은 행 잠금을
기다리다가 실패할 수 있고, 잠금 실패는 협업 409가 아니라 일반 500으로 내려간다.

따라서 질문에 대한 답은 **“있다”**이다. 수정 지시서는
`docs/dev-reports/2026-08-05-874-r39-fix-directive.md`에 분리했다.

## 증거 무결성 및 실행 환경

### 착수 무결성

| 필드명 | 실측값 |
|---|---|
| `integrity_toplevel` | `D:/dev/Samhan-Public/.claude/worktrees/w1057` |
| `integrity_branch` | `feat/874-set-riusage-global-dc` |
| `integrity_head_start` | `e013fbd584176a1b56f4c40e02958bda048e4d47` |
| `integrity_expected_head` | `e013fbd584176a1b56f4c40e02958bda048e4d47` |
| `integrity_status_before` | clean |
| `comparison_r37_head` | `e28e0fd606a8c2f0f202331714c1e45017abc524` |

HEAD가 요구값과 일치했으므로 검증을 계속했다.

### 컨테이너 필드

| 필드명 | 실측값 |
|---|---|
| `slip_service_name` | `/samhan-slip-service` |
| `slip_service_created` | `2026-08-05T02:50:44.702471161Z` |
| `slip_service_started` | `2026-08-05T02:51:02.147121178Z` |
| `api_gateway_name` | `/samhan-api-gateway` |
| `api_gateway_created` | `2026-08-05T02:50:37.64267995Z` |
| `api_gateway_started` | `2026-08-05T02:50:51.017973805Z` |
| `deployed_code` | `#1045` |
| `r38_backend_deployed` | `false` |
| `container_redeploy_or_stop` | `없음` |
| `database_write` | `없음` — SELECT만 실행 |

Docker가 gateway `created` 끝의 0을 생략해 `.64267995Z`로 출력했다. 제시된
`.642679950Z`와 같은 timestamp다. R38 백엔드는 이 스택에 없으므로 잠금 경합을 배포본에서 실행
확인했다고 쓰지 않는다.

### 프런트 필드

| 필드명 | 실측값 |
|---|---|
| `vite_config` | `clients/desktop/vite.renderer.dev.config.ts` |
| `vite_url` | `http://127.0.0.1:5178` |
| `vite_mode` | mock, `--strictPort`, version `2026/08/05-39` |
| `browser` | 저장소의 Playwright Chromium으로 실제 렌더링 |
| `cleanup` | 검증용 5178 Vite만 종료, 공유 컨테이너는 유지 |

### 실행 결과

| 명령/검증 | 결과 |
|---|---|
| `.\gradlew.bat :services:slip-service:test --console=plain` | 통과, 4분 41초, 210 suites / 1,569 tests / failures 0 / errors 0 / skipped 0 |
| `npx vitest run src/renderer/components/collab/SlipCollaborationPanel.coedit.test.tsx` | 통과, 4/4 |
| `npm run typecheck` | 184초 검증 제한에 도달해 결과 없음; 프로세스 잔류 없음, 결함 근거로 사용하지 않음 |
| 역할별 대시보드 렌더 | 7/7 역할 확인 |
| 전체 Playwright 게이트 | 실행하지 않음 — 기존 실측 15분 제한 |

### R38 동시성 증거의 한계

`SlipCollabIT.java:454-470`과 `:488-502`는 첫 `mvc.perform`이 끝난 뒤 둘째 요청을 호출한다.
즉 같은 필드 409와 다른 필드 병합의 **순차 직렬화 결과**는 증명하지만, 두 요청이 실제로 같은 행
잠금을 두고 기다리는 실행은 아니다. R38 보고서의 “동시 저장” 문구를 실제 동시 요청 실측으로
간주하지 않았다. 이는 검증 품질 평가가 아니라 런타임 증거를 순차 테스트로 바꾸어 읽지 않기 위한
증거 무결성 한정이다.

## 결함 1 — P1: 정상 협업 저장이 동기 알림 동안 행 잠금에 막혀 일반 500이 될 수 있다

### 사용자 화면 동선

1. 사용자 A와 B가 같은 DRAFT 전표의 `협업 수정`을 연다.
2. A는 메모, B는 배송지처럼 서로 다른 필드를 편집한다.
3. A가 `수정완료`를 누르면 서버는 전표 행의 쓰기 잠금을 얻고 전표를 저장한다.
4. A 요청은 잠금을 가진 채 기여자 식별과 푸시 전송을 순차 실행한다.
5. 그 사이 B가 `수정완료`를 누르면 저장이 행 잠금을 기다린다.
6. 외부 auth/notification 호출이 JPA 잠금 제한 3초를 넘기면 B는 필드 병합 201이나 stale 409가
   아니라 `서버 내부 오류가 발생했습니다.` 500을 받을 수 있다. A도 응답을 외부 호출 종료까지 기다린다.

이 경로는 `협업 수정` 화면의 실제 POST에서 도달한다. 현재 OUTBOUND DRAFT 전표도 **116건**이다.

### 코드 원문 좌표

- `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java:58-60` —
  협업 저장 행에 `PESSIMISTIC_WRITE`를 얻는다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/collab/SlipCollabEditService.java:62-73` —
  바깥 `@Transactional` 안에서 잠금 저장 경로를 호출한다.
- 같은 파일 `:83-88`, `:118-137` — 트랜잭션이 끝나기 전에 수신자 resolve와 푸시를 순차 호출한다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/AuthAccountLookupClient.java:41-47`,
  `:79-86` — connect 2초/read 3초 외부 조회다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/NotificationClient.java:54-60`,
  `:160-166` — connect 2초/read 3초 외부 POST다.
- `services/slip-service/src/main/resources/application.yml:36-39` — JPA 잠금 제한은 3초다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/GlobalExceptionHandler.java:113-131` —
  낙관적 락만 409로 매핑하고, 비관적 잠금 실패·timeout은 일반 예외의 500으로 폴백한다.

잠금은 편집 화면을 여는 시점에는 얻지 않는다. 저장 POST에서만 얻으므로 “편집 화면까지 잠김”은
발견하지 않았다. 문제는 저장 구간의 경계가 외부 부수효과까지 넓다는 것이다.

### 사용자 영향

- 서로 다른 필드의 정상 병합도 dependency 지연에 따라 체감 정지 뒤 500이 될 수 있다.
- 같은 필드의 패배자도 의도한 최신 확인 409 대신 먼저 잠금 500을 받을 수 있다.
- 500 문구는 “어느 필드가 바뀌었는지/다시 확인해야 하는지”를 알려 주지 못한다.
- 첫 저장 사용자도 수신자 수만큼 순차 외부 호출이 끝날 때까지 `수정완료` spinner를 기다린다.

R38 백엔드는 미배포라 위 경합의 실제 HTTP 시간을 실행 측정하지 않았다. 판정 근거는 트랜잭션 경계,
잠금 설정, 외부 client timeout, 예외 매핑의 코드 원문이다.

## 첫 각도 — 필드 baseline·잠금 전수 결과

### `expectedBefore` 미전송 호출부

**생산 호출부 누락 0건이다.**

| 경계 | 생산 호출부 수 | 결과 |
|---|---:|---|
| 데스크톱 `commitSlipCollabEdit` | 1 | `SlipCollaborationPanel.tsx:200-217`이 변경 필드마다 `before/after` 전송 |
| slip-service `SlipService.applyOverlayPatchBatch` | 1 | `SlipDocumentCollaborationPort.java:137-140`이 `patches`와 `expectedBefore` 함께 전달 |
| legacy `applyChangeSet` | 1 | 같은 parser를 거치며 `before/after` 누락 입력은 400으로 조기 거부 |
| desktop mock POST | 1 | `mock.ts:3683-3697`이 전 필드 baseline 선검증 후 mutation |
| 테스트 fixture | 전수 | port/unit/IT의 적용 입력이 `before/after` 계약으로 갱신됨 |

`rg`에서 accounting/groupware/partner-order 서비스의 동명 메서드도 나왔지만 서로 다른 서비스와
별도 시그니처이며, R38의 `SlipService.applyOverlayPatchBatch` 호출부가 아니다.

### 정상 의미론

| 질문 | 판정 | 근거 |
|---|---|---|
| 서로 다른 필드 저장 | 잠금 획득 뒤에는 병합 | 최신 row에서 대상 필드 baseline만 비교; 순차 IT 2회 201 |
| 같은 필드 stale | 409 | mutation 전 `SLIP_OPTIMISTIC_LOCK_CONFLICT`; 최신 값 보존 |
| 409 안내 | 이해 가능 | `전표 협업 수정 대상 필드가 이미 변경되었습니다. 최신 내용으로 다시 확인해 주세요.`가 패널 `role=alert`에 그대로 표시 |
| 원격 갱신 뒤 draft baseline | 보존 | 편집 진입 시 `editBaselineRef` 1회 캡처, realtime invalidate가 ref를 덮지 않음 |
| 편집 화면 잠금 | 없음 | 잠금 query는 저장 API에서만 호출 |
| 잠금 대기/실패 | **결함** | 위 결함 1 — 외부 호출까지 잠금 유지, timeout은 일반 500 |

## 두 번째 각도 — 대시보드 역할별 재계수

현재 `role_page_permissions`의 두 PageCode와 프런트 유형 guard를 교차하고, 같은 로컬 Vite에서 7개
역할을 각각 새로 렌더했다.

| 역할 | 판매 유형 허용 | `sales.slip.list` VIEW | 판매 카드 | 판매 빠른 이동 | 구매 유형 허용 | `purchases.slip.list` VIEW | 구매 빠른 이동 |
|---|---:|---:|---:|---:|---:|---:|---:|
| MASTER | 예 | 예 | 보임 | 보임 | 예 | 예 | 보임 |
| MANAGER | 예 | 예 | 보임 | 보임 | 예 | 예 | 보임 |
| SALES | 예 | 예 | 보임 | 보임 | 아니오 | 아니오 | 숨김 |
| WAREHOUSE | 아니오 | 아니오 | 숨김 | 숨김 | 예 | 예 | 보임 |
| ACCOUNTANT | 아니오 | 예 | 숨김 | 숨김 | 아니오 | 예 | 숨김 |
| DISPATCH | 아니오 | 아니오 | 숨김 | 숨김 | 아니오 | 아니오 | 숨김 |
| INVENTORY | 아니오 | 예 | 숨김 | 숨김 | 아니오 | 예 | 숨김 |

- 판매 조회 가능 역할은 3명/3역할이며 카드와 빠른 이동이 모두 유지됐다.
- 판매 조회 불가 역할은 R37의 4명/4역할이며 카드와 빠른 이동이 모두 숨었다.
- 구매 조회 가능 역할은 3명/3역할이며 구매 빠른 이동이 유지됐다. 이 화면에는 구매 통계 카드가 없다.
- 판매 카드가 숨은 계정에서도 저재고·미확인 메시지·결재 대기는 거짓 `0`이 아니라 모두 `준비중`이다.
- `DashboardPage.tsx:23-24`, `AppLayout.tsx:557-558`, `routes/index.tsx:428-445,563-570,582-618`은
  모두 PageCode VIEW와 유형 guard의 교집합을 사용한다.

## 세 번째 각도 — 전 라우트·비전표 메뉴 재계수

R37 HEAD `e28e0fd60`부터 R39 HEAD까지 `AppLayout.tsx`와 `routes/index.tsx`의 diff는 **0파일/0줄**이다.
현재 권한 교집합을 다시 적용한 8개 판매·구매 route element와 전체 사이드바 수는 다음과 같다.

| 역할 | 화면 수용 route / 8 | 실제 작동 기능 감소 | 사이드바 전체 링크 | R37 대비 변화 | 비전표 메뉴 감소 |
|---|---:|---:|---:|---:|---:|
| MASTER | 8 | 0 | 102 | 0 | 0 |
| MANAGER | 8 | 0 | 94 | 0 | 0 |
| SALES | 4 | 0 | 19 | 0 | 0 |
| WAREHOUSE | 4 | 0 | 17 | 0 | 0 |
| ACCOUNTANT | 0 | 0 | 58 | 0 | 0 |
| DISPATCH | 0 | 0 | 13 | 0 | 0 |
| INVENTORY | 0 | 0 | 15 | 0 | 0 |

사이드바 수는 `홈`·`알림 내역` 고정 링크를 포함한다. R38이 바꾼 대시보드 빠른 판매·구매 이동 수는
역할 순서대로 `2, 2, 1, 1, 0, 0, 0`이며 R37 후 수와 같다. 따라서 R37의 **작동 라우트 감소 0건,
비전표 메뉴 감소 0건** 판정은 유지된다.

## R37 3건 전후 대조

| R37 결함 | R37 | R38/R39 판정 | 근거 |
|---|---|---|---|
| 1. 협업 저장이 최신 직접/협업 수정을 조용히 덮음 | 미종결, OUTBOUND DRAFT 116건 | **원 결함 닫힘. 인접 신규 결함 1건** | 필드 baseline과 저장 잠금으로 same-field 409/different-field 병합. 다만 잠금이 동기 알림까지 유지돼 정상 저장 500 가능 |
| 2. 협업 폼 landmark가 `수정` | 미종결 | **닫힘** | `SlipCollaborationPanel.tsx:431`은 `aria-label="협업 수정"`; 옛 exact label 0 |
| 3. 대시보드가 PageCode를 빠뜨려 무권한 판매 카드 노출 | 미종결, 4명 | **닫힘** | PageCode와 유형 guard 교집합. 3개 허용 역할 보임, 4개 비허용 역할 숨김 |

## 이 라운드가 보지 않은 것

- 개발책임자가 A안으로 분리한 시나리오 2~5(회계 배분·전기).
- R38 백엔드의 배포본 실제 동시 HTTP 경합. 공유 스택은 `#1045`라 재배포하지 않았다.
- 전체 Playwright 게이트와 장시간 부하/성능 시험.
- 다른 트랙 `#1045`·`#1061`·`#1063`·`#1066`의 파일과 동작.
- 전표 협업 외 accounting/groupware/partner-order의 별도 collaboration 계약.
- 모바일 화면과 알림 vendor의 실제 전달 성공률.

## 최종 답

> R38이 바꾼 표면에서, 실 사용자가 화면으로 도달할 수 있는데 잘못 동작하는 것이 있는가.

**있다.** 필드별 baseline은 lost update를 막지만, 저장 행 잠금이 수신자 조회와 푸시 전송까지 유지되어
두 번째 정상 협업 저장이 3초 대기 뒤 일반 500이 될 수 있다. R37의 접근성·대시보드·라우트/메뉴 결함은
재수렴했으나 이 사용자 결함이 남아 있으므로 **머지 비권고**다.
