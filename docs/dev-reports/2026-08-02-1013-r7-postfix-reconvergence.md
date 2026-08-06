# PR #1059 / 이슈 #1013 — R7 postfix 재수렴 리뷰

작성일: 2026-08-02  
대상 브랜치: `feat/1013-dispatch-inherit`  
대상 HEAD: `d3efbd93708fdd81e2c9e278467ca8ce980e6365`

## 0. 결론

**판정: BLOCKING / 재수렴 실패.**

R5의 전화번호 그룹화 자체는 실 데이터에서 원문 메시지를 누락하지 않았다. 활성 OUTBOUND 2,303건 중 번호 보유 1,911건은 날짜별 전화번호 2개 그룹으로 합쳐졌고, production `buildSendEntries` 실행 결과 병합 전 메시지와 병합 후 문자열의 순서 포함 관계는 1,911/1,911, 누락 0건이었다. 번호 없는 392건은 외부 SMS entry에 0건 포함되고, 실 DB 동일 전표 중복도 0건이다.

그러나 만들어진 2개 entry는 실제 send 계약을 통과하지 못한다.

1. 번호 보유 1,911건 모두 `partnerCode`가 null/blank이고, R5 병합 entry의 대표 `partnerCode`도 두 그룹 모두 `null`이다. BE `SendEntry.partnerCode`는 `@NotBlank`다.
2. 2026-06-08의 1,908건 병합 문구는 128,275자(UTF-8 271,911 bytes)다. BE `SendEntry.message`는 `@Size(max = 2000)`이다.
3. 따라서 “1,911건 → 2건으로 그룹화”는 FE 문자열 생성까지만 성립한다. 실제 send endpoint가 수용할 수 있는 entry는 **0건**이다. 실제 send POST는 금지 조건에 따라 호출하지 않았다.
4. blocked lookup 실패는 한 entry만 격리하는 실패가 아니라, partner-service가 전역 장애이면 각 entry가 모두 `isBlocked=true`가 되어 정상 대상 전체를 `BLOCKED`로 만든다. 기존 실패 주입 테스트는 1건이 `BLOCKED`가 되고 SMS adapter 호출이 0회임을 실행으로 확인한다. 실 데이터에는 partnerCode와 번호를 동시에 가진 정상 유효 entry가 0건이라 실제 데이터 혼합 배치 주입은 수행할 수 없었다.
5. `8086`은 실제 slip-service의 내부 포트가 맞다. 하지만 current local/prod compose의 `notification-service`에는 `SAMHAN_SLIP_SERVICE_URL` 주입이 없고, 공유 컨테이너에서도 `UNSET`이다. R6의 코드 기본값 `http://localhost:8086`은 notification 컨테이너 자기 자신을 가리키며 실제로 도달 불가다. 명시적 서비스 DNS `slip-service:8086`은 도달 가능하다. 즉 포트 숫자는 고쳤지만 notification-service의 실제 연결은 아직 수렴하지 않았다.

실제 SMS/Aligo 발송, send endpoint POST, Docker 이미지 재빌드, DB write/DDL은 전혀 하지 않았다. dev의 `SENT`/`SUCCESS`를 실전달 성공으로 세지 않았다.

## 1. 조사 경계와 실측 모집단

공유 PostgreSQL에는 SELECT만 실행했다. 실 데이터 집계 원문은 다음과 같다.

```text
 total | no_phone | with_phone | phone_without_partner_code | duplicate_groups | duplicate_extra | date_phone_groups | pregroup_extra 
-------+----------+------------+----------------------------+------------------+-----------------+-------------------+----------------
  2303 |      392 |       1911 |                       1911 |                0 |               0 |                 2 |           1909
(1 row)
```

```text
 slip_date  | with_phone | phone_groups | pregroup_extra | missing_partner_code 
------------+------------+--------------+----------------+----------------------
 2026-06-07 |          3 |            1 |              2 |                    3
 2026-06-08 |       1908 |            1 |           1907 |                 1908
(2 rows)
```

차단/단톡방 실 DB 원문:

```text
 total_rows | active_rows | deleted_rows 
------------+-------------+--------------
          0 |           0 |            0
(1 row)
```

```text
 active_mappings 
-----------------
             112
(1 row)
```

## 2. 각도 1 — 발송되면 안 되는 곳에 나가는가

### 2.1 번호 없는 392건

