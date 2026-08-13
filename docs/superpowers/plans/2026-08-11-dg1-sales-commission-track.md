# D-G1 영업수수료 정산 도메인 — 트랙 개설

> 근거: `docs/dev-reports/2026-08-11-gas-sweep-devlead-decisions.md` (개발책임자 결정 D-G1)
> GAS 전수조사 최종 결론 — **원본에 있고 우리에게 없는 업무규칙 중 이 도메인이 유일한 실제 유실**이다.

## 개발책임자 결정 (3회에 걸쳐 확정)

```text
1  정산 도메인을 신설한다 (계산 리포트만·폐기는 배제)
   카드 3% · 제경비 8%(수기율) · 원천 3.3% · 설치 8%
   항목별 대칭 반올림 · 선지급은 지급액에만 반영
2  계산 결과가 **결재문서로 그룹웨어에 연결**되어
   지출결의서 작성에 해당 영업수수료 문서가 포함될 수 있어야 한다
3  정산 화면에 **그룹웨어로 연결되는 버튼**을 넣는다
4  정산은 **하나의 문서**이며 번호는 `YYYY/MM/DD-{문서번호}` 형태다
```

## PM 정찰 결과 — 신설이 아니라 **확장**이다

| 실물 | 좌표 | 역할 |
|---|---|---|
| `ApprovalReferenceDocType` | `groupware/domain/ApprovalReferenceDocType.java` | 결재 첨부가 참조하는 업무문서 유형 — 현재 **6종** |
| `ApprovalAttachment` | 같은 패키지 | 🔑 참조를 **UUID 가 아니라 문서번호 문자열**로 잡는다 (`ref_doc_no` varchar 40 + `ref_doc_type`) |
| `GROUPWARE_EXPENSE_REPORT` | `ApprovalTemplate.businessCode` | 지출결의서 양식이 이미 운영 중 (`#845`·`#911`·`#914` 라이브QA 존재) |
| 채번 표준 | `CashReceiptNumberService:24-33` 외 4종 | `yyyy/MM/dd-N` · 일자별 atomic 시퀀스 + row lock |

⟹ 그룹웨어 쪽은 **스키마 변경 없이 enum 값 하나 추가**로 연결된다.

## 없는 것 (PM 실측)

```text
git grep commission  → 서비스 코드 0건
gh issue list --state all --limit 400  → 관련 이슈 0건
업무화면에서 결재로 넘어가는 진입점(결재 상신 버튼) → 저장소 전체 0건 (이 버튼이 최초 사례)
```

## 슬라이스

```text
S1  정산 엔티티 + 문서번호 채번 (yyyy/MM/dd-N · 일자별 atomic 시퀀스)
S2  요율 계약(versioned) + 계산기 — 카드3/제경비8/원천3.3/설치8 · 항목별 대칭 반올림 · 선지급
S3  ApprovalReferenceDocType 7번째 값 + 지출결의서 참조 첨부
S4  정산 화면 + 그룹웨어 연결 버튼 (참조가 이미 붙은 채로 열려야 함)
```
