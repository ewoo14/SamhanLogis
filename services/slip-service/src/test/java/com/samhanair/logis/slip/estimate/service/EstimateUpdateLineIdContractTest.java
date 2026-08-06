package com.samhanair.logis.slip.estimate.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import com.samhanair.logis.slip.estimate.repository.EstimateLineRepository;
import com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService;
import com.samhanair.logis.slip.estimate.web.dto.UpdateEstimateRequest;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * [D-R8-9] 견적 수정의 lineId 계약 마커 게이트 — 전표 미러
 * ({@code SlipUpdateLineIdContractTest}) 의 견적측.
 *
 * <p><b>왜 견적을 따로 잠그나</b>: 이 PR 은 전표/견적 <b>비대칭</b>을 8라운드째 반복 적발했고,
 * 종전 견적 미러는 실제로 {@code requestedLines.isEmpty()} 면 게이트를 면제해 전표와 이미
 * 어긋나 있었다. 판정을 공용 {@code LineIdContractGate} 로 좁혔으므로 판정 자체는 드리프트할 수
 * 없지만, <b>게이트를 어디서 부르는지</b>는 서비스마다 다르므로 여기서 별도로 고정한다.
 *
 * <p>🔴 <b>견적 고유의 함정</b>: {@code EstimateService.update} 는 {@code validateLineIds} 보다
 * <b>먼저</b> {@code editHeader} 로 헤더를 바꾸고, {@code lines == null} 이면 라인 검증을 아예
 * 호출하지 않는다. 게이트를 라인 검증 안에 두면 (a) 구 클라이언트의 헤더 변경이 이미 적용된 뒤
 * 거부되거나 (b) 헤더 전용 수정이 게이트를 통째로 우회한다. 아래 두 테스트가 그 둘을 막는다.
 */
class EstimateUpdateLineIdContractTest {

    private static final UUID PARTNER_ID = UUID.randomUUID();
    private static final UUID NEW_PARTNER_ID = UUID.randomUUID();
    private static final UUID PRODUCT_ID = UUID.randomUUID();
    private static final UUID COMPONENT_PRODUCT = UUID.randomUUID();
    private static final UUID SECOND_COMPONENT = UUID.randomUUID();
    private static final String SET_MODEL = "SET-809";

    private final EstimateRepository estimateRepository = mock(EstimateRepository.class);
    private final EstimateLineRepository estimateLineRepository = mock(EstimateLineRepository.class);
    private final EstimateNumberService estimateNumberService = mock(EstimateNumberService.class);
    private final ProductClient productClient = mock(ProductClient.class);
    private final EstimateToSlipConverter slipConverter = mock(EstimateToSlipConverter.class);
    private final EstimateRevisionService estimateRevisionService =
            mock(EstimateRevisionService.class);
    private final CollectionRealtimePublisher collectionRealtimePublisher =
            mock(CollectionRealtimePublisher.class);
    private final PartnerProductPriceMemoryService priceMemoryService =
            mock(PartnerProductPriceMemoryService.class);

    private final EstimateService service = new EstimateService(
            estimateRepository, estimateLineRepository, estimateNumberService, productClient,
            slipConverter, estimateRevisionService, collectionRealtimePublisher,
            priceMemoryService);

    @Test
    void update_withoutContractMarker_isRejectedAsBadRequest() {
        Estimate estimate = persistedEstimate();
        when(estimateRepository.findById(estimate.getId())).thenReturn(Optional.of(estimate));

        assertThatThrownBy(() -> service.update(estimate.getId(),
                staleClientRequest(), "user-old", "구 클라이언트"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    // 전표 미러와 <b>같은</b> 사유 문구여야 한다 — 드리프트 가드.
                    assertThat(ex.getMessage()).contains("구버전", "앱을 업데이트");
                });
    }

