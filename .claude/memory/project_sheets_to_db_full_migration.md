# 옵션C 폐기 — GAS 외부소스 4종 전면 우리 DB 치환 (2026-06-09)

개발책임자 결정(2026-06-09): GAS 레거시가 의존하던 **외부 4종(Notion / Google Sheets / 이카운트 통신 / 엑셀 업로드)을 전부 우리 프로그램 DB 데이터로 치환**한다. 종전 2026-05-05 "옵션C(견적서·주문서는 구글 스프레드시트에서 그대로 가져온다)"는 **폐기**.

- **Google Sheets**: 종합견적서가 읽던 홈멀티/싱글세트/싱글구성품/싱글자재가/상업멀티/상업멀티구성/구형 품목·단가 + 단가인상 5탭 + 거래처/담당자 + 추천실외기/분기/자재가 → product-service / partner-service / 시드로 마이그레이션. `google-sheets-client.js` JWT 직접 read 잔존은 정책 위반 → 단계적 제거.
- **Notion 페이지 데이터**: 레거시가 조회하던 모든 Notion DB(DC설정/출고·발송이력/인증/견적 snapshot) 데이터를 **시드로 우리 DB 이식 + 통신 호환 엔드포인트** 제공. (견적 snapshot = `quote_snapshots` 테이블 + `/api/v1/estimates/snapshots`, P0-A 완료)
- **이카운트 / 엑셀 업로드**: 이미 slip-service 발행 / N/A.

**실행 순서**: "종합견적서 완결 먼저"(개발책임자 2026-06-09) → 종합견적서가 쓰는 시트/노션 데이터부터 치환 후 나머지 23개 GAS 앱.

**주의**: `getFormulas()` 수식 분기($I$1 구형할인/$L$2 useK2/$D$7~8 matKey)는 Sheets readonly 가 수식을 안 주므로 DB 컬럼으로 명시 이관 필수. 관련: SP-08 raw read-only snapshot 기조는 유지하되 런타임 read 소스를 시트→DB 로 전환. 전산=eCount 대체(project_replaces_ecount_gas_was_exporter).
