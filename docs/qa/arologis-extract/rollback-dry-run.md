# 아로로지스 독립 분리 — 롤백 절차 dry-run runbook

> **branch** — `feature/arologis-extract`
> **작성일** — 2026-05-14
> **작성** — QA Team
> **목적** — spec §10.4 의 5 단계 reversible 롤백 절차를 dry-run 명령 + 예상 결과로 사전 검증. 본 runbook 은 실제 운영 사고 시점에서도 그대로 실행 가능한 명령 시퀀스.
> **총 예상 시간** — 약 1 시간 47 분 (DNS 5 + Docker 2 + Client 30 + Code 60 + DB 10)
> **연관 산출물** —
> - `docs/superpowers/specs/2026-05-14-arologis-extract-design.md` §10.4
> - `docs/qa/arologis-extract/scenarios.md` (정상 흐름 6 시나리오)
> - `docs/qa/arologis-extract/regression-33-case.md` (회귀 가드)
> - `infra/aws/route53/arologis-rollback.json` (Step 1 dry-run 산출)
> - `infra/aws/route53/arologis-rollback-recover.json` (Step 1 복귀)

---

## 0. 사전 가드

### 0.1 dry-run 정책

- AWS CLI 는 `--dry-run` 플래그가 있는 명령만 dry-run 가능. Route53 `change-resource-record-sets` 는 native `--dry-run` 미지원 — 본 runbook 은 `aws route53 list-resource-record-sets` (read-only) + change batch JSON validation 으로 대체.
- Docker `down` / `git mv` / `gh pr revert` / Flyway `repair` 모두 실제 실행 직전 staging 환경에서 1회 dry-run 권고.

### 0.2 트리거 조건

본 롤백은 다음 중 1건 이상일 때만 실행:

| 트리거 | 검증 |
|---|---|
| 시나리오 1~6 중 🔴 Critical FAIL | TM 통합 PR comment 의 QA 보고 |
| arologis-service 운영 중 30분 이상 DOWN | EC2 health check Lambda 알람 |
| Samhan Public 14 service 중 1건이라도 회귀 FAIL | CI samhanlogis-ci.yml red |
| 자체 auth 도메인의 보안 결함 (CVE 등) | 외부 보고 |

### 0.3 롤백 단계 의존성

```
Step 1 (DNS) → Step 2 (Docker) → [복구 가능]
Step 2 → Step 3 (Client) → Step 4 (Code) → Step 5 (DB)
```

Step 1+2 만 실행 시 빠른 회수 (7분), 데이터/코드 보존. Step 3~5 는 슬라이스 전체 회수 시점에 진행.

---

## 1. Step 1 — Route53 DNS 회수 (5 분)

### 1.1 목적

`*.arologis.samhan-air.com` 3 레코드 (api / app / mobile) 삭제 → 외부에서 arologis 접근 불가 → Samhan Public 14 service 트래픽 격리.

### 1.2 dry-run 절차

```bash
# 1. 회수 대상 레코드 확인 (read-only)
HOSTED_ZONE_ID="<arologis 분리 시 Route53 hosted zone id>"

aws route53 list-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --query "ResourceRecordSets[?starts_with(Name, 'api.arologis') || starts_with(Name, 'app.arologis') || starts_with(Name, 'mobile.arologis')]" \
  --output json

# Expected: 3 행 (api.arologis.samhan-air.com / app.arologis.samhan-air.com / mobile.arologis.samhan-air.com)
```

### 1.3 change batch JSON 작성 (실제 실행 직전 검토)

`infra/aws/route53/arologis-rollback.json` (작성 예시):

```json
{
  "Comment": "Rollback Step 1 — arologis subdomain DELETE 3 records",
  "Changes": [
    {
      "Action": "DELETE",
      "ResourceRecordSet": {
        "Name": "api.arologis.samhan-air.com.",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "<EC2 region zone>",
          "DNSName": "<EC2 elastic IP A record fqdn>.",
          "EvaluateTargetHealth": false
        }
      }
    },
    {
      "Action": "DELETE",
      "ResourceRecordSet": {
        "Name": "app.arologis.samhan-air.com.",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "<S3 web hosting IP 또는 CloudFront alias>"}]
      }
    },
    {
      "Action": "DELETE",
      "ResourceRecordSet": {
        "Name": "mobile.arologis.samhan-air.com.",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "<S3 web hosting IP>"}]
      }
    }
  ]
}
```

