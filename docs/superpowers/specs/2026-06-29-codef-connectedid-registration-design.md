# CODEF connectedId 등록 기반 — 설계 (Sub-epic 1)

> 2026-06-29 개발책임자 브레인스토밍 확정. CODEF 금융데이터 실연동 에픽의 **첫 sub-epic**.
> 후속: 거래내역 fetch→import→분개 / 완전 2FA / 홈택스 확장은 별 sub-epic.

## 1. 배경·결정

- 개발책임자 **"전부 CODEF"** 결정(2026-06-17 하이브리드 폐기) — 계좌 입출금·카드·대출 전부 CODEF. ([[project_external_integration_research]])
- 현재 `accounting-service`: `CodefClient` 6메서드(은행/카드/대출 목록+거래내역)가 **DRY_RUN mock + CODEF stub(throw)**. `connectedId`를 인자로 받지만 **이를 생성·저장하는 로직이 전무** — 실 API의 관문 부재.
- CODEF 데모·샌드박스 client_id/secret + RSA public_key 발급됨 → **gitignored `services/accounting-service/.env`** 저장(메모리·git 비포함).

**브레인스토밍 결정**:
| 항목 | 결정 |
|---|---|
| 즉시 목표 | connectedId 등록 UX부터 풀 구축 |
| connectedId 소유 | **회사 단위 1개**(회계 관리자 MASTER 관리) |
| 이 epic 경계 | OAuth + RSA 등록 UX + connectedId/기관 저장 + **3 list 메서드 실연동(목록 검증)**. 거래내역 fetch는 다음 epic |
| 구현 | **easyCodef 공식 Java SDK**(OAuth·RSA·서명·URL-decode 처리) |

## 2. 목표·성공기준

CODEF **샌드박스**에 대해: 회계 관리자가 회계 설정 "CODEF 금융연동" 화면에서 기관(은행/카드) 로그인 자격을 입력→회사 connectedId 등록→등록된 계좌/카드 **목록을 실 샌드박스 API로 조회**해 connectedId 동작을 증명한다. 실 자격은 우리 측에 절대 저장하지 않는다.

- ✅ 성공: 샌드박스 테스트 자격으로 connectedId 1개 등록 + 등록기관 메타 저장 + `GET /connection/accounts|cards`가 실 샌드박스 응답 반환.
- ✅ 보안: 실 자격(ID/PW/인증서) 무저장·무로깅. credential-plaintext-guard 통과.

## 3. 컴포넌트 (accounting-service)

| 컴포넌트 | 종류 | 역할 |
|---|---|---|
| `CodefProperties` | 확장 | `+ publicKey`(RSA), sandbox base-url, oauth-url. 기존 client-id/secret/submit-method 유지 |
| `EasyCodefClient` | 신규 | easyCodef SDK 래퍼 — `registerInstitution(...)`(createAccount/addAccount), `listBankAccounts/Cards/Loans(connectedId)`. **인터페이스로 추출**(테스트 @MockBean·CI가 실 CODEF 미호출) |
| `CodefClientImpl` | 수정 | CODEF 분기(현 stub)가 `EasyCodefClient` 호출로 전환. DRY_RUN 분기 유지(회귀 0) |
| `CodefConnectionService` | 신규 | 등록 오케스트레이션(자격 수집→SDK 암호화·등록→connectedId/기관 저장→자격 폐기) + 목록 조회 |
| `CodefConnectionController` | 신규 | `/accounting/codef/connection/*`, page-code `accounting.bank-matching` 재사용(MASTER) |
| FE desktop `CodefConnectionPage` | 신규 | 회계 설정 → "CODEF 금융연동"(기관 등록 폼 + 등록기관 목록 + 계좌/카드 검증 조회) |

## 4. 데이터 모델 (신규 2 테이블, Flyway, BaseEntity 7 audit + soft-delete)

```
codef_connection (회사 1행)
  id            UUID PK
  connected_id  VARCHAR  -- CODEF 반환 connectedId
  status        VARCHAR  -- ACTIVE | ERROR
  [BaseEntity]

codef_registered_institution
  id                 UUID PK
  connection_id      UUID FK -> codef_connection
  business_type      VARCHAR -- BANK | CARD | LOAN
  organization_code  VARCHAR -- CODEF 기관코드
  account_identifier VARCHAR -- 계좌/카드 식별(마스킹)
  nickname           VARCHAR
  status             VARCHAR -- ACTIVE | ERROR | ADDITIONAL_AUTH
  registered_at      TIMESTAMP
  last_verified_at   TIMESTAMP
  [BaseEntity]
```

