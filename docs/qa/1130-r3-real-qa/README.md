# PR #1130 R3 실 GUI QA 관측 기록

## 환경

- 측정일: 2026-08-09 KST
- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1064b`
- 브랜치/HEAD: `fix/1064-inbound-lifecycle` / `43c76841276a4c1b99d4e25a541af96804e3931d`
- renderer: `http://localhost:5199`, `VITE_MOCK_MODE=0`
- API: `http://localhost:8080` 실 gateway
- 실 DB: `samhan-postgres`의 `auth_db`, `slip_db`, `inventory_db`에 SELECT만 수행

## 발화 조건

- 2026-08-09 09:06:40 KST, `slip_db`: 활성 `INBOUND + INSPECTING` 2건
- 두 건 모두 `destination_warehouse_id` 존재
- 같은 시각 `inventory_db`: `inbound_inspections` 0건

따라서 전표 lifecycle 경로의 실 데이터 표본은 2건이고, 별도 입고 검수 목록 경로의 표본은 0건이다.

## GUI 관측 결과

renderer는 5199에서 HTTP 200으로 기동했으나, 제공된 브라우저 런타임의 가용 브라우저 목록이 빈 배열(`[]`)이었다. 브라우저 조작·스크린샷 캡처를 수행할 수 없었으므로 실 GUI 결과는 **관측 불가**다. PNG를 임의 생성하거나 mock 캡처로 대체하지 않았다.

또한 공유 `auth_db`에는 V98 적용 이력이 없고 MANAGER 비트가 아직 `1000000`이므로, 현재 실 API는 PR 배포 후 상태가 아니다. 실 DB 쓰기 금지에 따라 V98을 적용하거나 완료 POST를 호출하지 않았다.

