# PR #1115 S12 SOL 재수렴 — 실사용 화면 도달 검증

## 0. 환경 확인

- 검증 HEAD: `fdb653891643d99c4a89b710e1e5f7ecf4d922ae`
- Docker 스택 원본: `C:/dev/Samhan-Public/.claude/worktrees/t1096/infrastructure`
- HEAD 백엔드 빌드·배포 소스: `C:/dev/Samhan-Public/.claude/worktrees/t1110`
- 프런트: t1110에서 mock off로 `http://127.0.0.1:5176`
- API gateway: `http://127.0.0.1:8080`
- partner-order 직접 포트: `http://127.0.0.1:18088`
- 배포 JAR SHA-256: `3489A9467F6D0CBCB49B549C812BA91F402930EAE84A8F7232886663117A2615`
- 최종 컨테이너 이미지: `sha256:16d363039f79f2a2987c61c4dd1add259338b672e92deef493633ca0418f5238`
- 실행 브라우저: Playwright Chromium headless. GUI의 복원 버튼·확인 모달을 실제 클릭했다.

화면 네트워크에서 다음 실 호출을 확인했다. UUID는 증거 JSON에서도 `<uuid>`로 치환했다.

- `GET /api/v1/partner-orders/2026-06-08-1980` → 200
- `GET .../revisions` → 200
- `POST .../revisions/1/restore` → 정상 200, row-lock 경합 409, 권한 전환 403
- `GET .../collab/stream` → 200
- 재접속 뒤 `GET /api/v1/partner-orders/2026-06-08-1980` → 200

중간에 Docker 엔진이 재시작되어 gateway가 한 차례 `ECONNREFUSED`, Eureka 재등록 중 로그인 한 차례 503을 냈다. `docker stop/down`은 실행하지 않았다. t1096의 기존 compose 정의에 `up -d`만 적용해 전 컨테이너를 복구했고, 위 이미지 digest와 partner-order/gateway healthy를 다시 확인한 뒤 최종 core·reconnect 실측을 다시 수행했다. 아래 판정에는 복구 전 중단 실행을 세지 않았다.

## 1. 결론

**도달 결함 1건.** 열린 화면의 권한이 낡은 짧은 구간에서 실제 복원 요청이 403을 받으면, 화면은 권한 문제를 숨기고 `다시 시도`만 안내한다. 재시도로 해결되지 않아 사용자가 조치할 수 없다.

그 밖의 필수 반대급부에서는 정상 복원 오차단 0건, row-lock 실패의 부분 커밋 0건, 구 snapshot 복원 실패 0건을 실측했다.

## 2. 도달 결함

### D1 — 실제 403이 “다시 시도” 일반 문구로 묻힌다

발화 조건을 먼저 센 결과: **1건 발화 / 1건 재현**.

사용자 도달 경계는 열린 화면의 권한 캐시와 요청 시점 인증이 어긋나는 구간이다. `usePermissions`는 권한을 30초 캐시하고, API 요청은 호출 시점 auth provider의 토큰을 다시 읽는다. 따라서 관리자가 역할을 낮추거나 세션 토큰이 갱신된 직후에는 복원 버튼이 잠시 남아 있으면서 서버는 새 권한으로 403을 낼 수 있다.

라이브에서는 MASTER 권한으로 버전 이력을 연 뒤 요청 토큰을 DISPATCH 토큰으로 갱신했다. 화면의 `이 시점으로 복원`과 확인 모달을 실제 클릭했고, 네트워크 응답은 **403**이었다. 표시 문구는 다음뿐이었다.

```text
주문 복원에 실패했습니다. 다시 시도해 주세요.
```

`다시 시도`는 같은 403을 반복할 뿐이며, 사용자는 권한 요청·관리자 문의·재로그인 중 무엇을 해야 하는지 알 수 없다. 서버 원문을 그대로 공개할 필요는 없지만, 403에는 클라이언트가 통제하는 안전한 권한 안내가 필요하다.

증거: `docs/qa-shots/1110-s12-live-qa/04-forbidden-generic-message.png`, `evidence.json`의 `scenarios.forbidden`.

## 3. FOR UPDATE NOWAIT 반대급부

시나리오별 발화·차단 수:

| 실제 화면 시나리오 | 발화 | 409 차단 | 결과 |
|---|---:|---:|---|
| 혼자 쓰는 정상 복원 | 1 | 0 | 200 |
| 복원 직후 같은 버전 재복원 | 1 | 0 | 200 |
| 서로 다른 두 주문 동시 복원 | 2 | 0 | 200, 200 |
| 같은 주문 row가 이미 잠긴 상태의 복원 | 1 | 1 | 409 |

정상 경로 4요청 중 잘못 막힌 요청은 **0건**이다. 409 경합에서는 서버 업무 문구가 화면 하단 토스트에 노출됐다.

```text
동시에 복원된 주문입니다. 다른 사용자의 복원이 먼저 완료되어 다시 조회해 주세요.
```

증거: `01-solo-legacy-restore.png`, `02-different-order-concurrent-restore.png`, `03a-row-lock-409-obscured.png`, `03b-row-lock-409-after-close.png`.

## 4. 잠금 실패 원자성·유령 revision

발화 조건: **실 row-lock 경합 1건**. DB에는 쓰기 없이 `SELECT ... FOR UPDATE`만 사용했고, 화면 복원 클릭이 409를 받은 전후를 SELECT로 비교했다.

