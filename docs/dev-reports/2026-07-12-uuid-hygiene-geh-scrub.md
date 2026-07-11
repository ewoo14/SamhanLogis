# UUID 비공개 hygiene — 예외응답 GEH scrub(공유) + 혼합메시지 정리 (#794)

- **일자**: 2026-07-12
- **PR**: #794 · **연관**: feedback_uuid_no_user_visibility · #787 UUID sweep
- **워크플로우**: 정찰(71파일/133스팟) → 개발책임자 Approach 결정 → Codex 구현 → Opus 5-agent(BE/FE/Design/DevOps/QA·실HTTP+라이브) → fix → Codex 5-agent 적대(R1 MEDIUM/LOW→fix→재수렴) → 0수렴 → CI → 머지.

## 배경·전략 결정
`GlobalExceptionHandler` 계열이 `ApiResponse.fail(code, ex.getMessage())`로 예외메시지를 응답 body 반환 → 예외메시지에 보간된 **내부 UUID가 사용자 노출**(UUID 비공개 가드 위반). 정찰 결과 71파일/133스팟(전부 예외메시지 경유).

**개발책임자 결정(Approach B)**: 133개 메시지 개별편집(대규모·재누출 가능) 대신 **응답시점 scrub(future-proof 방어)** + sanitizer가 clean히 못 지우는 **혼합메시지만 편집**.

## 구현
- **`shared/common/.../exception/ExceptionMessageSanitizer`** (신규): 응답 예외메시지에서 UUID 정규식 제거 + 인접 잔재 정리. 패턴 순서:
  - `KEYED_UUID`(`word=uuid` 통째 제거 — bare/괄호/중간) → `QUOTED_UUID`(따옴표) → `UUID`(bare) → `EMPTY_KEY_VALUE`(괄호/콤마 컨텍스트 빈 key만·`$` 미포함) → `LEADING_COMMA`/`EMPTY_PARENS`(괄호 정리) → 공백/trailing 정리(`=` 제외).
  - 업무번호(slipNo·revisionNo·lineNo·bizNo)·값 있는 `key=value`·`=`로 끝나는 정상 메시지("수식: x=") 보존.
- **14개 예외핸들러** + **GEH 밖 직접반환 7곳**(collab 6컨트롤러·PublicSlipController): 사용자메시지 반환부에 `sanitize()` 적용 → 전 예외응답 UUID 자동 차단(전역 완전성).
- **혼합메시지 16곳 source 편집**(sanitizer 미처리 label=uuid/중간/따옴표): slipId/estimateId/orderId/warehouseId/dispatchId/journalId 등 제거·`revisionNo`(버전 N)·`lineNo`·`productCode`·`seq` 유지. 단순 "메시지: uuid"는 sanitizer 처리(과편집 회피).

## 리뷰 disposition
- **BE(PASS·P0/P1 없음)**: sanitizer 정확·업무값 타입레벨 분리 보존·14핸들러 전수·혼합편집 완전·전 서비스 컴파일 genuine. P2-1(mid-string 잔재 future-proof)·P2-2(영구 IT 부재)→fix.
- **QA(GREEN)**: sanitizer 단위 + slip 전체 1220 + 5서비스 145 genuine(`--rerun-tasks`)·**실HTTP 3서비스**(slip comment·inventory warehouse·groupware approval — source 미편집 메시지가 응답시점 scrub돼 UUID 미포함 실증)·CI 36/36.
- **Design/FE/DevOps(PASS)**: 메시지 자연스러움·FE verbatim 표시 무영향·CI sanitizer 테스트 자동실행·arologis-ci 트리거.
- **Codex 적대(R1→재수렴)**: **MEDIUM**(EMPTY_KEY_VALUE가 "수식: x=" 오손상)→KEYED_UUID 선처리+lookahead 축소+TRAILING서 `=` 제외로 안전화. **LOW**(GEH 밖 직접반환 7곳 미적용)→sanitize 래핑. 재수렴 지적 0.
- **P2 fix**: sanitizer 빈-key 정리(값 보존 회귀 테스트) + ProductCatalogControllerIT 영구 end-to-end IT(미존재 specId PATCH→404 UUID 미노출·핸들러 sanitize 누락/revert 회귀 포착).

## 검증
- `:shared:common:test`(sanitizer 회귀 포함) GREEN + 14서비스 compile + revision IT + 영구 IT + 실HTTP 3서비스 + CI 36/36.

## 참고
- borderline 5(무효입력 echo·Link 헤더 URL)은 실 UUID 누출 아님 → 미포함.
- 잔여 grep의 `slipId=` 표기는 전부 로그(log.warn)·Javadoc(사용자 비노출) → 미대상.
