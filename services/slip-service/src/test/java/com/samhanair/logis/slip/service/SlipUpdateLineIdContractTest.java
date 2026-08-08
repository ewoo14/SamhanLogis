package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import com.samhanair.logis.slip.web.dto.SlipUpdateRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * [D-R8-6 · D-R8-9] 전표 PUT 의 lineId 계약 마커 게이트 — 매입/매출 미러 문서 층 계약 테스트.
 *
 * <p><b>왜 이 클래스가 필요한가 (R8-QA-8)</b>: 종전에는 이 시나리오를 검증하는 테스트가 <b>0건</b>
 * 이었고, {@code BundleLineageResolverTest} 가 오히려 "lineId 없으면 계보 소실" 을 바람직한 계약으로
 * 단언해 BE 스위트를 green 으로 유지했다. 그 사이 R8-QA-1 이 라이브에서 실증한 것 —
 * 세트 전표를 <b>아무것도 수정하지 않고</b> 왕복 PUT(lineId 없음) → <b>200</b> → 계보 전량 소실 +
 * 구성품 배분가가 LINE_SAVE 로 각인. 사용자는 성공 응답을 받고 데이터를 잃었다.
 *
 * <p><b>D-R8-9 — 판정 기준 이전</b>: D-R8-6 의 "계보 보유 문서인데 전 라인이 lineId 미전송" 기준은
 * <b>전 라인을 새 라인으로 교체하는 정상 저장</b>을 함께 막는 오탐이 있었다(그 요청도 lineId 0개).
 * 판정을 <b>요청 레벨 마커</b>로 옮겨 오탐을 제거하되, 파괴 경로는 그대로 막는다. 이 클래스가
 * 잠그는 것은 그 두 가지가 <b>동시에</b> 성립한다는 것이다:
 * <ul>
 *   <li>마커 없는 구 클라이언트 → 400 (파괴 차단 = D-R8-6 유지)</li>
 *   <li>마커 있는 신 클라이언트 → lineId 0개여도 200 (오탐 제거 = D-R8-9)</li>
 * </ul>
 *
 * <p>실 PostgreSQL 왕복 회귀는 {@code PartnerProductPriceMemoryIT} 가 담당한다. 이 클래스는 Docker
 * 미가용 환경에서도 항상 실행되도록 mock 경계로 <b>판정 로직</b>만 고정한다.
 */
class SlipUpdateLineIdContractTest {

    private static final UUID PARTNER_ID = UUID.randomUUID();
    private static final UUID COMPONENT_PRODUCT = UUID.randomUUID();
    private static final UUID PLAIN_PRODUCT = UUID.randomUUID();
    private static final UUID FRESH_PRODUCT = UUID.randomUUID();
    private static final String SET_MODEL = "SET-809";
    private static final LocalDateTime CREATED_AT = LocalDateTime.of(2026, 7, 16, 9, 0);

    private final SlipRepository slipRepository = mock(SlipRepository.class);
    private final SlipAuditLogService auditLogService = mock(SlipAuditLogService.class);
    private final SlipRevisionService revisionService = mock(SlipRevisionService.class);
    private final PartnerProductPriceMemoryService priceMemoryService =
            mock(PartnerProductPriceMemoryService.class);
    private final ProductClient productClient = mock(ProductClient.class);

    private final SlipUpdateService purchaseUpdateService = new SlipUpdateService(
            slipRepository, auditLogService, revisionService, priceMemoryService, productClient,
            mock(SlipClosedDateGuard.class));
    private final SalesSlipUpdateService salesUpdateService = new SalesSlipUpdateService(
            slipRepository, auditLogService, revisionService, priceMemoryService, productClient,
            mock(SlipClosedDateGuard.class));

    // ------------------------------------------- 마커 부재 = 구 클라이언트 → 400 (매출)

    @Test
    void salesPut_withoutContractMarker_isRejectedAsBadRequest() {
        Slip slip = bundleSalesSlip();
        stubLoad(slip);

        assertThatThrownBy(() -> salesUpdateService.update(
                slip.getId(), staleClientRequest(slip), UUID.randomUUID(), "구 클라이언트"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    // 사용자가 무엇이 왜 거부됐는지 + 무엇을 해야 하는지 알 수 있어야 한다.
                    assertThat(ex.getMessage()).contains("구버전", "앱을 업데이트");
                });
    }

