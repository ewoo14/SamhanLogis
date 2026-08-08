-- V97: 회계전표 PageCode 정합성 확인용 예약 migration.
--
-- V37이 정본인 accounting.*.accounting 권한을 MASTER/ACCOUNTANT로
-- 한정한다. 기존 accounting.*.list 권한을 이 코드로 복제하면 MANAGER·SALES
-- 및 개별 계정/그룹의 권한이 넓어지므로, 이 migration은 권한을 새로 부여하지 않는다.
-- FE/BE 코드 정합성은 애플리케이션 코드에서 맞추고, 기존 권한 행은 변경하지 않는다.
--
-- 주의: 이 파일은 이미 배포된 번호를 대체하지 않으며, Flyway가 V97을 소비할 수
-- 있도록 부작용 없는 문장만 실행한다. 두 번 실행해도 상태가 변하지 않는다.

SELECT 1;
