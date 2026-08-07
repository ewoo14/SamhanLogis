# 레거시 GAS 종합견적서(22) 계승 명세

> 조사일: 2026-08-01  
> 범위: 구형 helper 12개 분류 및 거래처 업데이트 프로그램(6번) 폐기 전제 확인  
> 결론: **A 6개 · B 4개 · C 2개**. 거래처의 Google Sheets 직접 조회는 두 웹앱 모두에서 찾지 못했으나, 두 앱이 동일한 거래처 DB를 조회하는 것은 아니다.

## 0. 조사 기준과 제약

- 로드맵의 “완전계승”은 기능과 표현 데이터(항목·값·집계 결과)를 계승하는 것이며, 저장소가 Notion이어서 필요했던 압축·분할·Notion CRUD는 계승 대상이 아니다: `docs/dev-reports/2026-07-31-gas-parity-roadmap.md:8-28`, `:91-123`.
- 구현, 애플리케이션 소스 변경, GAS 실행, Docker 재빌드·재기동, 공유 DB 쓰기를 수행하지 않았다.
- 자격값과 스크립트 ID는 이 문서에 기록하지 않았다.
- 견적 계산·가격 규칙과 기타 판정불가 항목은 조사하지 않았다.

### 원본 제한

작업지시에 지정된 ignored 경로 `tools/legacy-gas/종합견적서-live/`는 현재 워크트리와 확인 가능한 다른 로컬 worktree에 존재하지 않았다. 따라서 작업지시가 제공한 live 시작 행(`:18`, `:73`, …, `:343`)은 **직접 재검증하지 못했다**.

다만 12개 helper의 이름과 시작 행은 추적 원본 `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js`의 helper 블록과 정확히 일치한다. 아래 분류는 이 실제 파일의 함수 본문을 보조 원본으로 읽어 판정했다. 이 파일의 저장 유형도 `거래원장(필터링단어)`, `거래원장(거래처코드)`, `거래원장결과`로 되어 있어, live 종합견적서 앞부분이 다른 프로그램에서 복사된 잔재일 가능성이 있다. live HTML 호출부 확인 전에는 이 가능성을 확정할 수 없다.

## 1. helper 12개 분류표

| helper | 분류 | 근거 파일:행 | B인 경우 현재 대응물 유무와 위치 |
|---|---|---|---|
| `getUserAuth` | **C. 별도 판단** | 이메일 부재를 거부하고, Notion 인증 DB에서 이메일을 찾아 이름·직급을 `managerName`으로 반환한다: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:18-69`. 저장소 적응 helper가 아니라 접근 승인·사용자 표시명 계약이다. | 해당 없음 |
| `getChatMapData` | **C. 별도 판단** | Notion 전체 페이지를 순회해 `이카운트 사업자명 → 카톡방` map을 만든다: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:73-111`. | 해당 없음 |
| `saveFilterWordsToNotion` | **B. 계승 대상** | 입력 `data`를 JSON/base64로 만들지만 실제 저장 주제는 `필터링단어` 집합이다. 작업자·작업계정도 감사값으로 기록한다: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:115-139`. | **없음.** 현행 estimate-app 공개 함수 목록에 저장 RPC가 없고(`clients/web/estimate-app/lib/code.js:2814-2845`), RPC는 공개 함수만 호출할 수 있다(`clients/web/estimate-app/routes/rpc.js:25-40`). |
| `getFilterWordsFromNotion` | **B. 계승 대상** | `거래원장(필터링단어)` 최신 1건을 조회해 배열을 복원한다. 작업자 조건이 없어 **사용자별이 아니라 전역 최신값**이다: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:143-167`. | **없음.** 위와 같이 필터 단어 조회·복원 RPC/DB 계약이 없다. |
| `saveClientCodesToNotion` | **B. 계승 대상** | 입력 `data`를 `거래처코드` 주제로 저장한다: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:171-195`. 전체 거래처 마스터가 아니라 사용자가 선택한 코드 집합이다. | **없음.** 현행 directory는 전체 거래처를 `code/name/bizno/...`로 변환할 뿐 선택 집합을 저장하지 않는다: `clients/web/estimate-app/lib/directory.js:56-85`. |
| `getClientCodesFromNotion` | **B. 계승 대상** | `거래원장(거래처코드)` 최신 1건을 조회해 선택 코드 배열을 복원한다. 이것도 작업자 조건이 없는 **전역 최신값**이다: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:199-223`. | **없음.** `getCustomerDataAsync`는 전체 directory cache를 반환할 뿐 저장된 선택 집합을 복원하지 않는다: `clients/web/estimate-app/lib/code.js:2037-2061`. |
| `compressString` | **A. 계승 대상 아님** | 문자열을 gzip 후 base64로 바꾸는 저장수단이다: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:227-230`. | 해당 없음 |
| `decompressString` | **A. 계승 대상 아님** | gzip/base64 본문을 되돌리는 역변환 수단이다: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:233-237`. | 해당 없음 |
| `autoSaveResultToNotion` | **A. 계승 대상 아님** | 결과 JSON을 압축한 뒤 2,000자 조각으로 나눠 Notion page에 저장한다: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:241-277`. | 해당 없음 |
| `getHistoryFromNotion` | **A. 계승 대상 아님** | 날짜 범위의 Notion page를 조회해 page id·시간·작업자·주제 목록으로 바꾼다: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:281-316`. | 해당 없음 |
| `getSpecificHistory` | **A. 계승 대상 아님** | Notion page 1건의 분할 본문을 합치고 압축 해제한다: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:320-339`. | 해당 없음 |
| `getLatestHistoryFromNotion` | **A. 계승 대상 아님** | `거래원장결과` 최신 Notion page 1건의 분할 본문을 복원한다: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:343-372`. | 해당 없음 |