    /**
     * 🔴 거부는 <b>헤더 갱신보다 먼저</b>여야 한다 — 부분 적용 금지.
     *
     * <p>게이트가 {@code validateLineIds} 안에 있으면 이 시점에 이미 {@code editHeader} 가 돌아
     * 거래처가 바뀐 채로 400 이 난다. 트랜잭션 롤백이 대개 지워주겠지만, "거부된 요청이 상태를
     * 건드렸다"는 사실 자체가 계약 위반이며 롤백에 의존하는 방어는 방어가 아니다.
     */
    @Test
    void update_rejection_happensBeforeHeaderMutationAndAnySideEffect() {
        Estimate estimate = persistedEstimate();
        when(estimateRepository.findById(estimate.getId())).thenReturn(Optional.of(estimate));

        assertThatThrownBy(() -> service.update(estimate.getId(),
                staleClientRequest(), "user-old", "구 클라이언트"))
                .isInstanceOf(BusinessException.class);

        // 헤더가 원 거래처 그대로여야 한다 — 바뀌었다면 거부가 늦은 것이다.
        assertThat(estimate.getPartnerId()).isEqualTo(PARTNER_ID);
        assertThat(estimate.getPartnerName()).isEqualTo("원 거래처");
        assertThat(estimate.getLines()).isEmpty();
        verify(priceMemoryService, never()).rememberBatchAfterCommit(any(), any());
        verifyNoInteractions(estimateRevisionService, productClient);
    }

