# #896 `거래처` 시트 재수집 및 기초거래처 적재 대조

측정 시각: 2026-08-09T12:38:05+09:00 (KST)

이번 작업은 읽기 전용으로 수행했다. Google Sheets는 `spreadsheets.values.get` + `UNFORMATTED_VALUE`로 읽었고, DB는 `SELECT`만 실행했다. INSERT/UPDATE/DELETE, 마이그레이션, 코드 수정, 커밋은 하지 않았다.

## 1. 네 탭 재수집

주 스프레드시트: `종합 견적서` (`<SHEET_ID>`)

| 탭 | 행×열(API 결과) | 저장 파일 | 바이트 | SHA-256 | 2026-08-08 값과 대조 |
|---|---:|---|---:|---|---|
| 거래처 | 7,254×10 | `docs/migration/896-sheet/거래처.csv` | 1,114,535 | `43CDF0DB3E4D960BD46D21318596720DE195A7B59193C65A5172F321FAFCA933` | **다름** |
| 담당자 | 20×2 | `docs/migration/896-sheet/담당자.csv` | 413 | `84396282DA82C48673D8D675CD836F52D4BE167DF6279476C95BB0B99982EEEE` | 같음 |
| 추천실외기 | 26×5 | `docs/migration/896-sheet/추천실외기.csv` | 379 | `EA12457793479E400B1AC5B1119FDAD368F109A0F1F88388ADA45117E8D8BBCE` | **다름** |
| 구형_템플릿 | 44×9 | `docs/migration/896-sheet/구형_템플릿.csv` | 4,117 | `0EF80B60282FB7119E68946E910DF38854C791D56890B739CF06392C9E495A49` | **다름** |

기준 해시는 `docs/dev-reports/2026-08-08-896-sheet-tab-inventory.md`의 기록을 사용했다. `거래처`가 어제 값과 다르므로 그 사이 원본 시트가 변경된 것으로 판정한다. 네 파일은 저장소에서 무시되는 `tools/legacy-gas/**/*.csv` 밖에 저장했다. CSV는 UTF-8 BOM이며 API의 비포맷 값 결과를 보존했다.

`거래처!J`는 이번 API 응답에서 데이터 7,253행 중 300행이 비어 있지 않았고, 300행 모두 문자열이었다. 따라서 숫자 할인율로 변환하거나 `partners`의 숫자 컬럼에 적재하면 안 된다.

## 2. 기초거래처 적재 전 대조

DB 측정 기준은 `partner_db.partners WHERE is_deleted = false`이다. 코드 비교는 양쪽 값을 `BTRIM`한 뒤 고유 문자열 집합으로 계산했다. DB 수치는 최종 동일 시점 스냅샷 기준이다.

### 컬럼 대조표

| 시트 열 | `partners` 대응 | 판정/비고 |
|---|---|---|
| 거래처코드 | `partner_code` | 직접 대응. 조인 키. |
| 담당자명 | `manager_name` | 직접 대응. 기존 `manager`가 아니라 현재 스키마의 확장 컬럼 기준. |
| 거래처명 | `name` | 직접 대응. |
| 대표자명 | `representative` | 직접 대응. |
| 주소 | `address` | 기본 주소 대응. `address1`/`address2` 배송지 분리는 시트에 별도 열이 없어 확정할 수 없음. |
| 전화번호 | `phone` | 직접 대응. |
| 특이사항 | `note` | 직접 대응. |
| 그룹 | `partner_group1` | 1차 그룹 대응. 그룹의 세부 의미가 시트만으로 확정되지 않아 `partner_group2`에는 대응하지 않음. |
| 여신한도 | `credit_limit` | 직접 대응. |
| 싱글 할인 | 없음 | 300건의 자유 텍스트 Notion 병합 결과다. `partners`의 숫자/정책 컬럼과 의미가 다르므로 강제 변환하지 않는다. 별도 할인 정책/원문 보존 계약 없이는 적재 대상이 아니다. |

시트에는 없지만 `partners`에 존재하는 `id`, `biz_no`, `status`, 감사 필드, 이카운트 보강 필드 등은 DB 정체성·운영/audit·외부 마스터 필드다. 이 시트 10열만으로 덮어쓰거나 재구성할 수 없으므로 시트 적재의 직접 대응 열로 세지 않았다.

### 행·코드 대조

| 항목 | 건수 |
|---|---:|
| 시트 데이터 행 | 7,253 |
| 활성 DB 행 | 7,259 |
| 양쪽에 모두 있는 고유 거래처코드 | 7,204 |
| 시트에만 있는 고유 거래처코드 | 49 |
| DB에만 있는 고유 거래처코드 | 55 |
| 시트 중복 거래처코드 그룹/행 | 0 / 0 |
| DB 중복 거래처코드 그룹/행 | 0 / 0 |