### 1.1 A 판정의 현행 상위 대체 근거

현행 견적서는 DB 기반 목록·상세·생성·수정 API를 이미 갖는다.

- 목록과 상세 조회: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/EstimateController.java:76-106`
- DB 신규 생성과 DRAFT/SENT 수정: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/EstimateController.java:109-137`
- desktop API의 목록·상세·생성·수정 호출: `clients/desktop/src/renderer/api/estimateApi.ts:218-269`

따라서 Notion page 저장, base64/gzip, 분할 본문, page id 기반 이력 조회를 다시 만들지 않는다. 소유자별 수정 권한의 세부 검증은 이번 두 과제의 범위 밖이며, A helper를 되살릴 근거가 되지 않는다.

### 1.2 B 4개에 대해 만들어야 할 것

live HTML에서 실제 호출되는 것이 확인될 경우에만 다음 DB 기반 계약을 만든다.

1. `filterWords: string[]`와 `partnerCodes: string[]`를 각각 저장·조회하는 종합견적서 설정 데이터.
2. 최신 집합을 읽고 교체 저장하는 API와 estimate-app RPC/UI 배선. Notion, gzip, base64, 2,000자 분할은 사용하지 않는다.
3. legacy 조회는 작업자 조건 없이 최신 1건을 읽으므로 원형은 **전역 공유 설정**이다. 사용자별 설정으로 바꾸려면 기능 변경 결정이 별도로 필요하다.
4. `partnerCodes`는 저장된 선택 집합 자체가 데이터다. 저장 시 현재 `partner-service` 코드 존재 여부를 검증할 수는 있지만, 전체 거래처 마스터를 이 집합의 대체물로 간주하지 않는다.
5. 작업자와 작업계정은 값 집합이 아니라 감사 정보다. 현행 `BaseEntity` 감사 필드로 보존하고 별도 업무 필드로 중복하지 않는다.

반대로 live HTML에서 호출되지 않는 복사 잔재로 확인되면 B 데이터도 종합견적서 계승 범위가 아니므로 새 기능을 만들지 않는다.

### 1.3 C 2개의 현재 상태와 판단

#### `getUserAuth`

현행 대응물이 있다. estimate-app은 Notion 인증 DB 대신 `user-service /internal/users/by-email`을 호출하고 `authorized`, `managerName`, `managerCode`를 반환한다: `clients/web/estimate-app/lib/code.js:2712-2741`. bootstrap도 이 함수를 사용한다: `clients/web/estimate-app/lib/code.js:1871-1875`.

판정: **기능 대응 완료**. 구형 `getUserAuth` 이름이나 Notion 호출을 복원하지 않는다.

#### `getChatMapData`