    /**
     * 🔴 <b>헤더 전용 수정</b>({@code lines == null}) 도 마커를 요구한다 — 게이트 우회 금지.
     *
     * <p>구 클라이언트는 {@code partnerId} 도 보내지 않으므로, 헤더만 바꾸는 저장이 통과하면
     * 거래처가 어긋난 채 가격기억이 원 거래처에 각인되는 R8-QA-3 경로가 그대로 열린다.
     * 라인을 건드리지 않는다고 안전한 요청이 아니다.
     */
    @Test
    void update_headerOnly_withoutContractMarker_isAlsoRejected() {
        Estimate estimate = persistedEstimate();
        when(estimateRepository.findById(estimate.getId())).thenReturn(Optional.of(estimate));

        UpdateEstimateRequest headerOnly = new UpdateEstimateRequest(
                NEW_PARTNER_ID, "구 클라이언트가 바꾼 거래처", null, null, null, "헤더만 수정",
                null, null);

        assertThatThrownBy(() -> service.update(estimate.getId(), headerOnly,
                "user-old", "구 클라이언트"))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));

        assertThat(estimate.getPartnerId()).isEqualTo(PARTNER_ID);
        assertThat(estimate.getPartnerName()).isEqualTo("원 거래처");
    }

    @Test
    void update_withExplicitlyFalseMarker_isRejected() {
        Estimate estimate = persistedEstimate();
        when(estimateRepository.findById(estimate.getId())).thenReturn(Optional.of(estimate));

        assertThatThrownBy(() -> service.update(estimate.getId(),
                request(false), "user-old", "계약 거부 클라이언트"))
                .isInstanceOf(BusinessException.class);

        assertThat(estimate.getPartnerName()).isEqualTo("원 거래처");
    }

    /**
     * 🔴 <b>D-R8-13 견적 미러 — 마커가 계보 파괴를 우회하지 못한다</b>: 계보 보유 견적에서 lineId 를
     * 한 개도 싣지 않은 전 라인 교체는 마커가 있어도 거부한다. 전표 미러
     * ({@code SlipUpdateLineIdContractTest.salesPut_onBundleSlip_withMarker_butNoLineIdAtAll_isRejected})
     * 와 <b>같은</b> 계약이어야 한다 — 전표/견적 비대칭은 이 PR 의 8라운드 재발 패턴이다.
     *
     * <p>거부는 {@code editHeader} 이후·<b>기존 라인 제거 이전</b>에 일어난다. 헤더는 인메모리로
     * 이미 바뀌지만 트랜잭션 롤백이 지운다(실 롤백은 IT 가 담당). 이 단위 테스트가 잠그는 것은
     * <b>라인 제거·라인 검증(productClient)·가격기억·버전 캡처가 한 건도 발생하지 않는다</b>는 것,
     * 그리고 원 세트 계보가 전량 살아있다는 것이다.
     */
    @Test
    void update_onBundleEstimate_withMarker_butNoLineIdAtAll_isRejected() {
        Estimate estimate = bundleEstimate();
        when(estimateRepository.findById(estimate.getId())).thenReturn(Optional.of(estimate));

        // 마커는 싣되 lineId 는 하나도 싣지 않은 전 라인 교체 (R8-QA-13 견적 재현).
        UpdateEstimateRequest allNew = new UpdateEstimateRequest(
                PARTNER_ID, "세트 견적 거래처", null, null, null, "전 라인 교체",
                List.of(new UpdateEstimateRequest.EstimateLineUpdate(
                        PRODUCT_ID, "교체 단품", "PLAIN-809", null, 1,
                        new BigDecimal("150000"), null, null, false, null)),
                true);

        assertThatThrownBy(() -> service.update(estimate.getId(), allNew, "user-set", "전 라인 교체자"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    // require 의 "앱 업데이트" 와 다른 조치 — 화면 새로고침을 안내한다.
                    assertThat(ex.getMessage()).contains("세트 구성품", "새로고침");
                });

        // 원 세트 계보가 전량 살아있어야 한다 — 거부가 라인 제거보다 앞섰다는 실증.
        assertThat(estimate.getLines()).hasSize(2);
        assertThat(estimate.getLines()).allMatch(line -> SET_MODEL.equals(line.getParentSetModel()));
        verify(priceMemoryService, never()).rememberBatchAfterCommit(any(), any());
        verifyNoInteractions(estimateRevisionService, productClient);
    }

    /** 🔴 부분 파괴 — 구성품 2개 중 1개를 익명 라인으로 재생성하면 400 이다. */
    @Test
    void update_onBundleEstimate_withOneComponentRecreatedWithoutLineId_isRejected() {
        Estimate estimate = bundleEstimate();
        when(estimateRepository.findById(estimate.getId())).thenReturn(Optional.of(estimate));

        UUID keptLineId = estimate.getLines().get(0).getId();
        UpdateEstimateRequest partialDestruction = new UpdateEstimateRequest(
                PARTNER_ID, "세트 견적 거래처", null, null, null, "부분 파괴",
                List.of(
                        new UpdateEstimateRequest.EstimateLineUpdate(
                                COMPONENT_PRODUCT, "실내기", "COMP-1", null, 1,
                                new BigDecimal("330000"), null, null, false, keptLineId),
                        new UpdateEstimateRequest.EstimateLineUpdate(
                                PRODUCT_ID, "익명 재생성", "NEW-1", null, 1,
                                new BigDecimal("120000"), null, null, false, null)),
                true);

        assertThatThrownBy(() -> service.update(
                estimate.getId(), partialDestruction, "user-set", "부분 파괴자"))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));

        assertThat(estimate.getLines()).hasSize(2);
        assertThat(estimate.getLines()).allMatch(line -> SET_MODEL.equals(line.getParentSetModel()));
        verifyNoInteractions(productClient);
    }

    /**
     * 🔴 오탐 방지 — 구성품을 요청에서 아예 빼고 익명 라인을 싣지 않으면 명시 삭제다.
     */
    @Test
    void update_onBundleEstimate_withOneComponentOmitted_isAcceptedAsExplicitDeletion() {
        Estimate estimate = bundleEstimate();
        when(estimateRepository.findById(estimate.getId())).thenReturn(Optional.of(estimate));
        when(productClient.lookup(any())).thenAnswer(inv -> java.util.List.of());

        UUID keptLineId = estimate.getLines().get(0).getId();
        UpdateEstimateRequest partial = new UpdateEstimateRequest(
                PARTNER_ID, "세트 견적 거래처", null, null, null, "부분 편집",
                List.of(new UpdateEstimateRequest.EstimateLineUpdate(
                        COMPONENT_PRODUCT, "실내기", "COMP-1", null, 1,
                        new BigDecimal("330000"), null, null, false, keptLineId)),
                true);

        assertThatCode(() -> service.update(estimate.getId(), partial, "user-set", "부분 편집자"))
                .doesNotThrowAnyException();

        assertThat(estimate.getLines()).singleElement().satisfies(line -> {
            assertThat(line.getProductId()).isEqualTo(COMPONENT_PRODUCT);
            assertThat(line.getParentSetModel()).isEqualTo(SET_MODEL);
        });
        verify(priceMemoryService).rememberBatchAfterCommit(any(), any());
    }

    /** 🔴 R9 오탐 오라클 — {@code lines: []} 는 계보 견적의 명시 전체삭제이므로 허용한다. */
    @Test
    void update_onBundleEstimate_withEmptyLines_isAcceptedAsExplicitFullDeletion() {
        Estimate estimate = bundleEstimate();
        when(estimateRepository.findById(estimate.getId())).thenReturn(Optional.of(estimate));
        when(productClient.lookup(List.of())).thenReturn(List.of());

        UpdateEstimateRequest deleteAll = new UpdateEstimateRequest(
                PARTNER_ID, "세트 견적 거래처", null, null, null, "전체 삭제",
                List.of(), true);

        assertThatCode(() -> service.update(
                estimate.getId(), deleteAll, "user-set", "전체 삭제자"))
                .doesNotThrowAnyException();

        assertThat(estimate.getLines()).isEmpty();
        verify(priceMemoryService).rememberBatchAfterCommit(any(), any());
        verifyNoInteractions(productClient);
    }

    // ---------------------------------------------------------------- 픽스처

    /**
     * 세트 계보(SET-809) 를 보유한 견적 — head(COMP-1) + 구성품(COMP-2) 2행. lineId 대조 게이트가
     * 계보를 인식하려면 영속 id 가 있어야 하므로 auditing 이 채우는 id 를 반영으로 심는다.
     */
    private Estimate bundleEstimate() {
        Estimate estimate = Estimate.create("2026/07/16-2", LocalDate.of(2026, 7, 16), 2,
                PARTNER_ID, "세트 견적 거래처", null, null, null, null, "user-1");
        ReflectionTestUtils.setField(estimate, "id", UUID.randomUUID());
        addBundleLine(estimate, 1, COMPONENT_PRODUCT, "실내기", "COMP-1",
                new BigDecimal("330000"), true);
        addBundleLine(estimate, 2, SECOND_COMPONENT, "실외기", "COMP-2",
                new BigDecimal("220000"), false);
        return estimate;
    }

    private void addBundleLine(Estimate estimate, int lineNo, UUID productId, String name,
                               String model, BigDecimal unitPrice, boolean setHead) {
        EstimateLine line = EstimateLine.create(estimate, lineNo, productId, name, model,
                null, 1, unitPrice, "구성품");
        line.assignBundleComponent(SET_MODEL, setHead);
        ReflectionTestUtils.setField(line, "id", UUID.randomUUID());
        estimate.addLine(line);
    }

    private Estimate persistedEstimate() {
        Estimate estimate = Estimate.create("2026/07/16-1", LocalDate.of(2026, 7, 16), 1,
                PARTNER_ID, "원 거래처", null, null, null, null, "user-1");
        ReflectionTestUtils.setField(estimate, "id", UUID.randomUUID());
        return estimate;
    }

    /** 구 클라이언트 재현 — 마커 필드를 모르므로 보내지 않는다(= null). */
    private UpdateEstimateRequest staleClientRequest() {
        return request(null);
    }

    private UpdateEstimateRequest request(Boolean lineIdContract) {
        return new UpdateEstimateRequest(
                NEW_PARTNER_ID, "구 클라이언트가 바꾼 거래처", null, null, null, "수정 메모",
                List.of(new UpdateEstimateRequest.EstimateLineUpdate(
                        PRODUCT_ID, "실내기", "COMP-1", null, 1,
                        new BigDecimal("330000"), null, null, null, null)),
                lineIdContract);
    }
}
