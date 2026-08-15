package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.client.NotificationClient;
import com.samhanair.logis.partnerorder.domain.HistoryEventType;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderDraft;
import com.samhanair.logis.partnerorder.domain.PartnerOrderHistory;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderDraftRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderHistoryRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderBoardChangePublisher;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionService;
import com.samhanair.logis.partnerorder.web.dto.ConfirmLineRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmResponse;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주문 확정 서비스 — 슬라이스 D1 이후 confirm 은 slip 미발행 DRAFT 주문만 생성한다.
 *
 * <pre>
 *   POST /confirm
 *     ① 멱등 가드 (findByIdempotencyKey)
 *     ② dc-config price-calc (POST /internal/price-calculations) 로 라인별 finalPrice 계산
 *        └ 실패/404/5xx/부분응답 → PRICE_CALCULATION_UNAVAILABLE(503), 저장하지 않음
 *     ③ M1a product 카탈로그 스냅샷
 *     ④ PartnerOrder.createFromConfirm → status=DRAFT, slipPublishStatus=NOT_REQUIRED
 *     ⑤ 서버 계산 결과가 모든 라인에 있음을 확인한 뒤 라인 INSERT + recomputeTotal + save
 *     ⑥ history(CONFIRMED=주문접수) + revision CREATE 캡처
 *     ⑦ (slip 발행 없음)
 *   → ConfirmResponse{ orderNo, status=DRAFT, slipNo=null }
 * </pre>
 *
 * <p>출고전표는 이후 명시적 convert 액션({@code PartnerOrderConvertService})으로만 발행된다.
 *
 * <p>UUID 비공개 가드 — 응답 ConfirmResponse 는 orderNo 만 사용자 노출.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderConfirmService {

    private static final Logger log = LoggerFactory.getLogger(PartnerOrderConfirmService.class);
    private static final DateTimeFormatter ORDER_NO_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd");
    /** legacy 동작 — 향후 슬라이스에서 partner-warehouse 분기. */
    private static final UUID DEFAULT_WAREHOUSE_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000001");

    private final PartnerOrderRepository orderRepository;
    private final PartnerOrderDraftRepository draftRepository;
    private final PartnerOrderHistoryRepository historyRepository;

    private final DcConfigClient dcConfigClient;
    private final ProductClient productClient;
    /** 미리보기와 확정이 공유하는 단일 가격 계산 진입점. */
    private final PartnerOrderPriceCalculationService priceCalculationService;
    private final PartnerOrderPartnerIdentityResolver partnerIdentityResolver;
    // Phase 2.6c: inventoryClient 제거 — confirm 단계는 재고 무영향 (주문 무영향 원칙).
    // inventoryClient 는 PartnerOrderConvertService 에서만 사용 (출고전표 전환 시 reserve).
    // 슬라이스 D1: slipServiceClient / outboxRepository 제거 — confirm 은 slip 미발행.

    private final PartnerOrderRevisionService revisionService;
    private final PartnerOrderBoardChangePublisher boardChangePublisher;

    /** 빈 값이면 메일을 발송하지 않는다. 운영에서 명시적으로 설정해야 한다. */
    @Value("${samhan.partner-order.confirmation-email:}")
    private String confirmationEmail;

    @Autowired(required = false)
    private NotificationClient notificationClient;

    private final EntityManager entityManager;

    /**
     * 임시저장 → 확정 흐름. draftId 가 있으면 draft 의 draftSeq 를 idempotencyKey 시드로 사용.
     *
     * <p>슬라이스 D1: confirm 은 {@link PartnerOrder#createFromConfirm} 으로 DRAFT + NOT_REQUIRED 주문을
     * 생성하며 slip-service 를 호출하지 않는다. 출고전표는 명시적 convert 액션으로만 발행.
     *
     * <p>DC 단가 계산: {@link DcConfigClient#calculatePrices} (POST /internal/price-calculations) 로
     * 라인별 finalPrice 를 받아 priceVat 에 적용한다. 계산 실패/부분 응답이면 정상가로 대체하지 않고
     * 사용자에게 재시도 가능한 503을 반환한다.
     *
     * <p>주문 저장 성공 후 {@link PartnerOrderRevisionService#capture} 로 CREATE 유형 revision 을
     * 트랜잭션 내에서 캡처한다 (Phase 2.4 버전이력 훅).
     *
     * @param partnerCode 거래처 코드 (JWT)
     * @param bizCode 사업자번호
     * @param actorUserId X-User-Id (헤더)
     * @param actorName X-User-Name (헤더, UUID 비공개 가드 적용 전 원본)
     * @param draftId 임시저장 UUID (legacy 흐름 — saveOrderSnapshot 후 sendOrderFromUi)
     * @param request 라인 (가격은 무시 — server-side DC 적용)
     * @return ConfirmResponse — status=DRAFT, slipNo=null
     */
    @Transactional
    public ConfirmResponse confirm(String partnerCode, String bizCode, String actorUserId,
                                   String actorName, UUID draftId, ConfirmRequest request) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "partnerCode 필수");
        }
        if (bizCode == null || bizCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "bizCode 필수");
        }

        // 1) draft 검증 + draftSeq 추출 (idempotencyKey 시드)
        // partnerCode 별 draftSeq 시퀀스가 독립이므로 idempotencyKey 도 partnerCode 로 격리
        // (PR #76 회고 — 다른 partner 의 동일 draftSeq 가 동일 idemKey 로 collide 되어 IT
        // race condition 발생).
        long draftSeq = resolveDraftSeq(partnerCode, draftId);
        String idempotencyKey = "PO-CONF-" + partnerCode + "-" + draftSeq;

        // 멱등 검사 — 이미 확정된 키면 기존 결과 반환 (재호출 가드)
        var existing = orderRepository.findByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            log.info("Idempotency hit: idemKey={} → 기존 주문 반환", idempotencyKey);
            return ConfirmResponse.from(existing.get());
        }

        // 신규 주문은 생성 시점의 활성 거래처 UUID를 snapshot한다. 코드 재사용 후에도
        // 이 주문은 당시 거래처 정체성을 잃지 않도록 partnerCode만 저장하지 않는다.
        UUID partnerId = partnerIdentityResolver.requirePartnerId(partnerCode, bizCode);

        // 2) 미리보기와 확정이 동일한 카탈로그/서버 가격 계산기를 통과한다.
        PartnerOrderPriceCalculationService.Calculation calculation =
                effectivePriceCalculationService().calculate(partnerCode, request);
        List<ConfirmLineRequest> reqLines = request.lines();
        if (!calculation.available() || calculation.lines().size() != reqLines.size()
                || calculation.lines().stream().anyMatch(line -> line.finalPrice() == null
                        || line.finalPrice().signum() <= 0)) {
            throw new BusinessException(ErrorCode.PRICE_CALCULATION_UNAVAILABLE,
                    ErrorCode.PRICE_CALCULATION_UNAVAILABLE.getDefaultMessage());
        }

        // 4) inventory reserve 제거 (Phase 2.6c — 주문 무영향 원칙)
        // confirm 단계에서는 재고 예약을 하지 않는다. 재고 예약은 "출고전표로 전환(convert)" 시점에만 발생.

        // 5) partner_order INSERT (DRAFT + NOT_REQUIRED — 슬라이스 D1)
        String orderNo = nextOrderNo();

        PartnerOrder order = PartnerOrder.createFromConfirm(
                partnerId, partnerCode, bizCode, orderNo, idempotencyKey, BigDecimal.ZERO,
                request.deliveryAddress());

        for (int i = 0; i < reqLines.size(); i++) {
            ConfirmLineRequest line = reqLines.get(i);
            PartnerOrderPriceCalculationService.Line calculatedLine = calculation.lines().get(i);
            ProductSummary p = calculatedLine.product();
            BigDecimal priceVat = calculatedLine.finalPrice();
            if (priceVat == null || priceVat.signum() <= 0) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "확정 최종 단가가 0원입니다: " + modelCodeSnapshot(p));
            }
            // 주문 라인 modelName 컬럼은 화면 표시 modelCode snapshot 으로 사용한다.
            String lineModelCode = modelCodeSnapshot(p);
            PartnerOrderLine entity = PartnerOrderLine.create(
                    p.id(), lineModelCode, p.name(), line.categoryKey(),
                    line.quantity(), priceVat, line.remark());
            order.addLine(entity); // totalAmount 자동 누적
        }
        order.recomputeTotal();
        order = orderRepository.save(order);
        historyRepository.save(PartnerOrderHistory.ofOrder(
                order.getId(), partnerCode, HistoryEventType.CONFIRMED,
                actorUserId, "{\"orderNo\":\"" + orderNo + "\"}"));

        // 6) slip 발행 없음 — 슬라이스 D1 confirm 자동발행 폐지 (D-CF-02).
        // 출고전표는 본사 데스크톱의 명시적 convert 액션(PartnerOrderConvertService)으로만 발행.

        // Phase 2.4 버전이력 훅 — confirm 은 PartnerOrder 를 신규 INSERT 하는 경로이므로 CREATE 캡처.
        UUID actorId = parseActorId(actorUserId);
        revisionService.capture(order, PartnerOrderRevisionType.CREATE, null,
                actorId, actorName, null);
        if (notificationClient != null && confirmationEmail != null && !confirmationEmail.isBlank()) {
            notificationClient.sendExternalEmail(confirmationEmail,
                    "[주문 확정] " + orderNo,
                    "주문서가 확정되었습니다. 주문번호: " + orderNo);
        }
        publishListChanged();

        return ConfirmResponse.from(order);
    }

    private PartnerOrderPriceCalculationService effectivePriceCalculationService() {
        if (priceCalculationService != null) {
            return priceCalculationService;
        }
        // 기존 단위 테스트/호환 생성 경로에서 새 의존성이 주입되지 않는 경우에도
        // 동일한 계산 서비스 구현을 사용한다. Spring 런타임에서는 위 bean이 항상 선택된다.
        return new PartnerOrderPriceCalculationService(productClient, dcConfigClient);
    }

    /** 레거시 반사 회귀 테스트/문서 호환용 매핑 — 실제 가격 계산은 공유 서비스가 담당한다. */
    @SuppressWarnings("unused")
    private String mapCategory(String categoryKey) {
        if (categoryKey == null) {
            return "OTHER";
        }
        return switch (categoryKey) {
            case "homemulti", "homeDefaults" -> "HOMEMULTI";
            case "commercialMulti" -> "COMMERCIAL_MULTI";
            default -> "OTHER";
        };
    }

    private void publishListChanged() {
        if (boardChangePublisher != null) {
            boardChangePublisher.publishListChanged("CREATED");
        }
    }

    /**
     * draft 가 있으면 draftSeq 반환, 없으면 partner 별 MAX+1.
     */
    private long resolveDraftSeq(String partnerCode, UUID draftId) {
        if (draftId != null) {
            PartnerOrderDraft draft = draftRepository.findById(draftId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "임시저장을 찾을 수 없습니다"));
            if (!draft.getPartnerCode().equals(partnerCode)) {
                throw new BusinessException(ErrorCode.FORBIDDEN, "본인 거래처 임시저장만 확정 가능");
            }
            return draft.getDraftSeq();
        }
        return draftRepository.findMaxDraftSeqByPartnerCode(partnerCode) + 1L;
    }

    /** 사용자 표시 주문번호 — 날짜별 마지막 순번 + 1, 공개 업무번호 표준({@code yyyy/MM/dd-N}). */
    private String nextOrderNo() {
        String datePrefix = LocalDate.now().format(ORDER_NO_DATE);
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(?1) AS bigint))")
                .setParameter(1, "partner_order_no_seq_" + datePrefix)
                .getSingleResult();
        int maxSeq = 0;
        for (PartnerOrder order : orderRepository.findAllByOrderNoStartingWith(datePrefix)) {
            maxSeq = Math.max(maxSeq, extractOrderSeq(datePrefix, order.getOrderNo()));
        }
        return datePrefix + "-" + (maxSeq + 1);
    }

    private int extractOrderSeq(String datePrefix, String orderNo) {
        if (orderNo == null || !orderNo.startsWith(datePrefix)) {
            return 0;
        }
        String suffix = orderNo.substring(datePrefix.length()).trim();
        if (suffix.startsWith("-")) {
            suffix = suffix.substring(1).trim();
        }
        if (suffix.startsWith("V")) {
            suffix = suffix.substring(1).trim();
        }
        try {
            return Integer.parseInt(suffix);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private String modelCodeSnapshot(ProductSummary product) {
        if (product.modelCode() != null && !product.modelCode().isBlank()) {
            return product.modelCode().trim();
        }
        return product.modelName();
    }

    /**
     * actorUserId 문자열을 UUID 로 변환한다. 파싱 실패 시 zero UUID 를 반환한다.
     *
     * @param actorUserId X-User-Id 헤더 문자열 (null 허용)
     * @return 파싱된 UUID 또는 zero UUID
     */
    private UUID parseActorId(String actorUserId) {
        if (actorUserId == null || actorUserId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(actorUserId);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }
}