시트 `거래처코드` 채움률은 공백·빈 문자열 기준 **7,253/7,253 = 100.0000%**다. 다만 값의 존재가 유효한 조인 키임을 뜻하지는 않는다. 시트에 리터럴 `-` 1건과 `00` 1건이 있어 업무적으로 유효한 코드인지 별도 판정이 필요하다. DB의 활성 `partner_code`는 공백값 0건이며, 채움률은 **7,259/7,259 = 100.0000%**다. UUID만 있고 코드가 비어 있는 상태는 이번 스냅샷에서 확인되지 않았다.

시트만 49건과 DB만 55건은 신규/삭제/코드 정규화 차이를 포함할 수 있다. 코드만으로 원인을 확정할 수 없으므로 자동 삭제·신규 생성의 근거로 사용하지 않는다.

## 3. DC율 고아 210행 provenance 및 재적재 요건

`dc_config_db.dc_configs`에서 활성이고 `source = LEGACY_CSV`인 210행을 확인했다.

| 항목 | 실측 |
|---|---|
| 행 수 | 210 |
| source | 210행 전부 `LEGACY_CSV` |
| created_at 범위 | `2026-05-16 13:32:08.750816` ~ `2026-05-16 13:32:10.667518` (DB timestamp, timezone 없음) |
| created_by | 210행 전부 `891b96e6-7262-4cf2-ad72-bb2a70cb9ed4` |
| 현재 `partner_db.partners.id`와 일치하는 `partner_id` | 0 / 210 |
| `dc_config_db.partners.id`와 일치하는 `partner_id` | 210 / 210 |

즉 이 210행은 2026-05-16에 같은 actor가 약 2초 동안 `dc_config_db`의 구형 로컬 `partners` 210행을 대상으로 `LEGACY_CSV`로 만든 설정이다. FK도 현재 `dc_config_db.partners(id)`를 가리킨다. 현재 정본으로 지정된 `partner_db.partners`의 UUID와는 별개이므로, DB 간 UUID를 직접 조인 키로 사용할 수 없다. 기존 210행과 어느 원본 CSV 행이 대응하는지는 `partner_code` 재대조 없이는 확정하지 않는다. 고아 행은 삭제하지 않았다.

개발책임자 실측으로 Notion DC CSV는 301 거래처이며 `partner_db` 코드 매칭은 301/301이다. 이 사실은 DC 원문 복구의 입력 조건으로 사용하되, 이번 작업에서는 DC 설정을 재적재하지 않았다.

### 거래처코드 기준 재적재 요건

1. DC CSV의 `거래처코드`를 문자열로 읽고 공백/표기 정규화 규칙을 먼저 확정한다. 숫자 변환은 선행하지 않는다.
2. 각 코드를 `partner_db.partners.partner_code`에 매칭하고, 0건·1건·복수건을 각각 격리한다. 이번 활성 DB에는 중복 코드가 없지만, 입력 코드의 `-`, `00` 같은 sentinel/비표준 값은 별도 판정해야 한다.
3. `dc_configs`의 할인·옵션·단위처리·note 컬럼은 Notion CSV와 1:1 대응하므로 `dc_configs` 자체의 컬럼/모델 변경은 필요하지 않다.
4. 다만 현재 `dc_configs.partner_id`의 FK와 애플리케이션 모델은 `dc_config_db.partners.id`를 소유자로 삼고 있다. `partner_db` UUID를 그대로 넣는 것은 FK/소유권 계약 위반이다. 따라서 다음 중 하나를 설계로 확정해야 한다.
   - `dc_config_db.partners`를 코드 기준으로 canonical `partner_db`와 동기화한 뒤, 기존 로컬 UUID를 유지하여 `dc_configs`를 갱신한다. 이 경우 매칭/동기화 이력과 210 고아의 보존 정책이 필요하다.
   - DC 서비스가 canonical `partner_db`를 참조하도록 소유권을 바꾸고, DB/FK·repository·서비스 계약을 함께 전환한다. 이는 `dc_configs` 컬럼 추가가 아니라 데이터베이스 소유권/마이그레이션 범위 변경이다.
   - 두 DB를 계속 분리한다면 코드-UUID 매핑을 별도 영속 계약으로 둔다. 매핑 테이블을 추가하는 경우에도 `dc_configs` 자체 스키마는 그대로 둘 수 있지만, 어느 UUID가 canonical인지와 변경 이력을 정의해야 한다.
5. 적재 실행 전 301행에 대해 매칭 결과, 기존 210행과의 코드 교차표, 신규 91행 여부, 고아 UUID 보존/비활성화 정책, dry-run 합격 기준을 산출해야 한다. 이번 라운드에서는 실행하지 않는다.

## 신규 파일 경로

- `docs/migration/896-sheet/거래처.csv`
- `docs/migration/896-sheet/담당자.csv`
- `docs/migration/896-sheet/추천실외기.csv`
- `docs/migration/896-sheet/구형_템플릿.csv`
- `docs/dev-reports/2026-08-09-896-partner-master-recollect.md`

