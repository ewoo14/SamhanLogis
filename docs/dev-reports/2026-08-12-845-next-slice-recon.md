# #845 문서 양식 디자이너 — 다음 슬라이스 정찰

- 조사일: 2026-08-12 (Asia/Seoul)
- 범위: 조사만 수행. 구현·마이그레이션·spec 작성 없음.
- 정본: 낡은 worktree 브랜치가 아니라 GitHub 원격 `main` 및 이슈/PR 원문.
- 금지 준수: git 명령 미사용, 공유 Docker 쓰기 미수행, 로그인 화면 미접근.

## 측정 1 — 정본과 에픽 현황

실측 명령:

```powershell
$mainInfo = gh api repos/ewoo14/Samhan-Public/commits/main | ConvertFrom-Json
"MAIN_SHA=$($mainInfo.sha)"
"MAIN_DATE=$($mainInfo.commit.committer.date)"
"MAIN_SUBJECT=$($mainInfo.commit.message.Split([Environment]::NewLine)[0])"
$issueInfo = gh api repos/ewoo14/Samhan-Public/issues/845 | ConvertFrom-Json
"ISSUE_STATE=$($issueInfo.state)"
"ISSUE_TITLE=$($issueInfo.title)"
"ISSUE_CREATED=$($issueInfo.created_at)"
"ISSUE_UPDATED=$($issueInfo.updated_at)"
$prInfo = gh api repos/ewoo14/Samhan-Public/pulls/891 | ConvertFrom-Json
"PR_STATE=$($prInfo.state)"
"PR_MERGED=$($prInfo.merged)"
"PR_MERGE_SHA=$($prInfo.merge_commit_sha)"
"PR_TITLE=$($prInfo.title)"
"PR_COMMENTS=$($prInfo.comments)"
"PR_REVIEW_COMMENTS=$($prInfo.review_comments)"
```

원문 출력:

```text
MAIN_SHA=ed3bf97840e771bca0d2e891d4d8695a72d6a452
MAIN_DATE=2026-08-12T03:21:03Z
MAIN_SUBJECT=[FEAT] #883 S4 — 주문·견적 상세를 다른 상세와 같은 셸·패턴으로 (레거시 웹 이탈) (#1175)
ISSUE_STATE=open
ISSUE_TITLE=[EPIC] 문서 양식 디자이너 — 이카운트식 WYSIWYG 폼 엔진
ISSUE_CREATED=2026-07-18T05:03:55Z
ISSUE_UPDATED=2026-07-24T04:06:32Z
PR_STATE=closed
PR_MERGED=True
PR_MERGE_SHA=13414d03a7a877335c360a34e221750da43dc058
PR_TITLE=[FEAT] #868 #845 DS-3b — 문서 양식 편집기 MVP (3-pane 밴드 캔버스 · schema v2)
PR_COMMENTS=18
PR_REVIEW_COMMENTS=0
```

판정:

- 원격 `main`은 요청에 명시된 `ed3bf9784`와 일치한다.
- #845는 OPEN이며, 2026-07-24 갱신된 본문 자체가 DS-4까지 완료로 기록한다. 따라서 질문의 “DS-3b 다음”은 단순히 DS-4를 제안하는 문제가 아니다. DS-4는 이미 #908로 머지됐고, 활성화 게이트 및 후속 연결이 남았다.
- #845 본문이 열거한 잔여 후보는 R1 DS-4 활성화 게이트, R2 결재문서 품목 원천 연결, R3 DFD-03 작성 입력화면 자동 생성/구 필드 빌더 대체, R4 비법정 인쇄문서 엔진 확장, R5 저작 방식 선택(#903), R6 검증품질 이월(#890/#913)이다. 이하에서 설계서·코드·CLOSED 이슈·결정 문서로 독립 검증한다.

## 측정 2 — PR #891 코멘트의 DS-3b 미완 항목

실측 명령:

```powershell
$comments891 = gh api --paginate repos/ewoo14/Samhan-Public/issues/891/comments | ConvertFrom-Json
"COMMENT_COUNT=$($comments891.Count)"
foreach ($comment in $comments891) {
  $hits = ($comment.body -split "`n") |
    Select-String -Pattern '후속|비범위|미완|롤백|이력|DS-4|#869|#890|#903|#913' -Context 2,2
  if ($hits) { "--- COMMENT $($comment.id) | $($comment.created_at) ---"; $hits }
}
$reviews891 = gh api --paginate repos/ewoo14/Samhan-Public/pulls/891/reviews | ConvertFrom-Json
"REVIEW_COUNT=$($reviews891.Count)"
```

핵심 원문 출력:

```text
COMMENT_COUNT=18
REVIEW_COUNT=0

### 1.2 비범위 (→ DS-4 #869 또는 별건)
| 반복 detail 밴드(행 반복) | 개발책임자 2026-07-19 결정에서 DS-4 로 명시 분리 |
| 이미지 / 로고 / 도장 요소 | 동상 |
| 인쇄 fidelity 정밀화(@page·mm 정합·페이지 넘김 제어) | 동상. DS-3b 는 기존 `PrintLayout` 골격을 유지한다 |
| 드래그 앤 드롭 자유 픽셀 배치의 고급 UX(스냅 그리드·정렬 가이드·다중 선택) | MVP 는 선택+속성 수치 입력 + 순서 이동으로 성립. 과투자 금지 |
| 템플릿 revision 롤백/브라우징 UI | D-DS3A-01 이 DS-3b 요구로 적었으나 **이슈 #868 범위 문구에 없음** → 별도 이슈 제안(§11) |
| 새 docType 도메인 확장 · 결재 외 문서(전표/견적) 편집 | 파일럿=결재 문서 유지 |
| A4 이외 용지 | `paperToPrintLayout` 은 `A4_PORTRAIT` 단일 exhaustive |

