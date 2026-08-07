package com.samhanair.logis.slip.estimate.revision.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevision;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevisionType;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateSnapshot;
import com.samhanair.logis.slip.estimate.revision.repository.EstimateRevisionRepository;
import com.samhanair.logis.slip.estimate.revision.web.dto.EstimateRevisionResponse;
import com.samhanair.logis.slip.estimate.revision.web.dto.EstimateRevisionResponse.ChangeSummary;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link EstimateRevisionService} 스냅샷 캡처 단위 테스트 (권한 재편 Phase 2.2 Task 2).
 *
 * <p>{@code maxRevisionNo+1} 채번 정합 (1 → 2), {@link Estimate#toSnapshot()} 매핑된 스냅샷의
 * 라인 수 / partnerName / lineTotal 정합, 채번 race(saveAndFlush DataIntegrityViolation 1회 →
 * 재시도 성공 / 2회 → CONFLICT)를 Mockito mock repository 로 검증한다.
 *
 * <p>{@code SlipRevisionServiceTest} 의 capture 케이스 미러.
 */
@ExtendWith(MockitoExtension.class)
class EstimateRevisionServiceTest {

    @Mock
    private EstimateRevisionRepository repository;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @InjectMocks
    private EstimateRevisionService service;

    /**
     * id 가 @GeneratedValue 라 영속화 전엔 null 이므로, 단위 테스트에서는 reflection 으로 주입한다.
     */
    private static void injectId(Estimate estimate, UUID id) throws Exception {
        Field f = Estimate.class.getDeclaredField("id");
        f.setAccessible(true);
        f.set(estimate, id);
    }

    private Estimate sampleEstimate(UUID estimateId) throws Exception {
        Estimate estimate = Estimate.create("2026/05/29-3", LocalDate.of(2026, 5, 29), 3,
                UUID.randomUUID(), "삼한물산", "123-45-67890", "서울시 주소",
                LocalDate.of(2026, 6, 29), "비고", "user-1");
        injectId(estimate, estimateId);
        // 라인1: 15000 × 2 = 30000 공급 + VAT 3000 = lineTotal 33000.00
        estimate.addLine(EstimateLine.create(estimate, 1, UUID.randomUUID(),
                "펌프", "MX-100", "220V", 2, new BigDecimal("15000.00"), "라인메모"));
        // 라인2: 3000 × 5 = 15000 공급 + VAT 1500 = lineTotal 16500.00
        estimate.addLine(EstimateLine.create(estimate, 2, UUID.randomUUID(),
                "밸브", null, null, 5, new BigDecimal("3000.00"), null));
        return estimate;
    }

    @Test
    @DisplayName("capture 2회 호출 시 revisionNo 가 1 → 2 로 채번되고 스냅샷이 헤더/라인과 정합한다")
    void captureAssignsSequentialRevisionNos() throws Exception {
        UUID estimateId = UUID.randomUUID();
        Estimate estimate = sampleEstimate(estimateId);
        UUID actorId = UUID.randomUUID();

        // 1회차: 기존 스냅샷 없음 (maxRevisionNo == null → next = 1)
        when(repository.maxRevisionNo(estimateId)).thenReturn(null);
        when(repository.saveAndFlush(any(EstimateRevision.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        EstimateRevision first = service.capture(estimate, EstimateRevisionType.CREATE, null,
                actorId, "홍길동", null);

        assertThat(first.getRevisionNo()).isEqualTo(1);
        assertThat(first.getRevisionType()).isEqualTo(EstimateRevisionType.CREATE);
        assertThat(first.getEstimateId()).isEqualTo(estimateId);
        assertThat(first.getEstimateNo()).isEqualTo("2026/05/29-3");
        assertThat(first.getEstimateDate()).isEqualTo(LocalDate.of(2026, 5, 29));
        assertThat(first.getActorId()).isEqualTo(actorId);
        assertThat(first.getActorName()).isEqualTo("홍길동");
        assertThat(first.getSnapshot().lines()).hasSize(2);
        assertThat(first.getSnapshot().partnerName()).isEqualTo("삼한물산");
        assertThat(first.getSnapshot().lines().get(0).supplyAmount())
                .isEqualByComparingTo("30000.00");
        assertThat(first.getSnapshot().lines().get(0).lineTotal())
                .isEqualByComparingTo("33000.00");
        assertThat(first.getSnapshot().lines().get(1).lineTotal())
                .isEqualByComparingTo("16500.00");

        // 2회차: 직전 revision 1 존재 (maxRevisionNo == 1 → next = 2)
        when(repository.maxRevisionNo(estimateId)).thenReturn(1);

        EstimateRevision second = service.capture(estimate, EstimateRevisionType.EDIT, null,
                actorId, "홍길동", null);

        assertThat(second.getRevisionNo()).isEqualTo(2);
        assertThat(second.getRevisionType()).isEqualTo(EstimateRevisionType.EDIT);
    }

    @Test
    @DisplayName("capture: saveAndFlush 1회차 DataIntegrityViolationException → 1회 재채번 재시도 후 "
            + "정상 반환 (saveAndFlush 2회 + maxRevisionNo 재조회 2회)")
    void captureRetriesOnceWhenFirstSaveConflicts() throws Exception {
        UUID estimateId = UUID.randomUUID();
        Estimate estimate = sampleEstimate(estimateId);
        UUID actorId = UUID.randomUUID();

        // maxRevisionNo: 1회차 채번 시 1(→next=2), 재시도 채번 시 갱신된 2(→next=3)
        when(repository.maxRevisionNo(estimateId)).thenReturn(1, 2);
        // saveAndFlush: 1회차 unique 위반, 2회차 정상 반환
        when(repository.saveAndFlush(any(EstimateRevision.class)))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException(
                        "estimate_revisions unique 위반 (race)"))
                .thenAnswer(inv -> inv.getArgument(0));

        EstimateRevision result = service.capture(estimate, EstimateRevisionType.EDIT, null,
                actorId, "홍길동", null);

        // 예외 없이 재채번된 revisionNo(=3) 로 반환
        assertThat(result).isNotNull();
        assertThat(result.getRevisionNo()).isEqualTo(3);
        assertThat(result.getRevisionType()).isEqualTo(EstimateRevisionType.EDIT);
        // saveAndFlush 2회 호출 (1회차 실패 + 재시도) + maxRevisionNo 2회 재조회
        verify(repository, times(2)).saveAndFlush(any(EstimateRevision.class));
        verify(repository, times(2)).maxRevisionNo(estimateId);
    }

    @Test
    @DisplayName("capture: saveAndFlush 가 2회 모두 DataIntegrityViolationException → "
            + "BusinessException(CONFLICT) 로 변환한다")
    void captureThrowsConflictWhenRetryAlsoConflicts() throws Exception {
        UUID estimateId = UUID.randomUUID();
        Estimate estimate = sampleEstimate(estimateId);

        when(repository.maxRevisionNo(estimateId)).thenReturn(1, 2);
        // saveAndFlush: 1회차·2회차 모두 unique 위반
        when(repository.saveAndFlush(any(EstimateRevision.class)))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException(
                        "estimate_revisions unique 위반 (race)"));

        assertThatThrownBy(() -> service.capture(estimate, EstimateRevisionType.EDIT, null,
                UUID.randomUUID(), "홍길동", null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.CONFLICT);

        // 2회 모두 시도 후 포기
        verify(repository, times(2)).saveAndFlush(any(EstimateRevision.class));
    }

    // ---------------------------------------------------------------------
    // Task 4: changeSummary 계산 단위 테스트 (SlipRevisionServiceTest 미러)
    // ---------------------------------------------------------------------

    /**
     * 라인 1건 스냅샷을 만든다 (productId 매칭 키 보존). 금액 필드는 단가×수량 기반 단순 산정.
     */
    private EstimateSnapshot.Line line(UUID productId, int quantity, String unitPrice) {
        BigDecimal price = new BigDecimal(unitPrice);
        BigDecimal supply = price.multiply(BigDecimal.valueOf(quantity));
        BigDecimal vat = supply.multiply(new BigDecimal("0.1"));
        return new EstimateSnapshot.Line(productId, "품목", "모델", "규격",
                quantity, price, supply, vat, supply.add(vat), null);
    }

    // 스냅샷 헤더의 partnerId 를 고정해 memo 외 헤더가 우연히 달라지지 않게 한다.
    private static final UUID FIXED_PARTNER_ID = UUID.randomUUID();

    /**
     * 헤더 + 라인 리스트를 가진 스냅샷을 만든다 (UUID 헤더는 고정값 — memo 만 가변).
     */
    private EstimateSnapshot snapshot(String memo, List<EstimateSnapshot.Line> lines) {
        return new EstimateSnapshot("2026/05/29-3", LocalDate.of(2026, 5, 29),
                FIXED_PARTNER_ID, "삼한물산", "123-45-67890", "서울시 주소",
                LocalDate.of(2026, 6, 29), memo, lines);
    }

    @Test
    @DisplayName("summarize: prev==null (최초 revision) 이면 headerChanged=0, lineAdded=현 라인 수, 나머지 0")
    void summarizeFirstRevisionCountsAllLinesAsAdded() {
        EstimateSnapshot cur = snapshot("memo", List.of(
                line(UUID.randomUUID(), 1, "1000"),
                line(UUID.randomUUID(), 2, "2000")));

        ChangeSummary summary = service.summarize(null, cur);

        assertThat(summary.headerChanged()).isZero();
        assertThat(summary.lineAdded()).isEqualTo(2);
        assertThat(summary.lineRemoved()).isZero();
        assertThat(summary.lineModified()).isZero();
    }

    @Test
    @DisplayName("summarize: 헤더 1필드 변경 + 라인 add1/remove1/modify1 → ChangeSummary 정합")
    void summarizeCountsHeaderAndLineDeltas() {
        UUID keep = UUID.randomUUID();      // 양쪽 존재 — modify 대상
        UUID removed = UUID.randomUUID();   // prev 에만 — removed
        UUID added = UUID.randomUUID();     // cur 에만 — added

        // prev: keep(qty1) + removed, memo "원본"
        EstimateSnapshot prev = snapshot("원본", List.of(
                line(keep, 1, "1000"),
                line(removed, 5, "500")));
        // cur: keep(qty3 — 수정) + added, memo "변경" (헤더 1필드 변경)
        EstimateSnapshot cur = snapshot("변경", List.of(
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
        EstimateSnapshot prev = snapshot("memo", List.of(line(p, 2, "1500")));
        EstimateSnapshot cur = snapshot("memo", List.of(line(p, 2, "1500")));

        ChangeSummary summary = service.summarize(prev, cur);

        assertThat(summary.headerChanged()).isZero();
        assertThat(summary.lineAdded()).isZero();
        assertThat(summary.lineRemoved()).isZero();
        assertThat(summary.lineModified()).isZero();
    }

    @Test
    @DisplayName("S20: 규격은 같고 provenance만 달라져도 라인 변경으로 집계한다")
    void summarizeCountsSpecificationSourceChange() {
        UUID productId = UUID.randomUUID();
        EstimateSnapshot.Line catalog = new EstimateSnapshot.Line(productId, "품목", "모델", "규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, "CATALOG");
        EstimateSnapshot.Line user = new EstimateSnapshot.Line(productId, "품목", "모델", "규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, "USER");

        ChangeSummary summary = service.summarize(snapshot("memo", List.of(catalog)),
                snapshot("memo", List.of(user)));

        assertThat(summary.lineModified()).isEqualTo(1);
    }

    @Test
    @DisplayName("S21 RED-A: legacy source null이 USER로 정규화되어도 동일 규격이면 라인 변경이 아니다")
    void summarizeIgnoresLegacyNullToUserNormalizationWhenSpecificationIsIdentical() {
        UUID productId = UUID.randomUUID();
        EstimateSnapshot.Line legacy = new EstimateSnapshot.Line(productId, "품목", "모델", "평문 규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, null);
        EstimateSnapshot.Line hydrated = new EstimateSnapshot.Line(productId, "품목", "모델", "평문 규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, "USER");

        ChangeSummary summary = service.summarize(snapshot("메모", List.of(legacy)),
                snapshot("변경 메모", List.of(hydrated)));

        assertThat(summary.headerChanged()).isEqualTo(1);
        assertThat(summary.lineModified()).isZero();
    }

    @Test
    @DisplayName("S24 RED-A: legacy marker가 표시값으로 정규화되어 CATALOG가 되어도 라인 변경이 아니다")
    void summarizeIgnoresLegacyMarkerToCatalogNormalizationWhenSpecificationIsCanonicalized() {
        UUID productId = UUID.randomUUID();
        String markerSpecification = "\u2060마커 규격";
        EstimateSnapshot.Line legacy = new EstimateSnapshot.Line(productId, "품목", "모델", markerSpecification,
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, null);
        EstimateSnapshot.Line hydrated = new EstimateSnapshot.Line(productId, "품목", "모델", "마커 규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, "CATALOG");

        ChangeSummary summary = service.summarize(snapshot("메모", List.of(legacy)),
                snapshot("변경 메모", List.of(hydrated)));

        assertThat(summary.headerChanged()).isEqualTo(1);
        assertThat(summary.lineModified()).isZero();
    }

    @Test
    @DisplayName("S24 RED-B: legacy marker가 USER로 정규화되면 표시값이 같아도 라인 변경이다")
    void summarizeCountsLegacyMarkerToUserSourceChange() {
        UUID productId = UUID.randomUUID();
        EstimateSnapshot.Line legacy = new EstimateSnapshot.Line(productId, "품목", "모델", "\u2060마커 규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, null);
        EstimateSnapshot.Line hydrated = new EstimateSnapshot.Line(productId, "품목", "모델", "마커 규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, "USER");

        ChangeSummary summary = service.summarize(snapshot("메모", List.of(legacy)),
                snapshot("메모", List.of(hydrated)));

        assertThat(summary.lineModified()).isEqualTo(1);
    }

    @Test
    @DisplayName("S24 RED-C: legacy 평문이 CATALOG로 정규화되면 표시값이 같아도 라인 변경이다")
    void summarizeCountsLegacyPlainTextToCatalogSourceChange() {
        UUID productId = UUID.randomUUID();
        EstimateSnapshot.Line legacy = new EstimateSnapshot.Line(productId, "품목", "모델", "평문 규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, null);
        EstimateSnapshot.Line hydrated = new EstimateSnapshot.Line(productId, "품목", "모델", "평문 규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, "CATALOG");

        ChangeSummary summary = service.summarize(snapshot("메모", List.of(legacy)),
                snapshot("메모", List.of(hydrated)));

        assertThat(summary.lineModified()).isEqualTo(1);
    }

    @Test
    @DisplayName("S24 RED-D: 명시 source에서 null로 복원되면 라인 변경이다")
    void summarizeCountsExplicitSourceToNullChange() {
        UUID productId = UUID.randomUUID();
        EstimateSnapshot.Line catalog = new EstimateSnapshot.Line(productId, "품목", "모델", "규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, "CATALOG");
        EstimateSnapshot.Line missingSource = new EstimateSnapshot.Line(productId, "품목", "모델", "규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, null);

        ChangeSummary summary = service.summarize(snapshot("메모", List.of(catalog)),
                snapshot("메모", List.of(missingSource)));

        assertThat(summary.lineModified()).isEqualTo(1);
    }

    @Test
    @DisplayName("S21 RED-B: 명시된 CATALOG와 USER 전환은 동일 규격이어도 라인 변경이다")
    void summarizeCountsExplicitSpecificationSourceChange() {
        UUID productId = UUID.randomUUID();
        EstimateSnapshot.Line catalog = new EstimateSnapshot.Line(productId, "품목", "모델", "규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, "CATALOG");
        EstimateSnapshot.Line user = new EstimateSnapshot.Line(productId, "품목", "모델", "규격",
                2, new BigDecimal("1500"), new BigDecimal("3000"), new BigDecimal("300"),
                new BigDecimal("3300"), null, null, null, null, "USER");

        ChangeSummary summary = service.summarize(snapshot("메모", List.of(catalog)),
                snapshot("메모", List.of(user)));

        assertThat(summary.lineModified()).isEqualTo(1);
    }

    @Test
    @DisplayName("listWithSummary: 최신 우선 정렬 + 각 항목이 직전 revisionNo 대비 changeSummary 를 가지며 "
            + "actorId 는 노출하지 않는다")
    void listWithSummaryBuildsAdjacentSummariesNewestFirst() {
        UUID estimateId = UUID.randomUUID();
        UUID p1 = UUID.randomUUID();

        // rev1 (최초): 라인 1건
        EstimateRevision rev1 = EstimateRevision.of(estimateId, 1, EstimateRevisionType.CREATE, null,
                "2026/05/29-3", LocalDate.of(2026, 5, 29),
                snapshot("원본", List.of(line(p1, 1, "1000"))),
                UUID.randomUUID(), "홍길동", null);
        // rev2: 동일 라인 수정 (qty 1→4) — modify 1
        EstimateRevision rev2 = EstimateRevision.of(estimateId, 2, EstimateRevisionType.EDIT, null,
                "2026/05/29-3", LocalDate.of(2026, 5, 29),
                snapshot("원본", List.of(line(p1, 4, "1000"))),
                UUID.randomUUID(), "관리자", null);

        // list 는 내림차순(rev2, rev1) 반환
        when(repository.findByEstimateIdOrderByRevisionNoDesc(estimateId))
                .thenReturn(List.of(rev2, rev1));

        List<EstimateRevisionResponse> result = service.listWithSummary(estimateId);

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
        assertThat(java.util.Arrays.stream(EstimateRevisionResponse.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName))
                .doesNotContain("actorId");
    }
}