### 1.4 dry-run validation

```bash
# Route53 는 native dry-run 미지원 — JSON schema 검증 + list 후 비교
cat infra/aws/route53/arologis-rollback.json | jq '.Changes | length'
# Expected: 3

# JSON 의 모든 Name 이 실제 hosted zone 에 존재하는지 비교
for name in $(jq -r '.Changes[].ResourceRecordSet.Name' infra/aws/route53/arologis-rollback.json); do
  found=$(aws route53 list-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --query "ResourceRecordSets[?Name=='$name'].Name" \
    --output text)
  if [ "$found" = "$name" ]; then
    echo "OK  — $name 존재"
  else
    echo "FAIL — $name 미존재 (이미 삭제됨 또는 오타)"
  fi
done
# Expected: 3 행 모두 "OK"
```

### 1.5 실제 실행 (dry-run 통과 후만)

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch file://infra/aws/route53/arologis-rollback.json

# Status PENDING → INSYNC 대기
aws route53 wait resource-record-sets-changed --id <ChangeInfo.Id>
```

### 1.6 검증

```bash
# DNS 해석 실패 확인 (TTL 300s 후)
dig +short api.arologis.samhan-air.com
# Expected: (empty)

curl -sS -o /dev/null -w "%{http_code}\n" https://api.arologis.samhan-air.com/actuator/health
# Expected: 000 (NXDOMAIN) 또는 6 (could not resolve)

# Samhan Public 영향 0 확인
curl -sS https://api.samhan-air.com/actuator/health | jq '.status'
# Expected: "UP"
```

### 1.7 복구 (rollback the rollback)

```bash
# CREATE 로 같은 JSON 재 apply (infra/aws/route53/arologis-rollback-recover.json)
# Action: DELETE → CREATE 교체 후 같은 명령 재실행
```

---

## 2. Step 2 — Docker 회수 (2 분)

### 2.1 목적

`docker-compose.arologis.yml` 단독 down → arologis-service 컨테이너 stop + remove. 같은 network 의 Samhan Public 14 service 영향 0 (시나리오 6 회귀 가드).

### 2.2 dry-run 절차

```bash
# 1. 현재 가동 컨테이너 확인
docker compose -f docker-compose.arologis.yml ps
# Expected: arologis-service (Up)

# 2. config 만 검증 (dry-run 효과)
docker compose -f docker-compose.arologis.yml config --quiet
# Expected: exit 0 (config 유효)

# 3. 영향 받는 컨테이너 목록 (실제 down 직전 미리보기)
docker compose -f docker-compose.arologis.yml ps --services
# Expected: arologis-service
```

### 2.3 실제 실행

```bash
# Samhan Public 14 service 보존 (volumes 유지)
docker compose -f docker-compose.arologis.yml down

# Expected:
#   [+] Running 1/1
#    ✔ Container arologis-service  Removed
#   (network samhanlogis-net 은 external true 라 삭제 X)
```

### 2.4 검증

```bash
# arologis-service down 확인
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:8097/actuator/health
# Expected: 000 (connection refused)

