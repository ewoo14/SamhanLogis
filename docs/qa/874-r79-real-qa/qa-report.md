# R79 라이브QA 보고서 — PR #1057 · 이슈 #874

## 환경 확인

| 확인 항목 | 실측 | 판정 |
|---|---|---|
| 렌더러 워크트리 | `C:\dev\Samhan-Public\.claude\worktrees\t874\clients\desktop`의 Vite 프로세스이며, 실제 명령 경로에도 이 워크트리가 표시됨 | PASS |
| 렌더러 주소/포트 | `http://localhost:5301/`, `--host localhost --port 5301 --strictPort`; 기동 로그에 동일 주소 확인. 5301은 기동 전 빈 포트 | PASS |
| 화면 호출 API | Playwright `request`/`response` 이벤트로 게이트웨이 요청·응답을 기록. `GET /api/v1/partner-dc-configs/4348703365`, 상품 조회, 가격기억 조회, `POST /slips`, 저장 후 `GET /slips/{id}` 원문 확인 | PASS |
| 관련 컨테이너 배포본 | `docker inspect -f '{{.Created}}'` 실측: product `2026-08-05T17:31:13.740980474Z`, dc-config `2026-08-05T17:31:13.74187812Z`, gateway `2026-08-05T13:55:20.45079612Z`, slip `2026-08-05T17:08:04.170798592Z` | 재배포 없음 |
| 검증 HEAD | `64e189d5395514d2da4e0e32f216022dc15f6ebc` | 일치 |

렌더러는 `localhost`로만 접속했고, product-service·dc-config-service는 재빌드·재배포하지 않았다.

## 최종 판정

**BLOCK — R78 결함 #2가 실서버·실화면에서 해소되지 않았다.**

정상 경로의 저장 자체는 201이지만, `AR09TXEAAWKNEU-04`가 요구 정가 `1,080,000`이 아니라 거래처 최근단가 `561,600`으로 화면·POST·재조회에 동일하게 남는다. 따라서 “화면값과 저장 payload·저장 결과가 같아야 한다”는 동일성은 성립하지만, 요구된 기대값과는 불일치한다.

## 시나리오 결과

| 시나리오 | 기대 | 실측 | 판정 |
|---|---|---|---|
| #1 `AX17B17NNDB-86` | 정가 204,000, 전역DC 문구 없음 | 화면 204,000, POST/재조회 `unitPriceWithVat=204000`; 라인 문구 `DC 없음`이고 전역DC 문구 없음 | PASS |
| #2 `AR09TXEAAWKNEU-04` | 정가 1,080,000, 전역DC 문구 없음 | 상품 API는 `sellingPrice=1080000`, `hasVariableDiscount=false`이나 화면이 `거래처 최근단가 561,600`; POST/재조회 `unitPriceWithVat=561600` | **BLOCK** |
| #3 `AJ060MXHNBC1` | 전역DC 48%, 문구 표시 | 화면 1,355,640, `거래처 전역DC 48% 적용`; POST/재조회 `unitPriceWithVat=1355640` | PASS |
| #4 `AJ020FERPBC2` | 고정DC 45% 우선, 1,089,000 | 화면 1,089,000, `품목 고정DC 45% 적용`; POST/재조회 `unitPriceWithVat=1089000` | PASS |
| #5 네 라인 혼합 저장 | 라인별 규칙, HTTP 201, 재조회 동일 | POST `201`, 전표 `2026/08/06-20` 재조회 `200`; #2만 기대값과 불일치 | **BLOCK** |

### F2 — DC 조회 4초 지연 및 거래처 변경

`GET /api/v1/partner-dc-configs/4348703365` 하나만 4초 지연시킨 뒤, 응답 도착 전에 거래처를 `000011111111`로 변경하고 `AJ060MXHNBC1`을 선택했다.

