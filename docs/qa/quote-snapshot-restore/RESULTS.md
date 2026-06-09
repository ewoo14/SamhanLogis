# 종합견적서 견적 저장/불러오기 (P0-A) — 실서버 QA 결과

> 실 검증 환경: slip-service.jar standalone-boot(:8099) → **실행 중 Docker 스택의 PostgreSQL**(samhan-postgres:5432, 신규 DB `slip_qa`) 대상. Flyway V36 실제 적용. 가짜·목업 없음([[feedback_no_fake_data_ever]] 준수). [[feedback_standalone_boot_real_qa]] 패턴.

## 실 적발 버그 (실 QA 가 사전 차단)

1. **GET 타입추론 버그** — `findHistory` 의 `(:from IS NULL OR ...)` 가 PostgreSQL 에서
   `ERROR: could not determine data type of parameter $2` 로 500. Testcontainers IT 가 Windows 로컬
   skip 되어 미적발(코드리뷰/컴파일로는 안 보임) → **실서버 호출로 적발**. NULL 분기 제거 + 서비스가
   FLOOR/CEIL 경계 대입으로 수정. (CI Linux 였으면 IT 가 잡았을 결함)

## 실 호출 결과

### 1) POST /api/v1/estimates/snapshots (alice, 삼한공조) → 201
```json
{"success":true,"code":"OK","message":"성공",
 "data":{"id":"1c457f2d-492d-4444-b63a-415a72fbfa0a","created":"2026-06-09T23:30:00",
         "custName":"삼한공조","data":null,"image":null}}
```

### 2) GET ?userEmail=alice@samhan-air.com → 최신순 2건 + **blob EXACT 복원**
- count=2, 최신순 = [삼한공조(6/9), 예전건(5/1)]
- 검증(verify.txt):
```
blob EXACT match: YES
restored custName: 삼한공조
restored lines: [{'model':'AC052CS1PBH1SY','qty':2,'unitPriceVat':1100000},{'model':'AR-EH05','qty':2}]
restored dc/branch: {"dc":{"home":0.45},"branch":{"2512":true}}
```
→ 저장한 base64 작업상태 blob 이 **바이트 단위 동일**하게 복원됨(그대로 불러오기 실증). 미리보기 image 도 보존.

### 3) 날짜 범위 필터 ?startDate=2026-06-01&endDate=2026-06-30 → count=1 (삼한공조만, 5월 예전건 제외) ✅

### 4) 사용자 격리 ?userEmail=bob@samhan-air.com → count=1 (밥거래처만, alice 것 안 보임) ✅
   ?userEmail=carol@samhan-air.com → count=0 ✅

### 5) DB 직접 확인 (slip_qa.quote_snapshots)
```
 alice@samhan-air.com | 삼한공조 | 2026-06-09 23:30:00 | blob_len 244
 bob@samhan-air.com   | 밥거래처 | 2026-06-09 10:00:00 | blob_len 244
 alice@samhan-air.com | 예전건   | 2026-05-01 09:00:00 | blob_len 16
```
→ 한글 거래처명 정상 영속, saved_at(클라이언트 저장시각) 보존, blob 길이 정상.

## 결론
저장→불러오기→EXACT 복원 + 날짜필터 + 사용자격리 + 한글 무결성 모두 **실 PostgreSQL 대상 통과**. permitAll 무인증 호출도 정상(estimate-app server-to-server). 데스크톱/웹 종합견적서 실 UI 캡처는 종합견적서 E2E QA 세션(#31)에 통합.