🔒 **실 자격(ID/PW/인증서) 컬럼 없음** — 입력→TLS→BE→SDK RSA 암호화→CODEF 전송→즉시 폐기. 우리 DB엔 connectedId + 기관 메타만.

## 5. 데이터 플로우

### 등록
1. 관리자: 회계 설정 "CODEF 금융연동" → 기관 선택(은행/카드) + 로그인 자격 입력(샌드박스=테스트 자격).
2. FE → `POST /accounting/codef/connection/institutions`(자격 TLS 전송).
3. BE `CodefConnectionService`: 기존 `codef_connection` 없으면 easyCodef `createAccount`, 있으면 `addAccount`(SDK가 RSA 암호화 + CODEF 샌드박스 호출).
4. CODEF가 connectedId 반환 → `codef_connection`(connectedId) + `codef_registered_institution`(메타) 저장. **raw 자격 폐기**.
5. 응답: 등록 기관(자격 제외).

### 목록 검증
- `GET /accounting/codef/connection/accounts|cards|loans` → `EasyCodefClient.listBankAccounts/Cards/Loans(connectedId)` → 실 샌드박스 응답. 기존 `CodefClientImpl` CODEF 분기 실연동.

## 6. 보안·설정

- BE-side RSA(easyCodef SDK). 자격 **무저장·무로깅**(로그에 자격 필드 마스킹/제외).
- `CODEF_PUBLIC_KEY` + 샌드박스 client-id/secret = gitignored `.env`(완료) + prod **Secrets Manager**(Phase 11 IaC). placeholder 차단(기존 가드 유지).
- `submit-method=CODEF` + sandbox base-url(예: development.codef.io — 구현 시 CODEF 문서 확정)로 전환. DRY_RUN 기본 유지.
- page-code `accounting.bank-matching`(MASTER) 게이트. UUID 비노출(connectedId는 내부, 화면=기관명/마스킹 식별자).

## 7. 에러 처리

- CODEF 에러코드(CF-xxxxx) → 사용자 메시지(자격오류/기관점검중/추가인증 필요).
- **추가인증(2FA)**: 일부 기관은 2-step 인증. 등록 응답이 ADDITIONAL_AUTH면 institution.status=ADDITIONAL_AUTH 저장 + 사용자 안내. **완전 2-way 2FA 플로우는 본 epic 내 후속 슬라이스**(샌드박스 단순자격으로 우회 가능 시 1차 미구현).
- easyCodef 토큰 만료 → SDK auto-refresh.

## 8. 테스트

- `EasyCodefClient` 인터페이스 @MockBean → `CodefConnectionService`/Controller 단위·IT(실 Postgres, CI는 CODEF 미호출).
- 등록/목록 플로우 IT(mocked easyCodef로 200/에러 분기).
- **실 샌드박스 등록·조회 = 로컬 라이브 QA**(테스트 자격, `docs/qa/` 문서화). CI가 CODEF 샌드박스 도달 불가(자격·외부망) → CI는 mocked, 실연동은 로컬 캡처.

## 9. 스코프 외 (다음 sub-epic)

- 거래내역 fetch(3 fetch 메서드)→`CodefImportService` import→분개(`DepositMatchService`).
- 완전 2FA 2-way 플로우.
- 홈택스 확장(전자세금계산서 통합조회·현금영수증·사업자등록상태).
- 프로덕션 실 자격 등록(샌드박스 검증 후, Phase 11 cutover).

## 10. 미해결/구현 시 확정

- CODEF 샌드박스 정확 base-url·OAuth-url·`account/create` 파라미터(organization 코드, 로그인 type) → 구현 시 CODEF 개발자 문서 확정.
- easyCodef Java SDK Gradle 좌표·버전 → 구현 시 확정.
- 샌드박스 테스트 기관/자격(CODEF 제공 테스트 계정) → 구현 시 CODEF 콘솔 확인.
