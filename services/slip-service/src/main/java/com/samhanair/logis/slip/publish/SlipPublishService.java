package com.samhanair.logis.slip.publish;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.PartnerInternalClient.PartnerVerifyResult;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipPublishAudit;
import com.samhanair.logis.slip.domain.SlipSourceType;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.domain.SlipSourceOrder;
import com.samhanair.logis.slip.repository.SlipPublishAuditRepository;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.SlipSourceOrderRepository;
import com.samhanair.logis.slip.service.SlipNumberService;
import com.samhanair.logis.slip.service.BundleModePolicy;
import com.samhanair.logis.slip.service.cutoff.OutboundCutoffGuard;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 6 M5 (slip-service-integration) — Sync REST 발행 서비스.
 *
 * <p>설계: {@code docs/migration/phase6/M5-slip-service-integration.md} §3 (payload 매핑) +
 * CONSISTENCY-MATRIX (Sync REST + idempotency 3중 격리).
 *
 * <p>**PR-G1 BE (V16) 리팩토링** — Samhan Public native:
 * <ul>
 *   <li>e-Count API 호출 코드 완전 제거 (사용자 결정). proxy {@code 152.69.228.109:3000} +
 *       {@code SaleList} / {@code SaleOrderList} / ECOUNT_SESSION 의존 0.</li>
 *   <li>memo 1000자 prepend 정책 폐기 — 12 신규 컬럼에 직접 저장
 *       ({@link Slip#applyEcountSchema}). memo 컬럼은 사용자 자유 입력만 보존.</li>
 *   <li>partner_code resolve — {@code req.partnerCode()} 를 {@link Slip#setPartnerCode} 로 직접
 *       snapshot (V15 보강). UUID 비공개 가드 일관.</li>
 *   <li>자체 슬립번호 채번 + 자체 publish 흐름으로 완결 — e-Count Data.SuccessCnt / Data.SlipNos
 *       의존 제거.</li>
 * </ul>
 *
 * <p>핵심 책임:
 * <ol>
 *   <li>Idempotency 3중 격리 (DB partial UNIQUE INDEX + 본 서비스의 fingerprint 비교 +
 *       (별 슬라이스) outbox).</li>
 *   <li>legacy header 12 필드 → {@link Slip#applyEcountSchema} 직접 컬럼 저장 (V16 신규).</li>
 *   <li>legacy line ({@code PROD_CD/QTY/USER_PRICE_VAT/SIZE_DES/REMARKS/SUPPLY_AMT/VAT_AMT})
 *       → {@link SlipLine} + {@link SlipPublishAudit}.</li>
 *   <li>{@code Slip.assignPublishSource} 로 출처/idempotencyKey 1회성 설정.</li>
 *   <li>{@code Slip.setPartnerCode} 로 partner_code snapshot (V15 보강).</li>
 *   <li>Audit 1행 INSERT (회계 reference 영구 보존).</li>
 * </ol>
 *
 * <p>Idempotency 매트릭스:
 * <ul>
 *   <li>같은 idempotencyKey + 같은 fingerprint → 200 OK + 기존 slipNo (replay)</li>
 *   <li>같은 idempotencyKey + 다른 fingerprint → 409 CONFLICT</li>
 *   <li>다른 idempotencyKey → 새 슬립 발행 (DB partial UNIQUE INDEX 가 동시 race condition 보호)</li>
 *   <li>idempotencyKey 가 null/blank → idempotency 보호 없이 매번 새 슬립 (호출자 책임)</li>
 * </ul>
 */
@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class SlipPublishService {

    private static final DateTimeFormatter IO_DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter TIME_DATE_FMT = DateTimeFormatter.ofPattern("HHmmss");
    private static final String ZERO_WIDTH_SPACE = "​";
    private static final int MEMO_MAX = 1000;
    /** PR-G1 V16 — 출고 디폴트 io_type. 입고 endpoint 신설 시 "11" 분기. */
    private static final String IO_TYPE_OUTBOUND = "10";

    private final SlipRepository slipRepository;
    private final SlipPublishAuditRepository auditRepository;
    private final SlipSourceOrderRepository sourceOrderRepository;
    private final SlipNumberService slipNumberService;
    private final ProductClient productClient;
    private final PartnerInternalClient partnerInternalClient;
    private final WarehouseCodeMapper warehouseCodeMapper;
    private final SlipPublishProperties publishProperties;
    private final ObjectMapper objectMapper;
    private final EntityManager entityManager;
    /** 출고전표 마감 게이트 — 발행 3경로(게이트④⑤⑥). */
    private final OutboundCutoffGuard cutoffGuard;
    /** KST 기준 오늘 — 컷오프 게이트와 동일 Clock. */
    private final Clock clock;

    /**
     * estimate-app v2 → 출고전표 발행. {@link
     * com.samhanair.logis.slip.web.SlipPublishController#publishFromEstimate} 의 핵심 처리.
     *
     * @param req 발행 요청 (DTO validation 후)
     * @param idempotencyKey {@code Idempotency-Key} 헤더 값 (null/blank 가능)
     * @param requesterId 호출자 user-id (gateway X-User-Id 또는 "system")
     * @return 발행 결과 + replay 여부
     * @throws BusinessException(CONFLICT) 같은 키 + 다른 본문
     * @throws BusinessException(INVALID_INPUT) warehouseCode 매핑 누락 / 라인 productCode 미존재 등
     */
    public PublishSlipResponse publishFromEstimate(PublishFromEstimateRequest req,
                                                   String idempotencyKey, String requesterId) {
        String fingerprint = computeFingerprint(req);

        // 1. idempotency 가드 — 같은 키 + 같은 fingerprint → replay
        Optional<Slip> existing = lookupByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            return assertReplayOrConflict(existing.get(), fingerprint, null, false);
        }

        // 1.5 PR-G1 backlog #1 — partnerCode strict 검증 (hybrid policy, default strict)
        UUID verifiedPartnerId = verifyPartnerOrThrow(req.partnerCode());

        // 2. 헤더 매핑 — PR-G1: memo prepend 폐기, 사용자 자유 입력만 보존
        UUID warehouseId = warehouseCodeMapper.resolve(req.warehouseCode());
        LocalDate slipDate = parseIoDate(req.ioDate());
        String memo = preserveFreeMemo(req.memo());
        String requester = pickRequester(req.employeeCode(), requesterId);

        // 3. 라인 매핑 + product lookup (모델명 → productId)
        ResolvedLines resolved = resolveLines(req.lines());

        // 4. 슬립 헤더 + 라인 빌드 + 채번
        String slipNo = slipNumberService.next(slipDate, SlipType.OUTBOUND);
        int seqNo = slipNumberService.extractSeqNo(slipNo);
        Slip slip = Slip.createOutbound(slipNo, slipDate, seqNo,
                warehouseId, null,
                null, req.partnerName(),
                null, memo, requester);
        slip.setSourceWarehouseCode(req.warehouseCode());
        // [게이트④] 견적 발행 출고전표 마감 게이트 — createOutbound 직후.
        // deliveryTag null(발행 시 미지정) 이므로 assertWithinCutoff 내부에서 즉시 통과.
        cutoffGuard.assertWithinCutoff(slip.getDeliveryTag(), slip.getSlipDate());
        for (SlipLine line : resolved.toEntityLines(slip)) {
            slip.addLine(line);
        }
        slip.assignPublishSource(SlipSourceType.ESTIMATE, req.estimateNumber(), idempotencyKey);

        // 5. PR-G1 V16 — e-Count 12 컬럼 + V15 partner_code snapshot 직접 저장 (memo prepend 폐기)
        slip.applyEcountSchema(
                pickIoType(req.ioType()), pickTimeDate(req.timeDate()),
                req.customerTel(), req.customerAddr(), req.customerRep(),
                req.shippingAddress(), req.inspectionAddress(), req.receiverPhone(),
                req.paymentDueLabel(), req.discountInfo(),
                null, null);
        String businessNumber = verifiedPartnerId == null
                ? null
                : partnerInternalClient.resolveBusinessNumber(verifiedPartnerId).orElse(null);
        slip.withProjectInfo(businessNumber, null, null, null, null, null);
        if (req.partnerCode() != null && !req.partnerCode().isBlank()) {
            slip.setPartnerCode(req.partnerCode().trim());
        }

        // [게이트④-배송일정] 견적 발행 시 deliveryTag null → unloadDate null.
        // 태그 확정(editHeader)은 SlipForm 저장 시 게이트⑦ 에서 applyDeliverySchedule 가 수행.
        slip.applyDeliverySchedule(slip.getDeliveryTag(), null);

        // 5. persist — partial UNIQUE INDEX 충돌 시 동시 race condition (정확한 원인 별도 추적)
        Slip saved;
        try {
            saved = slipRepository.saveAndFlush(slip);
        } catch (DataIntegrityViolationException ex) {
            return handleIdempotencyRaceCondition(idempotencyKey, fingerprint, null, false, ex);
        }

        // 6. 감사 로그 적재 (request fingerprint 동봉 — replay 비교용)
        String dcSnapshot = serializeDiscount(req.discountInfo(), req.paymentDueLabel());
        SlipPublishAudit audit = SlipPublishAudit.create(saved.getId(), SlipSourceType.ESTIMATE,
                req.estimateNumber(), idempotencyKey,
                resolved.totalSupplyAmount, resolved.totalVatAmount, dcSnapshot, fingerprint);
        auditRepository.save(audit);

        log.info("[Phase 6 M5] estimate {} → slip {} 발행 완료 (idem={})",
                req.estimateNumber(), saved.getSlipNo(), idempotencyKey);
        return PublishSlipResponse.created(saved);
    }

    /**
     * partner-order-service M4 → 출고전표 발행. {@link #publishFromEstimate} 와 거의 동일 흐름.
     *
     * @param req 발행 요청
     * @param idempotencyKey 헤더 값
     * @param requesterId 호출자 user-id
     */
    public PublishSlipResponse publishFromPartnerOrder(PublishFromPartnerOrderRequest req,
                                                       String idempotencyKey, String requesterId) {
        String fingerprint = computeFingerprint(req);
        String legacyFingerprint = req.deliveryAddress() == null
                ? computeLegacyFingerprint(req) : null;

        Optional<Slip> existing = lookupByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            return assertReplayOrConflict(existing.get(), fingerprint, legacyFingerprint,
                    legacyReplayMatches(existing.get(), req));
        }

        // PR-G1 backlog #1 — partnerCode strict 검증 (hybrid policy)
        UUID partnerId = resolveCommittedPartnerId(req.partnerCode());

        UUID warehouseId = resolveWarehouseId(req.warehouseId(), req.warehouseCode());
        LocalDate slipDate = parseIoDate(req.ioDate());
        // PR-G1: memo prepend 폐기 — orderApprovedAt 만 사용자 자유 입력 memo 와 결합 보존 (snapshot 컬럼 없음)
        String memo = mergePartnerOrderApprovalIntoMemo(req.memo(), req.orderApprovedAt());
        String requester = pickRequester(req.employeeCode(), requesterId);

        ResolvedLines resolved = resolveLines(req.lines());

        String slipNo = slipNumberService.next(slipDate, SlipType.OUTBOUND);
        int seqNo = slipNumberService.extractSeqNo(slipNo);
        Slip slip = Slip.createOutbound(slipNo, slipDate, seqNo,
                warehouseId, null,
                partnerId, req.partnerName(),
                null, memo, requester);
        slip.setSourceWarehouseCode(req.warehouseCode());
        // [게이트⑤] 주문 발행 출고전표 마감 게이트 — createOutbound 직후.
        // deliveryTag null(발행 시 미지정) 이므로 assertWithinCutoff 내부에서 즉시 통과.
        cutoffGuard.assertWithinCutoff(slip.getDeliveryTag(), slip.getSlipDate());
        for (SlipLine line : resolved.toEntityLines(slip)) {
            slip.addLine(line);
        }
        slip.assignPublishSource(SlipSourceType.PARTNER_ORDER, req.partnerOrderId(), idempotencyKey);

        // PR-G1 V16 — e-Count 12 컬럼 + V15 partner_code snapshot 직접 저장
        // partner-order DTO 에는 ioType/timeDate/customer* / inspection* 필드 없음 → null 보존 (defaults)
        slip.applyEcountSchema(
                IO_TYPE_OUTBOUND, pickTimeDate(null),
                null, null, null,
                req.shippingAddress(), null, req.receiverPhone(),
                req.paymentDueLabel(), req.discountInfo(),
                null, null);
        slip.withProjectInfo(req.bizCode(), req.deliveryAddress(), null, null, null, null);
        if (req.partnerCode() != null && !req.partnerCode().isBlank()) {
            slip.setPartnerCode(req.partnerCode().trim());
        }

        // [게이트⑤-배송일정] 주문 발행 시 deliveryTag null → unloadDate null.
        // 태그 확정(editHeader)은 SlipForm 저장 시 게이트⑦ 에서 applyDeliverySchedule 가 수행.
        slip.applyDeliverySchedule(slip.getDeliveryTag(), null);

        Slip saved;
        try {
            saved = slipRepository.saveAndFlush(slip);
        } catch (DataIntegrityViolationException ex) {
            return handleIdempotencyRaceCondition(idempotencyKey, fingerprint, legacyFingerprint,
                    legacyReplayMatches(slip, req), ex);
        }

        // Phase 2.6c: PARTNER_ORDER 전환 전표 발행 즉시 불변 — DRAFT → SAVED → SENT 전이.
        // EDITABLE_STATUSES({DRAFT, SAVED}) 에서 벗어나 수정/삭제 차단.
        // 다른 sourceType(ESTIMATE 등) 및 기존 전표는 미변경 (회귀 방지).
        if (SlipSourceType.PARTNER_ORDER.equals(saved.getSourceType())) {
            saved.save();  // DRAFT → SAVED
            saved.send();  // SAVED → SENT
            saved = slipRepository.saveAndFlush(saved);
            log.info("[Phase 2.6c] partner-order 전환 전표 불변 전이 완료: slip={} status=SENT",
                    saved.getSlipNo());
        }

        String dcSnapshot = serializeDiscount(req.discountInfo(), req.paymentDueLabel());
        SlipPublishAudit audit = SlipPublishAudit.create(saved.getId(), SlipSourceType.PARTNER_ORDER,
                req.partnerOrderId(), idempotencyKey,
                resolved.totalSupplyAmount, resolved.totalVatAmount, dcSnapshot, fingerprint);
        auditRepository.save(audit);

        log.info("[Phase 6 M5] partner-order {} → slip {} 발행 완료 (idem={})",
                req.partnerOrderId(), saved.getSlipNo(), idempotencyKey);
        return PublishSlipResponse.created(saved);
    }

    /**
     * 다중 주문 → 단일 출고전표 병합 발행 — Phase 2.6b D2.
     *
     * <p>{@link #publishFromPartnerOrder} 와 동일한 헤더/라인/채번/SENT 불변 전이/audit 흐름을
     * 따르되 차이점:
     * <ul>
     *   <li>{@code Slip.assignPublishSource(PARTNER_ORDER, primaryOrderId, key)} — 대표(첫) 주문</li>
     *   <li>{@code slip_source_orders} N행 INSERT — 전체 출처 주문 추적</li>
     *   <li>fingerprint = 입력 순서를 보존한 sourceOrders + lines 기준</li>
     * </ul>
     * 기존 {@link #publishFromPartnerOrder}(단일주문)는 무변경 — 회귀 0.
     *
     * @param req           병합 발행 요청
     * @param idempotencyKey Idempotency-Key (null/blank 가능)
     * @param requesterId   호출자 user-id
     * @return 발행 결과 + replay 여부
     * @throws BusinessException(CONFLICT) 같은 키 + 다른 본문
     */
    public PublishSlipResponse publishFromOrdersMerge(PublishFromOrdersMergeRequest req,
                                                      String idempotencyKey, String requesterId) {
        String fingerprint = computeMergeFingerprint(req);
        String legacyFingerprint = req.deliveryAddress() == null
                ? computeLegacyMergeFingerprint(req) : null;

        Optional<Slip> existing = lookupByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            return assertReplayOrConflict(existing.get(), fingerprint, legacyFingerprint,
                    legacyReplayMatches(existing.get(), req));
        }

        UUID partnerId = requireMergePartnerId(req.partnerId());

        UUID warehouseId = resolveWarehouseId(req.warehouseId(), req.warehouseCode());
        LocalDate slipDate = parseIoDate(req.ioDate());
        String memo = preserveFreeMemo(req.memo());
        String requester = pickRequester(req.employeeCode(), requesterId);

        ResolvedLines resolved = resolveLines(req.lines());

        String slipNo = slipNumberService.next(slipDate, SlipType.OUTBOUND);
        int seqNo = slipNumberService.extractSeqNo(slipNo);
        Slip slip = Slip.createOutbound(slipNo, slipDate, seqNo,
                warehouseId, null, partnerId, req.partnerName(), null, memo, requester);
        slip.setSourceWarehouseCode(req.warehouseCode());
        // [게이트⑥] 주문 병합 발행 출고전표 마감 게이트 — createOutbound 직후.
        // deliveryTag null(발행 시 미지정) 이므로 assertWithinCutoff 내부에서 즉시 통과.
        cutoffGuard.assertWithinCutoff(slip.getDeliveryTag(), slip.getSlipDate());
        for (SlipLine line : resolved.toEntityLines(slip)) {
            slip.addLine(line);
        }
        // 대표(첫) 주문을 source_id 로 설정 — N:1 진실은 slip_source_orders.
        String primaryOrderId = req.sourceOrders().get(0).partnerOrderId();
        slip.assignPublishSource(SlipSourceType.PARTNER_ORDER, primaryOrderId, idempotencyKey);

        slip.applyEcountSchema(
                IO_TYPE_OUTBOUND, pickTimeDate(null),
                null, null, null,
                req.shippingAddress(), null, req.receiverPhone(),
                req.paymentDueLabel(), req.discountInfo(),
                null, null);
        slip.withProjectInfo(req.bizCode(), req.deliveryAddress(), null, null, null, null);
        if (req.partnerCode() != null && !req.partnerCode().isBlank()) {
            slip.setPartnerCode(req.partnerCode().trim());
        }

        // [게이트⑥-배송일정] 병합 발행 시 deliveryTag null → unloadDate null.
        // 태그 확정(editHeader)은 SlipForm 저장 시 게이트⑦ 에서 applyDeliverySchedule 가 수행.
        slip.applyDeliverySchedule(slip.getDeliveryTag(), null);

        Slip saved;
        try {
            saved = slipRepository.saveAndFlush(slip);
        } catch (DataIntegrityViolationException ex) {
            return handleIdempotencyRaceCondition(idempotencyKey, fingerprint, legacyFingerprint,
                    legacyReplayMatches(slip, req), ex);
        }

        // 출처 주문 N행 기록 (slip_source_orders V30)
        for (SourceOrderRef ref : req.sourceOrders()) {
            sourceOrderRepository.save(
                    SlipSourceOrder.of(saved.getId(), UUID.fromString(ref.partnerOrderId()), ref.orderNo()));
        }

        // Phase 2.6c: PARTNER_ORDER 전환 전표 발행 즉시 불변 (DRAFT → SAVED → SENT)
        if (SlipSourceType.PARTNER_ORDER.equals(saved.getSourceType())) {
            saved.save();
            saved.send();
            saved = slipRepository.saveAndFlush(saved);
            log.info("[D2] 병합 전표 불변 전이 완료: slip={} status=SENT", saved.getSlipNo());
        }

        String dcSnapshot = serializeDiscount(req.discountInfo(), req.paymentDueLabel());
        SlipPublishAudit audit = SlipPublishAudit.create(saved.getId(), SlipSourceType.PARTNER_ORDER,
                primaryOrderId, idempotencyKey,
                resolved.totalSupplyAmount, resolved.totalVatAmount, dcSnapshot, fingerprint);
        auditRepository.save(audit);

        log.info("[D2] 병합 발행 완료 — {}개 주문 → slip {} (idem={})",
                req.sourceOrders().size(), saved.getSlipNo(), idempotencyKey);
        return PublishSlipResponse.created(saved);
    }

    /**
     * {@code GET /api/v1/slips/by-source} — sourceType + sourceId 로 슬립 목록 조회.
     *
     * <p>Phase 2.6b D2 확장: PARTNER_ORDER sourceType 의 경우
     * {@code slip_source_orders} 역조회(UNION)로 병합 비대표 주문도 누락 없이 반환한다.
     * 단일주문 전환 경로는 {@code slip.source_id} 직접 매칭으로 기존과 동일하게 처리된다.
     *
     * <p>N+1 방지: 비대표 주문 역조회 시 {@code findAllByPartnerOrderId} 결과의 slipId 목록을 먼저
     * 수집한 후 {@code slipRepository.findAllById(slipIds)} 배치 1회 조회로 Slip 을 로드한다.
     * (기존: N회 {@code findById} 루프 → 배치 1회로 교체. 사이클1 P1-3 수정.)
     */
    @Transactional(readOnly = true)
    public List<PublishSlipResponse> findBySource(SlipSourceType sourceType, String sourceId) {
        if (sourceType == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "sourceType 은 필수입니다");
        }
        if (sourceId == null || sourceId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "sourceId 는 필수입니다");
        }
        // 1) 기존: slip.source_id 직접 매칭 (단일주문 + 병합 대표 주문)
        java.util.LinkedHashMap<UUID, Slip> byId = new java.util.LinkedHashMap<>();
        slipRepository.findAllBySourceTypeAndSourceIdAndIsDeletedFalse(sourceType, sourceId)
                .forEach(s -> byId.put(s.getId(), s));
        // 2) 병합 비대표 주문 — slip_source_orders 역조회 (PARTNER_ORDER 한정)
        // N+1 방지: findAllByPartnerOrderId 결과 slipId 목록을 모아 findAllById 배치 1회 조회.
        if (sourceType == SlipSourceType.PARTNER_ORDER) {
            try {
                UUID orderId = UUID.fromString(sourceId);
                List<UUID> slipIds = sourceOrderRepository.findAllByPartnerOrderId(orderId).stream()
                        .map(SlipSourceOrder::getSlipId)
                        .filter(id -> !byId.containsKey(id))
                        .distinct()
                        .toList();
                if (!slipIds.isEmpty()) {
                    slipRepository.findAllById(slipIds)
                            .forEach(s -> byId.putIfAbsent(s.getId(), s));
                }
            } catch (IllegalArgumentException ignored) {
                // sourceId 가 UUID 형식이 아니면(estimate 번호 등) 역조회 skip
            }
        }
        return byId.values().stream().map(PublishSlipResponse::replay).toList();
    }

    // ---------- 내부 helper ----------

    /**
     * 창고 식별자 해석 — 슬라이스 C (inventory 단일 출처).
     *
     * <p>{@code warehouseId}(UUID 문자열) 가 주어지면 그대로 사용한다. partner-order convert 가
     * inventory {@code by-code} 로 이미 해석한 UUID 를 전달하는 경로로, slip 의 정적 yml 매핑
     * ({@link WarehouseCodeMapper})을 경유하지 않는다.
     *
     * <p>{@code warehouseId} 가 null/blank 이면 {@code warehouseCode} 를 {@link WarehouseCodeMapper}
     * 로 폴백 해석한다 (estimate-app 등 레거시 호출자 하위호환).
     *
     * @param warehouseId   inventory 해석 UUID 문자열 (null/blank 가능)
     * @param warehouseCode legacy/내부 창고 코드 (폴백 해석용)
     * @return 출고지 창고 UUID
     * @throws BusinessException(INVALID_INPUT) warehouseId 가 UUID 형식이 아니거나, 폴백 매핑 누락
     */
    private UUID resolveWarehouseId(String warehouseId, String warehouseCode) {
        if (warehouseId != null && !warehouseId.isBlank()) {
            try {
                return UUID.fromString(warehouseId.trim());
            } catch (IllegalArgumentException ex) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "warehouseId 형식이 UUID 가 아닙니다: " + warehouseId);
            }
        }
        return warehouseCodeMapper.resolve(warehouseCode);
    }

    /**
     * 병합 호출자가 이미 판정한 거래처 정체성을 검증한다.
     *
     * <p>병합 경로에서 {@code partnerCode}를 다시 조회하면 soft-delete 후 코드 재사용 시
     * 과거 주문을 신규 거래처 UUID로 오인할 수 있다. 따라서 이 경로는 partner-order-service가
     * 동일 UUID 여부를 판정한 값을 그대로 사용하고, 누락된 요청만 거부한다.
     *
     * @param partnerId partner-order-service가 확정한 내부 거래처 UUID
     * @return 검증된 partnerId
     * @throws BusinessException(INVALID_INPUT) UUID가 누락된 경우
     */
    private UUID requireMergePartnerId(UUID partnerId) {
        if (partnerId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "병합 전표 발행 전 거래처 정체성을 지정해야 합니다");
        }
        return partnerId;
    }

    /**
     * 주문에서 즉시 커밋되는 출고전표의 거래처 UUID를 엄격하게 해소한다.
     *
     * <p>주문 단일·병합 발행은 {@code FOUND}이면서 실제 {@code partnerId}가 있는 경우에만
     * 거래처가 확인된 것으로 간주한다. strict 설정, SERVER_ERROR(5xx·404 외 4xx) fail-open,
     * token 미설정 우회는 이 경로의 회계 무결성을 위해 적용하지 않는다.
     *
     * <p>{@code SKIPPED}(internal token 미설정)은 {@code SERVER_ERROR}와 같은 "검증 불가" 범주이지만
     * {@link ErrorCode#MIG12_INTERNAL_AUTH_MISS}(503) 로 별도 구분한다 — {@code resolveCommittedPartnerId}
     * 호출 시점에는 {@code partnerCode} 가 이미 non-blank 로 검증되어 있어({@code verifyPartnerCode} 의
     * {@code SKIPPED} 두 원인 중 이 호출 경로에서는 오직 <b>이 서비스 자신의 internal token 미설정</b>만
     * 가능하다. MIG-12 마이그레이션 도구가 동일 원인에 이미 사용 중인 전례를 재사용해 원인을 더
     * 정확히 드러낸다(운영자에게 "설정 확인 필요" 로 즉시 안내). partner-order-service 의
     * {@code SlipServiceClient} 는 5xx 를 일괄 재시도 대상으로 취급하므로 500→503 전환은 outbox
     * 재시도/종결 분류에 영향을 주지 않는다.
     *
     * @param partnerCode 발행 요청의 거래처 코드
     * @return partner-service가 확인한 거래처 UUID
     * @throws BusinessException(INVALID_INPUT) 등록되지 않은 거래처 코드(NOT_FOUND)
     * @throws BusinessException(MIG12_INTERNAL_AUTH_MISS) 이 서비스의 internal token 미설정(SKIPPED)
     * @throws BusinessException(INTERNAL_ERROR) 거래처 검증을 수행할 수 없거나 FOUND 결과에 UUID가 없는 경우
     */
    private UUID resolveCommittedPartnerId(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "커밋 전표 발행 전 거래처 코드를 지정해야 합니다");
        }
        String normalizedPartnerCode = partnerCode.trim();
        PartnerVerifyResult result = partnerInternalClient.verifyPartnerCode(normalizedPartnerCode);
        if (result == null) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "거래처 코드 '" + normalizedPartnerCode
                            + "'를 검증할 수 없어 커밋 전표를 발행할 수 없습니다");
        }
        return switch (result.status()) {
            case FOUND -> requireVerifiedPartnerId(result.partnerId(), normalizedPartnerCode);
            case NOT_FOUND -> throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "거래처 코드 '" + normalizedPartnerCode
                            + "'를 확인할 수 없어 커밋 전표를 발행할 수 없습니다");
            case SKIPPED -> throw new BusinessException(ErrorCode.MIG12_INTERNAL_AUTH_MISS,
                    "내부 인증 토큰이 설정되지 않아 거래처 코드 '" + normalizedPartnerCode
                            + "'를 검증할 수 없어 커밋 전표를 발행할 수 없습니다");
            case SERVER_ERROR -> throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "거래처 코드 '" + normalizedPartnerCode
                            + "'를 검증할 수 없어 커밋 전표를 발행할 수 없습니다");
        };
    }

    /**
     * FOUND 검증 결과에서 partnerId 를 추출한다.
     *
     * <p>{@link PartnerVerifyResult#partnerId()} 는 {@code found()} 팩토리 경유 시 항상 non-null
     * {@code Optional} 이지만, record accessor 를 직접 신뢰해 {@code .orElseThrow()} 를 곧바로 호출하면
     * 그 전제가 깨졌을 때(레코드 필드 자체가 null) {@code NullPointerException} 이 이 메서드의 계약
     * (BusinessException 만 던짐)을 깨고 새어나간다 — null 과 빈 Optional 을 동일하게 방어한다.
     *
     * @param partnerId FOUND 결과의 partnerId Optional (이론상 null 불가하나 방어적으로 재확인)
     * @param normalizedPartnerCode 예외 메시지용 정규화된 거래처 코드
     * @return 검증된 partnerId
     * @throws BusinessException(INTERNAL_ERROR) partnerId 가 null 이거나 빈 Optional 인 경우
     */
    private UUID requireVerifiedPartnerId(Optional<UUID> partnerId, String normalizedPartnerCode) {
        if (partnerId == null || partnerId.isEmpty()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "거래처 코드 '" + normalizedPartnerCode
                            + "'의 검증 결과에 거래처 식별자가 없어 커밋 전표를 발행할 수 없습니다");
        }
        return partnerId.get();
    }

    /**
     * PR-G1 backlog #1 — partnerCode strict 검증 (hybrid policy).
     *
     * <p>{@link SlipPublishProperties#isPartnerStrictValidation()} = true (default):
     * <ul>
     *   <li>partner-service {@code GET /internal/partners/{partnerCode}} 호출.</li>
     *   <li>{@link PartnerVerifyResult#isFound()} → 정상 진행.</li>
     *   <li>{@link PartnerVerifyResult#isNotFound()} → {@link BusinessException} (NOT_FOUND).</li>
     *   <li>{@code SERVER_ERROR} (5xx 또는 404 외 4xx — 401/403/408/429 등 검증 불가 포함) →
     *       fail-open + warning log (회계 critical path 보호).</li>
     *   <li>{@code SKIPPED} (partnerCode null/blank 또는 token 미설정) → 진행 (기존 호환성).</li>
     * </ul>
     *
     * <p>{@code partnerStrictValidation = false} (운영 override):
     * <ul>
     *   <li>lookup 자체 skip + warning log.</li>
     * </ul>
     *
     * @param partnerCode 발행 요청의 partnerCode (null/blank 가능)
     * @throws BusinessException(NOT_FOUND) strict on + 거래처 미등록 (404)
     */
    private UUID verifyPartnerOrThrow(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return null; // partnerCode 가 비어있으면 lookup 자체 의미 없음 (기존 호환성)
        }
        if (!publishProperties.isPartnerStrictValidation()) {
            log.warn("[strict OFF] partner verify skipped (code={}) — app.slip.partner-strict-validation=false 운영 override",
                    partnerCode);
            return null;
        }
        PartnerVerifyResult result = partnerInternalClient.verifyPartnerCode(partnerCode);
        if (result.isNotFound()) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "거래처 코드 '" + partnerCode + "' 가 partner-service 에 등록되지 않았습니다. "
                            + "거래처를 먼저 등록한 후 다시 발행하세요.");
        }
        if (result.status() == PartnerVerifyResult.Status.SERVER_ERROR) {
            log.warn("[strict ON, fail-open] partner-service 검증 불가(5xx/404 외 4xx/연결 실패) — partnerCode={} raw 저장 진행 (회계 critical path 보호)",
                    partnerCode);
        }
        // FOUND / SKIPPED → 정상 진행 (SKIPPED 는 internal token 미설정 시 — 운영 misconfig 지표)
        return result.partnerId().orElse(null);
    }

    private Optional<Slip> lookupByIdempotencyKey(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return Optional.empty();
        }
        return slipRepository.findByIdempotencyKeyAndIsDeletedFalse(idempotencyKey);
    }

    private PublishSlipResponse assertReplayOrConflict(Slip existing, String newFingerprint,
                                                       String legacyFingerprint,
                                                       boolean legacyPayloadMatches) {
        // audit 에 저장된 request_fingerprint 와 신규 요청 fingerprint 를 strict 비교.
        // 같은 알고리즘으로 만든 SHA-256 이므로 본문이 동일하면 정확히 일치.
        // legacy audit row (V9 migration 이전) 는 fingerprint 가 null 이므로 비교 skip
        // (운영 데이터 호환성 — 본 분기는 실제로는 마이그레이션 이후 발생하지 않음).
        String existingFingerprint = lookupFingerprintFromAudit(existing);
        boolean matchesCurrent = existingFingerprint != null && existingFingerprint.equals(newFingerprint);
        boolean matchesLegacy = legacyFingerprint != null
                && legacyPayloadMatches
                && existing.getDeliveryAddress() == null
                && existingFingerprint != null && existingFingerprint.equals(legacyFingerprint);
        if (existingFingerprint != null && !matchesCurrent && !matchesLegacy) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "동일 Idempotency-Key 로 다른 본문이 도착했습니다. 키를 새로 발급하세요. "
                            + "(slipNo=" + existing.getSlipNo() + ")");
        }
        log.info("[Phase 6 M5] idempotent replay → slip {} 재반환 (idem={})",
                existing.getSlipNo(), existing.getIdempotencyKey());
        return PublishSlipResponse.replay(existing);
    }

    private String lookupFingerprintFromAudit(Slip existing) {
        // audit 1행 조회 → 저장된 request_fingerprint 그대로 반환.
        // 정상 경로에서는 발행 시점에 동일 SHA-256 알고리즘으로 저장되었으므로 같은 본문 재호출 시
        // strict equals 매치. legacy null 행 방어 로직 포함.
        List<SlipPublishAudit> audits = auditRepository.findAllBySlipIdAndIsDeletedFalse(existing.getId());
        if (audits.isEmpty()) {
            return null;
        }
        return audits.get(0).getRequestFingerprint();
    }

    private PublishSlipResponse handleIdempotencyRaceCondition(String idempotencyKey,
                                                               String fingerprint,
                                                               String legacyFingerprint,
                                                               boolean legacyPayloadMatches,
                                                               DataIntegrityViolationException ex) {
        // partial UNIQUE INDEX 가 동시 INSERT 를 차단했을 가능성 — 다시 select 시도.
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            // EntityManager clear 로 영속성 컨텍스트 초기화 후 재조회 (DataIntegrityViolation 후)
            entityManager.clear();
            Optional<Slip> raceWinner = slipRepository.findByIdempotencyKeyAndIsDeletedFalse(idempotencyKey);
            if (raceWinner.isPresent()) {
                return assertReplayOrConflict(raceWinner.get(), fingerprint, legacyFingerprint,
                        legacyPayloadMatches);
            }
        }
        throw new BusinessException(ErrorCode.CONFLICT,
                "전표 동시 발행 충돌 — 잠시 후 재시도하세요. (cause=" + ex.getMostSpecificCause().getMessage() + ")");
    }

    private LocalDate parseIoDate(String ioDate) {
        if (ioDate == null || ioDate.isBlank()) {
            return LocalDate.now(clock);
        }
        try {
            return LocalDate.parse(ioDate.trim(), IO_DATE_FMT);
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "ioDate 형식 오류 (yyyyMMdd 필요): '" + ioDate + "'");
        }
    }

    private String pickRequester(String employeeCode, String headerUserId) {
        if (employeeCode != null && !employeeCode.isBlank()) {
            return employeeCode.trim();
        }
        if (headerUserId != null && !headerUserId.isBlank()) {
            return headerUserId;
        }
        return "system";
    }

    /**
     * PR-G1 V16 — memo 1000자 prepend 정책 폐기 후의 사용자 자유 입력 보존 헬퍼.
     *
     * <p>기존 {@code composeEstimateMemo / composePartnerOrderMemo} 가 배송지/검수지/연락처/결제/할인을
     * "라벨: 값" 으로 prepend 결합하여 memo 1000자 한도를 사용했다. 본 PR 부터는 각 의미 단위가
     * {@link Slip#applyEcountSchema} 로 별도 컬럼에 저장되므로 memo 는 사용자가 직접 입력한 자유
     * 텍스트만 보존. trim + 1000자 cut 만 수행.
     *
     * @param userMemo 사용자 자유 입력 (null/blank 가능)
     * @return trim 후 1000자 cut 한 문자열, 또는 null (입력이 null/blank 인 경우)
     */
    private String preserveFreeMemo(String userMemo) {
        if (userMemo == null) {
            return null;
        }
        String trimmed = userMemo.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > MEMO_MAX) {
            return trimmed.substring(0, MEMO_MAX);
        }
        return trimmed;
    }

    /**
     * partner-order 전용 memo 보존 — orderApprovedAt 은 V16 컬럼이 없으므로 자유 memo 와 prepend 결합.
     *
     * <p>partner-order DTO 의 {@code orderApprovedAt} 은 협력사 주문 승인 시각 audit 용도로 슬립
     * 본문에 표시될 필요가 있다 (회계 cross-check). e-Count BulkDatas 매핑 대상이 아니므로 별도
     * 컬럼 없이 memo 에 라벨 1줄만 prepend (다른 5 필드 prepend 폐기).
     *
     * @param userMemo 사용자 자유 입력 (null/blank 가능)
     * @param orderApprovedAt 주문 승인 시각 ISO 문자열 (null/blank 면 prepend 생략)
     * @return 결합된 memo 또는 null
     */
    private String mergePartnerOrderApprovalIntoMemo(String userMemo, String orderApprovedAt) {
        String approval = (orderApprovedAt == null || orderApprovedAt.isBlank())
                ? null : "주문 승인 시각: " + orderApprovedAt.trim();
        String free = preserveFreeMemo(userMemo);
        if (approval == null) {
            return free;
        }
        if (free == null) {
            return approval.length() > MEMO_MAX ? approval.substring(0, MEMO_MAX) : approval;
        }
        String combined = approval + "\n" + free;
        return combined.length() > MEMO_MAX ? combined.substring(0, MEMO_MAX) : combined;
    }

    /**
     * io_type 결정 — DTO 가 명시한 값을 우선, 없으면 출고 디폴트 ('10').
     *
     * @param requestedIoType DTO 의 ioType (null/blank 가능). "10"=출고, "11"=입고.
     * @return 정규화된 ioType (항상 non-null)
     */
    private String pickIoType(String requestedIoType) {
        if (requestedIoType == null || requestedIoType.isBlank()) {
            return IO_TYPE_OUTBOUND;
        }
        String trimmed = requestedIoType.trim();
        return trimmed.length() > 2 ? trimmed.substring(0, 2) : trimmed;
    }

    /**
     * time_date 결정 — DTO 가 명시한 HHmmss 우선, 없으면 발행 시점의 서버 시각으로 채움.
     *
     * @param requestedTimeDate DTO 의 timeDate (HHmmss, null/blank 가능)
     * @return HHmmss 형식 문자열 (항상 non-null)
     */
    private String pickTimeDate(String requestedTimeDate) {
        if (requestedTimeDate == null || requestedTimeDate.isBlank()) {
            return java.time.LocalTime.now().format(TIME_DATE_FMT);
        }
        return requestedTimeDate.trim();
    }

    /** legacy SIZE_DES 의 zero-width space ({@code ​}) 제거. */
    private static String normalizeSpec(String raw) {
        if (raw == null) {
            return null;
        }
        return raw.replace(ZERO_WIDTH_SPACE, "").trim();
    }

    private ResolvedLines resolveLines(List<PublishLineRequest> lines) {
        if (lines == null || lines.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "lines 가 비어있습니다");
        }
        ResolvedLines resolved = new ResolvedLines();
        for (PublishLineRequest l : lines) {
            ProductSummary summary = productClient.lookupByModel(l.productCode());
            // 견적/거래처 주문 단건/주문 병합 발행은 모두 이 resolver를 공유한다.
            // BUNDLE 부모를 평면 SlipLine 으로 만들면 구성품 계보와 가격 배분 없이
            // 부모 productId가 slip_lines에 영속되므로, 전표 라인 저장 전에 명시적으로 거부한다.
            if (BundleModePolicy.shouldExpand(summary)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "세트 품목은 판매전표 라인으로 저장할 수 없습니다. 구성품으로 전개해 주세요.");
            }
            int qty = parseQty(l.qty());
            BigDecimal unitPrice = l.unitPriceVat() != null
                    ? l.unitPriceVat().abs()
                    : (l.unitPriceExVat() != null ? l.unitPriceExVat().abs() : BigDecimal.ZERO);
            resolved.entries.add(new ResolvedLines.Entry(
                    summary.id(),
                    l.productName() != null ? l.productName() : summary.name(),
                    summary.modelName(),
                    normalizeSpec(l.spec()),
                    qty,
                    unitPrice,
                    l.unitPriceVat() != null,
                    l.remarks(),
                    l.sourceOrderLineId(),
                    l.categoryKey()));
            if (l.supplyAmount() != null) {
                resolved.totalSupplyAmount = resolved.totalSupplyAmount.add(l.supplyAmount());
            }
            if (l.vatAmount() != null) {
                resolved.totalVatAmount = resolved.totalVatAmount.add(l.vatAmount());
            }
        }
        return resolved;
    }

    private static int parseQty(String qty) {
        try {
            int n = Integer.parseInt(qty.trim());
            if (n <= 0) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "qty 는 양수여야 합니다: " + qty);
            }
            return n;
        } catch (NumberFormatException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "qty 가 정수가 아닙니다: " + qty);
        }
    }

    private String computeMergeFingerprint(PublishFromOrdersMergeRequest req) {
        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("kind", "ORDERS_MERGE");
        canonical.put("sourceOrders", req.sourceOrders().stream()
                .map(this::canonicalSourceOrder)
                .toList());
        canonical.put("ioDate", canonicalOptionalText(req.ioDate()));
        canonical.put("partnerId", req.partnerId());
        canonical.put("warehouseCode", req.warehouseCode());
        canonical.put("warehouseId", canonicalOptionalText(req.warehouseId()));
        canonical.put("partnerCode", canonicalOptionalText(req.partnerCode()));
        canonical.put("bizCode", canonicalOptionalText(req.bizCode()));
        canonical.put("partnerName", req.partnerName());
        canonical.put("shippingAddress", req.shippingAddress());
        canonical.put("deliveryAddress", req.deliveryAddress());
        canonical.put("receiverPhone", req.receiverPhone());
        canonical.put("employeeCode", canonicalOptionalText(req.employeeCode()));
        canonical.put("paymentDueLabel", req.paymentDueLabel());
        canonical.put("discountInfo", req.discountInfo());
        canonical.put("memo", canonicalOptionalText(req.memo()));
        canonical.put("lines", canonicalLines(req.lines()));
        return sha256(toJsonOrThrow(canonical));
    }

    private String computeFingerprint(PublishFromEstimateRequest req) {
        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("kind", "ESTIMATE");
        canonical.put("estimateNumber", req.estimateNumber());
        canonical.put("ioDate", req.ioDate());
        canonical.put("warehouseCode", req.warehouseCode());
        canonical.put("partnerCode", req.partnerCode());
        canonical.put("employeeCode", req.employeeCode());
        canonical.put("paymentDueLabel", req.paymentDueLabel());
        canonical.put("discountInfo", req.discountInfo());
        canonical.put("memo", req.memo());
        canonical.put("lines", req.lines().stream().map(this::legacyCanonicalLine).toList());
        return sha256(toJsonOrThrow(canonical));
    }

    private String computeFingerprint(PublishFromPartnerOrderRequest req) {
        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("kind", "PARTNER_ORDER");
        canonical.put("partnerOrderId", req.partnerOrderId());
        canonical.put("ioDate", canonicalOptionalText(req.ioDate()));
        canonical.put("warehouseCode", req.warehouseCode());
        canonical.put("warehouseId", canonicalOptionalText(req.warehouseId()));
        canonical.put("partnerCode", canonicalOptionalText(req.partnerCode()));
        canonical.put("bizCode", canonicalOptionalText(req.bizCode()));
        canonical.put("partnerName", req.partnerName());
        canonical.put("shippingAddress", req.shippingAddress());
        canonical.put("deliveryAddress", req.deliveryAddress());
        canonical.put("receiverPhone", req.receiverPhone());
        canonical.put("employeeCode", canonicalOptionalText(req.employeeCode()));
        canonical.put("paymentDueLabel", req.paymentDueLabel());
        canonical.put("discountInfo", req.discountInfo());
        canonical.put("memo", canonicalOptionalText(req.memo()));
        canonical.put("orderApprovedAt", canonicalOptionalText(req.orderApprovedAt()));
        canonical.put("lines", canonicalLines(req.lines()));
        return sha256(toJsonOrThrow(canonical));
    }

    /** 배송주소 필드가 없던 배포 전 단건 발행의 멱등 지문을 재현한다. */
    private String computeLegacyFingerprint(PublishFromPartnerOrderRequest req) {
        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("kind", "PARTNER_ORDER");
        canonical.put("partnerOrderId", req.partnerOrderId());
        canonical.put("ioDate", req.ioDate());
        canonical.put("warehouseCode", req.warehouseCode());
        canonical.put("partnerCode", req.partnerCode());
        canonical.put("employeeCode", req.employeeCode());
        canonical.put("paymentDueLabel", req.paymentDueLabel());
        canonical.put("discountInfo", req.discountInfo());
        canonical.put("memo", req.memo());
        canonical.put("lines", req.lines().stream().map(this::legacyCanonicalLine).toList());
        return sha256(toJsonOrThrow(canonical));
    }

    /** 배송주소 필드가 없던 배포 전 병합 발행의 멱등 지문을 재현한다. */
    private String computeLegacyMergeFingerprint(PublishFromOrdersMergeRequest req) {
        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("kind", "ORDERS_MERGE");
        canonical.put("sourceOrders", req.sourceOrders().stream()
                .map(SourceOrderRef::partnerOrderId).sorted().toList());
        canonical.put("ioDate", req.ioDate());
        canonical.put("partnerId", req.partnerId());
        canonical.put("warehouseCode", req.warehouseCode());
        canonical.put("partnerCode", req.partnerCode());
        canonical.put("paymentDueLabel", req.paymentDueLabel());
        canonical.put("discountInfo", req.discountInfo());
        canonical.put("memo", req.memo());
        canonical.put("lines", req.lines().stream().map(this::legacyCanonicalLine).toList());
        return sha256(toJsonOrThrow(canonical));
    }

    private Map<String, Object> canonicalLine(PublishLineRequest l) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productCode", l.productCode());
        m.put("productName", l.productName());
        m.put("qty", l.qty());
        m.put("spec", normalizeSpec(l.spec()));
        m.put("unitPrice", l.unitPriceVat() != null
                ? l.unitPriceVat().abs()
                : (l.unitPriceExVat() != null ? l.unitPriceExVat().abs() : BigDecimal.ZERO));
        m.put("supplyAmount", l.supplyAmount());
        m.put("vatAmount", l.vatAmount());
        m.put("remarks", l.remarks());
        m.put("sourceOrderLineId", l.sourceOrderLineId());
        // PR #991 — 발행 결과에 보존되는 주문 카테고리 축도 현행 지문에 포함한다.
        m.put("categoryKey", l.categoryKey());
        return m;
    }

    private List<Map<String, Object>> canonicalLines(List<PublishLineRequest> lines) {
        return lines.stream()
                .map(this::canonicalLine)
                .toList();
    }

    private Map<String, Object> legacyCanonicalLine(PublishLineRequest l) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productCode", l.productCode());
        m.put("qty", l.qty());
        m.put("spec", normalizeSpec(l.spec()));
        m.put("unitPriceVat", l.unitPriceVat());
        m.put("supplyAmount", l.supplyAmount());
        m.put("vatAmount", l.vatAmount());
        m.put("remarks", l.remarks());
        // 배포 전 발급 키에는 categoryKey 필드가 없었으므로 legacy 지문에는 넣지 않는다.
        return m;
    }

    private Map<String, Object> canonicalSourceOrder(SourceOrderRef ref) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("partnerOrderId", ref.partnerOrderId());
        m.put("orderNo", ref.orderNo());
        return m;
    }

    private static String canonicalOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    /**
     * 배포 전 지문에는 없던 값을 저장 전표와 대조한다. 이 대조가 없으면 과거 키 replay를
     * 살리기 위해 서로 다른 주소·거래처·창고가 같은 발행으로 합쳐진다.
     */
    private boolean legacyReplayMatches(Slip existing, PublishFromPartnerOrderRequest req) {
        return existing.getDeliveryAddress() == null
                && Objects.equals(existing.getPartnerName(), req.partnerName())
                && Objects.equals(existing.getShippingAddress(), req.shippingAddress())
                && Objects.equals(existing.getReceiverPhone(), req.receiverPhone())
                && warehouseMatches(existing, req.warehouseId())
                && requesterMatches(existing, req.employeeCode())
                && Objects.equals(existing.getMemo(), mergePartnerOrderApprovalIntoMemo(
                        req.memo(), req.orderApprovedAt()))
                && linesMatch(existing, req.lines());
    }

    private boolean legacyReplayMatches(Slip existing, PublishFromOrdersMergeRequest req) {
        if (existing.getDeliveryAddress() != null
                || !Objects.equals(existing.getPartnerName(), req.partnerName())
                || !Objects.equals(existing.getShippingAddress(), req.shippingAddress())
                || !Objects.equals(existing.getReceiverPhone(), req.receiverPhone())
                || !warehouseMatches(existing, req.warehouseId())
                || !requesterMatches(existing, req.employeeCode())
                || !Objects.equals(existing.getMemo(), preserveFreeMemo(req.memo()))
                || !linesMatch(existing, req.lines())) {
            return false;
        }
        List<SlipSourceOrder> stored = sourceOrderRepository.findAllBySlipId(existing.getId());
        if (stored.size() != req.sourceOrders().size()) {
            return false;
        }
        return req.sourceOrders().stream().allMatch(ref -> stored.stream().anyMatch(row ->
                Objects.equals(row.getPartnerOrderId(), UUID.fromString(ref.partnerOrderId()))
                        && Objects.equals(row.getOrderNo(), ref.orderNo())));
    }

    private boolean warehouseMatches(Slip existing, String warehouseId) {
        if (warehouseId == null || warehouseId.isBlank()) {
            return true;
        }
        return Objects.equals(existing.getSourceWarehouseId(), UUID.fromString(warehouseId.trim()));
    }

    private boolean requesterMatches(Slip existing, String employeeCode) {
        return employeeCode == null || employeeCode.isBlank()
                || Objects.equals(existing.getRequesterId(), employeeCode);
    }

    private boolean linesMatch(Slip existing, List<PublishLineRequest> requested) {
        if (existing.getLines().size() != requested.size()) {
            return false;
        }
        for (int i = 0; i < requested.size(); i++) {
            PublishLineRequest req = requested.get(i);
            SlipLine line = existing.getLines().get(i);
            BigDecimal requestedUnitPrice = req.unitPriceVat() != null
                    ? req.unitPriceVat().abs()
                    : (req.unitPriceExVat() != null ? req.unitPriceExVat().abs() : BigDecimal.ZERO);
            BigDecimal persistedUnitPrice = req.unitPriceVat() != null
                    ? line.getUnitPriceWithVat()
                    : line.getUnitPrice();
            if ((req.productName() != null && !Objects.equals(line.getProductName(), req.productName()))
                    || line.getQuantity() != Integer.parseInt(req.qty().trim())
                    || !unitPriceMatchesLegacyOrCurrent(persistedUnitPrice, requestedUnitPrice,
                            req.unitPriceVat() != null)
                    || !Objects.equals(line.getSpecification(), normalizeSpec(req.spec()))
                    || !Objects.equals(line.getNote(), req.remarks())
                    || !Objects.equals(line.getSourceOrderLineId(), req.sourceOrderLineId())) {
                return false;
            }
        }
        return true;
    }

    private boolean unitPriceMatchesLegacyOrCurrent(BigDecimal persistedUnitPrice,
                                                     BigDecimal requestedUnitPrice,
                                                     boolean vatInclusiveRequest) {
        if (persistedUnitPrice == null) {
            return false;
        }
        if (persistedUnitPrice.compareTo(requestedUnitPrice) == 0) {
            return true;
        }
        return vatInclusiveRequest
                && persistedUnitPrice.compareTo(requestedUnitPrice.multiply(new BigDecimal("1.1"))
                        .setScale(2, RoundingMode.HALF_UP)) == 0;
    }

    private String serializeDiscount(String discountInfo, String paymentDueLabel) {
        Map<String, String> m = new LinkedHashMap<>();
        if (discountInfo != null) {
            m.put("discountInfo", discountInfo);
        }
        if (paymentDueLabel != null) {
            m.put("paymentDueLabel", paymentDueLabel);
        }
        if (m.isEmpty()) {
            return null;
        }
        return toJsonOrThrow(m);
    }

    private String toJsonOrThrow(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "fingerprint JSON 직렬화 실패", ex);
        }
    }

    private static String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 not available", ex);
        }
    }

    /** 라인 매핑 결과 + 합계 누적용 내부 컨테이너. */
    private static class ResolvedLines {
        List<Entry> entries = new java.util.ArrayList<>();
        BigDecimal totalSupplyAmount = BigDecimal.ZERO;
        BigDecimal totalVatAmount = BigDecimal.ZERO;

        /**
         * SlipLine 엔티티 목록으로 변환. Phase 2.6a: sourceOrderLineId 포함 오버로드.
         */
        List<SlipLine> toEntityLines(Slip slip) {
            return entries.stream()
                    .map(e -> e.vatInclusive
                            ? SlipLine.createFromVatInclusive(slip, e.productId, e.productName, e.modelName,
                                    e.specification, e.quantity, e.unitPrice, e.note, e.sourceOrderLineId,
                                    e.categoryKey)
                            : SlipLine.create(slip, e.productId, e.productName, e.modelName,
                                    e.specification, e.quantity, e.unitPrice, e.note, e.sourceOrderLineId,
                                    e.categoryKey))
                    .toList();
        }

        record Entry(UUID productId, String productName, String modelName, String specification,
                     int quantity, BigDecimal unitPrice, boolean vatInclusive, String note,
                     UUID sourceOrderLineId,
                     String categoryKey) {
        }
    }

    // OUTBOUND 만 발행 가능 (입고전표는 본 endpoint 범위 밖) — 정적 가드용 reference.
    @SuppressWarnings("unused")
    private static final SlipType ENFORCED_TYPE = SlipType.OUTBOUND;
}
