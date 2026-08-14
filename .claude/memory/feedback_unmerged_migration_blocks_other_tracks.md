---
name: feedback_unmerged_migration_blocks_other_tracks
description: 🚨 머지 안 된 브랜치의 마이그레이션을 공유 DB 에 적용하면 같은 서비스의 다른 트랙이 전부 기동 불가가 된다 — 이미지는 되돌리면 그만이지만 스키마는 남는다 (2026-08-01 #1009↔#1032)
metadata:
  type: feedback
---

# 🚨 머지 안 된 마이그레이션이 **다른 트랙 전부를 막는다**

**2026-08-01 실측.** `#1009` 라이브QA 를 위해 그 브랜치의 `slip-service` 를 배포했다. Flyway 가 공유 `slip_db` 에 `V100` 을 적용했다.

```sql
-- V100__normalize_quote_snapshot_json_owner_totals.sql
ALTER TABLE quote_snapshots
    DROP COLUMN snapshot_data,
    DROP COLUMN preview_image,     -- ← 이것
    DROP COLUMN user_email;
```

몇 시간 뒤 `#1032` 라이브QA 를 위해 **main 기반** `slip-service` 를 배포하자 **재시작 루프**에 빠졌다.

```text
SchemaManagementException: Schema-validation:
  missing column [preview_image] in table [quote_snapshots]
```

## 🔑 이미지 충돌과 다르다

[[feedback_parallel_backend_tracks_share_docker_stack]] 은 **이미지**가 서로를 덮는 문제다. 그건 **다시 빌드하면 복구**된다.

**스키마는 남는다.** 한 트랙이 컬럼을 지우면, 그 트랙이 머지될 때까지 **같은 서비스의 다른 모든 트랙이 기동조차 못 한다.** 트랙이 10개면 9개가 멈춘다.

⚠️ 증상이 **기능 결함처럼 보이지 않는다** — 컨테이너가 그냥 안 뜬다. `health=000` 과 `Restarting (1)` 만 보인다.

## 조치 (실측)

```sql
DELETE FROM quote_snapshots;                   -- QA 가 만든 행뿐인지 먼저 셀 것
ALTER TABLE ... ADD COLUMN <지워진 것들>;       -- NOT NULL 은 나중에 SET
ALTER TABLE ... DROP COLUMN <추가된 것들>;
DELETE FROM flyway_schema_history WHERE version = '100';
```

되돌린 뒤 컨테이너는 **재시작 루프에서 스스로 빠져나온다**(restart 정책). 별도 재기동이 필요 없었다.

**Why:** Hibernate `ddl-auto: validate` 는 **없는 컬럼**만 문제 삼고 **남는 컬럼**은 통과시킨다. 그래서 *"추가"* 는 트랙 간 무해하지만 *"삭제"* 는 치명적이다. 삭제가 들어간 마이그레이션이 위험 신호다.

## How to apply

- 🚨 **라이브QA 로 배포한 트랙은 QA 가 끝나면 되돌린다.** 또는 같은 서비스의 다른 트랙 QA 를 **그 트랙 머지 뒤로** 미룬다. 백엔드 직렬화는 **이미지뿐 아니라 스키마에도** 적용된다.
- 🚨 배포 전에 그 브랜치 마이그레이션에 **`DROP COLUMN`·`DROP TABLE`·`RENAME` 이 있는지** 먼저 본다. 있으면 그 배포는 **되돌릴 계획과 함께** 한다.
- 되돌리기 전에 **영향 행 수를 센다.** 이번엔 4행이 전부 QA 산출물이라 지워도 무해했다 — 실 데이터였으면 다른 방법이 필요했다.
- 컨테이너가 `Restarting` 이면 **로그의 `Caused by:` 마지막 줄**을 보라. `Schema-validation: missing column` 은 거의 항상 이 상황이다.
- 🚨 마이그레이션 **번호 충돌**도 같은 계열이다 — 같은 서비스에 두 트랙이 같은 `V` 번호를 쓰면 먼저 머지된 쪽이 뒤쪽을 기동 불가로 만든다. 커밋 전 `origin/main` **과 열려 있는 다른 PR** 의 최대 번호를 함께 볼 것(2026-08-01 `inventory-service` `V22` 중복 실측).

## 관련
[[feedback_parallel_backend_tracks_share_docker_stack]](이미지 판) · [[feedback_applied_migration_immutable]] · [[feedback_stale_deployment_looks_like_defect]] · PR #1010(#1009) · PR #1044(#1032)

## 🆕 2026-08-15 — **되돌린 줄 알았는데 다시 적용돼 있었다** (#1210 → #1214·#1216 차단)

낮에 V121 을 공유 DB 에서 되돌렸다(감사표 기준 UPDATE 61 · DELETE 61 · flyway history 1).
그런데 밤에 다시 재보니 V121·V122 가 둘 다 `success` 로 들어가 있었다.

```text
공유 slip_db flyway 최신
  122  redesign outbound delivery tags and cutoffs   success
  121  normalize inbound purchase delivery tag       success

활성 slips.delivery_tag
  SALE 144 · PURCHASE 61 · REGION 8 · …
```

🔑 **배포된 slip-service 는 main 기반이라 enum 에 `SALE`·`PURCHASE` 가 없다.**
그 값을 가진 행을 읽으면 매핑에 실패한다 ⟹ `GET /slips` 가 **500 INTERNAL_ERROR**.

증상이 어떻게 보였나 — **완전히 다른 트랙의 UI 결함처럼 보였다.**

```text
#1214  "전표 목록이 안 뜬다 · 품목 입력 DOM 대기 실패"
       ⟹ 셀렉터 문제로 파고들 뻔했다
```

### 왜 되돌리기가 유지되지 않았나

되돌린 뒤에도 **그 브랜치의 라운드가 계속 돌았고**, 라이브QA 가 다시 마이그레이션을 태웠다.
🚩 **되돌리기는 1회 조치이고, 브랜치가 살아 있는 한 재적용은 계속 일어난다.**

### 적용

```text
미머지 마이그레이션을 공유 DB 에 태웠으면
  ① 되돌리는 것으로 끝났다고 보지 마라 — 그 브랜치가 도는 동안 다시 들어온다
  ② 그 브랜치의 라이브QA 를 격리 DB 로 돌리거나, 아니면 빨리 머지해서 정본화하라
  ③ 다른 트랙에서 "목록이 500" · "화면이 안 뜬다" 가 나오면
     flyway_schema_history 와 enum 컬럼 분포를 먼저 봐라
🚨 행이 이미 새 값을 들고 있으면 되돌리기가 파괴적이다 — 그때는 머지가 유일한 출구다
```



관련: [[feedback_migration_number_three_counts]] · [[feedback_applied_migration_immutable]] ·
[[feedback_parallel_backend_tracks_share_docker_stack]] · [[feedback_stale_deployment_looks_like_defect]]
