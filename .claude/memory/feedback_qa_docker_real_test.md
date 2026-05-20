---
name: qa-docker-real-test
description: QA agent 는 반드시 Docker 통해 실서버 (Testcontainers Postgres) 에서 테스트 완료. code read 만 PASS 절대 금지 (사용자 명시 2026-05-20 재강조)
metadata:
  type: feedback
---

# QA agent Docker 실서버 테스트 의무 (2026-05-20 사용자 재강조)

> 사용자 명시: "QA는 테스트 시 반드시 도커를 통해 실서버에서 테스트를 완료해야함"

QA agent 가 단위 테스트 + IT 코드만 read 하고 "PASS 가능 예상" 으로 APPROVE 하는 패턴 절대 금지.

**Why:** Windows JDK 17 / 한국 path / Korean 인코딩 / Docker 미가용 등의 trap 으로 코드만 read 하면 회귀 미감지. Linux CI 가 PASS 해도 사용자 운영 환경 (Docker 실)에서 fail 가능. PII / 외부 client / DB constraint 회귀는 실 Postgres + Flyway 실행 후만 확실.

**How to apply:**

- 모든 QA agent dispatch prompt 에 **명시 의무**:
  ```
  ## Docker 실서버 검증 의무 (사용자 명시 2026-05-20)
  
  QA agent 는 반드시 Docker 실행 후 IT 검증:
  
  1. Docker 가용 여부 확인 (`docker info` 또는 `docker ps`)
  2. Testcontainers Postgres 부팅 직접 시도:
     ```
     cd C:/dev/SamhanLogis
     ./gradlew.bat :services:<service>:test --tests <IntegrationIT> --no-daemon
     ```
  3. PASS/FAIL 결과 + JUnit XML 로그 첨부 (defects 의 detail 에 명시)
  4. Docker 미가용 시 → defects 에 "Docker 미가용으로 IT 실 검증 불가" 명시 + Linux CI 결과 첨부 (gh run view <run_id> --log) — code read 만 PASS 금지
  ```

- **회피 패턴** (절대 금지):
  - "code 검토 결과 정상 예상" → 실 실행 결과 없이 APPROVE
  - Windows Docker 미가용 → "Linux CI 가 검증할 것" 만 명시 + APPROVE
  - 단위 테스트만 실행 + IT skip → "단위 PASS" 만 명시 + APPROVE

- **허용 패턴**:
  - Docker 가용 → IT 직접 실행 + XML 결과 첨부 → APPROVE 또는 결함 명시
  - Docker 미가용 (Windows npipe trap) → **defects 의 P2 이상으로 명시** + Linux CI 결과 (`gh run view`) 직접 fetch 후 첨부 → APPROVE (Linux 결과 명시 시)

관련: [[testcontainers-windows-docker]] (Windows Docker Desktop 한계), [[dual-5agent-review]] (사이클 안 QA 의무)