실 DB 활성 OUTBOUND는 2,303건, 번호 보유 1,911건, 번호 없음 392건이다. 현행 `buildSendEntries`는 `recipientPhone.trim()`이 빈 행을 `continue`한다. 실 데이터 투영에서 번호 없는 392건이 외부 SMS entry에 포함된 수는 **0건**이다.

이 392건은 preview의 `unmapped` 표본에는 남는다. 다만 send 결과 상세에는 entry 자체가 만들어지지 않아 “번호 없음/미발송” 행별 결과로 남지 않는다. 레거시의 `N_<index>` 표본 보존과 비교하면 외부 전송 제외는 같고, 발송 결과 행 가시성은 부분 계승이다.

### 2.2 동일 전표 중복

실 DB `(slip_date, slip_no)` 기준 중복은 다음과 같다.

```text
duplicate_groups=0
duplicate_extra=0
```

따라서 현재 실 데이터로 만들어지는 동일 전표 중복 entry는 **0건**이다. 다만 현행 `buildSendEntries`에는 `slipNo` dedupe가 없으므로 upstream 중복에 대한 별도 방어는 없다. 이번 실 데이터에는 중복 표본이 없어 그 회귀는 실행 재현하지 않았다.

### 2.3 동일 번호 초과 요청

그룹화 전 잠재 초과는 `1,911 - 2 = 1,909건`이었다. production `buildSendEntries`에 실 slip-service 응답을 투영해 실행한 결과 날짜별 entry가 각각 1건이므로, 그룹 내부 초과 entry는 **0건**이다.

그러나 두 entry 모두 `partnerCode=null`이고 한 entry는 메시지 크기 제한을 초과한다. 따라서 외부 전송까지 도달한 정상 entry는 0건이며, 이 라운드는 실제 send POST를 호출하지 않았다.

**각도 1 판정: PARTIAL PASS.** 번호 없음 외부 혼입 0, 실 동일 전표 중복 0, 전화번호 그룹 초과 0은 확인했다. 하지만 실제 발송 가능한 유효 entry도 0이라 외부 전달 안전성의 end-to-end PASS는 아니다.

## 3. 각도 2 — 나가야 할 정보가 그룹화로 사라지는가

실 slip-service GET 응답을 현재 `MessageTemplateService`와 같은 규칙으로 렌더하고, production `buildSendEntries`를 Vite SSR로 직접 로드해 실행했다. 실제 실행 원문:

```text
{"date":"2026-06-07","sourceRows":3,"entriesForDate":1,"representativePartnerCode":null,"messageChars":199,"messageUtf8Bytes":427,"dispatchHeaders":3,"exactOrderedMerge":true,"missingMessages":0,"firstSlipNo":"2026/06/07-4688","lastSlipNo":"2026/06/07-4686"}
{"date":"2026-06-08","sourceRows":1908,"entriesForDate":1,"representativePartnerCode":null,"messageChars":128275,"messageUtf8Bytes":271911,"dispatchHeaders":1908,"exactOrderedMerge":true,"missingMessages":0,"firstSlipNo":"2026/06/08-1908","lastSlipNo":"2026/06/08-1"}
```

실측 해석:

| 날짜 | 원 전표/메시지 | 병합 entry | `[배차안내]` 절 | 순서대로 정확 병합 | 누락 | 문자 수 | BE 2,000자 제한 |
|---|---:|---:|---:|---|---:|---:|---|
| 2026-06-07 | 3 | 1 | 3 | true | 0 | 199 | 통과 크기 |
| 2026-06-08 | 1,908 | 1 | 1,908 | true | 0 | 128,275 | **초과** |
| 합계 | 1,911 | 2 | 1,911 | true | **0** | 128,474 | 1건 초과 |

따라서 **R5 병합 연산 때문에 사라진 렌더 메시지는 0건**이다. 하지만 1,908건 그룹은 실제 계약상 보낼 수 없는 크기다. 정보 보존 문자열을 만들었을 뿐 발송 가능한 메시지를 만든 것은 아니다.

또한 “모든 전표 내용”을 전표 원본 전체로 해석하면 별도 차이가 있다. 실제 번호 보유 1,911건은 모두 `slip_no`가 있지만 현재 `MessageTemplateService` 본문에는 `slipNo`를 넣지 않는다.

```text
 max_address_len | address_truncated_rows | max_lines | line_capped_rows | slip_no_present_but_not_in_template 
-----------------+------------------------+-----------+------------------+-------------------------------------
               0 |                      0 |         1 |                0 |                                1911
(1 row)
```

