# Apps Script 원본 Secrets 매핑

> 본 문서는 GitHub Push Protection 우회 + 마이그레이션 시 secret 재주입을 위한 참조.
> **실제 토큰 값은 본 파일에 절대 기록하지 않음** — 별도 `.secrets.local.txt` (gitignored) 참조.

---

## Notion API 토큰 9종 (모두 `ntn_` prefix)

| Placeholder | 원본 위치 (파일:라인) | Notion DB 추정 용도 |
|---|---|---|
| `REDACTED_NOTION_AUTH_TOKEN_001` | estimate/Code.js:2 (`AUTH_TOKEN`) | 인증 (Notion 계정/권한 검증) |
| `REDACTED_NOTION_TOKEN_002` | estimate/Code.js:83, partner-order/Code.js:69 (`NOTION_TOKEN`) | 메인 — 시트 master DB 연계 |
| `REDACTED_NOTION_TOKEN_ORDER_003` | estimate/Code.js:85, partner-order/Code.js:73 (`NOTION_TOKEN_ORDER`) | 주문 DB |
| `REDACTED_NOTION_TOKEN_SHIPPING_004` | estimate/Code.js:2229 (`NOTION_KEY_SEND`), long-pending/Code.js:8 (`NOTION_TOKEN_SHIPPING`), partner-order/Code.js:2909 | 배송/발송 DB |
| `REDACTED_NOTION_TOKEN_BEARER_005` | estimate/Code.js:2429 (`Bearer ...`) | API 호출 직접 Bearer 헤더 (노출 1건) |
| `REDACTED_NOTION_TOKEN_QUOTE_006` | estimate/Code.js:2610 (`NOTION_TOKEN_QUOTE`) | 견적 DB |
| `REDACTED_NOTION_TOKEN_LOG_007` | long-pending/Code.js:2, partner-order/Code.js:2907, 3255, partner-order/index.html:8207 (`NOTION_TOKEN_LOG`) | 작업 로그 DB |
| `REDACTED_NOTION_TOKEN_AUTH_008` | long-pending/Code.js:5, partner-order/Code.js:71 (`NOTION_TOKEN_AUTH`) | 인증 부속 |
| `REDACTED_NOTION_TOKEN_SNAPSHOT_009` | partner-order/Code.js:75 (`NOTION_TOKEN_SNAPSHOT`) | 주문 스냅샷 DB |

---

## 마이그레이션 시 처리 방침

1. **Phase 1 분석 단계**: 각 토큰이 호출하는 Notion DB endpoint (`https://api.notion.com/v1/databases/{db_id}` 등) 와 실제 사용 함수를 inventory.
2. **Phase 4 Migration Plan**: 각 Notion DB → SamhanLogis 도메인 매핑 (예: NOTION_TOKEN_ORDER → slip-service Slip / partner-service Partner / accounting-service Journal).
3. **Phase 6 구현**: Notion 의존을 모두 SamhanLogis 마이크로서비스 endpoint 로 교체. 토큰은 결과적으로 **불요** (Notion 의존 0).
4. **운영 전환 시점**: Notion DB 의 기존 데이터를 한 번 export → SamhanLogis DB 로 시드 → Apps Script 폐기.

---

## 보안 가드 (PR #30 회고 후속)

- `.gitignore` 에 `.secrets.local.txt` 추가 (이미 `.tmp/` `.pr-body*.md` 등과 함께 가드 패턴).
- 향후 legacy 코드 commit 전 push protection 가드 사전 검증 의무: `grep -rE "ntn_|secret_|sk-|AIza|Bearer [A-Za-z0-9]{20,}" <대상 디렉토리>`
- 본 문서는 placeholder 만 기록 — 원본 토큰은 `.secrets.local.txt` (gitignored) 또는 운영 환경 시크릿 매니저 (Vault/AWS Secrets Manager) 에만 저장.