업무 데이터는 현행 DB에 있다.

- `notification_db.partner_chat_room_mappings`는 거래처 코드와 채팅방명을 보유하며, 거래처명은 표시·감사용 snapshot이다: `services/notification-service/src/main/java/com/samhanair/logis/notification/domain/PartnerChatRoomMapping.java:20-57`.
- 내부 목록 endpoint가 거래처 코드·거래처명·채팅방명 필터를 제공한다: `services/notification-service/src/main/java/com/samhanair/logis/notification/controller/NotificationChatRoomInternalController.java:23-53`.

그러나 current estimate-app에는 이 endpoint 호출이나 `getChatMapData` RPC가 없다(`clients/web/estimate-app/lib/code.js:2814-2845`). 판정은 다음과 같다.

- live 종합견적서 화면이 채팅방명을 표시·정렬·출력한다면 **데이터는 존재하지만 estimate-app 배선은 미대응**이다. 이름 map을 새로 저장하지 말고 거래처 코드 기반 notification-service 조회를 배선해야 한다.
- live 화면이 helper를 호출하지 않는다면 종합견적서 앞부분의 복사 잔재이므로 계승 대상이 아니다.

## 2. 거래처 업데이트 프로그램(6번) 폐기 전제 확인

### 2.1 estimate-app의 거래처 데이터 원천

데이터 흐름은 다음과 같다.

`estimate-app bootstrap/RPC → directory.fetchPartners → partner-service /internal/partners/list → partner DB → CUS_V6 cache → 화면`

근거:

- directory 계층은 Google Sheets의 `거래처`/`담당자` 탭 대신 partner-service/user-service를 호출한다고 명시한다: `clients/web/estimate-app/lib/directory.js:1-20`.
- 거래처는 `/internal/partners/list`를 끝 페이지까지 읽고 legacy 형태로 변환한다: `clients/web/estimate-app/lib/directory.js:56-85`.
- bootstrap은 directory를 prefetch한다: `clients/web/estimate-app/lib/code.js:1865-1869`, `:1937-1965`.
- 화면용 `getCustomerDataAsync`는 directory cache를 반환한다: `clients/web/estimate-app/lib/code.js:2031-2061`.

판정: **거래처 데이터는 기초 거래처 DB에서 조회한다. 거래처 Google Sheets 조회 경로는 찾지 못했다.**

#### estimate-app에 남은 Sheets 경로

Google Sheets 읽기 구현 자체는 남아 있다. 단, 거래처가 아니라 제품 카탈로그의 명시적 fallback이다.

- 기본은 `CATALOG_SOURCE=db`이고, `sheet`를 명시하면 제품·구성품·자재·추천 탭을 preload한다: `clients/web/estimate-app/lib/code.js:1842-1863`.
- preload 목록에는 `거래처`와 `담당자`가 없다: `clients/web/estimate-app/lib/code.js:1851-1857`.
- Sheets 클라이언트는 실제 Google Sheets readonly API를 호출한다: `clients/web/estimate-app/lib/google-sheets-client.js:47-76`, `:83-101`.

따라서 “애플리케이션 안에 Sheets 경로가 하나도 없다”는 명제는 거짓이지만, **6번 프로그램이 갱신하던 거래처 데이터의 Sheets 경로는 없다**. 남은 카탈로그 fallback은 거래처 fan-out 이관 대상이 아니다.

### 2.2 order-app의 거래처 데이터 원천

현재 화면의 주 경로는 다음과 같다.

`order-app tryLogin → /api/v1/auth/partner-login → partner-auth DB 인증 → dc-config-service /internal/partners/by-bizno → dc_config DB partners → 로그인 config.partnerName/managerName`

근거:

- 클라이언트 로그인은 `/auth/partner-login`을 호출한다: `clients/web/order-app/src/samhanApi.ts:281-300`.
- 로그인 성공 후 화면은 `res.config.partnerName`과 `managerName`을 사용한다: `clients/web/order-app/index.html:8546`, `:8619-8629`.
- partner-auth-service는 성공 시 `DcConfigClient.findByBizNo` 결과를 응답 config로 넣는다: `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:249-271`.
- `DcConfigClient`는 `/internal/partners/by-bizno/{bizNo}`를 호출해 거래처명·담당자 등을 매핑한다: `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/client/DcConfigClient.java:45-66`, `:88-108`.
- 그 거래처 마스터는 `dc-config-service`의 `partners` DB entity다: `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/domain/Partner.java:20-68`.

