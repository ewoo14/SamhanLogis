# PR #1245 / 이슈 #1234 — 1단계 결과

## ① 환경 확인

요청 명령 원문:

cd C:\dev\Samhan-Public\.claude\worktrees\w1234
git rev-parse HEAD                 # eaae3ef10 (main 최신화 직후)
git rev-parse --abbrev-ref HEAD    # data/legacy-csv-full-load
git status --porcelain

실행 결과:

eaae3ef100710793fe69f10f0cd90b044b44360a
data/legacy-csv-full-load

git status --porcelain은 빈 출력이었다.

## ② 공유 DB read-only 확인

infrastructure/.env.local을 사용했고 PostgreSQL 대상 DB에 다음 형식으로 조회했다.

BEGIN;
SET TRANSACTION READ ONLY;
-- SELECT only
ROLLBACK;

UPDATE/INSERT/DELETE, pg_dump, import endpoint, migration 실행은 하지 않았다. 대상 테이블과 현행 스키마 조회만 수행했다.

## ③ 계열별 격차 카운트

문서 기준: 발송금지 6행, DC 원천만 92코드·현행만 1코드·drift 43코드/67필드·원천 중복 충돌 1코드, 단톡방 신규 누락 2코드·방명 drift 1코드, 지역분류 19그룹·20필드 drift.

금액에 닿는 DC는 문서 기준 126~127코드다.

## ④ 격차 목록 파일과 행 수

docs/qa/1245-legacy-load-gaps/gap-list.csv — 13행(헤더 제외).

원천 CSV 4개가 현재 워크트리, Git 추적 파일, 인접 워크트리에서 발견되지 않았다. 따라서 이 파일은 전량 격차 목록이 아니라 근거 문서에서 재현 가능한 최소 행만 담은 부분 산출물이다. 원천 파일 없이는 92코드와 43코드/67필드의 원천값을 전량 복원할 수 없다.

## ⑤ 백업 파일과 행 수

docs/qa/1245-legacy-load-gaps/current-db-backup.csv — 데이터 1행(백업 미생성 상태 표기).

원천 CSV가 없어 CSV와 다른 현행 DB 값 전량이라는 대조 조건을 충족할 수 없었다. 현행 DB를 백업한 것으로 가장하지 않았다.

## ⑥ 금액 126~127코드 별도 표시

금액 영향 대상은 문서 기준 DC 126~127코드이며, 92 누락 중 91코드와 43 drift 중 정률·옵션 정액·I호스·단위처리 필드가 포함된다. 원천 부재 때문에 현재 CSV에는 전량을 싣지 못했다.

## ⑦ 판단 필요 지점과 선택지

- 원천 중복 2291465974: (a) 0.48 채택 / (b) 0.47 채택 / (c) 거래처 확인 후 보류.
- 현행에만 있는 6973700076: (a) 보존 / (b) soft-delete 후보 / (c) 거래처 확인 후 보류. 삭제하지 않았다.
- 4348703365: (a) CSV로 덮기 / (b) 현행 보존 / (c) 개발책임자 확인 후 보류.
- 인천 지역 키워드: (a) 원천 서해구 / (b) 현행 서구 / (c) 행정구역 확인 후 보류.
- 발송금지 및 GAS 예외 8428102605: (a) preview/send hard block / (b) 목록만 표시 / (c) 보류.

## ⑧ 중단 지점과 남은 것

90분 제한 내에서 원천 파일 부재 확인, 공유 DB read-only 스키마 조회, 문서 기반 최소 산출물 작성까지 수행하고 중단했다. 남은 것은 원천 CSV 확보 후 전량 격차 목록, 현행 DB 전량 대조, 전량 백업이다. 적재·마이그레이션·격리 복제본·전후 비교는 수행하지 않았다.

## ⑨ 프로세스 회수

새로 기동한 장기 프로세스는 없다. Docker/DB 기존 공유 스택은 중지하지 않았다. 새로 남긴 프로세스 수는 0개.

## ⑩ git status --porcelain 원문

(빈 출력)

커밋·push·git add는 수행하지 않았다.