→ **#903** 으로 별도 슬라이스 등록했습니다.

### 미완 (정직 기록)
- **M-I**: `ElementInspector`/`BandCanvas` 내부 입력의 design-system 전면 교체 미완(`Button`/`Modal`/`Select` 만 적용). → 새 게이트 기준 **"디자인 일관성" = PM 재량 항목**이며 머지를 막지 않는다.
- **LOW**: 요소 추가 후 포커스 미이동 · 미리보기 `h1` 중복 미착수. → 동일하게 재량.
- **라이브QA 미실행** — 캐논 3단계에서 **PM 이 실서버로 수행**한다(게이트 ③).
```

후속 코멘트의 원문 출력:

```text
실서버 라이브QA     12 passed — 9 뷰포트 1440·1100·1099·700·699·640·639·375·320 전량
                    (수평 오버플로 0 · 팔레트 사용자 휠 도달 + hit-test 유지)

| ③ 라이브QA (실서버 실행) | ✅ PM 직접 · 9 뷰포트 완주 · 캡처 첨부 |
```

판정:

- **있다.** PR #891 코멘트가 명시적으로 남긴 제품 미완은 (1) 내부 입력의 design-system 전면 교체, (2) 요소 추가 후 포커스 이동, (3) 미리보기 `h1` 중복이다. 모두 당시 PM이 비차단·재량으로 분류했다.
- revision 롤백/브라우징 UI, 고급 스냅·정렬·다중선택, A4 외 용지, 결재 외 docType 확장은 DS-3b의 명시적 비범위였다. “기능 유실”이 아니라 범위 결정이다.
- 중간 코멘트의 라이브QA 미완은 후속 코멘트에서 9개 뷰포트 12 passed로 닫혔다. 따라서 현재 잔여로 다시 세면 안 된다.
- 리뷰 코멘트 API는 0건이며, 미완 기록은 일반 PR 코멘트에 있다.

## 측정 3 — 설계서·CLOSED 이슈·개발책임자 결정 대조

실측 명령:

```powershell
$designMeta = gh api 'repos/ewoo14/Samhan-Public/contents/docs/specs/document-form-designer-epic-design.md?ref=main' | ConvertFrom-Json
$designText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($designMeta.content -replace "`n",'')))
"DESIGN_SHA=$($designMeta.sha)"
"DESIGN_SIZE=$($designMeta.size)"
($designText -split "`n") | Select-String -Pattern '^#|DFD-|슬라이스|이후 확장' -Context 1,3

$numbers = 825,845,868,869,890,903,908,909,910,913
foreach ($number in $numbers) {
  $item = gh api "repos/ewoo14/Samhan-Public/issues/$number" | ConvertFrom-Json
  "#$number | $($item.state) | PR=$([bool]$item.pull_request) | $($item.title) | created=$($item.created_at) | closed=$($item.closed_at)"
}
```

핵심 원문 출력:

```text
DESIGN_SHA=f3b857ea74e35ac047397252d7e9f7b01e5262cd
DESIGN_SIZE=6111

| DFD-03 | 설계 대상 = **인쇄·미리보기 문서**. 캔버스에 필드를 배치하면 그게 곧 템플릿 필드로 정의되고, 작성 입력화면은 그 필드 집합으로 자동 생성 |
| DFD-05 | 캔버스 모델 = **하이브리드 밴드**(밴드로 뼈대 + 밴드 안/위 자유 배치·스냅 그리드·정렬 가이드). 반복 라인아이템 = detail 밴드 |
| DFD-08 | **법정 고정 양식**(세금계산서·재무제표 등)은 자유설계 **제외**(고정/테마만·법적 형식 고정) |

| **DS-3 편집기 MVP** | 3-pane 팔레트/밴드 캔버스(드래그·스냅)/속성·데이터 바인딩·저장·라이브 미리보기. 현 필드 빌더 대체 |
| **DS-4 고도화** | 반복 detail 밴드·이미지/로고·서식 정밀·인쇄 fidelity iteration([feedback_print_design_iteration] 3~5회) |
| **이후 확장** | 거래명세서·판매송장·매입전표·견적서 등으로 엔진 확장(문서유형별 데이터 바인딩 어댑터만 추가). 법정 양식(DFD-08) 제외 |

