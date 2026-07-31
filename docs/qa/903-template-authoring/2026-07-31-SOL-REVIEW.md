# PR #1007 / Issue #903 S2 기능 회귀 검토

- 검토일: 2026-07-31
- 역할: 기능 회귀 검토자(SOL)
- 검증 대상: `feat/903-template-authoring-s2` / `d8f89abeab7d50507c8e855d0e8cf4f35bd294c9`
- 검토 원칙: 코드 수정 없음, Git 쓰기 없음, 공유 DB 쓰기 없음, Docker 재빌드·재기동 없음

## 최종 판정: BLOCK

머지 게이트 세 항목을 동시에 충족하지 못했다.

1. **실 사용자 경로 오작동 0을 입증하지 못했다.** 대상 HEAD의 프론트 dev 서버는 `http://127.0.0.1:5175`에서 기동했으나, 이 세션의 브라우저 런타임은 사용 가능한 브라우저를 `0개`로 반환했다. 따라서 기존 양식 편집 화면과 인쇄 화면을 실제로 띄워 비교하지 못했다. 코드 읽기나 단위 테스트로 이 필수 조건을 대체 판정하지 않았다.
2. **exact SHA CI가 아직 green이 아니다.** `gh pr view 1007`의 head는 exact SHA와 일치했지만, 2026-07-31 21:47 KST 재조회에서 42개 check 중 `41 pass / 1 pending`이었다. pending은 `Desktop Playwright (mock 회귀 hard gate)`이다.
3. **대상 구현의 라이브 QA 실서버 실행 증거가 없다.** 현재 `samhan-groupware-service` 컨테이너는 이 워크트리 HEAD를 재빌드·재기동한 인스턴스가 아니다. 허용된 읽기 전용 실서버 GET으로 active 양식과 과거 revision 응답은 확인했지만, 대상 HEAD 백엔드의 update/422 경로를 라이브 서버에서 실행했다고 볼 수 없다.

추가로, 생성 후 EXCEL 양식을 구형/범용 클라이언트가 `mode` 없이 평범하게 수정하는 경로는 의도와 달리 422가 되는 기능 결함을 확인했다.

## 발견 1 — EXCEL 양식의 `mode` 생략 update가 정상 저장이 아니라 422가 된다

### 실 사용자 경로

1. API 또는 향후 선택 UI에서 `document.mode="EXCEL"`인 DRAFT 양식을 만든다.
2. mode 필드를 알지 못하는 기존 클라이언트 또는 선택 필드를 생략하는 범용 클라이언트로 양식명/본문만 수정한다.
3. 클라이언트는 기존과 같은 `docType`, `schemaVersion`, `document.paper`, `document.bands`를 보내되 `document.mode`는 보내지 않는다.
4. 기대 결과는 기존 EXCEL mode를 이어받아 HTTP 200으로 저장하는 것이다. 구현 보고서도 “기존 클라이언트가 명시 mode를 생략하고 update해도 현재 저장된 명시 mode를 이어 붙인다”고 명시한다.

### 관측된 잘못된 결과(숫자)

- 제품 코드의 결정적 응답 판정: **HTTP 422**(기대 **200**). 공유 DB 쓰기 금지와 대상 백엔드 미배포 때문에 이 조합의 라이브 HTTP 호출은 하지 않았으며, 아래 비교·throw 순서로 판정했다.
- 원인 순서: 현재 `EXCEL`과 incoming 누락의 정규화값 `WORD`를 먼저 비교하여 422를 던진다. 기존 mode를 이어 붙이는 분기는 그 뒤에 있어 도달하지 못한다.
- 현재 공유 DB 영향 건수: 명시 EXCEL 양식이 **0건**이므로 현재 330건 중 이 조합으로 막히는 행은 **0건**이다.
- 재현 가능한 신규 영향: 명시 EXCEL 양식 중 mode를 생략하는 클라이언트가 수정하는 행은 **100%** 막힌다.
- 반대 조합인 현재 legacy WORD 330건에 대해 incoming `mode` 누락/null/빈 문자열/`word`/`Word`/공백 포함 값은 모두 WORD로 수렴하므로 mode 불일치 422 예상 건수는 **전체 0건, visible 0건**이다. 정확한 `EXCEL` 요청만 현재 330건 전체에서 의도된 mode 변경으로 판정되어 422 대상이다.