이번 실 데이터에서는 주소 80자 truncate와 품목 100건 cap으로 잘린 행은 0건이다. 반면 전표번호 1,911개는 그룹화 전 개별 현행 메시지부터 포함되지 않는다. 이는 R5 병합 중 손실은 아니지만 레거시/업무 의미의 “전표 내용 완전 포함”이라고 보고할 수 없는 이유다.

**각도 2 판정: BLOCKING.** 병합 연산 누락은 0건이나, 1,908건 그룹이 2,000자를 126,275자 초과하고 두 대표 partnerCode가 null이라 실제 발송 계약을 통과하지 못한다.

## 4. 각도 3 — blocked fail-closed가 정상 발송을 막는가

R4의 기존 실패 주입 테스트를 강제 재실행했다. 결과 XML 원문:

```text
<testsuite name="com.samhanair.logis.notification.service.DispatchBatchSendServiceTest" tests="1" skipped="0" failures="0" errors="0" timestamp="2026-08-02T14:00:49" hostname="DESKTOP-8SO2GTL" time="2.105">
  <testcase name="blocked 조회 실패 — 안전하게 차단하고 SMS adapter에 도달하지 않는다" classname="com.samhanair.logis.notification.service.DispatchBatchSendServiceTest" time="2.105"/>
  <system-out><![CDATA[23:00:51.721 [Test worker] WARN com.samhanair.logis.notification.service.DispatchBatchSendService -- DispatchBatchSendService — blocked lookup 실패 partnerCode=P-LOOKUP-FAIL, msg=partner-service unavailable
]]></system-out>
```

이 실행은 lookup 실패 1건이 `BLOCKED=1`, SMS adapter 호출 0회가 되는 기존 회귀 계약을 확인한다. 현행 서비스는 entry loop 안에서 예외마다 `isBlocked=true`를 지정한다. 따라서 partner-service 자체가 장애이면 모든 entry의 lookup이 같은 방식으로 실패하고, 정상 거래처까지 전부 `BLOCKED`가 된다. 재시도, 캐시, “조회 불가” 별도 상태는 없다.

실 DB 활성 blocked 행은 0건이다. 동시에 번호 보유 1,911건 모두 partnerCode가 없어, Bean Validation을 통과하는 실 정상 SMS entry가 0건이다. 제약의 “합성 데이터 금지”와 “실제 SMS/send POST 금지”를 지키기 위해 실 데이터 정상+장애 혼합 send 호출은 수행하지 않았다.

**각도 3 판정: BLOCKING.** fail-closed가 entry 단위 장애 격리가 아니라 provider 전역 장애 시 정상 배치 전체 차단으로 확대된다. 실제 유효 정상 표본이 0건인 데이터 결함도 함께 존재한다.

## 5. 각도 4 — 포트 교정 후 실제 slip-service에 붙는가

### 5.1 8086 서비스 정체

공유 Docker 상태 원문:

```text
samhan-slip-service b958c19fb0c5 127.0.0.1:18086->8086/tcp Up 9 hours (healthy)
samhan-product-service infrastructure-product-service 127.0.0.1:8084->8084/tcp Up 12 hours (healthy)
```

notification 컨테이너에서 서비스 DNS health를 호출한 원문:

```text
http://slip-service:8086/actuator/health -> {"status":"UP"}
http://product-service:8084/actuator/health -> {"status":"UP"}
http://localhost:8086/actuator/health -> UNREACHABLE
http://localhost:8084/actuator/health -> UNREACHABLE
```

호스트의 `18086 -> container 8086` 매핑으로 실제 internal outbound endpoint를 GET한 원문:

```text
port=18086 status=200 dataCount=3 contentType=application/json
port=8084 status=403 error=원격 서버에서 (403) 사용할 수 없음 오류를 반환했습니다.
```

따라서 **8086은 slip-service 포트가 맞고**, `/internal/slips/outbound`도 실제 slip-service에서 200/data 3건으로 동작한다. 8084는 product-service다.

### 5.2 notification-service 실제 배선

공유 notification 컨테이너의 환경 원문:

```text
SAMHAN_SLIP_SERVICE_URL=UNSET
```

