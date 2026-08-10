package com.samhanair.logis.slip.revision.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import com.samhanair.logis.slip.revision.web.dto.SlipRevisionResponse;
import com.samhanair.logis.slip.revision.web.dto.SlipRevisionResponse.ChangeSummary;
import com.samhanair.logis.shared.realtime.presence.PresenceColor;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link SlipRevisionService} 스냅샷 캡처 단위 테스트 (권한 재편 Phase 2.1 Task 2).
 *
 * <p>{@code maxRevisionNo+1} 채번 정합 (1 → 2), {@link Slip#toSnapshot()} 매핑된 스냅샷의
 * 라인 수 / slipNo / slipDate 정합을 Mockito mock repository 로 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class SlipRevisionServiceTest {

    private static final UUID ACTOR_ID = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");

    @Mock
    private SlipRevisionRepository repository;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @InjectMocks
    private SlipRevisionService service;

    /**
     * id 가 @GeneratedValue 라 영속화 전엔 null 이므로, 단위 테스트에서는 reflection 으로 주입한다.
     */
    private static void injectId(Slip slip, UUID id) throws Exception {
        Field f = Slip.class.getDeclaredField("id");
        f.setAccessible(true);
        f.set(slip, id);
    }

    private Slip sampleSlip(UUID slipId) throws Exception {
        Slip slip = Slip.createOutbound("2026/05/29-3", LocalDate.of(2026, 5, 29), 3,
                UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "삼한물산",
                DeliveryTag.DAY, "긴급 출고", "user-1");
        injectId(slip, slipId);
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "펌프", "MX-100", "220V",
                2, new BigDecimal("15000.00"), "라인메모"));
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "밸브", null, null,
                5, new BigDecimal("3000.00"), null));
        return slip;
    }

    @Test
    @DisplayName("capture 2회 호출 시 revisionNo 가 1 → 2 로 채번되고 스냅샷이 헤더/라인과 정합한다")
    void captureAssignsSequentialRevisionNos() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = sampleSlip(slipId);
        UUID actorId = UUID.randomUUID();

        // 1회차: 기존 스냅샷 없음 (maxRevisionNo == null → next = 1)
        when(repository.maxRevisionNo(slipId)).thenReturn(null);
        when(repository.saveAndFlush(any(SlipRevision.class))).thenAnswer(inv -> inv.getArgument(0));

        SlipRevision first = service.capture(slip, SlipRevisionType.CREATE, null,
                actorId, "홍길동", null);

        assertThat(first.getRevisionNo()).isEqualTo(1);
        assertThat(first.getRevisionType()).isEqualTo(SlipRevisionType.CREATE);
        assertThat(first.getSlipId()).isEqualTo(slipId);
        assertThat(first.getSlipNo()).isEqualTo("2026/05/29-3");
        assertThat(first.getSlipDate()).isEqualTo(LocalDate.of(2026, 5, 29));
        assertThat(first.getActorId()).isEqualTo(actorId);
        assertThat(first.getActorName()).isEqualTo("홍길동");
        assertThat(first.getSnapshot().lines()).hasSize(2);
        assertThat(first.getSnapshot().partnerName()).isEqualTo("삼한물산");
        assertThat(first.getSnapshot().lines().get(0).lineTotal()).isEqualByComparingTo("30000.00");

        // 2회차: 직전 revision 1 존재 (maxRevisionNo == 1 → next = 2)
        when(repository.maxRevisionNo(slipId)).thenReturn(1);

        SlipRevision second = service.capture(slip, SlipRevisionType.EDIT, null,
                actorId, "홍길동", null);

        assertThat(second.getRevisionNo()).isEqualTo(2);
        assertThat(second.getRevisionType()).isEqualTo(SlipRevisionType.EDIT);
    }

    @Test
    @DisplayName("RESTORE 캡처는 sourceRevisionNo 를 보존한다")
    void captureRestorePreservesSourceRevision() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = sampleSlip(slipId);

        when(repository.maxRevisionNo(slipId)).thenReturn(3);
        when(repository.saveAndFlush(any(SlipRevision.class))).thenAnswer(inv -> inv.getArgument(0));

        SlipRevision restored = service.capture(slip, SlipRevisionType.RESTORE, 2,
                UUID.randomUUID(), "관리자", null);

        assertThat(restored.getRevisionNo()).isEqualTo(4);
        assertThat(restored.getSourceRevisionNo()).isEqualTo(2);
        assertThat(restored.getRevisionType()).isEqualTo(SlipRevisionType.RESTORE);
    }

    @Test
    @DisplayName("capture: saveAndFlush 1회차 DataIntegrityViolationException → 1회 재채번 재시도 후 "
            + "정상 반환 (saveAndFlush 2회 + maxRevisionNo 재조회 2회)")
    void captureRetriesOnceWhenFirstSaveConflicts() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = sampleSlip(slipId);
        UUID actorId = UUID.randomUUID();

        // maxRevisionNo: 1회차 채번 시 1(→next=2), 재시도 채번 시 갱신된 2(→next=3)
        when(repository.maxRevisionNo(slipId)).thenReturn(1, 2);
        // saveAndFlush: 1회차 unique 위반, 2회차 정상 반환
        when(repository.saveAndFlush(any(SlipRevision.class)))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException(
                        "uq_slip_revisions_active 위반 (race)"))
                .thenAnswer(inv -> inv.getArgument(0));

        SlipRevision result = service.capture(slip, SlipRevisionType.EDIT, null,
                actorId, "홍길동", null);

        // 예외 없이 재채번된 revisionNo(=3) 로 반환
        assertThat(result).isNotNull();
        assertThat(result.getRevisionNo()).isEqualTo(3);
        assertThat(result.getRevisionType()).isEqualTo(SlipRevisionType.EDIT);
        // saveAndFlush 2회 호출 (1회차 실패 + 재시도) + maxRevisionNo 2회 재조회
        verify(repository, times(2)).saveAndFlush(any(SlipRevision.class));
        verify(repository, times(2)).maxRevisionNo(slipId);
    }

    @Test
    @DisplayName("capture: saveAndFlush 가 2회 모두 DataIntegrityViolationException → "
            + "BusinessException(CONFLICT) 로 변환한다")
    void captureThrowsConflictWhenRetryAlsoConflicts() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = sampleSlip(slipId);

        when(repository.maxRevisionNo(slipId)).thenReturn(1, 2);
        // saveAndFlush: 1회차·2회차 모두 unique 위반
        when(repository.saveAndFlush(any(SlipRevision.class)))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException(
                        "uq_slip_revisions_active 위반 (race)"));

        assertThatThrownBy(() -> service.capture(slip, SlipRevisionType.EDIT, null,
                UUID.randomUUID(), "홍길동", null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.CONFLICT);

        // 2회 모두 시도 후 포기
        verify(repository, times(2)).saveAndFlush(any(SlipRevision.class));
    }

    private SlipSnapshot partnerlessSnapshot(SlipSnapshot source) {
        return new SlipSnapshot(
                source.slipNo(), source.slipDate(), null, source.partnerName(), source.partnerCode(),
                source.businessNumber(), source.memo(), source.deliveryTag(), source.deliveryAddress(),
                source.supervisionAddress(), source.projectName(), source.recipientPhone(),
                source.paymentDueDate(), source.destinationWarehouseId(), source.destinationWarehouseName(),
                source.shippingAddress(), source.inspectionAddress(), source.receiverPhone(),
                source.customerTel(), source.customerAddress(), source.customerRepresentative(),
                source.paymentDueLabel(), source.discountInfo(), source.collectTerm(), source.agreeTerm(),
                source.lines());
    }

    @Test
    void restoreRejectsPartnerlessSnapshotForCommittedSlip() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = sampleSlip(slipId);
        slip.save();
        slip.send();
        SlipRevision revision = SlipRevision.of(
                slipId, 1, SlipRevisionType.EDIT, null,
                slip.getSlipNo(), slip.getSlipDate(), partnerlessSnapshot(slip.toSnapshot()),
                UUID.randomUUID(), "관리자", null);
        when(repository.findBySlipIdAndRevisionNo(slipId, 1)).thenReturn(Optional.of(revision));

        assertThatThrownBy(() -> service.restore(slip, 1, UUID.randomUUID(), "관리자", null))
                .isInstanceOf(BusinessException.class)
                .hasMessage("거래처 없는 이력으로 커밋 전표를 복원할 수 없습니다");
        org.mockito.Mockito.verify(repository, org.mockito.Mockito.never())
                .saveAndFlush(any(SlipRevision.class));
    }

    /**
     * 메모를 변경하고 라인을 1건 추가한다 (rev2 의 변형 상태 시뮬레이션).
     */
    private void mutateToRev2State(Slip slip) {
        // rev1=memo "긴급 출고" + 라인 2건 → rev2=memo 변경 + 라인 3건
        slip.editHeader(null, null, null, "수정된 메모", null, null);
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "호스", null, null,
                1, new BigDecimal("1000.00"), null));
    }

    @Test
    @DisplayName("restore: rev1(라인2/memo원본) → 변형(라인3/memo변경) → restore(rev1) 시 "
            + "memo·라인이 rev1 로 복원되고 신규 RESTORE revision(source=1) 이 캡처된다")
    void restoreRevertsHeaderAndLinesAndCapturesRestoreRevision() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = sampleSlip(slipId);
        UUID actorId = UUID.randomUUID();

        // rev1 스냅샷 = 원본 상태 (라인 2건, memo "긴급 출고")
        SlipRevision rev1 = SlipRevision.of(slipId, 1, SlipRevisionType.CREATE, null,
                slip.getSlipNo(), slip.getSlipDate(), slip.toSnapshot(),
                actorId, "홍길동", null);

        // 변형 — memo 변경 + 라인 1건 추가 (현 슬립 상태가 라인 3건/memo "수정된 메모" 가 됨)
        mutateToRev2State(slip);
        assertThat(slip.getMemo()).isEqualTo("수정된 메모");
        assertThat(slip.getLines().stream()
                .filter(l -> !Boolean.TRUE.equals(l.getIsDeleted())).count()).isEqualTo(3);

        // restore(rev1) — rev1 스냅샷 로드 + 신규 revisionNo=3 채번
        when(repository.findBySlipIdAndRevisionNo(slipId, 1)).thenReturn(Optional.of(rev1));
        when(repository.maxRevisionNo(slipId)).thenReturn(2);
        when(repository.saveAndFlush(any(SlipRevision.class))).thenAnswer(inv -> inv.getArgument(0));

        SlipRevision restored = service.restore(slip, 1, actorId, "관리자", null);

        // 슬립 헤더/라인이 rev1 로 복원
        assertThat(slip.getMemo()).isEqualTo("긴급 출고");
        assertThat(slip.getLines().stream()
                .filter(l -> !Boolean.TRUE.equals(l.getIsDeleted())).count()).isEqualTo(2);
        // 신규 RESTORE revision: type=RESTORE, source=1, revisionNo=3
        assertThat(restored.getRevisionType()).isEqualTo(SlipRevisionType.RESTORE);
        assertThat(restored.getSourceRevisionNo()).isEqualTo(1);
        assertThat(restored.getRevisionNo()).isEqualTo(3);
        assertThat(restored.getActorName()).isEqualTo("관리자");
        // 캡처된 스냅샷도 복원 후 상태(라인 2건)와 정합
        assertThat(restored.getSnapshot().lines()).hasSize(2);
        assertThat(restored.getSnapshot().memo()).isEqualTo("긴급 출고");
    }

    @Test
    @DisplayName("restore: 대상 revisionNo 가 없으면 NOT_FOUND 를 던진다")
    void restoreThrowsWhenTargetRevisionMissing() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = sampleSlip(slipId);

        when(repository.findBySlipIdAndRevisionNo(slipId, 99)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.restore(slip, 99, UUID.randomUUID(), "관리자", null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NOT_FOUND);
    }

    // ---------------------------------------------------------------------
    // Task 4: changeSummary 계산 단위 테스트
    // ---------------------------------------------------------------------

    /**
     * 라인 1건 스냅샷을 만든다 (productId 매칭 키 보존).
     */
    private SlipSnapshot.Line line(UUID productId, int quantity, String unitPrice) {
        return new SlipSnapshot.Line(productId, "품목", "모델", "규격",
                quantity, new BigDecimal(unitPrice),
                new BigDecimal(unitPrice).multiply(BigDecimal.valueOf(quantity)), null,
                null, null, null);
    }

    // 스냅샷 헤더의 partnerId/destinationWarehouseId 를 고정해 memo 외 헤더가 우연히 달라지지 않게 한다.
    private static final UUID FIXED_PARTNER_ID = UUID.randomUUID();
    private static final UUID FIXED_WAREHOUSE_ID = UUID.randomUUID();

    /**
     * 헤더 + 라인 리스트를 가진 스냅샷을 만든다 (UUID 헤더는 고정값 — memo 만 가변).
     */
    private SlipSnapshot snapshot(String memo, List<SlipSnapshot.Line> lines) {
        return new SlipSnapshot("2026/05/29-3", LocalDate.of(2026, 5, 29),
                FIXED_PARTNER_ID, "삼한물산", "P001", "123-45-67890",
                memo, "DAY", "서울시", null, "프로젝트A", "010", null,
                FIXED_WAREHOUSE_ID, "본사창고",
                // audit overlay 필드 10개 — 고정 null (memo 외 헤더가 우연히 달라지지 않게)
                null, null, null, null, null, null, null, null, null, null,
                lines);
    }

    @Test
    @DisplayName("summarize: prev==null (최초 revision) 이면 headerChanged=0, lineAdded=현 라인 수, 나머지 0")
    void summarizeFirstRevisionCountsAllLinesAsAdded() {
        SlipSnapshot cur = snapshot("memo", List.of(
                line(UUID.randomUUID(), 1, "1000"),
                line(UUID.randomUUID(), 2, "2000")));

        ChangeSummary summary = service.summarize(null, cur);

        assertThat(summary.headerChanged()).isZero();
        assertThat(summary.lineAdded()).isEqualTo(2);
        assertThat(summary.lineRemoved()).isZero();
        assertThat(summary.lineModified()).isZero();
    }

    @Test
    @DisplayName("summarize: 현재 snapshot 이 null 이면 summary 도 null 로 반환한다")
    void summarizeReturnsNullWhenCurrentSnapshotIsNull() {
        assertThat(service.summarize(snapshot("memo", List.of()), null)).isNull();
    }

    @Test
    @DisplayName("summarize: 헤더 1필드 변경 + 라인 add1/remove1/modify1 → ChangeSummary 정합")
    void summarizeCountsHeaderAndLineDeltas() {
        UUID keep = UUID.randomUUID();      // 양쪽 존재 — modify 대상
        UUID removed = UUID.randomUUID();   // prev 에만 — removed
        UUID added = UUID.randomUUID();     // cur 에만 — added

        // prev: keep(qty1) + removed, memo "원본"
        SlipSnapshot prev = snapshot("원본", List.of(
                line(keep, 1, "1000"),
                line(removed, 5, "500")));
        // cur: keep(qty3 — 수정) + added, memo "변경" (헤더 1필드 변경)
        SlipSnapshot cur = snapshot("변경", List.of(
                line(keep, 3, "1000"),
                line(added, 9, "900")));

        ChangeSummary summary = service.summarize(prev, cur);

        assertThat(summary.headerChanged()).isEqualTo(1);   // memo 만 변경
        assertThat(summary.lineAdded()).isEqualTo(1);       // added
        assertThat(summary.lineRemoved()).isEqualTo(1);     // removed
        assertThat(summary.lineModified()).isEqualTo(1);    // keep qty 1→3
    }

    @Test
    @DisplayName("summarize: 동일 productId·동일 필드값이면 modified 로 집계하지 않는다 (no-op)")
    void summarizeNoChangeWhenLinesIdentical() {
        UUID p = UUID.randomUUID();
        SlipSnapshot prev = snapshot("memo", List.of(line(p, 2, "1500")));
        SlipSnapshot cur = snapshot("memo", List.of(line(p, 2, "1500")));

        ChangeSummary summary = service.summarize(prev, cur);

        assertThat(summary.headerChanged()).isZero();
        assertThat(summary.lineAdded()).isZero();
        assertThat(summary.lineRemoved()).isZero();
        assertThat(summary.lineModified()).isZero();
    }

    @Test
    @DisplayName("summarize: 동일 productId 복수 행 중 1건 삭제도 removed 로 집계한다")
    void summarizeCountsRemovedDuplicateProductLineByOccurrence() {
        UUID p = UUID.randomUUID();
        SlipSnapshot prev = snapshot("memo", List.of(
                line(p, 1, "1000"),
                line(p, 2, "1000")));
        SlipSnapshot cur = snapshot("memo", List.of(
                line(p, 1, "1000")));

        ChangeSummary summary = service.summarize(prev, cur);

        assertThat(summary.lineAdded()).isZero();
        assertThat(summary.lineRemoved()).isEqualTo(1);
        assertThat(summary.lineModified()).isZero();
    }

    @Test
    @DisplayName("listWithSummary: 최신 우선 정렬 + 각 항목이 직전 revisionNo 대비 changeSummary 를 가지며 "
            + "actorId 는 노출하지 않는다")
    void listWithSummaryBuildsAdjacentSummariesNewestFirst() {
        UUID slipId = UUID.randomUUID();
        UUID p1 = UUID.randomUUID();

        // rev1 (최초): 라인 1건
        SlipRevision rev1 = SlipRevision.of(slipId, 1, SlipRevisionType.CREATE, null,
                "2026/05/29-3", LocalDate.of(2026, 5, 29),
                snapshot("원본", List.of(line(p1, 1, "1000"))),
                UUID.randomUUID(), "홍길동", null);
        // rev2: 동일 라인 수정 (qty 1→4) — modify 1
        SlipRevision rev2 = SlipRevision.of(slipId, 2, SlipRevisionType.EDIT, null,
                "2026/05/29-3", LocalDate.of(2026, 5, 29),
                snapshot("원본", List.of(line(p1, 4, "1000"))),
                UUID.randomUUID(), "관리자", null);

        // list 는 내림차순(rev2, rev1) 반환
        when(repository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        List<SlipRevisionResponse> result = service.listWithSummary(slipId);

        // 최신 우선 (rev2 먼저)
        assertThat(result).hasSize(2);
        assertThat(result.get(0).revisionNo()).isEqualTo(2);
        assertThat(result.get(1).revisionNo()).isEqualTo(1);

        // rev2 changeSummary = rev1 대비 라인 modify 1
        ChangeSummary rev2Summary = result.get(0).changeSummary();
        assertThat(rev2Summary.lineModified()).isEqualTo(1);
        assertThat(rev2Summary.lineAdded()).isZero();
        assertThat(rev2Summary.lineRemoved()).isZero();
        assertThat(rev2Summary.headerChanged()).isZero();

        // rev1 = 최초 → lineAdded 1
        ChangeSummary rev1Summary = result.get(1).changeSummary();
        assertThat(rev1Summary.lineAdded()).isEqualTo(1);
        assertThat(rev1Summary.headerChanged()).isZero();

        // 표시 필드 정합 + actorId 미노출 (응답 record 에 actorId 필드 부재)
        assertThat(result.get(0).actorName()).isEqualTo("관리자");
        assertThat(result.get(0).revisionType()).isEqualTo("EDIT");
        assertThat(java.util.Arrays.stream(SlipRevisionResponse.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName))
                .doesNotContain("actorId");
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {
            "550e8400-e29b-41d4-a716-446655440000",
            "550E8400-E29B-41D4-A716-446655440000",
            "  550e8400-e29b-41d4-a716-446655440000  ",
            "{550e8400-e29b-41d4-a716-446655440000}",
            "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
            "550e8400e29b41d4a716446655440000"
    })
    void listWithSummary_hidesUuidActorNameOnlyWhenItEqualsActorId(String actorName) {
        UUID slipId = UUID.randomUUID();
        SlipRevision revision = SlipRevision.of(slipId, 1, SlipRevisionType.CREATE, null,
                "2026/05/29-3", LocalDate.of(2026, 5, 29),
                snapshot("원본", List.of()), ACTOR_ID, actorName, null);
        when(repository.findBySlipIdOrderByRevisionNoDesc(slipId)).thenReturn(List.of(revision));

        assertThat(service.listWithSummary(slipId).get(0).actorName()).isNull();
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {
            "cafebabecafebabecafebabecafebabe",
            "{cafebabecafebabecafebabecafebabe}",
            "urn:uuid:cafebabecafebabecafebabecafebabe"
    })
    void listWithSummary_preservesUuidShapedNameWhenItDiffersFromActorId(String actorName) {
        UUID slipId = UUID.randomUUID();
        SlipRevision revision = SlipRevision.of(slipId, 1, SlipRevisionType.CREATE, null,
                "2026/05/29-3", LocalDate.of(2026, 5, 29),
                snapshot("원본", List.of()), ACTOR_ID, actorName, null);
        when(repository.findBySlipIdOrderByRevisionNoDesc(slipId)).thenReturn(List.of(revision));

        assertThat(service.listWithSummary(slipId).get(0).actorName()).isEqualTo(actorName);
    }

    @Test
    void listWithSummary_projectionPathPreservesUuidShapedNameWhenItDiffersFromActorId() throws Exception {
        UUID slipId = UUID.randomUUID();
        SlipRevisionRepository.SlipRevisionSnapshotRow row = org.mockito.Mockito.mock(
                SlipRevisionRepository.SlipRevisionSnapshotRow.class);
        when(row.getRevisionNo()).thenReturn(1);
        when(row.getRevisionType()).thenReturn("CREATE");
        when(row.getSourceRevisionNo()).thenReturn(null);
        when(row.getSlipNo()).thenReturn("2026/05/29-3");
        when(row.getSlipDate()).thenReturn(LocalDate.of(2026, 5, 29));
        when(row.getActorId()).thenReturn(ACTOR_ID);
        when(row.getActorName()).thenReturn("cafebabecafebabecafebabecafebabe");
        when(row.getActorColor()).thenReturn(null);
        when(row.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 29, 9, 0));
        String snapshotJson = objectMapper.writeValueAsString(snapshot("원본", List.of()));
        when(row.getSnapshotJson()).thenReturn(snapshotJson);
        when(repository.findSnapshotRowsBySlipIdOrderByRevisionNoDesc(slipId)).thenReturn(List.of(row));

        assertThat(service.listWithSummary(slipId).get(0).actorName())
                .isEqualTo("cafebabecafebabecafebabecafebabe");
    }

    @Test
    void safeActorName_preserves32CharacterNonUuidNames() {
        String koreanName = "가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도";
        String alphaNumericName = "0000000000000000000000000000000G";

        assertThat(service.safeActorName(koreanName, ACTOR_ID)).isEqualTo(koreanName);
        assertThat(service.safeActorName(alphaNumericName, ACTOR_ID)).isEqualTo(alphaNumericName);
    }

    @Test
    @DisplayName("listWithSummary: 직전 revision 대비 헤더 필드와 품목 셀 변경 목록을 actor 색상과 함께 노출한다")
    void listWithSummaryExposesFieldLevelChangesWithPresenceColor() throws Exception {
        UUID slipId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        UUID editorId = UUID.fromString("20000000-0000-0000-0000-000000000001");

        SlipRevision rev1 = SlipRevision.of(slipId, 1, SlipRevisionType.CREATE, null,
                "2026/05/29-3", LocalDate.of(2026, 5, 29),
                snapshot("원본 메모", List.of(line(productId, 1, "1000"))),
                UUID.randomUUID(), "작성자", null);
        SlipRevision rev2 = SlipRevision.of(slipId, 2, SlipRevisionType.EDIT, null,
                "2026/05/29-3", LocalDate.of(2026, 5, 29),
                snapshot("수정 메모", List.of(line(productId, 3, "1000"))),
                editorId, "김영업", null);

        when(repository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        List<SlipRevisionResponse> result = service.listWithSummary(slipId);

        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        JsonNode rev2Json = mapper.valueToTree(result.get(0));
        JsonNode fieldChanges = rev2Json.get("fieldChanges");
        assertThat(fieldChanges).isNotNull();
        JsonNode memoChange = findChange(fieldChanges, "header.memo");
        JsonNode quantityChange = findChange(fieldChanges, "lines[0].quantity");
        assertThat(memoChange).isNotNull();
        assertThat(memoChange.get("label").asText()).isEqualTo("메모");
        assertThat(memoChange.get("beforeValue").asText()).isEqualTo("원본 메모");
        assertThat(memoChange.get("afterValue").asText()).isEqualTo("수정 메모");
        assertThat(memoChange.get("actorName").asText()).isEqualTo("김영업");
        assertThat(memoChange.get("actorColor").asText())
                .isEqualTo(PresenceColor.fromUserId(editorId.toString()).hex());
        assertThat(quantityChange).isNotNull();
        assertThat(quantityChange.get("label").asText()).isEqualTo("품목 1행 수량");
        assertThat(quantityChange.get("beforeValue").asText()).isEqualTo("1");
        assertThat(quantityChange.get("afterValue").asText()).isEqualTo("3");
        assertThat(rev2Json.has("actorId")).isFalse();
    }

    @Test
    @DisplayName("listWithSummary: 동일 productId 복수 행은 등장 순서로 매칭해 두 번째 행 변경을 정확히 귀속한다")
    void listWithSummaryMatchesDuplicateProductLinesByOccurrence() {
        UUID slipId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        UUID editorId = UUID.fromString("20000000-0000-0000-0000-000000000002");

        SlipRevision rev1 = SlipRevision.of(slipId, 1, SlipRevisionType.CREATE, null,
                "2026/05/29-3", LocalDate.of(2026, 5, 29),
                snapshot("memo", List.of(
                        line(productId, 1, "1000"),
                        line(productId, 2, "1000"))),
                UUID.randomUUID(), "작성자", null);
        SlipRevision rev2 = SlipRevision.of(slipId, 2, SlipRevisionType.EDIT, null,
                "2026/05/29-3", LocalDate.of(2026, 5, 29),
                snapshot("memo", List.of(
                        line(productId, 1, "1000"),
                        line(productId, 3, "1000"))),
                editorId, "김영업", null);

        when(repository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        List<SlipRevisionResponse> result = service.listWithSummary(slipId);

        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        JsonNode fieldChanges = mapper.valueToTree(result.get(0)).get("fieldChanges");
        JsonNode firstRowQuantity = findChange(fieldChanges, "lines[0].quantity");
        JsonNode secondRowQuantity = findChange(fieldChanges, "lines[1].quantity");
        assertThat(firstRowQuantity).isNull();
        assertThat(secondRowQuantity).isNotNull();
        assertThat(secondRowQuantity.get("beforeValue").asText()).isEqualTo("2");
        assertThat(secondRowQuantity.get("afterValue").asText()).isEqualTo("3");
    }

    @Test
    @DisplayName("listWithSummary: productId 기준 신규 라인은 null→value fieldChanges 로 노출한다")
    void listWithSummaryExposesAddedLineFieldChanges() {
        UUID added = UUID.randomUUID();
        JsonNode fieldChanges = fieldChangesFor(
                List.of(),
                List.of(line(added, 2, "1000")));

        JsonNode quantity = findChange(fieldChanges, "lines[0].quantity");
        assertThat(quantity).isNotNull();
        assertThat(quantity.get("beforeValue").isNull()).isTrue();
        assertThat(quantity.get("afterValue").asText()).isEqualTo("2");
    }

    @Test
    @DisplayName("listWithSummary: productId 기준 삭제 라인은 value→null fieldChanges 로 노출한다")
    void listWithSummaryExposesRemovedLineFieldChanges() {
        UUID removed = UUID.randomUUID();
        JsonNode fieldChanges = fieldChangesFor(
                List.of(line(removed, 4, "1000")),
                List.of());

        JsonNode quantity = findChange(fieldChanges, "lines.removed[0].quantity");
        assertThat(quantity).isNotNull();
        assertThat(quantity.get("beforeValue").asText()).isEqualTo("4");
        assertThat(quantity.get("afterValue").isNull()).isTrue();
    }

    @Test
    @DisplayName("listWithSummary: 라인 재정렬은 productId 로 매칭해 수정 fieldChanges 를 만들지 않는다")
    void listWithSummaryDoesNotTreatReorderedLinesAsModified() {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        JsonNode fieldChanges = fieldChangesFor(
                List.of(line(first, 1, "1000"), line(second, 2, "1000")),
                List.of(line(second, 2, "1000"), line(first, 1, "1000")));

        assertThat(fieldChanges).isEmpty();
    }

    @Test
    @DisplayName("summarize: productId null 라인은 매칭하지 않고 added/removed 로만 집계한다")
    void summarizeCountsNullProductIdLinesAsAddedAndRemovedOnly() {
        SlipSnapshot prev = snapshot("memo", List.of(line(null, 1, "1000")));
        SlipSnapshot cur = snapshot("memo", List.of(line(null, 1, "1000")));

        ChangeSummary summary = service.summarize(prev, cur);

        assertThat(summary.lineAdded()).isEqualTo(1);
        assertThat(summary.lineRemoved()).isEqualTo(1);
        assertThat(summary.lineModified()).isZero();
    }

    /**
     * 재수렴 6차(#937) ⑦ — 버전이력 "단가"가 화면과 같은 VAT 포함 도메인을 말한다.
     *
     * <p>라이브 실증(전표 2026/07/27-209): 사용자는 단가(VAT 포함) 100,000 을 한 번 입력하고
     * 이후 <b>공급가액·부가세만</b> 편집했는데, 버전이력은 {@code 단가 null→90,909} +
     * {@code 단가 90,909→100,000} 이라는 <b>하지 않은 변경 2건</b>을 기록했다. 재수렴 4차가
     * {@code unit_price} 의 의미를 "사용자 입력" → "공급가액 ÷ 수량"으로 바꿨는데 버전이력이
     * 그 컬럼을 정규화 없이 읽고 있었기 때문이다. 같은 상세 화면이 레드라인(VAT 포함)과
     * 버전이력을 나란히 렌더하므로 사용자는 한 화면에서 두 단가를 본다.
     */
    @Test
    @DisplayName("재수렴 6차 ⑦: 공급가액만 편집한 라인은 버전이력에 단가 변경을 남기지 않는다")
    void versionHistoryUnitPriceUsesScreenTaxDomain() {
        UUID productId = UUID.randomUUID();
        // 생성 직후: 단가(VAT포함) 100,000 x 2 → S=181,818 · V=18,182 · unit_price=90,909
        SlipSnapshot.Line before = domainLine(productId, 2, "90909", "100000",
                "181818", "18182", "VAT_INCLUSIVE");
        // 공급가액·부가세만 정정("부가세 별도") → unit_price 는 S÷Q 로 100,000 이 된다.
        SlipSnapshot.Line after = domainLine(productId, 2, "100000", "100000",
                "200000", "20000", "VAT_INCLUSIVE");

        JsonNode fieldChanges = fieldChangesFor(List.of(before), List.of(after));

        // RED(수정 전): {beforeValue:"90909", afterValue:"100000"} — 사용자가 하지 않은 변경.
        assertThat(findChange(fieldChanges, "lines[0].unitPrice"))
                .as("사용자가 건드리지 않은 단가는 이력에 남지 않는다").isNull();
        // 합계는 실제로 바뀌었다(표시 도메인 200,000 → 220,000) — 재수렴 7차 R7-1 이후 VAT 포함.
        JsonNode lineTotal = findChange(fieldChanges, "lines[0].lineTotal");
        assertThat(lineTotal).isNotNull();
        assertThat(lineTotal.get("beforeValue").asText()).isEqualTo("200000");
        assertThat(lineTotal.get("afterValue").asText()).isEqualTo("220000");
    }

    @Test
    @DisplayName("재수렴 6차 ⑦: 실제 단가 변경은 화면 도메인(VAT 포함) 값으로 기록된다")
    void versionHistoryRecordsRealUnitPriceChangeInScreenDomain() {
        UUID productId = UUID.randomUUID();
        SlipSnapshot.Line before = domainLine(productId, 2, "90909", "100000",
                "181818", "18182", "VAT_INCLUSIVE");
        SlipSnapshot.Line after = domainLine(productId, 2, "109091", "120000",
                "218182", "21818", "VAT_INCLUSIVE");

        JsonNode change = findChange(fieldChangesFor(List.of(before), List.of(after)),
                "lines[0].unitPrice");

        assertThat(change).isNotNull();
        assertThat(change.get("beforeValue").asText()).isEqualTo("100000");
        assertThat(change.get("afterValue").asText()).isEqualTo("120000");
    }

    @Test
    @DisplayName("재수렴 6차 A안: 도메인이 없는 legacy 스냅샷은 현행 휴리스틱을 유지한다")
    void versionHistoryKeepsHeuristicForLegacySnapshotLines() {
        UUID productId = UUID.randomUUID();
        // 같은 좌표인데 도메인만 없다 — 구 BE 오염행일 수 있어 권위 합계에서 유도(220,000/2).
        SlipSnapshot.Line legacy = domainLine(productId, 2, "100000", "100000",
                "200000", "20000", null);
        SlipSnapshot.Line changed = domainLine(productId, 2, "100000", "100000",
                "200000", "20000", "VAT_INCLUSIVE");

        JsonNode change = findChange(fieldChangesFor(List.of(legacy), List.of(changed)),
                "lines[0].unitPrice");

        assertThat(change).isNotNull();
        assertThat(change.get("beforeValue").asText()).isEqualTo("110000");
        assertThat(change.get("afterValue").asText()).isEqualTo("100000");
    }

    /**
     * 재수렴 7차(#937) R7-1 — 버전이력 "합계"가 전표 라인 표의 "합계(VAT포함)"와 같은 값을 말한다.
     *
     * <p>라이브 실증(단가 VAT포함 100,000 × 2 → 단가만 120,000 수정): 같은 상세 화면이
     * <b>전표 라인 표</b>에 {@code 단가(VAT포함) 120,000 | 공급가액 218,181 | 합계(VAT포함) 240,000}
     * 을, 바로 아래 <b>버전 이력</b>에 {@code 단가 100000 → 120000} + {@code 합계 181818 → 218181}
     * 을 나란히 렌더했다. {@code 120,000 × 2 = 240,000 ≠ 218,181} — 표 헤더의 "합계(VAT포함)"와
     * 이력의 "합계"가 <b>같은 단어로 다른 값</b>이었다.
     *
     * <p>개발책임자 결정(2026-07-27) = <b>A안 "이력 합계도 VAT 포함으로"</b>. 과거 감사 이력의
     * 숫자가 소급 변경된다는 점을 인지한 상태의 결정이다.
     */
    @Test
    @DisplayName("재수렴 7차 R7-1: 단가만 수정하면 버전이력 합계가 표의 합계(VAT포함)와 같은 값으로 기록된다")
    void versionHistoryLineTotalUsesScreenTaxDomain() {
        UUID productId = UUID.randomUUID();
        // 단가(VAT포함) 100,000 × 2 → S=181,818 · V=18,182 · 표의 합계(VAT포함)=200,000
        SlipSnapshot.Line before = domainLine(productId, 2, "90909", "100000",
                "181818", "18182", "VAT_INCLUSIVE");
        // 단가만 120,000 으로 수정 → S=218,181 · V=21,819 · 표의 합계(VAT포함)=240,000
        SlipSnapshot.Line after = domainLine(productId, 2, "109090.50", "120000",
                "218181", "21819", "VAT_INCLUSIVE");

        JsonNode fieldChanges = fieldChangesFor(List.of(before), List.of(after));

        JsonNode unitPrice = findChange(fieldChanges, "lines[0].unitPrice");
        JsonNode lineTotal = findChange(fieldChanges, "lines[0].lineTotal");
        assertThat(unitPrice).isNotNull();
        assertThat(unitPrice.get("beforeValue").asText()).isEqualTo("100000");
        assertThat(unitPrice.get("afterValue").asText()).isEqualTo("120000");
        assertThat(lineTotal).isNotNull();
        // RED(수정 전): 181818 → 218181 (VAT 제외 공급가액) — 같은 화면의 "합계(VAT포함) 240,000"과 어긋난다.
        assertThat(lineTotal.get("beforeValue").asText()).isEqualTo("200000");
        assertThat(lineTotal.get("afterValue").asText()).isEqualTo("240000");
        // 불변식 1 — 한 행 안에서 단가 × 수량 = 합계.
        assertThat(new BigDecimal(lineTotal.get("afterValue").asText()))
                .isEqualByComparingTo(new BigDecimal(unitPrice.get("afterValue").asText())
                        .multiply(BigDecimal.valueOf(2)));
        assertThat(new BigDecimal(lineTotal.get("beforeValue").asText()))
                .isEqualByComparingTo(new BigDecimal(unitPrice.get("beforeValue").asText())
                        .multiply(BigDecimal.valueOf(2)));
    }

    /**
     * 재수렴 7차(#937) R7-2 — 금액 3값이 없는 구 스냅샷에서 FE/BE 표시 판정이 갈렸다.
     *
     * <p>실전표 {@code 2026/06/24-7} rev3 → rev4 에 <b>사용자가 하지 않은</b> "품목 1행 단가
     * 100000 → 110000" 이 새로 생겼다(main 에는 없는 항목). 원인은
     * {@code supplyAmount}·{@code vatAmount} 가 둘 다 없을 때의 총액 해석 차이다 —
     * BE {@code lineTotalDisplayValue} 는 {@code lineTotal}(VAT 제외) 을 총액으로 보고,
     * FE {@code SlipDetailPage.slipLineAmounts} 는 {@code lineTotal + 10%} 를 총액으로 본다.
     * 화면이 권위이므로 BE 를 FE 에 맞춘다(불변식 3).
     */
    @Test
    @DisplayName("재수렴 7차 R7-2: 금액 3값이 없는 구 스냅샷도 화면(FE)과 같은 VAT 포함 총액으로 읽는다")
    void versionHistoryLegacySnapshotWithoutAmountsMirrorsScreen() {
        UUID productId = UUID.randomUUID();
        // 실전표 2026/06/24-7 rev3 — supplyAmount·vatAmount·unitPriceWithVat 가 전부 없다.
        SlipSnapshot.Line legacy = new SlipSnapshot.Line(productId, "품목", "모델", "규격", 1,
                new BigDecimal("100000.00"), new BigDecimal("100000.00"), null, null, null, null);
        // 같은 전표 rev4 — 같은 라인에 금액 3값이 채워졌다(사용자는 단가를 건드리지 않았다).
        SlipSnapshot.Line filled = new SlipSnapshot.Line(productId, "품목", "모델", "규격", 1,
                new BigDecimal("100000"), new BigDecimal("100000.00"), null,
                new BigDecimal("110000.00"), new BigDecimal("10000.00"), new BigDecimal("100000.00"));

        JsonNode fieldChanges = fieldChangesFor(List.of(legacy), List.of(filled));

        // RED(수정 전): {beforeValue:"100000", afterValue:"110000"} — 하지 않은 단가 변경.
        assertThat(findChange(fieldChanges, "lines[0].unitPrice")).isNull();
        assertThat(findChange(fieldChanges, "lines[0].lineTotal")).isNull();
    }

    /**
     * 재수렴 7차(#937) R7-1 부수 — 같은 패널의 "변경 요약" 1줄과 "변경 목록"이 같은 판정을 한다.
     *
     * <p>{@code SlipVersionHistoryPanel.formatChangeSummary} 는 {@code changeSummary} 가 전부 0 이면
     * "변경 없음" 을 쓰고, 바로 아래에 {@code fieldChanges} 를 나열한다. 합계를 표시 도메인으로
     * 바꾸면 부가세만 편집한 라인이 <b>목록에는</b> 뜨는데 {@code summarize} 의 {@code lineDiffers}
     * 는 저장 컬럼만 비교해 {@code lineModified=0} 이라, 한 카드가 "변경 없음"이라고 쓰고 그 아래에
     * 변경 1건을 나열하는 자기모순이 생긴다. 두 지점이 같은 표시 판정을 쓰게 한다.
     */
    @Test
    @DisplayName("재수렴 7차 R7-1 부수: 부가세만 편집한 라인은 변경 요약과 변경 목록이 같은 판정을 한다")
    void versionSummaryAgreesWithFieldChangesOnDisplayedAmounts() {
        UUID productId = UUID.randomUUID();
        SlipSnapshot.Line before = domainLine(productId, 2, "100000", "100000",
                "200000", "20000", "VAT_INCLUSIVE");
        // 부가세만 20,000 → 25,000 (공급가액·수량·단가 무편집 — 2026-07-25 결정 P6 경로)
        SlipSnapshot.Line after = domainLine(productId, 2, "100000", "100000",
                "200000", "25000", "VAT_INCLUSIVE");

        JsonNode fieldChanges = fieldChangesFor(List.of(before), List.of(after));
        ChangeSummary summary = service.summarize(
                snapshot("memo", List.of(before)), snapshot("memo", List.of(after)));

        // RED(수정 전): 저장 lineTotal(=공급가액) 이 그대로라 목록에도 안 뜬다.
        JsonNode lineTotal = findChange(fieldChanges, "lines[0].lineTotal");
        assertThat(lineTotal).isNotNull();
        assertThat(lineTotal.get("beforeValue").asText()).isEqualTo("220000");
        assertThat(lineTotal.get("afterValue").asText()).isEqualTo("225000");
        // RED(수정 전): lineModified=0 — 패널이 "변경 없음"이라 쓰고 그 아래에 변경을 나열한다.
        assertThat(summary.lineModified()).isEqualTo(1);
    }

    /** 금액 5값 + 단가 도메인을 가진 스냅샷 라인 (재수렴 6차 #937). */
    private SlipSnapshot.Line domainLine(UUID productId, int quantity, String unitPrice,
                                         String unitPriceWithVat, String supplyAmount,
                                         String vatAmount, String unitPriceDomain) {
        return new SlipSnapshot.Line(productId, "품목", "모델", "규격", quantity,
                new BigDecimal(unitPrice), new BigDecimal(supplyAmount), null,
                new BigDecimal(unitPriceWithVat), new BigDecimal(vatAmount),
                new BigDecimal(supplyAmount), null, null, unitPriceDomain);
    }

    private JsonNode fieldChangesFor(List<SlipSnapshot.Line> prevLines,
                                     List<SlipSnapshot.Line> curLines) {
        UUID slipId = UUID.randomUUID();
        SlipRevision rev1 = SlipRevision.of(slipId, 1, SlipRevisionType.CREATE, null,
                "2026/05/29-3", LocalDate.of(2026, 5, 29),
                snapshot("memo", prevLines), UUID.randomUUID(), "작성자", null);
        SlipRevision rev2 = SlipRevision.of(slipId, 2, SlipRevisionType.EDIT, null,
                "2026/05/29-3", LocalDate.of(2026, 5, 29),
                snapshot("memo", curLines), UUID.randomUUID(), "김영업", null);
        when(repository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        return mapper.valueToTree(service.listWithSummary(slipId).get(0)).get("fieldChanges");
    }

    private JsonNode findChange(JsonNode changes, String fieldPath) {
        for (JsonNode change : changes) {
            if (fieldPath.equals(change.get("fieldPath").asText())) {
                return change;
            }
        }
        return null;
    }
}