### 파일:행 근거

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentPayload.java:23-30` — 누락을 포함해 정확한 EXCEL 외 모든 값은 WORD로 정규화한다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentTemplate.java:113-120` — 113행에서 mode 비교·422를 먼저 수행하고, 119행에서야 incoming 누락 시 현재 mode를 보존한다. EXCEL+누락에서는 119행에 도달하지 않는다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/DocumentPayloadValidator.java:107-122` — JSON에 mode 키가 없으면 typed payload의 mode를 null로 두며, `normalizedMode()`는 이를 WORD로 본다.
- `clients/desktop/src/renderer/api/documentTemplate.ts:114-118` — update payload를 그대로 PUT한다. 현재 HEAD 클라이언트는 명시 EXCEL을 보존하지만, mode를 모르는 기존 클라이언트의 생략 요청 계약은 백엔드가 받아야 한다.

## 첫 번째 각도 — 기존 양식 열기·출력·revision·저장

### 실데이터 읽기 결과

동일한 `psql -c` 집계에서 다음을 재현했다.

| 대상 | 전체 | mode 누락 | mode 존재 | WORD | EXCEL | 미지 값 | normalize 예상 JSON 변경 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `document_templates` | 330 | 330 | 0 | 0 | 0 | 0 | 0 |
| `document_template_revisions` | 369 | 369 | 0 | 0 | 0 | 0 | 0 |

- 양식 330건 중 soft-delete되지 않은 visible 양식은 **1건**, visible ACTIVE도 **1건**이다. `status=ACTIVE`인 soft-deleted 이력은 별도로 4건이다.
- visible active 양식 실서버 GET은 **HTTP 200**, 응답 내 mode 키 **0개**였다.
- 같은 양식의 과거 revision 1 실서버 GET도 **HTTP 200**, 응답 내 mode 키 **0개**였다.
- revision 저장·조회 경로는 document JSONB를 통째로 저장하고 반환한다. 근거는 `DocumentTemplateRevisionService.java:49-59,62-71`, `DocumentTemplateRevisionResponse.java:8-17`, 프론트 조회는 `documentTemplate.ts:61-85`이다.

### 화면·출력 판정

**판정 보류가 아니라 게이트 실패다.** 대상 HEAD 프론트 dev 서버 기동은 확인했지만 브라우저 0개로 실제 화면을 열지 못했다. 따라서 “기존 양식이 변경 전과 같은 화면으로 열리고 같은 출력이 나온다”는 필수 사용자 경로를 PASS로 판정하지 않는다. 실서버 GET 200, JSON 변경 0건, renderer 파일 무변경은 참고 증거일 뿐 화면 실측을 대신하지 않는다.

### 평범한 update와 JSON mode 삽입 영향

- 현재 HEAD 프론트에서 legacy mode 누락은 parser와 draft에서 non-enumerable WORD로 유지된다(`templateSchema.ts:665-674`, `useTemplateDraft.ts:69-91`). 따라서 이 프론트가 legacy 양식 내용을 수정해 직렬화하면 mode는 요청 JSON에 끼어들지 않는다. 이 조합의 mode 추가 예상 건수는 **0건**이다.
- 반면 요청에 `mode:null`, 빈 문자열, 대소문자 변형 또는 공백 포함 값이 **명시**되면 정확한 두 값 외 WORD 규칙에 따라 백엔드는 `mode:"WORD"`를 저장한다(`DocumentPayloadValidator.java:107-122`). 공유 DB 330건 모두 legacy이므로 그런 serializer를 통한 최초 update에서는 mode 필드가 추가될 수 있는 전체 행이 **330건**, 현재 visible 사용자 경로는 **1건**이다. 이는 #998의 “명시 미지 값은 WORD” 계약 결과이며, 필드 자체를 생략한 요청과 구분해야 한다.

## 두 번째 각도 — normalize 계약 일관성

FE `normalizeTemplateAuthoringMode`와 BE `DocumentPayload.normalizeMode` 모두 정확한 두 문자열만 보존한다.

| 입력 | FE | BE | 계약 일치 |
|---|---|---|---|
| `"WORD"` | WORD | WORD | 예 |
| `"EXCEL"` | EXCEL | EXCEL | 예 |
| 누락 / `null` | WORD | WORD | 예 |
| `""` | WORD | WORD | 예 |
| `"word"`, `"Word"`, `"excel"` | WORD | WORD | 예 |
| `" WORD"`, `"WORD "`, `" EXCEL"`, `"EXCEL "` | WORD | WORD | 예 |
| 문자열이 아닌 값 | WORD | WORD | 예 |

정확한 두 값 외 WORD라는 #998 규칙과 어긋나는 normalize 지점은 찾지 못했다. 다만 위 발견 1처럼 “정규화 후 불변 비교”와 “누락 시 현재 mode 계승”의 실행 순서가 서로 충돌한다.

## 세 번째 각도 — 변경 9개 파일이 연 표면

`git show --numstat d8f89abea` 결과는 9개 파일과 일치했다.

| 파일 | 새 표면과 판정 |
|---|---|
| `useTemplateDraft.ts` | 편집 draft에 mode를 전달한다. legacy non-enumerable 상태와 명시 EXCEL enumerable 상태를 복제한다. |
| `templateSchema.ts` | active/get/revision/admin 응답을 포함한 모든 FE template parse에 mode normalize를 적용한다. |
| `templateSchema.test.ts` | FE의 EXCEL/legacy/미지 값과 v1 upcast 계약을 실행한다. |
| `DocumentPayload.java` | JSONB typed record와 API 응답 직렬화에 mode 및 normalize 계약을 추가한다. |
| `DocumentTemplate.java` | 모든 DRAFT update에 mode 불변 422를 추가한다. 발견 1의 실행 순서 결함이 이 파일에 있다. |
| `DocumentPayloadValidator.java` | 모든 문서 양식 create/update/activate 재검증에서 명시 mode를 normalize한다. |
| `DocumentTemplateIT.java` | EXCEL create/get/update/revision 및 WORD 변경 422 경로를 실행한다. |
| `DocumentPayloadValidatorTest.java` | BE EXCEL/미지/누락 normalize를 실행한다. |
| 개발 보고서 | 구현 주장과 수치를 기록한다. 라이브 UI 실측은 하지 않았다고 스스로 명시한다. |

`DocumentPayloadValidator`의 main 호출자는 `DocumentTemplateService`의 create(74행), update(101행), activate 재검증(116행)뿐이다. 따라서 결재 본문, 메시지, 일정 등 다른 aggregate의 JSON에는 직접 적용되지 않는다. 그러나 document template의 `docType`별 분기는 없으므로 저장된 **62개 고유 GROUPWARE_* docType / 330행 전체**에 동일하게 적용된다. 실데이터는 전부 mode 누락이라 현재 normalize 예상 JSON 변경은 0건이다.

## 네 번째 각도 — 보고 수치 재현

| 주장 | 재실행 결과 | 판정 |
|---|---:|---|
| 기존 양식 | 330건 | 일치 |
| 기존 revision | 369건 | 일치 |
| normalize 예상 JSON 변경 | 0건 + 0건 | 일치 |
| 백엔드 | 32 XML files / 239 tests / failures 0 / errors 0 / skipped 0 | 일치 |
| 데스크톱 | 186 files / 1,693 tests / exit 0 | 일치 |

재실행 명령:

```powershell
.\gradlew :services:groupware-service:test --rerun-tasks --no-daemon
cd clients/desktop
npm run test
```

백엔드는 `BUILD SUCCESSFUL`, `27 actionable tasks: 27 executed`였다. 데스크톱은 전체 Vitest exit 0이었고 JSON reporter 재실행으로 파일·테스트 수를 다시 집계했다.

## CI와 라이브 QA 게이트

- PR head SHA: exact target와 일치.
- GitHub checks: **41 pass / 1 pending**. 따라서 현재 시점 CI green이 아니다.
- 공유 실서버 읽기: active GET 200, 과거 revision GET 200.
- 대상 HEAD 프론트 dev 서버: 5175 기동 성공.
- 대상 HEAD의 실제 UI 열기/출력: 브라우저 0개로 미실행.
- 대상 HEAD 백엔드 update/422 라이브 실행: 현재 컨테이너가 대상 이미지가 아니며 재빌드·재기동 금지이므로 미실행.

## 이 라운드가 보지 않은 것

- 브라우저에서 기존 visible 양식 편집 화면을 실제로 연 시각 결과.
- 브라우저에서 기존 결재문서 인쇄 화면과 변경 전 화면/PDF의 픽셀·페이지 동등성.
- 브라우저에서 과거 revision을 실제 재인쇄 화면으로 연 결과.
- 공유 DB를 쓰는 기존 양식 PUT 실측. 지시된 DB 쓰기 금지 때문에 SQL과 제품 코드의 read-only 경로 계산으로 영향 건수를 산출했다.
- 대상 SHA로 재빌드·재기동한 groupware-service의 라이브 HTTP update/422 결과.
- 아직 pending인 Desktop Playwright check의 최종 결론.
- S3 mode 선택 UI, S3 Excel 편집기, S4/S5 renderer 분기, S5 Excel ACTIVE 출력. 이들은 다음 슬라이스 범위이므로 결함으로 판정하지 않았다.
- 그룹웨어 결재 문서 양식 시스템 밖의 다른 서비스/문서 aggregate. `DocumentPayloadValidator` 호출자 감사로 직접 영향이 없음을 확인했지만, 그 시스템들의 사용자 화면을 순회하지는 않았다.