# Samhan Public 14 service UP 일괄 확인
for port in 8080 8081 8082 8083 8084 8085 8086 8087 8088 8089 8090 8091 8092 8093; do
  status=$(curl -sS -o /dev/null -w "%{http_code}" http://localhost:$port/actuator/health)
  printf "port %-5s → %s\n" "$port" "$status"
done
# Expected: 모든 줄 "200"

# Eureka registry 14 instance 확인
curl -sS http://localhost:8761/eureka/apps -H "Accept: application/json" \
  | jq '[.applications.application[].instance[] | select(.status=="UP")] | length'
# Expected: 14 (15 - 1)

# arologis_db volume 보존 (Step 5 회수 전까지 데이터 보존)
docker volume ls --filter name=arologis_db_data
# Expected: 1 행
```

### 2.5 복구

```bash
docker compose -f docker-compose.arologis.yml up -d
# 30초 후 Eureka 15 instance 복귀 확인
```

---

## 3. Step 3 — Client 회수 (30 분)

### 3.1 목적

`clients/arologis-desktop/` + `clients/arologis-mobile/` 폴더의 코드를 원래 위치 (`clients/desktop/src/routes/arologis/` + `clients/mobile-staff/src/screens/driver/`) 로 `git mv` 역순 회수.

### 3.2 dry-run 절차

```bash
# 1. 회수 대상 파일 수 확인
echo "[arologis-desktop]"
git ls-files clients/arologis-desktop/ | wc -l
# Expected: ~40~80 file (FE F1~F4 산출)

echo "[arologis-mobile]"
git ls-files clients/arologis-mobile/ | wc -l
# Expected: ~30~60 file (FE F5~F7 산출)

# 2. 회수 후 충돌 가능성 검토 — clients/desktop/src/routes/arologis/ 가 이미 존재하면 충돌
test -d clients/desktop/src/routes/arologis && echo "WARN — 충돌 가능" || echo "OK — 충돌 없음"
test -d clients/mobile-staff/src/screens/driver && echo "WARN — 충돌 가능" || echo "OK — 충돌 없음"

# 3. git mv dry-run 시뮬레이션 (실제 mv 없이 명령만 echo)
git ls-files clients/arologis-desktop/routes/dispatches/ \
  | sed 's|clients/arologis-desktop/routes/dispatches/|clients/desktop/src/routes/arologis/|' \
  | head -10
# Expected: 10 줄 미리보기 (mv 대상 매핑)
```

### 3.3 git mv 역순 명령 (실제 실행)

```bash
# 1. desktop 폴더 → 원래 위치
mkdir -p clients/desktop/src/routes/arologis
git mv clients/arologis-desktop/routes/dispatches/* clients/desktop/src/routes/arologis/

# 2. mobile 폴더 → 원래 위치
mkdir -p clients/mobile-staff/src/screens/driver
# FE F5 에서 mv 한 driver 화면 회수 (DispatchListScreen / DispatchDetailScreen / SignatureScreen)
git mv clients/arologis-mobile/src/screens/* clients/mobile-staff/src/screens/driver/

# 3. arologis-desktop / arologis-mobile 폴더 제거 (잔여 신규 파일 — Login/PhoneLogin/GpsPermission)
git rm -r clients/arologis-desktop/
git rm -r clients/arologis-mobile/

# 4. import path 회수 (sed 일괄 치환)
git grep -l "from '@/routes/arologis" clients/desktop/src/ \
  | xargs sed -i "s|from '@/routes/arologis|from '@/routes/arologis|g"
# Note: path 가 동일하므로 변경 0, F2 의 routes/arologis 가 회복됨
```

### 3.4 검증

```bash
# 1. 폴더 위치 회복
test -d clients/desktop/src/routes/arologis && echo "OK — desktop 회복" || echo "FAIL"
test -d clients/mobile-staff/src/screens/driver && echo "OK — mobile-staff 회복" || echo "FAIL"

# 2. arologis-* 신규 폴더 제거 확인
test ! -d clients/arologis-desktop && echo "OK — arologis-desktop 제거" || echo "FAIL"
test ! -d clients/arologis-mobile && echo "OK — arologis-mobile 제거" || echo "FAIL"

# 3. desktop 컴파일 (전체 회귀 0 검증)
cd clients/desktop && npm run typecheck && cd ../..
# Expected: 0 error

cd clients/mobile-staff && npm run typecheck && cd ../..
# Expected: 0 error
```

---

## 4. Step 4 — Code 회수 (1 시간)

### 4.1 목적

자체 auth/user 도메인 (AdminUser/RefreshToken/JwtIssuer/AdminLoginService/DriverLoginService/ArologisAuthController) 제거 + UserClient + shared:user-client-abstraction 의존 복원. `gh pr revert` 1 commit.

### 4.2 dry-run 절차

```bash
# 1. 분리 PR 의 머지 commit SHA 확인
gh pr list --base main --state merged --search "arologis-extract" --limit 1 \
  --json number,title,mergeCommit \
  | jq '.[0] | {number, title, sha: .mergeCommit.oid}'

PR_NUMBER=<위 결과의 number>
MERGE_SHA=<위 결과의 sha>

# 2. revert dry-run (실제 commit 없이 conflict 만 검증)
git checkout main
git pull origin main
git checkout -b rollback/arologis-extract-revert

git revert --no-commit "$MERGE_SHA"
# Expected: 충돌 없으면 staged 상태, 있으면 unmerged paths 표시

git diff --cached --stat | tail -3
# Expected: ~150+ file changed (BE/FE/Designer/QA/DevOps 5-team 산출 전체 revert)

# 3. 충돌 있으면 abort 후 수동 회수 계획 수립
git revert --abort   # dry-run 종료
```

### 4.3 실제 실행

```bash
# 1. revert PR 발행 (CI green 검증 의무)
git checkout main && git pull
git checkout -b rollback/arologis-extract-revert
git revert -m 1 "$MERGE_SHA"  # -m 1 — merge commit 의 첫 부모 (main) 기준
git commit -m "$(cat <<EOF
revert(arologis-extract): 아로로지스 독립 분리 회수 — 자체 auth + Client 추출 + Docker/DNS 분리 revert

회수 사유: <트리거 조건 0.2 명시>
회수 범위: PR #${PR_NUMBER} 의 5-team 산출 전체 (BE B1~B15 + FE F1~F7 + Designer D1~D5 + QA Q1~Q3 + DevOps DO1~DO6)
보존: arologis_db 의 dispatch/vehicle/stop/driver 데이터 (Step 5 에서 별도 결정)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push -u origin rollback/arologis-extract-revert
gh pr create --base main --head rollback/arologis-extract-revert \
  --title "revert(arologis-extract): 아로로지스 독립 분리 회수" \
  --body "## Summary
- PR #${PR_NUMBER} (아로로지스 독립 분리) revert
- Step 4 of rollback runbook (docs/qa/arologis-extract/rollback-dry-run.md)

## Trigger
- <0.2 트리거 조건>

## 영향
- arologis-service 자체 auth 제거 → UserClient + shared:user-client-abstraction 복원
- clients/arologis-* 폴더 제거 → clients/desktop/src/routes/arologis + clients/mobile-staff/src/screens/driver 복귀

## Test plan
- [ ] CI samhanlogis-ci.yml green
- [ ] CI arologis-ci.yml red (의도된 결과 — 분리 전이므로 신규 IT 4 가 컴파일 안됨)
- [ ] 시나리오 6 단독 down 가드 회귀 0
"

# 2. PM 자동 watch (feedback_pr_ci_monitoring)
gh pr checks --watch
```

### 4.4 검증

```bash
# 1. 자체 auth 도메인 코드 제거 확인
test 0 -eq $(git ls-files services/arologis-service/src/main/java/ | grep -E "AdminUser|RefreshToken|JwtIssuer|AdminLoginService|DriverLoginService|ArologisAuthController" | wc -l) \
  && echo "OK — 자체 auth 코드 0 file" \
  || echo "FAIL — 자체 auth 코드 잔존"

# 2. UserClient 복원 확인
test 1 -le $(grep -rln "UserClient" services/arologis-service/src/main/java/ | wc -l) \
  && echo "OK — UserClient main 코드 복원" \
  || echo "FAIL — UserClient 미복원"

# 3. shared:user-client-abstraction 의존 복원
grep "user-client-abstraction" services/arologis-service/build.gradle services/arologis-service/build.gradle.kts \
  && echo "OK — shared 의존 복원" \
  || echo "FAIL — shared 의존 미복원"

# 4. 기존 IT 13 회귀 0 PASS
./gradlew :services:arologis-service:test --tests "com.samhanair.logis.arologis.it.*" -i \
  | tee build/rollback-step4-it.log | grep -E "tests completed|BUILD"
# Expected: BUILD SUCCESSFUL, 48 tests completed, 0 failed (revert 후 baseline 복귀)
```

---

## 5. Step 5 — DB 회수 (10 분)

### 5.1 목적

Flyway V7 (`auth_user`) + V8 (`auth_refresh_token`) 의 테이블 drop. arologis_db 의 기존 데이터 (dispatch / vehicle / stop / driver) 는 보존 (spec §10.4 명시).

### 5.2 dry-run 절차

```bash
# 1. 회수 대상 테이블 존재 확인
docker exec -i samhanlogis-postgres psql -U postgres -d arologis_db -c "
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('auth_user', 'auth_refresh_token')
ORDER BY tablename;
"
# Expected: 2 행 (auth_user, auth_refresh_token)

# 2. 보존 대상 테이블 점검 (drop 0 영향)
docker exec -i samhanlogis-postgres psql -U postgres -d arologis_db -c "
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('dispatch', 'vehicle', 'stop', 'driver')
ORDER BY tablename;
"
# Expected: 4 행 — 보존 의무

# 3. FK 의존성 검증 (auth_user → 다른 테이블 참조 0 확인)
docker exec -i samhanlogis-postgres psql -U postgres -d arologis_db -c "
SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name IN ('auth_user', 'auth_refresh_token');
"
# Expected: 0 행 또는 auth_refresh_token.user_id → auth_user.id 1행 (CASCADE 처리됨)
```

### 5.3 Flyway V7/V8 undo 마이그레이션 (revert PR 의 commit 에 포함)

`services/arologis-service/src/main/resources/db/migration/V10__rollback_auth_tables.sql`:

```sql
-- V10 — arologis-extract 회수 (V7/V8 의 자체 auth 테이블 drop)
-- 보존: dispatch / vehicle / stop / driver
-- 제거: auth_user / auth_refresh_token

BEGIN;

-- 1. refresh_token (FK 먼저)
DROP TABLE IF EXISTS auth_refresh_token CASCADE;

-- 2. user
DROP TABLE IF EXISTS auth_user CASCADE;

-- 3. driver.app_user_id @Deprecated 컬럼 정리 (NULL 만 있어야 함)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'driver' AND column_name = 'app_user_id'
  ) THEN
    -- NULL 인 row 만 보존, 그 외에는 회수 후 별도 마이그레이션 필요
    ASSERT (SELECT COUNT(*) FROM driver WHERE app_user_id IS NOT NULL) = 0,
      'driver.app_user_id 가 NOT NULL 인 row 가 있음 — 회수 전 데이터 검토 필요';
    ALTER TABLE driver DROP COLUMN app_user_id;
  END IF;
END $$;

COMMIT;
```

### 5.4 실제 실행

```bash
# 1. Flyway repair (V7/V8 history 정리)
./gradlew :services:arologis-service:flywayRepair

# 2. V10 적용 (자동 — bootRun 시 flyway.migrate 자동 실행)
./gradlew :services:arologis-service:flywayMigrate

# 3. 또는 직접 SQL 실행 (CI 환경)
docker exec -i samhanlogis-postgres psql -U postgres -d arologis_db \
  < services/arologis-service/src/main/resources/db/migration/V10__rollback_auth_tables.sql
```

### 5.5 검증

```bash
# 1. 테이블 drop 확인
docker exec -i samhanlogis-postgres psql -U postgres -d arologis_db -c "
SELECT COUNT(*) AS auth_table_count
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('auth_user', 'auth_refresh_token');
"
# Expected: auth_table_count = 0

# 2. 보존 테이블 데이터 보존
docker exec -i samhanlogis-postgres psql -U postgres -d arologis_db -c "
SELECT
  (SELECT COUNT(*) FROM dispatch) AS dispatch_cnt,
  (SELECT COUNT(*) FROM vehicle) AS vehicle_cnt,
  (SELECT COUNT(*) FROM stop) AS stop_cnt,
  (SELECT COUNT(*) FROM driver) AS driver_cnt;
"
# Expected: 4개 카운트 모두 슬라이스 시작 전과 동일 (데이터 마이그레이션 0)

# 3. Flyway schema_history 확인
docker exec -i samhanlogis-postgres psql -U postgres -d arologis_db -c "
SELECT version, description, success
FROM flyway_schema_history
ORDER BY installed_rank DESC
LIMIT 5;
"
# Expected: V10 / rollback auth tables / success=true (최신 head)
```

---

## 6. 통합 dry-run 시뮬레이션 (staging 환경 1회 권고)

본 runbook 의 5 단계를 실제 운영 사고 직전 staging 에서 1회 dry-run:

```bash
# staging EC2 에 prod 데이터 snapshot 복제 후
ssh staging-ec2 'bash -s' < docs/qa/arologis-extract/rollback-dry-run.md
# (위 명령은 markdown 이므로 실제 실행 불가 — 참고용. 각 단계 명령을 별도 스크립트로 추출)
```

권고 — `infra/aws/scripts/arologis-rollback-staging-dry-run.sh` 를 별도 PR 로 추가 (본 슬라이스 범위 외).

---

## 7. 단계별 RTO/RPO

| Step | RTO (예상) | RPO | 비고 |
|---|---|---|---|
| 1. DNS | 5분 (+ TTL 300s 전파) | 0 | 데이터 영향 없음 |
| 2. Docker | 2분 | 0 | volume persistent |
| 3. Client | 30분 | 0 | git history 보존 |
| 4. Code | 1시간 | 0 | git revert — history 보존 |
| 5. DB | 10분 | dispatch/vehicle/stop/driver 보존 | auth_user/auth_refresh_token 의 data 는 손실 (재가입 필요) |
| **합** | **1시간 47분** | auth 도메인만 손실 |

---

## 8. 보고 형식 (rollback 후 TM/PM 공유)

```markdown
## Rollback 실행 보고 — <YYYY-MM-DD HH:mm>

### 트리거
- <0.2 트리거 조건 명시>

### 실행 단계
- [x] Step 1 DNS 회수 — <소요시간>
- [x] Step 2 Docker 회수 — <소요시간>
- [x] Step 3 Client 회수 — <소요시간>
- [x] Step 4 Code 회수 — PR #<번호>, merged at <SHA>
- [x] Step 5 DB 회수 — V10 applied at <timestamp>

### 검증
- samhanlogis-ci.yml green
- 시나리오 1~6 회수 후 더 이상 적용 불가 (의도)
- 기존 IT 48 + 단위 98 = 146 PASS (revert 전 baseline 복귀)

### 후속 조치
- arologis 운영자 (admin/${QA_AROLOGIS_ADMIN_PASSWORD} 시드) 재가입 안내
- dispatch/vehicle/stop/driver 데이터 보존 확인
- Phase 10 재계획 (분리 시점 재결정)
```

---

## 9. 본 runbook 사전 dry-run 체크리스트

본 슬라이스 통합 PR 머지 전 다음 dry-run 1회 실행 (5-team QA 의무):

- [ ] Step 1 의 `aws route53 list-resource-record-sets` read-only 명령 실행 → 3 레코드 존재 확인
- [ ] Step 2 의 `docker compose -f docker-compose.arologis.yml config --quiet` → exit 0
- [ ] Step 3 의 `git ls-files clients/arologis-*` → file 수 측정 + 복원 폴더 충돌 0 확인
- [ ] Step 4 의 `git revert --no-commit <SHA>` + `git revert --abort` → 충돌 0 확인
- [ ] Step 5 의 V10 SQL 작성 + `psql -c "EXPLAIN ..."` 으로 DROP plan 검증

체크리스트 1건이라도 fail 시 통합 PR comment 에 known issue 명시 후 진행 결정 (TM/PM 협의).
