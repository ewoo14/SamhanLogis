# PR #1120 / 이슈 #825 S6 — AC-5 검색 표면 계약 갱신

> 검증일: 2026-08-08  
> 실행 환경: `clients/desktop`, Chromium headless, `VITE_MOCK_MODE=1`, `VITE_API_BASE_URL=http://127.0.0.1:1`

## 변경

`/admin/approval-line-config`의 `GROUP/USER 복합키 add와 저장 id DELETE를 화면에서 왕복한다` 테스트에서 이전 inline listbox 계약만 제거했다.

- `매니저`: `autoSelectSingleResult`에 의한 즉시 칩 확정을 기다린다.
- `김기철`: 정확 검색의 단일 후보 즉시 칩 확정을 기다린다.
- `approval-role-approver-chip`의 `매니저` 포함, 2칩, `김기철` 제거 후 1칩, UUID 비공개 단정은 유지했다.
- GROUP/USER 복합키 add와 저장 id DELETE 왕복 로직은 변경하지 않았다.

`autoSelectSingleResult`가 켜진 이 소비처에서 두 정확 검색은 실제로 모달을 열지 않는다. 다건 모달 전환 자체는 S5 대표 spec의 같은 `/admin/approval-line-config` 경로가 검증하므로, 이 AC-5 케이스에 존재하지 않는 모달을 단정하도록 바꾸지 않았다.

## AC-5 `listbox` 전수 분류

| 위치 | 소비처 | 판정 | 처리 |
|---|---|---|---|
| `:71` | `/groupware/approvals/new` 담당자 검색 helper | 이전 계약 아님 | 유지 |
| `:120` | `/groupware/approvals/new` opaque option·UUID 검증 | 이전 계약 아님 | 유지 |
| `:181` | `/admin/approval-line-config` `매니저` 정확 검색 | 전환 소비처, 단일 즉시확정 | 제거 |
| `:187` | `/admin/approval-line-config` `김기철` 정확 검색 | 전환 소비처, 단일 즉시확정 | 제거 |

## 검증

### AC-5 단독 대상

원문 red 재현:

```text
1 failed
Locator: getByRole('listbox', { name: '출고자 결재자 검색 결과' })
```

수정 후:

```text
1 passed (4.9s)
```

### AC-5 전체

```text
5 passed (11.2s)
```

### design-system

```text
Test Files  26 passed (26)
Tests       200 passed (200)
```

### S5 유지 확인

입금자명 매핑 단독 실행은 다음과 같이 통과했다.

```text
1 passed (4.4s)
```

그러나 S5 4건 전체 묶음은 같은 마지막 케이스에서 두 번 연속 다음 결과를 냈다.

```text
3 passed / 1 failed
실패: getByRole('dialog', { name: '거래처 검색 결과' }) not visible
```

따라서 S5 전체 `4/4` 유지 증거는 확보하지 못했다. 이 실패는 AC-5 변경과 무관하고 단독 실행에서는 통과하므로, S6에서 수정하지 않고 묶음 실행 격리/순서 문제로 보고한다.

모든 Playwright 실행은 `VITE_API_BASE_URL=http://127.0.0.1:1`로 격리했다. mock handler가 없는 endpoint는 공유 서버 대신 해당 주소로 실제 Axios 요청이 나가는 조건이다. 공유 Docker 스택은 재기동하지 않았다.

## 변경 통계 및 신규 파일

현재 `git diff --stat`:

```text
 .../playwright/ac-5-chip-multiselect.spec.ts | 6 ------
 1 file changed, 6 deletions(-)
```

신규 파일:

- `docs/dev-reports/2026-08-08-825-s6-ac5-contract-update.md`

커밋·push는 하지 않았다.