#825 | closed | PR=False | [FEAT] 전역 입력 UX — 전 메뉴 자동완성 + 모달 복수선택(칩) · 단수 강제 필드 구분 | created=2026-07-16T01:45:46Z | closed=2026-08-08T11:21:44Z
#845 | open | PR=False | [EPIC] 문서 양식 디자이너 — 이카운트식 WYSIWYG 폼 엔진 | created=2026-07-18T05:03:55Z | closed=
#868 | closed | PR=False | [FEAT] #845 DS-3b — 문서 양식 편집기 MVP (3-pane 밴드 캔버스 · schema v2) | created=2026-07-21T03:06:52Z | closed=2026-07-22T18:09:45Z
#869 | closed | PR=False | [FEAT] #845 DS-4 — 문서 양식 고도화 (반복 detail 밴드 · 이미지/로고 · 인쇄 fidelity) | created=2026-07-21T03:07:01Z | closed=2026-07-23T06:44:43Z
#890 | closed | PR=False | [CHORE] #845 DS-3a 이월 검증 품질 — CI 게이트·뮤테이션 가드·mock 파리티 (도달성 축) | created=2026-07-22T00:07:49Z | closed=2026-07-27T21:17:14Z
#903 | closed | PR=False | [FEAT] 문서 양식 저작 방식 선택 — 워드 문서 방식 / 엑셀 방식(엑셀 라이브러리) | created=2026-07-22T04:28:07Z | closed=2026-07-31T22:14:23Z
#908 | closed | PR=True | [FEAT] #845 DS-4 — 문서 양식 고도화 (반복 detail 밴드 · 이미지/로고 · 인쇄 fidelity) | created=2026-07-22T18:13:53Z | closed=2026-07-23T06:43:57Z
#909 | closed | PR=True | [FEAT] 데스크톱 자동 업데이트 — DS-4 활성화 게이트 해제의 선행 | created=2026-07-22T21:09:04Z | closed=2026-07-23T20:00:18Z
#910 | open | PR=False | [FEAT] 전 사용자 대면 클라이언트 버전 정책 확대 — 8앱 자동 업데이트 · 사용 중 알림 | created=2026-07-22T22:44:07Z | closed=
#913 | closed | PR=False | [CHORE] #908 DS-4 검증품질 이월 묶음 — finally 타임아웃 미동작 · 커버 공백 · CI 미실행 · 문서 불일치 | created=2026-07-23T05:04:58Z | closed=2026-07-27T21:17:10Z
```

개발책임자 결정 및 완료 코멘트 원문:

```text
📌 개발책임자 결정 (2026-07-23) — "자동 업데이트 선행 후 DS-4 활성화"

운영 활성화 조건은 (1) 코드서명 인증서/CI 비밀값 준비, (2) `DESKTOP_UPDATE_URL` HTTPS 피드에
NSIS 설치본·`latest.yml`·blockmap 업로드, (3) clean machine에서
`available → downloading → downloaded → quitAndInstall` 실증이다.

✅ **완료 — PR #998 + #1007 머지**
전달된 것: 워드 문서 방식 / 엑셀 방식 저작 모드 선택 · 저장 · 선택 UI · 편집기 · renderer.

## 이월 — **없습니다**
```

판정:

- **DS-4는 잔여가 아니라 완료**다. 에픽 본문, CLOSED #869, 머지 PR #908, DS-4 개발 리포트가 일치한다. 다만 DETAIL/IMAGE의 운영 활성화는 별도 게이트로 막혀 있다.
- #903의 워드/엑셀 저작 방식 선택은 PR #998+#1007로 완료됐다. 에픽 본문의 R5는 2026-07-24 당시 목록이므로 현재 잔여에서 제거해야 한다.
- #890/#913 검증품질 묶음은 PR #951로 닫혔고 종결 코멘트가 “이월 없음”을 명시한다. 에픽 본문의 R6도 현재 잔여에서 제거한다.
- 설계서 기준 미충족 축은 **DFD-03 작성 입력 자동 생성/구 필드 빌더 대체**, **하이브리드 밴드의 고급 스냅·정렬 가이드(DS-3b 명시 비범위)**, **비법정 문서유형 엔진 확장**이다.
- DS-4 활성화 게이트는 확정 결정상 자동 업데이트 운영 성립이 선행한다. 코드 머지만으로 해제 조건을 충족했다고 볼 수 없다.

## 측정 4 — 원격 main 코드 실재 대조

실측 명령:

```powershell
$queries = @(
  'ADVANCED_ACTIVATION_GATE_ENABLED repo:ewoo14/Samhan-Public',
  'DocumentRenderer repo:ewoo14/Samhan-Public path:clients/desktop/src',
  'lineItemsAvailability repo:ewoo14/Samhan-Public',
  'authoringMode repo:ewoo14/Samhan-Public path:clients/desktop/src/renderer',
  'groupware/approval-templates repo:ewoo14/Samhan-Public path:clients/desktop/src/renderer/routes'
)
foreach ($query in $queries) {
  "=== QUERY: $query ==="
  $result = gh api -X GET search/code -f q="$query" -f per_page=100 | ConvertFrom-Json
  "TOTAL=$($result.total_count)"
  $result.items | ForEach-Object { $_.path }
}
```

원문 출력:

```text
=== QUERY: ADVANCED_ACTIVATION_GATE_ENABLED repo:ewoo14/Samhan-Public ===
TOTAL=8
services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/DocumentTemplateService.java

=== QUERY: DocumentRenderer repo:ewoo14/Samhan-Public path:clients/desktop/src ===
TOTAL=17
clients/desktop/src/renderer/print/DocumentRenderer.tsx
clients/desktop/src/renderer/print/ApprovalDocView.tsx
clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx
[나머지 14건은 CSS 또는 test/fixture]

=== QUERY: lineItemsAvailability repo:ewoo14/Samhan-Public ===
TOTAL=3
clients/desktop/src/renderer/print/approvalRenderModel.ts
clients/desktop/src/renderer/print/documentTemplateEditorPreview.ts
clients/desktop/src/renderer/print/DocumentRenderer.tsx

