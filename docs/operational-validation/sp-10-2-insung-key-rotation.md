# SP-10-2 인성데이타 퀵프로그램 — 운영 키 관리 및 rotation 절차

> 작성일: 2026-05-19
> 작성자: DevOps (SP-10-2 W10-2)
> 보안 등급: 내부 운영 문서 (repo 커밋 허용 — 실 키 값 미포함)

---

## 1. 보안 원칙

- **prod 키는 운영 PC `.env` 파일에만 보존** (SP-08-8 일관).
- GHCR 이미지 빌드 컨텍스트 / repo / CI 로그 / Docker image layer 평문 차단.
- `check-credential-plaintext.sh` INSUNG_QUICK 가드가 repo push 시 자동 탐지.
- `SAMHAN_INSUNG_QUICK_API_KEY`, `SAMHAN_INSUNG_QUICK_API_URL`, `SAMHAN_INSUNG_QUICK_PARTNER_ID`, `SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET` 4키 — **빈 값 의무, placeholder 자체 금지**.

---

## 2. 키 발급 단계 (W10-2 trigger)

인성데이타 vendor 협약 완료 후 아래 절차를 따른다:

1. 인성데이타 담당자에게 sandbox 계정 + API 자격 발급 요청.
2. 발급 받은 값을 **운영 PC** (EC2 또는 로컬 dev PC) `/opt/arologis/.env` (운영) 또는 `infrastructure/env-templates/.env.local` (로컬 dev) 에 직접 입력.
3. 해당 파일은 `.gitignore` 적용 확인 — repo 에 절대 커밋하지 않는다.

```dotenv
# 운영 PC /opt/arologis/.env (예시 — 실 값은 직접 입력)
SAMHAN_INSUNG_QUICK_API_URL=https://api.insungdata.co.kr/quick/v1
SAMHAN_INSUNG_QUICK_API_KEY=<인성데이타_발급_키>
SAMHAN_INSUNG_QUICK_PARTNER_ID=<파트너_ID>
SAMHAN_INSUNG_QUICK_SANDBOX_MODE=true
SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET=<webhook_시크릿>
```

---

## 3. sandbox → prod cutover 절차

sandbox 키 검증 완료 후 prod 전환 시:

1. 인성데이타에서 prod 키 별도 발급 요청.
2. 운영 PC `.env` 갱신:
   - `SAMHAN_INSUNG_QUICK_API_KEY` = prod 키로 교체.
   - `SAMHAN_INSUNG_QUICK_SANDBOX_MODE=false` 로 변경.
   - `SAMHAN_AROLOGIS_MATCHER_PROVIDER=insung-quick` 로 변경.
3. `docker-compose.arologis.yml` rolling restart:
   ```bash
   docker-compose -f /opt/arologis/docker-compose.arologis.yml up -d --no-deps arologis-service
   ```
4. 아래 §5 검증 절차 수행.

---

## 4. 키 rotation 절차 (분기별 갱신 의무)

| 항목 | 주기 | 담당 |
|---|---|---|
| `SAMHAN_INSUNG_QUICK_API_KEY` | 분기 1회 (1월/4월/7월/10월) | DevOps |
| `SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET` | 분기 1회 동반 rotation | DevOps |
| `SAMHAN_INSUNG_QUICK_PARTNER_ID` | 계약 갱신 시 | DevOps + PM |

rotation 절차:

1. 인성데이타 담당자에게 신규 키 발급 요청 (구 키 만료 7일 전).
2. 운영 PC `.env` 신규 키로 갱신.
3. rolling restart (§3 동일).
4. 구 키 만료 확인 후 인성데이타 측 구 키 폐기 요청.
5. rotation 이력 `docs/operational-validation/key-rotation-log.md` 에 날짜+담당자만 기록 (키 값 미포함).

---

## 5. 검증 절차

### 5-1. sandbox-mode=true 기동 확인 (W10-2 기본 상태)

```bash
curl -X GET http://localhost:8097/actuator/health
# 기대: {"status":"UP"} — sandbox-mode=true 에서 InsungQuickClient 미초기화 상태도 UP 정상
```

### 5-2. matcher provider 확인

```bash
curl -X GET http://localhost:8097/actuator/env \
  | python3 -m json.tool \
  | grep -A2 "arologis.matcher.provider"
# 기대: mock (키 없을 때) 또는 insung-quick (prod cutover 후)
```

### 5-3. webhook 엔드포인트 연결 확인 (sandbox key 발급 후)

```bash
# match-result webhook — HMAC 서명 검증 포함
curl -X POST http://localhost:8097/internal/arologis/insung/match-result \
  -H "Content-Type: application/json" \
  -H "X-Internal-Token: ${SAMHAN_INTERNAL_TOKEN}" \
  -H "X-Insung-Signature: <sandbox_test_sig>" \
  -d '{"orderId":"TEST-001","driverId":"D-001","status":"MATCHED"}'
# sandbox-mode=true 시 서명 검증 우회 → 200 응답
```

### 5-4. prod cutover 후 sandbox-mode=false 변경 의무 확인

```bash
# prod 전환 후 반드시 확인:
grep 'SAMHAN_INSUNG_QUICK_SANDBOX_MODE' /opt/arologis/.env
# 기대: SAMHAN_INSUNG_QUICK_SANDBOX_MODE=false
```

---

## 6. 비상 차단 절차

인성데이타 API 장애 또는 키 유출 의심 시:

```bash
# 즉시 mock fallback 전환 (무중단)
# 운영 PC .env 수정:
SAMHAN_AROLOGIS_MATCHER_PROVIDER=mock

# rolling restart:
docker-compose -f /opt/arologis/docker-compose.arologis.yml up -d --no-deps arologis-service

# 인성데이타 측 키 폐기 요청 (전화/이메일 병행)
```

---

## 7. 관련 파일

| 파일 | 역할 |
|---|---|
| `infrastructure/env-templates/arologis-service.env` | 빈 값 템플릿 (repo 공개, 실 값 없음) |
| `infrastructure/docker/docker-compose.arologis.yml` | 컨테이너 환경변수 전달 (운영 PC `.env` 참조) |
| `scripts/check-credential-plaintext.sh` | CI grep 가드 — INSUNG_QUICK 패턴 포함 |
| `.github/workflows/arologis-ci.yml` | credential-guard job (SP-10-2 자동 적용) |