    /** 거부는 <b>교체 이전</b>에 일어나야 한다 — 저장/기억이 한 건도 발생하면 안 된다. */
    @Test
    void salesPut_rejection_happensBeforeAnyPersistenceOrPriceMemory() {
        Slip slip = bundleSalesSlip();
        stubLoad(slip);

        assertThatThrownBy(() -> salesUpdateService.update(
                slip.getId(), staleClientRequest(slip), UUID.randomUUID(), "구 클라이언트"))
                .isInstanceOf(BusinessException.class);

        verify(slipRepository, never()).saveAndFlush(any());
        verify(priceMemoryService, never()).rememberBatchAfterCommit(any(), any());
        // 기존 계보가 살아있어야 한다 — 거부됐는데 라인이 교체됐다면 그게 곧 R8-QA-1 결함이다
        assertThat(slip.getLines()).hasSize(2);
        assertThat(slip.getLines()).allMatch(line -> SET_MODEL.equals(line.getParentSetModel()));
    }

    /**
     * 마커를 <b>명시적으로 false</b> 로 보낸 요청도 거부한다 — 통과 값은 {@code true} 하나뿐이다.
     *
     * <p>"부재 → null" 과 "false" 가 같은 결과로 수렴해야, Jackson 이 "필드 부재" 와 "명시적 null" 을
     * 구분하지 못하는 것이 무해해진다. 이 단언이 곧 <b>fail-closed 기본값</b>의 고정이다.
     */
    @Test
    void salesPut_withExplicitlyFalseMarker_isRejected() {
        Slip slip = bundleSalesSlip();
        stubLoad(slip);

        assertThatThrownBy(() -> salesUpdateService.update(
                slip.getId(), request(slip, roundTripLines(slip), false),
                UUID.randomUUID(), "계약 거부 클라이언트"))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));

        verify(slipRepository, never()).saveAndFlush(any());
    }

    /**
     * 🔴 게이트는 <b>문서 계보와 무관</b>하다 — 평면 전표의 마커 없는 PUT 도 거부한다 (D-R8-9).
     *
     * <p>종전(D-R8-6) 게이트는 계보 보유 문서로 한정돼 평면 전표에서는 구 클라이언트가 200 을 받았다.
     * 그 200 은 무해하지 않다: 구 클라이언트는 {@code partnerId}(D-R8-7 신규)도 보내지 않으므로
     * 거래처를 바꿔 저장하면 {@code partner_id} 가 불변인 채 가격기억이 <b>원 거래처</b>에 각인된다
     * (R8-QA-3 라이브 실증). 마커는 문서 상태가 아니라 <b>클라이언트 버전</b>을 판정하므로
     * 게이트도 문서 상태와 무관해야 한다.
     */
    @Test
    void salesPut_onPlainSlip_withoutContractMarker_isAlsoRejected() {
        Slip slip = plainSalesSlip();
        stubLoad(slip);

        assertThatThrownBy(() -> salesUpdateService.update(
                slip.getId(), staleClientRequest(slip), UUID.randomUUID(), "구 클라이언트"))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));

        verify(slipRepository, never()).saveAndFlush(any());
    }

    // ------------------------------------------- 마커 존재 = lineId 계약 활성 (매출)

    /**
     * 🔴 <b>D-R8-13 — 마커가 계보 파괴를 우회하지 못한다</b>: 계보 보유 전표에서 lineId 를 한 개도
     * 싣지 않은 전 라인 교체는 마커가 있어도 <b>거부</b>한다.
     *
     * <p><b>D-R8-9 로부터의 개정</b>: D-R8-9 는 이 케이스(전 라인 교체 · lineId 0개)를 "오탐 제거"
     * 명목으로 통째 허용했다. 그러나 R8-QA-13 이 라이브에서 실증한 것 — 그 허용은 <b>계보 보유
     * 문서</b>에서 마커라는 다른 문으로 R8-QA-1(세트 전표 무수정 왕복 → 계보 전량 소실)을
     * 재개방한다. 마커({@link LineIdContractGate#require})는 클라이언트 <i>자기신고</i>일 뿐이므로,
     * 계보 보유 문서에서 실제로 lineId 를 실었는지는
     * {@link LineIdContractGate#requireLineIdsForLineage} 가 <b>내용과 대조</b>해 별도 검증한다.
     *
     * <p>계보 <b>없는</b> 평면 문서의 전 라인 교체는 여전히 정상이다 —
     * {@link #salesPut_onPlainSlip_withMarker_withoutLineIds_remainsAccepted} 가 오탐 없음을 고정한다.
     */
    @Test
    void salesPut_onBundleSlip_withMarker_butNoLineIdAtAll_isRejected() {
        Slip slip = bundleSalesSlip();
        stubLoad(slip);

        // 전 라인 삭제 + 전부 신규 라인 — 마커는 싣되 lineId 는 하나도 싣지 않는다(R8-QA-13 재현).
        List<SlipUpdateRequest.LineRequest> allNew = List.of(
                new SlipUpdateRequest.LineRequest(FRESH_PRODUCT, "교체 품목 A", "NEW-1", null,
                        2, new BigDecimal("150000"), "전 라인 교체", null),
                new SlipUpdateRequest.LineRequest(PLAIN_PRODUCT, "교체 품목 B", "NEW-2", null,
                        1, new BigDecimal("90000"), "전 라인 교체", null));

        assertThatThrownBy(() -> salesUpdateService.update(
                slip.getId(), request(slip, allNew, true), UUID.randomUUID(), "전 라인 교체자"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    // require 의 "앱 업데이트" 와 다른 조치 — 화면 새로고침을 안내한다.
                    assertThat(ex.getMessage()).contains("세트 구성품", "새로고침");
                });

        // 거부는 교체 이전에 — 저장이 한 건도 발생하면 안 되고 원 세트 계보가 전량 살아있어야 한다
        // (R8-QA-1 이 마커라는 다른 문으로 재개방되지 않았음을 실증).
        verify(slipRepository, never()).saveAndFlush(any());
        assertThat(slip.getLines()).hasSize(2);
        assertThat(slip.getLines()).allMatch(line -> SET_MODEL.equals(line.getParentSetModel()));
    }

    /**
     * 🔴 <b>R8-QA-1 파괴 경로가 여전히 차단되는지</b> — 마커를 실은 신 클라이언트의 무수정 왕복
     * PUT 은 계보를 <b>보존</b>한다.
     *
     * <p>라이브에서 파괴가 일어난 이유는 왕복 PUT 이 lineId 를 싣지 않아 전 라인이 신규 라인으로
     * 재생성됐기 때문이다. 신 클라이언트는 Y.Doc 에서 lineId 를 직독해 되돌려 보내므로 계보가
     * 승계된다. 구 클라이언트는 마커가 없어 위 테스트들이 400 으로 막는다 — 두 경로 모두 닫힌다.
     */
    @Test
    void salesPut_withMarker_andRoundTrippedLineIds_preservesLineage() {
        Slip slip = bundleSalesSlip();
        stubLoad(slip);
        when(slipRepository.saveAndFlush(any(Slip.class))).thenAnswer(inv -> inv.getArgument(0));

        // 무수정 왕복 — 상세 응답 그대로를 되돌려 보낸다.
        salesUpdateService.update(slip.getId(), request(slip, roundTripLines(slip), true),
                UUID.randomUUID(), "무수정 저장자");

        assertThat(slip.getLines()).hasSize(2);
        assertThat(slip.getLines()).allSatisfy(line ->
                assertThat(line.getParentSetModel()).isEqualTo(SET_MODEL));
        // set_head 도 원래 그 행에 남아야 한다 — 탈취/증발 둘 다 결함이다.
        assertThat(slip.getLines()).filteredOn(SlipLine::isSetHead)
                .extracting(SlipLine::getProductId)
                .containsExactly(COMPONENT_PRODUCT);
    }

    /**
     * 🔴 핵심 뉘앙스 — 신규 라인의 {@code lineId == null} 은 <b>정상</b>이다.
     *
     * <p>세트 전표에 행을 추가하는 정상 편집이 막히면 안 된다. 마커가 있으므로 lineId 를 실은 행은
     * 계보를 승계하고, 싣지 않은 행은 신규 평면 라인으로 남는다 — 한 요청에 공존한다.
     */
    @Test
    void salesPut_withMarker_andNewLineAlongsideRoundTrippedLineIds_isAccepted() {
        Slip slip = bundleSalesSlip();
        stubLoad(slip);
        when(slipRepository.saveAndFlush(any(Slip.class))).thenAnswer(inv -> inv.getArgument(0));

        List<SlipUpdateRequest.LineRequest> lines = new java.util.ArrayList<>(roundTripLines(slip));
        lines.add(new SlipUpdateRequest.LineRequest(
                PLAIN_PRODUCT, "신규 단품", "PLAIN-809", null,
                1, new BigDecimal("123000"), "편집 중 추가", null));

        assertThatCode(() -> salesUpdateService.update(
                slip.getId(), request(slip, lines, true), UUID.randomUUID(), "정상 클라이언트"))
                .doesNotThrowAnyException();

        assertThat(slip.getLines()).hasSize(3);
        // 기존 2행은 계보 승계, 추가된 3행은 평면 — 위치가 아니라 lineId 유무가 가른다.
        assertThat(slip.getLines().get(0).getParentSetModel()).isEqualTo(SET_MODEL);
        assertThat(slip.getLines().get(1).getParentSetModel()).isEqualTo(SET_MODEL);
        assertThat(slip.getLines().get(2).getParentSetModel()).isNull();
    }

    /** 평면 전표 + 마커 + lineId 미전송 = 정상 (게이트는 마커만 본다). */
    @Test
    void salesPut_onPlainSlip_withMarker_withoutLineIds_remainsAccepted() {
        Slip slip = plainSalesSlip();
        stubLoad(slip);
        when(slipRepository.saveAndFlush(any(Slip.class))).thenAnswer(inv -> inv.getArgument(0));

        assertThatCode(() -> salesUpdateService.update(
                slip.getId(), request(slip, linesWithoutIds(slip), true),
                UUID.randomUUID(), "평면 전표 수정자"))
                .doesNotThrowAnyException();
    }

    // ---------------------------------------------------------------- 매입(INBOUND) 미러

    /** 매입/매출 비대칭은 이 PR 의 재발 패턴이므로 미러 케이스를 함께 고정한다. */
    @Test
    void purchasePut_withoutContractMarker_isRejectedAsBadRequest() {
        Slip slip = bundlePurchaseSlip();
        stubLoad(slip);

        assertThatThrownBy(() -> purchaseUpdateService.update(
                slip.getId(), staleClientRequest(slip), UUID.randomUUID(), "구 클라이언트"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    // 매출과 <b>같은</b> 사유 문구여야 한다 — 미러 드리프트 가드.
                    assertThat(ex.getMessage()).contains("구버전", "앱을 업데이트");
                });

        verify(slipRepository, never()).saveAndFlush(any());
    }

    @Test
    void purchasePut_withMarker_andRoundTrippedLineIds_preservesLineage() {
        Slip slip = bundlePurchaseSlip();
        stubLoad(slip);
        when(slipRepository.saveAndFlush(any(Slip.class))).thenAnswer(inv -> inv.getArgument(0));

        assertThatCode(() -> purchaseUpdateService.update(
                slip.getId(), request(slip, roundTripLines(slip), true),
                UUID.randomUUID(), "정상 클라이언트"))
                .doesNotThrowAnyException();

        assertThat(slip.getLines()).allSatisfy(line ->
                assertThat(line.getParentSetModel()).isEqualTo(SET_MODEL));
    }

    /**
     * 매입 미러 — 계보 보유 매입 전표 + 마커 + lineId 전무도 거부한다 (D-R8-13). 매입/매출
     * 비대칭은 이 PR 의 재발 패턴이므로 매출
     * {@link #salesPut_onBundleSlip_withMarker_butNoLineIdAtAll_isRejected} 와 <b>같은</b>
     * 계약(같은 사유 문구 포함)이어야 한다.
     */
    @Test
    void purchasePut_onBundleSlip_withMarker_butNoLineIdAtAll_isRejected() {
        Slip slip = bundlePurchaseSlip();
        stubLoad(slip);

        assertThatThrownBy(() -> purchaseUpdateService.update(
                slip.getId(), request(slip, linesWithoutIds(slip), true),
                UUID.randomUUID(), "전 라인 교체자"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    assertThat(ex.getMessage()).contains("세트 구성품", "새로고침");
                });

        verify(slipRepository, never()).saveAndFlush(any());
        assertThat(slip.getLines()).allMatch(line -> SET_MODEL.equals(line.getParentSetModel()));
    }

    /**
     * 🔴 <b>부분 파괴</b> — 구성품 2개 중 1개의 lineId 를 누락하고 익명 라인으로 재생성하면
     * 다른 구성품 ID가 남아 있어도 400 이다. 종전 개수 게이트는 lineId 1개만 보고 통과시켰다.
     */
    @Test
    void salesPut_onBundleSlip_withOneComponentRecreatedWithoutLineId_isRejected() {
        Slip slip = bundleSalesSlip();
        stubLoad(slip);

        // 첫 구성품은 ID 유지, 둘째 구성품은 같은 품목이지만 ID 없는 익명 라인으로 재생성한다.
        UUID keptLineId = slip.getLines().get(0).getId();
        List<SlipUpdateRequest.LineRequest> partial = List.of(
                new SlipUpdateRequest.LineRequest(COMPONENT_PRODUCT, "실내기", "COMP-1", null,
                        1, new BigDecimal("330000"), "유지", keptLineId),
                new SlipUpdateRequest.LineRequest(PLAIN_PRODUCT, "실외기", "COMP-2", null,
                        1, new BigDecimal("120000"), "구성품 익명 재생성", null));

        assertThatThrownBy(() -> salesUpdateService.update(
                slip.getId(), request(slip, partial, true), UUID.randomUUID(), "부분 편집자"))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));

        verify(slipRepository, never()).saveAndFlush(any(Slip.class));
        assertThat(slip.getLines()).hasSize(2);
        assertThat(slip.getLines()).allMatch(line -> SET_MODEL.equals(line.getParentSetModel()));
    }

    /**
     * 🔴 오탐 방지 — 구성품을 요청에서 아예 빼고 익명 라인을 함께 싣지 않으면 명시 삭제다.
     */
    @Test
    void salesPut_onBundleSlip_withOneComponentOmitted_isAcceptedAsExplicitDeletion() {
        Slip slip = bundleSalesSlip();
        stubLoad(slip);
        when(slipRepository.saveAndFlush(any(Slip.class))).thenAnswer(inv -> inv.getArgument(0));

        SlipLine kept = slip.getLines().get(0);
        List<SlipUpdateRequest.LineRequest> deletion = List.of(
                new SlipUpdateRequest.LineRequest(
                        kept.getProductId(), kept.getProductName(), kept.getModelName(),
                        kept.getSpecification(), kept.getQuantity(), kept.getUnitPrice(),
                        kept.getNote(), kept.getId()));

        assertThatCode(() -> salesUpdateService.update(
                slip.getId(), request(slip, deletion, true), UUID.randomUUID(), "구성품 삭제자"))
                .doesNotThrowAnyException();

        assertThat(slip.getLines()).singleElement().satisfies(line -> {
            assertThat(line.getProductId()).isEqualTo(COMPONENT_PRODUCT);
            assertThat(line.getParentSetModel()).isEqualTo(SET_MODEL);
        });
    }

    /** 매입 미러도 구성품 1개 누락 + 익명 재생성을 매출과 동일하게 400으로 거부한다. */
    @Test
    void purchasePut_onBundleSlip_withOneComponentRecreatedWithoutLineId_isRejected() {
        Slip slip = bundlePurchaseSlip();
        stubLoad(slip);

        SlipLine kept = slip.getLines().get(0);
        List<SlipUpdateRequest.LineRequest> partialDestruction = List.of(
                new SlipUpdateRequest.LineRequest(
                        kept.getProductId(), kept.getProductName(), kept.getModelName(),
                        kept.getSpecification(), kept.getQuantity(), kept.getUnitPrice(),
                        kept.getNote(), kept.getId()),
                new SlipUpdateRequest.LineRequest(
                        FRESH_PRODUCT, "익명 재생성", "NEW-PURCHASE", null,
                        1, new BigDecimal("120000"), "lineId 누락", null));

        assertThatThrownBy(() -> purchaseUpdateService.update(
                slip.getId(), request(slip, partialDestruction, true),
                UUID.randomUUID(), "매입 부분 파괴자"))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));

        verify(slipRepository, never()).saveAndFlush(any(Slip.class));
        assertThat(slip.getLines()).allMatch(line -> SET_MODEL.equals(line.getParentSetModel()));
    }

    // ---------------------------------------------------------------- 픽스처

    private void stubLoad(Slip slip) {
        when(slipRepository.findById(slip.getId())).thenReturn(Optional.of(slip));
    }

    private Slip bundleSalesSlip() {
        Slip slip = persisted(Slip.createOutbound("2026/07/16-1", LocalDate.of(2026, 7, 16), 1,
                UUID.randomUUID(), UUID.randomUUID(), PARTNER_ID, "테스트 거래처",
                DeliveryTag.DAY, "세트 전표", "user-1"));
        addBundleLines(slip);
        return slip;
    }

    private Slip bundlePurchaseSlip() {
        Slip slip = persisted(Slip.createInbound("2026/07/16-2", LocalDate.of(2026, 7, 16), 2,
                UUID.randomUUID(), PARTNER_ID, "테스트 거래처",
                DeliveryTag.RETURN_TRIP, "세트 매입 전표", "user-1"));
        addBundleLines(slip);
        return slip;
    }

    private Slip plainSalesSlip() {
        Slip slip = persisted(Slip.createOutbound("2026/07/16-3", LocalDate.of(2026, 7, 16), 3,
                UUID.randomUUID(), UUID.randomUUID(), PARTNER_ID, "테스트 거래처",
                DeliveryTag.DAY, "평면 전표", "user-1"));
        slip.addLine(persistedLine(SlipLine.create(slip, PLAIN_PRODUCT, "일반 품목", "PLAIN-809",
                null, 1, new BigDecimal("99000"), "일반 라인")));
        return slip;
    }

    /** 세트 전개 결과 — head 구성품 + 일반 구성품 2행 모두 parentSetModel 보유. */
    private void addBundleLines(Slip slip) {
        SlipLine head = persistedLine(SlipLine.create(slip, COMPONENT_PRODUCT, "실내기", "COMP-1",
                null, 1, new BigDecimal("330000"), "구성품"));
        head.assignBundleComponent(SET_MODEL, true);
        SlipLine component = persistedLine(SlipLine.create(slip, PLAIN_PRODUCT, "실외기", "COMP-2",
                null, 1, new BigDecimal("220000"), "구성품"));
        component.assignBundleComponent(SET_MODEL, false);
        slip.addLine(head);
        slip.addLine(component);
    }

    /** JPA 영속 상태 모사 — id / createdAt 은 auditing 이 채우므로 단위 테스트에서 직접 심는다. */
    private Slip persisted(Slip slip) {
        ReflectionTestUtils.setField(slip, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(slip, "createdAt", CREATED_AT);
        return slip;
    }

    private SlipLine persistedLine(SlipLine line) {
        ReflectionTestUtils.setField(line, "id", UUID.randomUUID());
        return line;
    }

    /**
     * 구 클라이언트 재현 — 계약 마커를 <b>모르므로 보내지 않고</b>, lineId 도 싣지 않은 채 전 라인을
     * 통째 재전송한다(무수정 왕복 PUT). 이것이 R8-QA-1 이 라이브에서 계보를 전량 파괴한 요청이다.
     */
    private SlipUpdateRequest staleClientRequest(Slip slip) {
        return request(slip, linesWithoutIds(slip), null);
    }

    /** lineId 를 싣지 않은 라인 목록 — 구 클라이언트 재현과 "전 라인 교체" 양쪽에 쓴다. */
    private List<SlipUpdateRequest.LineRequest> linesWithoutIds(Slip slip) {
        return slip.getLines().stream()
                .map(line -> new SlipUpdateRequest.LineRequest(
                        line.getProductId(), line.getProductName(), line.getModelName(),
                        line.getSpecification(), line.getQuantity(), line.getUnitPrice(),
                        line.getNote(), null))
                .toList();
    }

    /** 계약을 지키는 클라이언트 — 기존 라인은 lineId 를 그대로 되돌려 보낸다. */
    private List<SlipUpdateRequest.LineRequest> roundTripLines(Slip slip) {
        return slip.getLines().stream()
                .map(line -> new SlipUpdateRequest.LineRequest(
                        line.getProductId(), line.getProductName(), line.getModelName(),
                        line.getSpecification(), line.getQuantity(), line.getUnitPrice(),
                        line.getNote(), line.getId()))
                .toList();
    }

    private SlipUpdateRequest request(Slip slip, List<SlipUpdateRequest.LineRequest> lines,
                                      Boolean lineIdContract) {
        return new SlipUpdateRequest(CREATED_AT, slip.getPartnerId(), slip.getPartnerName(),
                slip.getPartnerCode(), slip.getMemo(), slip.getBusinessNumber(),
                slip.getDeliveryAddress(), slip.getSupervisionAddress(), slip.getProjectName(),
                slip.getRecipientPhone(), slip.getPaymentDueDate(), lines, lineIdContract);
    }
}