=== QUERY: authoringMode repo:ewoo14/Samhan-Public path:clients/desktop/src/renderer ===
TOTAL=4
clients/desktop/src/renderer/print/templateAuthoringMode.ts
clients/desktop/src/renderer/print/templateSchema.ts
clients/desktop/src/renderer/components/documentTemplate/useTemplateDraft.ts
clients/desktop/src/renderer/print/templateAuthoringMode.test.ts

=== QUERY: groupware/approval-templates repo:ewoo14/Samhan-Public path:clients/desktop/src/renderer/routes ===
TOTAL=2
clients/desktop/src/renderer/routes/index.tsx
clients/desktop/src/renderer/routes/GroupwareApprovalTemplateAdminPage.tsx
```

원격 파일 핵심 원문:

```text
DocumentTemplateService.java | sha=bdd8f4968768a41de0b17745f3adf4b46578efac
30: /** 개발책임자 결정: 자동 업데이트 선행 후 제거할 BE 권위 게이트. 기존 legacy 양식은 통과한다. */
31: private static final boolean ADVANCED_ACTIVATION_GATE_ENABLED = true;
117: if (ADVANCED_ACTIVATION_GATE_ENABLED && validator.containsActivationBlockedElements(document)) {
118:     throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
119:             "자동 업데이트 선행 전에는 DETAIL/IMAGE 양식을 활성화할 수 없습니다.");

ApprovalDocView.tsx | sha=ad6a7fffb5779c7c57acdacad9b79e2119f91f8e
258: const renderInput = {
259:   approval,
260:   templateFields,
261:   attachments: attachments.slice().sort((a, b) => a.displayOrder - b.displayOrder),
262:   backTo: `/groupware/approvals/${id}`,
263: }

approvalRenderModel.ts | sha=fefc75d087fd5e1a6256dd5df1c7c7260d962ce8
133: lineItems: projectEstimateLineItems(input.lineItems ?? []),
134: lineItemsAvailability: input.lineItems === undefined ? 'UNAVAILABLE' : 'CONNECTED',

routes/index.tsx | sha=c1f15023355fdffb832c4c24e4fce68edaca3f33
387: path: '/groupware/approval-templates',
390:   <GroupwareApprovalTemplateAdminPage />
395: path: '/groupware/document-templates',
398:   <GroupwareDocumentTemplateAdminPage />
403: path: '/groupware/document-templates/:id/edit',
406:   <DocumentTemplateEditorPage />

GroupwareApprovalTemplateAdminPage.tsx | sha=0107a26fe93d729cf4633f64777918c01a1f0a5d
382: <h4 style={{ margin: 0, fontSize: 14 }}>필드 빌더</h4>
383: <Button type="button" variant="secondary" size="sm" onClick={addField}>
384:   필드 추가