current `infrastructure/docker-compose.local-all.yml`과 `infrastructure/docker-compose.prod.yml`의 `notification-service.environment`에도 `SAMHAN_SLIP_SERVICE_URL`이 없다. R6 current code 기본값은 `http://localhost:8086`이다. 위 실행처럼 notification 컨테이너의 `localhost:8086`은 도달 불가다. 실제로 붙으려면 컨테이너 배선은 `http://slip-service:8086`이어야 한다.

공유 notification image 생성 시각은 R4~R6보다 이전이며, Docker 이미지 재빌드 금지 때문에 current HEAD image로 재기동 검증하지 않았다.

```text
image=infrastructure-notification-service created=2026-07-22T15:45:47.216782028Z
```

R6 config audit 재실행 원문:

```text
config-audit validation passed: 161 URL/template checks
```

이 audit는 `8086` 숫자 일치는 잡지만 notification-service compose의 서비스 DNS 주입 누락은 잡지 못했다.

**각도 4 판정: BLOCKING.** 8086의 서비스 정체는 PASS지만, notification-service가 실제 사용하는 주소는 current compose에서 주입되지 않아 연결 FAIL이다.

## 6. 각도 5 — 레거시 원문 대조

### 6.1 blocked 행별 오류 — `Code.js:269-293`

```javascript
 269:       var 거래처_raw = cleanValue(match_row['거래처']);
 270:       var 거래처_norm = normalizeForMatch(거래처_raw);
 271: 
 272:       if (거래처_norm && blocklist[거래처_norm]) {
 273:         var kakao_room_blk = '';
 274:         if (거래처_norm && kakaoIndex[거래처_norm]) {
 275:           var rblk = kakaoIndex[거래처_norm];
 276:           kakao_room_blk = isAccountingRoom_(rblk) ? '' : rblk;
 277:         }
 278:         result_rows.push({
 279:           '원본내역': original_text,
 280:           '거래처명': 거래처_raw,
 281:           '전표번호': dispatch_number,
 282:           '배송주소': '',
 283:           '인수자 번호': '',
 284:           '발송멘트': '발송금지 업체입니다.',
 285:           '단톡방': kakao_room_blk,
 286:           '기사번호': '',
 287:           'type_word': '당일배송',
 288:           'override_sun': 'FALSE',
 289:           'is_remote': false,
 290:           '_dateKey': rowDateKey
 291:         });
 292:         continue;
 293:       }
```

현행 mapped row는 `blocked` flag를 행에 남긴다. 하지만 unmapped preview는 `isBlocked(partnerCode)`를 호출한 반환값을 버리고 일반 `UnmappedPartner`로 넣는다. send에서 다시 막힐 때만 `BLOCKED` 상세가 생긴다. lookup 장애도 실제 차단과 같은 `BLOCKED`로 합쳐진다. 레거시의 명시적 행별 차단 오류와 완전히 같지 않다.

### 6.2 번호 추출 실패 빈 문자열 — `Code.js:299-305`

```javascript
 299:       var raw_phone = cleanValue(match_row['인수자 번호']);
 300:       var phone_match = raw_phone.match(/(010(?:[-.\s]?\d){8})/);
 301:       var 인수자번호 = '';
 302:       if (phone_match) {
 303:         var digits = phone_match[1].replace(/\D/g, '');
 304:         if (digits.length === 11) 인수자번호 = digits.slice(0,3) + '-' + digits.slice(3,7) + '-' + digits.slice(7);
 305:       }
```

현행도 null/blank/공백-only 번호를 external entry에서 제외한다. 실 392건의 외부 혼입은 0건이다. 다만 번호 형식 정규식 검증은 하지 않고 nonblank 문자열이면 entry로 수용하므로 레거시와 형식 검증까지 같은 것은 아니다.

### 6.3 `N_<index>` 행 그룹 보존 — `Index.html:1154-1168`

```javascript
1154:         let roomKey = String(row['단톡방'] || '').trim();
1155:         let phoneKey = String(row['인수자번호'] || '').trim();
1156:         let key = roomKey ? 'R_' + roomKey : (phoneKey ? 'P_' + phoneKey : 'N_' + ai);
1157: 
1158:         let aj = ai;
1159:         while (aj < list.length) {
1160:           let rj = list[aj];
1161:           if (rj['에러']) break;
1162:           let rr = String(rj['단톡방'] || '').trim();
1163:           let rp = String(rj['인수자번호'] || '').trim();
1164:           let k2 = rr ? 'R_' + rr : (rp ? 'P_' + rp : 'N_' + aj);
1165:           if (k2 !== key) break;
1166:           aj++;
1167:         }
1168:         let group = list.slice(ai, aj);
```

