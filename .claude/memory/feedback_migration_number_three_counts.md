---
name: feedback_migration_number_three_counts
description: 🚨 마이그레이션 번호는 정하기 전에 셋을 다 세라 — 그 서비스의 최고 파일 번호 · 그 DB 의 적용 최고 · 열린 PR 이 예약한 번호. 하루 한 트랙에서 세 가지 방식으로 다 틀렸고 CI 는 셋 다 통과했다 (2026-08-05 집PC #1057)
metadata:
  type: feedback
---

# 🚨 마이그레이션 번호 — **셋을 다 세야** 안 틀린다

**2026-08-05 집PC, 한 트랙(`#1057`)에서 하루에 세 번** 번호로 걸렸다. 셋 다 실패 방식이 다르다.

| 라운드 | 넣은 번호 | 무엇이 틀렸나 | 결과 |
|---|---|---|---|
| R42 | slip `V62` | 그 폴더에 **비어 있던 낮은 슬롯**을 썼다(최고는 V100) | `slip_db` 는 이미 **105** → out-of-order 비활성이라 **적용되지 않고 Flyway validate 가 부팅을 막는다** |
| R45 | notification `V109` | PM 이 *"V109 이상"* 이라 지시했는데 그건 **slip-service 기준**이었다 | notification 최고는 **V7** → 앞으로 누가 V8·V9 를 추가하면 **영원히 적용 안 됨** |
| R49 | accounting `V96` | **열린 다른 PR(`#1061`)이 이미 V96 을 쓴다** | 둘 다 머지되면 `Found more than one migration with version 96` 으로 **그 서비스 전체 기동 불가** |

## 🔑 CI 는 이 계열을 **하나도** 못 잡는다

CI 는 Testcontainers 로 **빈 DB** 를 만들어 전 마이그레이션을 순서대로 적용한다. 낮은 번호도, 서비스별 기준선 차이도, 다른 PR 의 번호도 빈 DB 에서는 전부 통과한다. **`CI green` 은 이 결함의 반증이 아니다.** → [[feedback_ungated_surface_and_mock_covering_defect]]

세 번 다 **PM 이 `git status` 에서 `migration` 을 눈으로 찾아** 잡았다. 그것이 유일하게 작동한 게이트였다.

## How to apply

착수 전 **셋을 각각 세고 브리핑에 숫자로 준다.**

```powershell
# ① 그 서비스의 최고 파일 번호
Get-ChildItem services/<svc>/src/main/resources/db/migration -Filter "V*.sql" |
  ForEach-Object { if ($_.Name -match '^V(\d+)__') { [int]$matches[1] } } | Sort-Object -Descending | Select-Object -First 3

# ② 그 DB 의 적용 최고
docker exec samhan-postgres psql -U samhan -d <db> -t -c "SELECT MAX(version::numeric) FROM flyway_schema_history WHERE success;"

# ③ 열린 PR 이 예약한 번호 — 워크트리/브랜치를 훑는다
```

- 🚨 **서비스마다 기준선이 다르다.** 한 브리핑이 여러 서비스를 건드리면 **서비스별로** 번호를 줘야 한다. *"V109 이상"* 한 줄이 다른 서비스에 그대로 꽂히면 그 결함은 PM 이 만든 것이다 → [[feedback_pm_means_instruction_creates_defect]]
- 🚨 **빈 슬롯은 쓸 수 있는 자리가 아니라 이미 지나간 자리다.**
- 브리핑에 *"마이그레이션을 새로 만들었으면 파일명을 목록으로 보고하라"* 를 항상 넣는다 → [[feedback_pm_copy_untracked_files]]
- 다른 서비스에 마이그레이션이 생겼다면 **범위 이탈 신호**이기도 하다. `#1057` R49 의 accounting `V96` 은 번호 충돌인 동시에 다른 트랙(`#1061`)의 서비스를 건드린 것이었다 → [[feedback_fix_in_current_pr_no_split]]

## 네 번째 — **main 과 직접 이름 충돌** (2026-08-06 `#1075` S18)

구현자가 `V101__add_estimate_specification_source.sql` 을 만들었는데 **main 에 이미 `V101__preserve_source_warehouse_code.sql` 이 있었다.** 둘 다 들어가면 Flyway 중복 버전으로 slip-service 가 아예 기동하지 않는다.

왜 브랜치에서 안 보였나 — **그 브랜치가 main 보다 9 커밋 뒤처져 있었다.** 브랜치의 `db/migration/` 최고는 `V100` 이라 `V101` 이 자연스러워 보였다. main 에는 이미 `V101~V107` 이 있었다.

```
① 그 서비스 최고        브랜치에서 세면 V100  ← 함정. main 기준으로 세야 V107
② 그 DB 적용 최고       V112  (#1057 이 라이브QA 배포로 적용해 둠)
③ 열린 PR 예약분        #1057 이 V108~V112
⟹ V113
```

- 🚨 ①은 **브랜치가 아니라 `origin/main` 기준으로** 센다: `git ls-tree -r --name-only origin/main <migration dir>`.
- 브랜치가 main 보다 뒤처져 있으면 그 자체가 신호다: `git rev-list --count HEAD..origin/main`.
- 네 번 다 **CI 는 통과했다.** 빈 DB 에 순서대로 적용하기 때문이다. 네 번 다 PM 이 `git status` 에서 `migration` 을 눈으로 찾아 잡았다 — 그 육안 확인이 유일하게 작동한 장치다.

## 관련
[[feedback_unmerged_migration_blocks_other_tracks]](스키마 잔재 판) · [[feedback_parallel_backend_tracks_share_docker_stack]] · PR #1057 · PR #1078