GroupwareApprovalCreatePage.tsx | sha=da3208a426a666d2f94c298e66cf95bccb2785de
293: const templatesQuery = useQuery({
294:   queryKey: ['groupwareApprovalTemplates', 'active'],
295:   queryFn: listActiveApprovalTemplates,
302: const sortedFields = useMemo(
303:   () => selectedTemplate ? [...selectedTemplate.fields].sort((a, b) => a.displayOrder - b.displayOrder) : [],
580: <h4 style={{ margin: 0, fontSize: 14 }}>세부 필드</h4>
582: sortedFields.map((field) => (
583:   <DynamicApprovalFieldInput

templateSchema.ts | sha=9c193b161be956e817b79372d4212890215ed20f
118: export type DocElement = LegacyDocElement | FieldElement | TextElement | DetailElement | ImageElement
143: * 게이트 자체는 개발책임자 결정으로 존치한다(자동 업데이트 선행 전까지 DETAIL/IMAGE 포함 양식은
148: export const ACTIVATION_BLOCKED_ELEMENT_TYPES: ReadonlySet<DocElement['type']> = new Set(['DETAIL', 'IMAGE'])
174: /** document JSONB 내부 저작 방식. legacy 양식은 parser가 WORD로 해석한다. */
175: mode?: TemplateAuthoringMode

templateAuthoringMode.ts | sha=6745890fe9b3ed15da27cfa1c596cd5769a71f15
2: export const TEMPLATE_AUTHORING_MODES = ['WORD', 'EXCEL'] as const
```

판정:

- **R1/R2는 코드로 재현된다.** BE 권위 게이트가 여전히 `true`이고, 프로덕션 유일 결재 인쇄 입력에 `lineItems`가 없다. 그러므로 DETAIL은 게이트 해제 전에는 활성화 불가, 게이트만 풀어도 실제 결재 인쇄에서는 `UNAVAILABLE`이다.
- **R3도 코드로 재현된다.** 구 결재 필드 빌더와 신 문서 템플릿 편집기 라우트가 병존하고, 결재 작성 화면은 여전히 구 `ApprovalTemplate.fields`로 동적 입력을 만든다. 캔버스의 FIELD 배치가 작성 입력 정의의 권위가 아니다.
- **R4도 코드로 재현된다.** `DocumentRenderer`의 프로덕션 소비자는 결재 인쇄와 편집기 미리보기뿐이다. 테스트/fixture 이름을 제외하면 거래명세서·판매송장·매입전표·견적서 adapter 소비처가 없다.
- **R5는 코드로 완료 확인된다.** `WORD|EXCEL` 공통 계약과 JSONB `mode`가 존재한다. 이름 차이를 기능 부재로 오판하지 않았다.
- DS-4 자체도 코드로 존재한다. `DETAIL|IMAGE` union, parser, editor, renderer가 있으므로 “DS-4를 새로 만들자”는 제안은 금지한다.

## 측정 5 — OPEN/CLOSED 이슈 중복 추적 여부

실측 명령:

```powershell
$queries = @(
  'repo:ewoo14/Samhan-Public is:issue "품목 원천"',
  'repo:ewoo14/Samhan-Public is:issue "작성 입력화면"',
  'repo:ewoo14/Samhan-Public is:issue "필드 빌더"',
  'repo:ewoo14/Samhan-Public is:issue "문서 양식" "거래명세서"',
  'repo:ewoo14/Samhan-Public is:issue "문서 양식" "견적서"'
)
foreach ($query in $queries) {
  $encoded = [Uri]::EscapeDataString($query)
  $result = gh api "search/issues?q=$encoded&per_page=100" | ConvertFrom-Json
  "=== $query ==="
  "TOTAL=$($result.total_count)"
  $result.items | ForEach-Object { "#$($_.number) | $($_.state) | $($_.title)" }
}
```

원문 출력:

```text
=== repo:ewoo14/Samhan-Public is:issue "품목 원천" ===
TOTAL=2
#845 | open | [EPIC] 문서 양식 디자이너 — 이카운트식 WYSIWYG 폼 엔진
#1001 | closed | [FEAT] 거래처별 원장 표시 사양 정합 — 부가세 포함 단가 · 배송주소 데이터 · 판매전표/입금보고서 2종
=== repo:ewoo14/Samhan-Public is:issue "작성 입력화면" ===
TOTAL=1
#845 | open | [EPIC] 문서 양식 디자이너 — 이카운트식 WYSIWYG 폼 엔진
=== repo:ewoo14/Samhan-Public is:issue "필드 빌더" ===
TOTAL=1
#845 | open | [EPIC] 문서 양식 디자이너 — 이카운트식 WYSIWYG 폼 엔진
=== repo:ewoo14/Samhan-Public is:issue "문서 양식" "거래명세서" ===
TOTAL=1
#845 | open | [EPIC] 문서 양식 디자이너 — 이카운트식 WYSIWYG 폼 엔진
=== repo:ewoo14/Samhan-Public is:issue "문서 양식" "견적서" ===
TOTAL=1
#845 | open | [EPIC] 문서 양식 디자이너 — 이카운트식 WYSIWYG 폼 엔진
```

판정:

- R2·R3·R4는 CLOSED까지 포함해도 별도 추적 이슈가 없고 #845가 단독 진실원이다. #1001은 거래처 원장 표시 정합으로 목적이 달라 R2 중복이 아니다.
- #912는 FIELD 참조의 빈칸 결함을 #914로 고쳤지만, 구 필드 빌더를 캔버스 FIELD 정의로 대체하지 않았다. R3 완료 증거가 아니다.

## 측정 6 — 실 데이터: 템플릿 분포와 실제 사용 양식

모든 SQL은 명시적으로 `BEGIN TRANSACTION READ ONLY`로 실행했다.

실측 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d groupware_db -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY;
SELECT COUNT(*) AS total_rows,
       COUNT(*) FILTER (WHERE NOT is_deleted) AS live_rows,
       COUNT(*) FILTER (WHERE is_deleted) AS deleted_rows,
       COUNT(*) FILTER (WHERE NOT is_deleted AND status='ACTIVE') AS live_active,
       COUNT(*) FILTER (WHERE NOT is_deleted AND status='DRAFT') AS live_draft
FROM document_templates;
SELECT doc_type,name,status,revision,schema_version,
       COALESCE(document->>'mode','(누락→WORD)') AS authoring_mode
FROM document_templates WHERE NOT is_deleted ORDER BY doc_type,status,name;
SELECT COUNT(*) AS live_approval_templates,
       COUNT(*) FILTER (WHERE active) AS active_approval_templates,
       COUNT(*) FILTER (WHERE NOT active) AS inactive_approval_templates
FROM approval_templates WHERE NOT is_deleted;
SELECT t.code,t.name,t.active,
       (SELECT COUNT(*) FROM approval_template_fields f WHERE f.template_id=t.id AND NOT f.is_deleted) AS live_fields,
       (SELECT COUNT(*) FROM approval_lines a WHERE a.template_id=t.id AND NOT a.is_deleted) AS approval_count
FROM approval_templates t WHERE NOT t.is_deleted ORDER BY t.display_order,t.code;
SELECT COUNT(*) FILTER (WHERE document_template_default_pinned) AS default_pinned,
       COUNT(*) FILTER (WHERE document_template_id IS NOT NULL) AS named_template_pinned,
       COUNT(*) FILTER (WHERE NOT document_template_default_pinned AND document_template_id IS NULL) AS unpinned
FROM approval_lines WHERE NOT is_deleted;
COMMIT;"
```

원문 출력:

```text
BEGIN
 total_rows | live_rows | deleted_rows | live_active | live_draft
------------+-----------+--------------+-------------+------------
        330 |         1 |          329 |           1 |          0
(1 row)

                             doc_type                              |           name            | status | revision | schema_version | authoring_mode
-------------------------------------------------------------------+---------------------------+--------+----------+----------------+----------------
 GROUPWARE_LIVEQA848_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA | LiveQA848 doc R1fix final | ACTIVE |        1 |              1 | (누락→WORD)
(1 row)

 live_approval_templates | active_approval_templates | inactive_approval_templates
-------------------------+---------------------------+-----------------------------
                       3 |                         3 |                           0
(1 row)

                          code                           |           name            | active | live_fields | approval_count
---------------------------------------------------------+---------------------------+--------+-------------+----------------
 EXPENSE_REPORT                                          | 지출결의서                | t      |           5 |              5
 LEAVE_REQUEST                                           | 휴가신청서                | t      |           4 |              0
 LIVEQA848_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA | LiveQA848 overflow verify | t      |           0 |              1
(3 rows)

 default_pinned | named_template_pinned | unpinned
----------------+-----------------------+----------
              0 |                     0 |       70
(1 row)

COMMIT
```

추가 실측 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d groupware_db -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY;
SELECT COALESCE(t.name,CASE WHEN a.template_id IS NULL THEN '(template_id 없음)' ELSE '(삭제/미상 템플릿)' END) AS approval_form,
       COALESCE(t.code,'-') AS form_code, COALESCE(t.is_deleted,false) AS template_deleted, COUNT(*) AS approval_count
FROM approval_lines a LEFT JOIN approval_templates t ON t.id=a.template_id
WHERE NOT a.is_deleted
GROUP BY COALESCE(t.name,CASE WHEN a.template_id IS NULL THEN '(template_id 없음)' ELSE '(삭제/미상 템플릿)' END),
         COALESCE(t.code,'-'),COALESCE(t.is_deleted,false)
ORDER BY approval_count DESC,approval_form;
SELECT status,COUNT(*) FROM approval_lines WHERE NOT is_deleted GROUP BY status ORDER BY status;
SELECT attachment_type,COALESCE(ref_doc_type::text,'(없음)') AS ref_doc_type,COUNT(*) AS live_count
FROM approval_attachments WHERE NOT is_deleted
GROUP BY attachment_type,COALESCE(ref_doc_type::text,'(없음)') ORDER BY live_count DESC,attachment_type;
COMMIT;"
```

원문 출력:

```text
BEGIN
       approval_form       |                        form_code                        | template_deleted | approval_count
---------------------------+---------------------------------------------------------+------------------+----------------
 (template_id 없음)        | -                                                       | f                |             64
 지출결의서                | EXPENSE_REPORT                                          | f                |              5
 LiveQA848 overflow verify | LIVEQA848_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA | f                |              1
(3 rows)

  status  | count
----------+-------
 APPROVED |    32
 PENDING  |    30
 REJECTED |     8
(3 rows)

 attachment_type | ref_doc_type  | live_count
-----------------+---------------+------------
 SLIP_REF        | OUTBOUND_SLIP |          5
 SLIP_REF        | JOURNAL       |          2
(2 rows)

COMMIT
```

판정:

- **문서 레이아웃 템플릿(`document_templates`)**: 전체 이력 330행, live 1행 = ACTIVE 1 / DRAFT 0. 유일 live는 `LiveQA848...`이므로 업무 양식이 아니라 QA 잔재다. 삭제 329행도 최근 표본과 분류상 QA/SOL/DS4 임시 양식 중심이다.
- **결재 입력 양식(`approval_templates`)**: live 3행 = ACTIVE 3 / inactive 0. 실제 업무 양식은 `지출결의서`(필드 5, 결재 5건)와 `휴가신청서`(필드 4, 결재 0건)이고, 나머지 1행은 LiveQA 잔재다.
- **실제 사용 중인 출력 레이아웃**: 결재 70건 모두 named template pin 0, default pin 0, unpinned 70이다. 즉 DB 문서 레이아웃 템플릿이 실제 승인 문서에 각인되어 사용된 증거는 **0건**이다. 현재 출력은 legacy/default/current fallback 계열이다.
- **품목 원천 식별자 갱신**: 7월 리포트 이후 `approval_attachments.ref_doc_type/ref_doc_no`가 생겼고 실제 OUTBOUND_SLIP 참조 5건이 있다. 따라서 R2는 “원천 ID 신규 영속화”부터가 아니라 **기존 비즈니스 문서번호 참조를 권한 있는 품목 조회와 `ApprovalDocView.lineItems`로 연결**하는 작업으로 재정의해야 한다. 이름이 달라 이미 있는 영속 계약을 새로 만들면 안 된다.

## 측정 7 — R2의 현재 크기 경계

실측 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d groupware_db -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY;
WITH per_approval AS (
  SELECT approval_id,COUNT(*) AS refs
  FROM approval_attachments
  WHERE NOT is_deleted AND ref_doc_type='OUTBOUND_SLIP'
  GROUP BY approval_id
)
SELECT refs AS outbound_refs_per_approval,COUNT(*) AS approval_count
FROM per_approval GROUP BY refs ORDER BY refs;
COMMIT;"
```

원문 출력:

```text
BEGIN
 outbound_refs_per_approval | approval_count
----------------------------+----------------
                          1 |              5
(1 row)

COMMIT
```

원격 코드 원문:

```text
documentReferenceSearch.ts | sha=90a3a5e77a034f9e964b5e23edae0a0a1a02fd5f
101: case 'OUTBOUND_SLIP':
102:   return searchSlips(keyword, limit, 'OUTBOUND')
126: if (type === 'OUTBOUND_SLIP' || type === 'INBOUND_SLIP') {
130:   refDocNo: row.slipNo,

slip.ts | sha=179e1525b636b02dc0c963b9c027683b7b4edef7
58: /** 라인 응답 — BE `SlipLineResponse`. */
59: export interface SlipLineDetail {
69:   quantity: number
71:   lineTotal: string
116: /** 상세 응답 — BE `SlipDetailResponse`. */
117: export interface SlipDetail extends SlipSummary {
123:   lines: SlipLineDetail[]
568: export async function getSlip(id: string): Promise<SlipDetail> {
569:   const res = await apiClient.get<ApiEnvelope<SlipDetail>>(`/slips/${id}`)
```

판정:

- 실데이터의 출고전표 참조 결재 5건은 모두 결재당 1개 참조다. 당장 다중 참조 병합 정책이 파일럿을 막지는 않는다.
- 검색 경로는 문서번호를 이미 사용하고, 전표 상세 계약에는 품목 라인이 이미 있다. 새 품목 DTO/DB를 만들 필요는 없다.
- 다만 상세 조회 함수는 내부 UUID 경로를 쓰므로, 인쇄 시 `refDocNo`를 정확히 한 건의 권한 있는 상세로 해석하는 계약(기존 검색→상세 재사용 또는 BE exact-number 조회)이 필요하다. UUID는 API 내부에서만 쓰고 화면에는 노출하지 않는다.

## 종합 답변 1 — DS-3b 다음의 잔여 슬라이스

| 우선순위 | 잔여 | 현재 판정 | 근거 |
|---:|---|---|---|
| 1 | **결재문서 참조 품목 연결** | 미완 · 별도 이슈 없음 | `ApprovalDocView`에 `lineItems` 없음. 다만 원천 식별자는 `approval_attachments.refDocType/refDocNo`로 이미 존재 |
| 2 | **DS-4 운영 활성화 게이트 해제** | 코드가 아니라 운영 선행 차단 | 인증서/CI secret + HTTPS update feed + clean-machine 업데이트 실증 후 BE/FE 게이트 해제. 의미 있는 DETAIL에는 1번도 필요 |
| 3 | **DFD-03 입력 정의 통합** | 미완 | 구 필드 빌더와 신 문서 편집기가 병존하고 결재 작성은 구 `ApprovalTemplate.fields`를 사용 |
| 4 | **하이브리드 캔버스 고급 UX** | 미완·DS-3b 명시 비범위 | 스냅 그리드·정렬 가이드·다중 선택. 자유 배치의 고도화이지 현재 저장/출력의 선결은 아님 |
| 5 | **revision 이력·롤백/브라우징 UI** | 미완·별도 이슈 없음 | D-DS3A-01 요구와 #868 범위가 충돌해 DS-3b에서 명시적으로 제외. revision 저장/조회 기반은 이미 있음 |
| 6 | **비법정 문서유형 adapter 확장** | 미완 | 거래명세서·판매송장·매입전표·견적서의 실제 `DocumentRenderer` 소비처 없음. 문서유형당 별도 슬라이스가 안전 |
| 7 | **PR #891 비차단 UX/디자인 부채** | 미완이나 PM 비차단 판정 | 내부 입력 design-system 전면 교체, 요소 추가 포커스, 미리보기 `h1` 중복 |

현재 잔여에서 제외할 것:

- DS-4 구현 자체: #908 머지 완료.
- 워드/엑셀 방식 선택: #998+#1007 완료.
- #890/#913 검증품질: #951 완료, 이월 없음.
- 법정 양식(세금계산서·재무제표): 확정 제외.

## 종합 답변 2 — 선행 관계

1. **결재문서 참조 품목 연결**은 자동 업데이트 인증서와 독립적으로 구현·검증할 수 있다. 현재 존재하는 출고전표 참조와 상세 라인 계약을 재사용한다.
2. **DS-4 게이트 해제**는 개발책임자 확정 결정상 `코드서명/CI secret → HTTPS 피드 배포 → clean-machine 자동 업데이트 실증`이 먼저다. IMAGE의 활성화에는 이 운영 조건만 필요하지만, DETAIL을 실제 업무에 켜려면 품목 연결도 먼저 끝나야 한다.
3. **DFD-03 입력 정의 통합**은 품목 연결·업데이트 게이트와 독립이다. 다만 파일럿 결재 문서의 스키마 권위를 하나로 만드는 작업이므로 문서유형 확장 전에 끝내는 편이 blast radius가 작다.
4. **비법정 문서유형 확장**은 공통 렌더러/편집기(완료) 위에서 가능하지만, 파일럿 gap인 품목 연결과 DFD-03을 먼저 닫은 뒤 문서유형별 adapter로 진행해야 같은 결함을 여러 문서에 복제하지 않는다. 반복 품목/이미지를 쓰는 유형은 DS-4 게이트 해제도 선행한다.
5. 고급 스냅/정렬, revision UI, PR #891의 비차단 UX 부채는 서로 독립이며 위 기능들의 hard blocker가 아니다.

간단한 차단 관계:

```text
코드서명·HTTPS 피드·clean-machine 실증 ──> DS-4 게이트 해제 ──┐
기존 refDocType/refDocNo ──> 품목 exact 조회·projection ───────┼─> DETAIL 실사용
                                                               │
DFD-03 입력 정의 통합 ──────────────────────────────────────────┼─> 파일럿 완결
                                                               └─> 비법정 문서유형별 확장
```

## 종합 답변 3 — PR #891이 남긴 미완

있다. 일반 코멘트에 design-system 내부 입력 전면 교체, 요소 추가 후 포커스, 미리보기 `h1` 중복이 “미완(정직 기록)”으로 남았다. revision 롤백/브라우징, 고급 스냅·정렬·다중선택, A4 외 용지, 결재 외 docType은 명시적 비범위다. 중간의 라이브QA 미완은 후속 9뷰포트 실서버 QA로 해소됐으므로 잔여에 포함하지 않는다.

## 종합 답변 4 — 실 데이터 요약

- 문서 레이아웃 템플릿: 전체 330, live 1 = ACTIVE 1 / DRAFT 0, 삭제 329. live 1은 업무 양식이 아닌 LiveQA 잔재.
- 결재 입력 양식: live 3 = ACTIVE 3 / inactive 0. 업무 양식은 지출결의서(5필드·실 결재 5건), 휴가신청서(4필드·실 결재 0건); 나머지 1개는 LiveQA.
- 결재 문서 70건: named layout pin 0, default pin 0, unpinned 70. 저장형 문서 레이아웃이 실제 승인 문서에 사용된 증거는 0건.
- 참조 원천: live OUTBOUND_SLIP 5건, JOURNAL 2건. OUTBOUND_SLIP은 모두 결재당 1개다.

## 라운드 종료 확인 — 삭제된 추적 파일

원격 브랜치 ref는 404라 증거로 사용하지 않았다. git 명령 없이 worktree의 binary index(`DIRC`)를 직접 읽어 각 추적 경로의 로컬 존재를 대조했다.

실측 명령:

```powershell
$gitPointer=(Get-Content -LiteralPath '.git' -Raw).Trim()
$indexPath=Join-Path ($gitPointer.Substring(8)) 'index'
$bytes=[IO.File]::ReadAllBytes($indexPath)
function Read-BE32([byte[]]$buffer,[int]$offset) {
  return ([uint32]$buffer[$offset] -shl 24) -bor ([uint32]$buffer[$offset+1] -shl 16) -bor
    ([uint32]$buffer[$offset+2] -shl 8) -bor [uint32]$buffer[$offset+3]
}
function Read-BE16([byte[]]$buffer,[int]$offset) {
  return ([uint16]$buffer[$offset] -shl 8) -bor [uint16]$buffer[$offset+1]
}
$signature=[Text.Encoding]::ASCII.GetString($bytes,0,4)
$version=Read-BE32 $bytes 4
$entryCount=Read-BE32 $bytes 8
$offset=12
$paths=New-Object System.Collections.Generic.List[string]
for ($entry=0; $entry -lt $entryCount; $entry++) {
  $entryStart=$offset
  $flags=Read-BE16 $bytes ($entryStart+60)
  $fixedLength=if (($flags -band 0x4000) -ne 0) { 64 } else { 62 }
  $pathStart=$entryStart+$fixedLength
  $pathEnd=$pathStart
  while ($bytes[$pathEnd] -ne 0) { $pathEnd++ }
  $paths.Add([Text.Encoding]::UTF8.GetString($bytes,$pathStart,$pathEnd-$pathStart))
  $entryLength=($pathEnd-$entryStart)+1
  $offset=$entryStart + ([Math]::Ceiling($entryLength/8.0)*8)
}
$workspace=(Get-Location).Path
$missing=@($paths | Sort-Object -Unique | Where-Object {
  -not (Test-Path -LiteralPath (Join-Path $workspace $_))
})
"INDEX_SIGNATURE=$signature"
"INDEX_VERSION=$version"
"INDEX_ENTRIES=$entryCount"
"UNIQUE_TRACKED_PATHS=$(@($paths | Sort-Object -Unique).Count)"
"MISSING_TRACKED_FILES=$($missing.Count)"
$missing
```

원문 출력:

```text
INDEX_SIGNATURE=DIRC
INDEX_VERSION=2
INDEX_ENTRIES=19190
UNIQUE_TRACKED_PATHS=19190
MISSING_TRACKED_FILES=0
```

삭제된 추적 파일은 **0개**다.

## 발주 결론

**다음 슬라이스는 “결재문서 출고전표 참조 품목 연결”이고 크기는 M(통합 PR 1개)이다.** 새 DB 컬럼이나 새 품목 모델을 만들지 말고 이미 영속된 `refDocType=OUTBOUND_SLIP/refDocNo`를 기존 전표 exact 조회·권한 계약으로 해석해 `SlipDetail.lines`를 UUID 비노출 projection으로 `ApprovalDocView.lineItems`에 연결하며, 조회 실패/권한 거부/참조 없음/1건 실데이터 인쇄를 함께 검증하는 범위다. 기존 검색→상세 경로를 안전하게 재사용할 수 있으면 FE+계약 테스트 중심의 M, exact-number 권한 조회 endpoint가 필요해도 BE+FE를 합친 M 상단이며 마이그레이션은 현재 증거상 불필요하다. 이 슬라이스와 병렬로 코드서명·HTTPS 피드·clean-machine 실증을 운영 트랙에서 해소한 뒤에만 DS-4 활성화 게이트를 푼다.