현행 preview는 번호 없는 392건을 `unmapped`에 유지하므로 표본 자체는 보존한다. 하지만 send entry/result에는 넣지 않아 `N_<index>`와 같은 명시적 미발송 결과 그룹은 없다.

레거시 병합 본문은 하차일별 `라인`을 모은 뒤 하나의 안내문으로 만든다(`Index.html:1170-1188`). 현행은 전표별 완성 메시지를 `\n\n`으로 단순 연결한다. 실 메시지 누락은 0건이지만 1,908개 안내 헤더가 반복되고 128,275자가 되어 레거시의 그룹별 compact 병합과 같지 않다.

**각도 5 판정: PARTIAL / 비동일.** 번호 없음 외부 제외와 표본 유지 방향은 같지만, blocked 장애/실차단 상태 구분, 번호 형식 검증, `N_<index>` 미발송 결과, compact 그룹 병합은 레거시와 다르다.

## 7. 종합 판정표

| 각도 | 실측 | 판정 |
|---|---|---|
| 1. 오발송/중복 | 번호 없음 외부 0/392, 동일 전표 중복 0, 전화번호 그룹 초과 0 | PARTIAL PASS — 유효 send 도달 0 |
| 2. 정보 누락 | rendered message 1,911/1,911, 그룹 누락 0; 1,908건 그룹 128,275자; slipNo 본문 누락 1,911 | **BLOCKING** |
| 3. blocked 실패 | 실패 주입 1건 BLOCKED, adapter 0; provider 전역 장애 시 모든 entry 동일 차단 | **BLOCKING** |
| 4. slip port | 8086 slip endpoint 200; notification compose env 누락, localhost:8086 unreachable | **BLOCKING** |
| 5. 레거시 | 외부 제외/표본 방향 일부 동일, 행 오류·형식·compact 병합 비동일 | PARTIAL |

PR #1059는 머지 전 재수렴 조건을 충족하지 못한다.

## 8. 재현 원문 요약

이번 라운드에서 실제 실행한 검증은 다음과 같다.

```text
git rev-parse HEAD
d3efbd93708fdd81e2c9e278467ca8ce980e6365
```

```text
port=18086 status=200 dataCount=3 contentType=application/json
port=8084 status=403 error=원격 서버에서 (403) 사용할 수 없음 오류를 반환했습니다.
```

```text
SAMHAN_SLIP_SERVICE_URL=UNSET
config-audit validation passed: 161 URL/template checks
```

```text
<testsuite name="com.samhanair.logis.notification.service.DispatchBatchSendServiceTest" tests="1" skipped="0" failures="0" errors="0" ...>
```

production FE 함수 실 데이터 실행 원문은 §3, DB 실측 원문은 §1에 그대로 보존했다.

## 9. 이 라운드가 보지 않은 것

- 실제 SMS/Aligo 전송, `/admin/notifications/dispatch-batch/send` POST, delivery receipt: **실행·조사하지 않음**.
- dev `SENT`/`SUCCESS`: 실전달 성공으로 세지 않음.
- Docker 이미지 재빌드/재기동/재배포: **실행하지 않음**. 공유 notification image는 R4~R6 이전 image다.
- DB write/DDL/seed/합성 데이터 생성: **실행하지 않음**.
- 실제 데이터 정상 entry + partner-service 장애의 혼합 send 실행: 번호와 partnerCode를 함께 가진 실 entry가 0건이고 send POST 금지라 **실행하지 않음**. 기존 실패 주입 단위 테스트와 현행 loop를 대조했다.
- 실제 active blocked positive row: DB에 0건이라 **조사할 표본 없음**.
- upstream이 동일 slip을 중복 반환하는 장애 주입/idempotency 재전송: 실 DB 중복 0이고 합성 데이터 금지라 **조사하지 않음**.
- 전화번호의 실제 사람 귀속/PII 정합성: cardinality만 세었고 **조사하지 않음**.
- production 운영 DB/운영 Aligo 자격증명/운영 delivery receipt: **접근·조사하지 않음**.
- current HEAD notification Docker image의 live preview: Docker image 재빌드 금지로 **실행하지 않음**.

## 10. 새 파일 경로

- `docs/dev-reports/2026-08-02-1013-r7-postfix-reconvergence.md`

기존 `docs/dev-reports/2026-08-02-1013-*.md`는 수정·덮어쓰기·축약하지 않았다.
