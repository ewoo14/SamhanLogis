# 2026-07-06 — config-audit: downstream URL·config-code 정합 (PR 예정)

> #28 config 재수렴이 발굴한 인접 config 결함(#28 out-of-scope·타 서비스/별 concern)을 별 슬라이스로 처리.

## 스코프 (config-audit·notification 데이터갭 무관)
1. **[High] arologis-service.env SLIP 포트 오류**: `SAMHAN_SLIP_SERVICE_URL=http://slip-service:8084`인데 실 slip-service 포트는 **8086**(compose/prod/partner-order 전부 8086). env template로 arologis 기동 시 slip 연동이 product-service(8084)로 향해 파손 → **8086 정정**.
2. **[높음] prod UserClient failFast 미배선**: `docker-compose.prod.yml`의 `SAMHAN_USER_CLIENT_FAIL_MODE=STRICT`가 실제 `UserClient`(notification·groupware의 `setFailFast(false)` 고정)에 반영 안 됨 → application.yml property 매핑 추가 or 무효 config 제거(설계 확인).
3. **[낮음] notification.env ALIGO_API_URL 빈값**: env template 빈값 vs operational-validation.ps1 기대 불일치(런타임 application.yml 기본값 작동) → template 기본값 명시 or 스크립트 정합.

## 계획
- 전 서비스 env-template SAMHAN_*_SERVICE_URL 포트 vs compose 실 포트 전수 대조(동종 갭 sweep).
- UserClient failFast config 배선 여부 설계 판단(개발책임자 정책 아닌 기술 결정).
- 검증: 마이그 무관·compose config·해당 서비스 test.

## 리뷰
Opus 5-agent↔Codex 5-agent(라이브)·0수렴·9-게이트.