판정: **order-app도 거래처를 Google Sheets에서 직접 읽지 않는다.** 다만 현재 주 경로는 `partner-service`의 기초 거래처 DB가 아니라 `dc-config-service`의 별도 `partners` 테이블이다.

#### 정적 단건 거래처 RPC의 상태

`samhanApi`에는 `getCustomerData(partnerCode) → GET /partners/{partnerCode}` 매핑이 남아 있다: `clients/web/order-app/src/samhanApi.ts:404-406`. 그러나 current order-app에서 이 RPC의 호출부는 찾지 못했다. 또한 gateway의 `/api/v1/partners/**`는 partner-service로 라우팅된다: `services/api-gateway/src/main/resources/application.yml:273-281`. partner-service에는 정확한 `GET /api/v1/partners/{partnerCode}` 기본 조회가 없고 `/full`, `/revisions` 등 하위 경로만 있다. 따라서 이 매핑은 현재 데이터 원천이 아니며, 호출되면 계약 확인이 필요한 잠재 잔재다.

#### order-app의 Sheets 잔존 여부

다음 범위를 정적 검색했다.

- `clients/web/order-app/package.json`
- `clients/web/order-app/src/**` (테스트 제외)
- `clients/web/order-app/index.html`
- 검색어: `SpreadsheetApp`, `googleapis`, `sheets`, Google Sheets API 호출 형태

거래처를 읽는 Google Sheets 클라이언트는 없었다. `google.script.run`은 실제 GAS 호출이 아니라 HTTP API로 넘기는 호환 Proxy다: `clients/web/order-app/src/legacyShim.ts:44-97`, `:131-147`.

### 2.3 6번 폐기 전제 최종 판정

| 명제 | 판정 | 설명 |
|---|---|---|
| estimate-app이 거래처를 Google Sheets에서 읽지 않는다 | **참** | partner-service directory 사용 |
| order-app이 거래처를 Google Sheets에서 읽지 않는다 | **참** | partner-auth + dc-config-service DB 사용 |
| 두 앱이 동일한 “우리 기초 거래처 DB”를 읽는다 | **거짓** | estimate-app은 partner-service, order-app 주 경로는 dc-config-service의 별도 partners 테이블 |
| 거래처 Sheets fan-out 프로그램이 여전히 필요하다 | **아니오** | 두 앱 모두 거래처 Sheets 직접 조회가 없으므로 6번의 기존 fan-out 역할은 폐기 가능 |

결론: **6번은 “거래처 Google Sheets fan-out” 도구로서는 폐기해도 된다.** 다만 로드맵의 전제 문구는 “두 앱 모두 우리 DB 계열에서 조회한다”로 고쳐야 정확하다. “동일한 기초 거래처 DB를 조회한다”는 현재 코드와 맞지 않으며, 두 DB의 정본 통합·동기화 여부는 별도 아키텍처 과제다. 이것은 구형 Google Sheets 업데이트 프로그램을 이관해야 한다는 뜻은 아니다.

## 3. 확인하지 못한 것

1. `tools/legacy-gas/종합견적서-live/Code.js` 3,577행 원본과 live HTML이 로컬에 없어, 12 helper의 live 본문과 실제 호출 여부를 직접 확인하지 못했다.
2. 특히 B 4개와 `getChatMapData`가 live 종합견적서에서 실행되는지, 아니면 중복 `doGet` 앞의 복사 잔재인지 확인하지 못했다. 이 확인 전에는 신규 DB 설정 기능을 구현하면 안 된다.
3. 현행 서비스의 실제 운영 데이터 내용과 두 거래처 DB 간 동기화 상태는 공유 DB 조회 없이 코드만 대조했으므로 확인하지 못했다.
4. GAS 원본 실행은 지시대로 시도하지 않았다. 이번 판정에는 실행이 필요하지 않지만, live 호출 여부 확정에는 누락된 live HTML 또는 원본 파일이 필요하다.

## 4. `git status --porcelain` 원문

```text
?? docs/dev-reports/2026-08-01-gas-parity-estimate.md
```