| 항목 | 실측 | 판정 |
|---|---|---|
| 품목 즉시 확정 | 화면에 `AJ060MXHNBC1`, 2,607,000 표시 | PASS |
| 저장 활성화 | `enabled=true`, `enabledMs=3`ms (5초 이내) | PASS |
| 늦은 이전 거래처 응답 오염 | 지연 응답 `matched=1` 후에도 새 거래처 라인 2,607,000 유지 | PASS |
| 저장/재조회 | POST `201`, 재조회 `200`, `unitPriceWithVat=2607000` | PASS |

두 번째 거래처의 DC API는 실서버에서 `404 DC 설정을 찾을 수 없습니다`였으며, 이는 정가 fallback으로 처리됐다. 지연된 48% 응답이 새 라인을 덮어쓰지는 않았다.

## 결함 근거

상품 원문은 다음과 같다.

```text
GET http://localhost:8080/api/products?q=AR09TXEAAWKNEU-04&size=20&usageScope=PARTNER_ORDER
sellingPrice=1080000.00
categoryKey=homemulti
fixedDiscountRate=null
hasVariableDiscount=false
```

그러나 같은 라인 선택 직후 가격기억 API가 다음 값을 반환했고, 화면과 저장이 이를 적용했다.

```text
GET http://localhost:8080/slips/price-memory?partnerId=77d0513c-5d31-441d-81db-e6007691a482&productId=d7f488a5-6259-379c-8035-ed551e75a102
data.unitPrice=561600.00
data.source=LINE_SAVE

POST http://localhost:8080/slips
lines[1].unitPrice="561600"

저장 후 GET /slips/{id}
lines[1].unitPriceWithVat=561600.00
```

R76에서 생성된 동일 품목의 최근단가 기억이 존재하는 상태에서 R79 요구 정가가 적용되지 않는 것이 재현 원인이다. 관련 원문은 [network-responses.json](network-responses.json), [07-mixed-lines-after-save-save-response.txt](07-mixed-lines-after-save-save-response.txt), [07-mixed-lines-after-save-requery-response.txt](07-mixed-lines-after-save-requery-response.txt)에 있다.

## 캡처 및 원문

캡처는 저장소 루트의 `docs/qa/874-r79-real-qa/screenshots/`에 11장 생성했다.

- 초기/라인별 선택: `01-initial.png` ~ `05-line-4-aj020ferpbc2.png`
- 혼합 저장 전/후: `06-mixed-lines-before-save.png`, `07-mixed-lines-after-save.png`
- F2 지연/거래처 전환: `08-f2-initial.png`, `09-f2-after-partner-switch.png`, `10-f2-before-save.png`, `11-f2-after-save.png`
- 네트워크 전체 원문: [network-responses.json](network-responses.json)
- 저장 응답: [07-mixed-lines-after-save-save-response.txt](07-mixed-lines-after-save-save-response.txt), [11-f2-after-save-save-response.txt](11-f2-after-save-save-response.txt)
- 저장 후 재조회: [07-mixed-lines-after-save-requery-response.txt](07-mixed-lines-after-save-requery-response.txt), [11-f2-after-save-requery-response.txt](11-f2-after-save-requery-response.txt)

보조적으로 `/app/version`, `/app/notices/active`, `/logs/front`는 실서버에서 503이었고, 거래처 `000011111111` DC 조회는 404였다. 이 응답들은 목표 품목의 가격 판정과 F2 stale guard 결과를 변경하지 않았다.

## 신규 파일 목록

- `clients/desktop/r79-riusage-live-qa-driver.mjs`
- `docs/qa/874-r79-real-qa/qa-report.md`
- `docs/qa/874-r79-real-qa/` 아래 단계별 txt/png, 네트워크 원문, 저장/재조회 원문

기존 `clients/desktop/playwright/874-riusage-real-qa.spec.ts`는 수정하지 않았다. git 명령으로 쓰기/커밋/푸시하지 않았다.