| 상태 | 전 | 후 |
|---|---:|---:|
| audit overlay revision_count | 8 | 8 |
| revision 행 | 33 | 33 |
| 최대 revision 번호 | 33 | 33 |
| 감사로그 행 | 8 | 8 |
| outbox 행 | 0 | 0 |
| 활성 라인 | 1 | 1 |
| 삭제 라인 | 28 | 28 |
| 헤더 fingerprint | `09a0421a4501ba4004216cd1b612ac40` | 동일 |

부분 헤더/라인 반영, 감사로그·outbox 잔재, 유령 RESTORE revision은 모두 **0건**이다.

## 5. commitId 멱등·재접속

### 정상 갱신이 함께 삼켜지는가

발화 조건: **연결 단절 중 정상 권위 커밋 1건**. 관찰 화면을 offline으로 전환한 동안 실 API로 협업 수정을 1건 저장했고 응답은 201이었다. online 복귀 후 화면이 상세 GET 200을 다시 수행했으며, 7.5초 뒤 표시값은 저장값과 정확히 같았다. **1/1 수렴**이다.

증거: `05-reconnect-missed-authority.png`, `reconnect-evidence.json`.

### 중복 replay와 2,048 초과 퇴출

- 동일 commitId의 실 broker replay 발화: **0건 → 판정 불가**
- deduper 창을 넘는 2,049번째 실 authority 사건 발화: **0건 → 판정 불가**

공유 DB에 2,049건의 합성 주문 변경을 남기지 않고는 실 경로 발화가 불가능해 실행하지 않았다. 코드상 퇴출된 사건의 재소비는 snapshot/Y.Doc 쓰기가 아니라 현재 상세·revision·목록 query 무효화이므로, 확인된 사용자 오염은 없다. 그러나 실 broker 장시간 세션 표본은 0이므로 이 문장을 라이브 결함 0 판정으로 쓰지 않는다.

## 6. 기존 행 호환

발화 조건: PR 이전인 **2026-06-08 생성 주문 2건**, 각 revision 1 snapshot 2건. 두 snapshot은 현재 규약의 `memo`, `dueDate`, `deliveryAddress` 등이 없고 기본 헤더·라인 키만 가진다.

- `2026/06/08-1980` revision 1: 화면 복원 200
- `2026/06/08-1982` revision 1: 다른 주문 동시 시나리오에서 화면 복원 200

표본 2건 중 실패·409는 **0건**이며, 복원 뒤 상세 GET도 200이었다. 새로 만든 데이터만으로 판정하지 않았다.

## 7. 409/403/404 메시지 경계

| 상태 | 발화 수 | 화면 결과 | 판정 |
|---|---:|---|---|
| 409 row-lock 업무 충돌 | 1 | 서버 업무 문구 노출 | 정상 |
| 403 권한 변경 | 1 | 일반 재시도 문구 | **D1 결함** |
| 404 주문/버전 소실 | 0 | 표본 없음 | 판정 불가 |

soft-delete 주문은 이 서비스의 복원 지원 대상이고 revision은 사용자 화면에서 hard-delete되지 않으므로, DB 변경 금지 조건에서 실제 404를 만들 수 없었다.

## 8. 증거 무결성

- S11 보고서의 현재 HEAD 수치 재현: `PartnerOrderRevisionRestoreIT` **tests=13, skipped=0, failures=0, errors=0**, XML time 2.058초.
- 같은 fresh `--rerun-tasks` 실행에서 SQLState `55P03`, `could not obtain lock on row`, `복원 대상 주문 락 경합` 원문을 확인했다.
- 최종 core Playwright: **1 passed (19.4s)**.
- 최종 reconnect Playwright: **1 passed (10.5s)**.
- S10의 25 tests 표기는 S11에서 반복 기반 RED-A를 단일 결정적 케이스로 바꾸기 전 커밋의 역사 수치다. 현재 HEAD 수치로 오인하게 제시된 원문은 찾지 못했다.

따라서 이 라운드에서 확인한 보고서·PR 실측 수치의 증거 무결성 결함은 **0건**이다.

## 9. 신규 파일

- `clients/desktop/playwright/1110-s12-live-qa/1110-s12-live-qa.spec.ts`
- `clients/desktop/playwright/1110-s12-live-qa/playwright.config.ts`
- `docs/dev-reports/2026-08-08-1110-s12-sol-reconvergence.md`
- `docs/qa-shots/1110-s12-live-qa/` 아래 PNG 7개와 비밀번호·토큰 없는 JSON 2개

기존 미추적 `clients/desktop/playwright/1110-s5-live-qa/`, `1110-s6-live-qa/`는 수정하지 않았다. 커밋·push는 수행하지 않았다.

## 10. 이 라운드가 보지 않은 것

- 동일 commitId를 실 broker가 실제 재전송한 표본과 한 화면에서 authority 사건 2,049건을 넘긴 장시간 세션
- 사용자 화면 경로에서 실제 404가 발생하는 hard-delete/보존기간 만료 상황
- 다중 partner-order 인스턴스·Redis broker 환경의 cross-node 순서와 replay
- 거래처 주문 외 다른 문서의 복원·협업 화면
- 화면 상단의 전역 앱 업데이트 실패 배너 원인과 동작; PR #1115 표면이 아니므로 판정하지 않았다
