# PR #1245 — 누락 92코드 적재 결과

## ① 누락 재실측 숫자

- 대상 서비스는 `dc-config-service`이며, 누락은 **92코드**로 재확인했다.
- 현재 브랜치·`origin/main`은 V6까지이고, 열린 PR 중 V7 선점은 없었다.
- drift 43코드, 현행-only `6973700076`, 중복 충돌 `2291465974`는 제외했다.
- 원천 CSV는 워크트리에 없어 2026-08-16 고정 스냅샷의 원천값 요약을 사용했다.

## ② 누락 코드 목록

코드·원천값 전체 목록은 [missing-92.csv](missing-92.csv)에 기록했다. 92행 모두 `source_value`를 포함하며, `source_note_presence`는 원천 특이사항 존재 여부다.

## ③ 마이그레이션 작성 여부·번호 3중 확인

- 작성: `services/dc-config-service/src/main/resources/db/migration/V7__load_missing_92_legacy_dc_configs.sql`
- 현재 브랜치: V1~V6 다음 V7.
- `origin/main`: V1~V6 다음 V7.
- 열린 PR: dc-config-service V7 선점 없음.
- add-only 방어: 파트너 누락 또는 대상 DC 기존 행이 있으면 전체 중단하며 기존 행을 수정·삭제하지 않는다.

## ④ fresh Postgres 적용 결과

| 항목 | 결과 |
|---|---:|
| 적용 전 `dc_configs` | 0 |
| 적용 후 `dc_configs` | 92 |
| 증가분 | **+92** |
| `source='LEGACY_CSV'` | 92 |

격리 PostgreSQL에서 V1·V2 스키마와 92개 테스트용 partner를 준비하고, Flyway와 같은 단일 트랜잭션으로 V7을 적용했다. 재적용은 기존 대상 검출로 실패(exit 3)했고 행 수 92를 유지했다. `git diff --check`도 통과했다.

## ⑤ 판단 보류 목록

- drift 43코드의 원천값/현행값 채택 여부.
- `2291465974`의 상업 DC 0.48/0.47 선택.
- `6973700076` 보존 또는 soft-delete.
- audit이 있는 `4348703365` 및 drift 단위처리·옵션 금액 처리.
- 원천 CSV 부재로 특이사항 원문 전체와 원천 해시 재검증.

## ⑥ 못 한 것과 이유

- drift 43 정렬, 가역 절차·테스트, 라이브 화면 확인, 전체 재적재는 지시 범위 밖이라 하지 않았다.
- 원천 CSV가 없어 사업자명·특이사항 원문 전체 재구성은 하지 못했다.
- 공유 DB는 변경하지 않았고 fresh 격리 DB에서만 적재를 확인했다.

## ⑦ `git status --porcelain` 원문

```text
?? docs/qa/1245-missing-92/
?? services/dc-config-service/src/main/resources/db/migration/V7__load_missing_92_legacy_dc_configs.sql
```

## ⑧ 프로세스 회수

- 격리 컨테이너 `codex-pr1245-pg`는 검증 후 제거했다.
- 공유 컨테이너 24개는 그대로 유지했다.
- 잔여 신규 프로세스·격리 컨테이너: 0개.
