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
import com.samhanair.logis.slip.repository.SlipPublishAuditRepository;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.SlipNumberService;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    private final SlipNumberService slipNumberService;
    private final ProductClient productClient;
    private final PartnerInternalClient partnerInternalClient;
    private final WarehouseCodeMapper warehouseCodeMapper;
    private final SlipPublishProperties publishProperties;
    private final ObjectMapper objectMapper;
    private final EntityManager entityManager;

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
            return assertReplayOrConflict(existing.get(), fingerprint);
        }

        // 1.5 PR-G1 backlog #1 — partnerCode strict 검증 (hybrid policy, default strict)
        verifyPartnerOrThrow(req.partnerCode());

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
        if (req.partnerCode() != null && !req.partnerCode().isBlank()) {
            slip.setPartnerCode(req.partnerCode().trim());
        }

        // 5. persist — partial UNIQUE INDEX 충돌 시 동시 race condition (정확한 원인 별도 추적)
        Slip saved;
        try {
            saved = slipRepository.saveAndFlush(slip);
        } catch (DataIntegrityViolationException ex) {
            return handleIdempotencyRaceCondition(idempotencyKey, fingerprint, ex);
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

        Optional<Slip> existing = lookupByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            return assertReplayOrConflict(existing.get(), fingerprint);
        }

        // PR-G1 backlog #1 — partnerCode strict 검증 (hybrid policy)
        verifyPartnerOrThrow(req.partnerCode());

        UUID warehouseId = warehouseCodeMapper.resolve(req.warehouseCode());
        LocalDate slipDate = parseIoDate(req.ioDate());
        // PR-G1: memo prepend 폐기 — orderApprovedAt 만 사용자 자유 입력 memo 와 결합 보존 (snapshot 컬럼 없음)
        String memo = mergePartnerOrderApprovalIntoMemo(req.memo(), req.orderApprovedAt());
        String requester = pickRequester(req.employeeCode(), requesterId);

        ResolvedLines resolved = resolveLines(req.lines());

        String slipNo = slipNumberService.next(slipDate, SlipType.OUTBOUND);
        int seqNo = slipNumberService.extractSeqNo(slipNo);
        Slip slip = Slip.createOutbound(slipNo, slipDate, seqNo,
                warehouseId, null,
                null, req.partnerName(),
                null, memo, requester);
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
        if (req.partnerCode() != null && !req.partnerCode().isBlank()) {
            slip.setPartnerCode(req.partnerCode().trim());
        }

        Slip saved;
        try {
            saved = slipRepository.saveAndFlush(slip);
        } catch (DataIntegrityViolationException ex) {
            return handleIdempotencyRaceCondition(idempotencyKey, fingerprint, ex);
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

    /** {@code GET /api/v1/slips/by-source} — sourceType + sourceId 로 슬립 목록 조회. */
    @Transactional(readOnly = true)
    public List<PublishSlipResponse> findBySource(SlipSourceType sourceType, String sourceId) {
        if (sourceType == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "sourceType 은 필수입니다");
        }
        if (sourceId == null || sourceId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "sourceId 는 필수입니다");
        }
        return slipRepository.findAllBySourceTypeAndSourceIdAndIsDeletedFalse(sourceType, sourceId)
                .stream()
                .map(PublishSlipResponse::replay)
                .toList();
    }

    // ---------- 내부 helper ----------

    /**
     * PR-G1 backlog #1 — partnerCode strict 검증 (hybrid policy).
     *
     * <p>{@link SlipPublishProperties#isPartnerStrictValidation()} = true (default):
     * <ul>
     *   <li>partner-service {@code GET /internal/partners/{partnerCode}} 호출.</li>
     *   <li>{@link PartnerVerifyResult#isFound()} → 정상 진행.</li>
     *   <li>{@link PartnerVerifyResult#isNotFound()} → {@link BusinessException} (NOT_FOUND).</li>
     *   <li>{@code SERVER_ERROR} (5xx) → fail-open + warning log (회계 critical path 보호).</li>
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
    private void verifyPartnerOrThrow(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return; // partnerCode 가 비어있으면 lookup 자체 의미 없음 (기존 호환성)
        }
        if (!publishProperties.isPartnerStrictValidation()) {
            log.warn("[strict OFF] partner verify skipped (code={}) — app.slip.partner-strict-validation=false 운영 override",
                    partnerCode);
            return;
        }
        PartnerVerifyResult result = partnerInternalClient.verifyPartnerCode(partnerCode);
        if (result.isNotFound()) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "거래처 코드 '" + partnerCode + "' 가 partner-service 에 등록되지 않았습니다. "
                            + "거래처를 먼저 등록한 후 다시 발행하세요.");
        }
        if (result.status() == PartnerVerifyResult.Status.SERVER_ERROR) {
            log.warn("[strict ON, fail-open] partner-service 5xx/연결 실패 — partnerCode={} raw 저장 진행 (회계 critical path 보호)",
                    partnerCode);
        }
        // FOUND / SKIPPED → 정상 진행 (SKIPPED 는 internal token 미설정 시 — 운영 misconfig 지표)
    }

    private Optional<Slip> lookupByIdempotencyKey(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return Optional.empty();
        }
        return slipRepository.findByIdempotencyKeyAndIsDeletedFalse(idempotencyKey);
    }

    private PublishSlipResponse assertReplayOrConflict(Slip existing, String newFingerprint) {
        // audit 에 저장된 request_fingerprint 와 신규 요청 fingerprint 를 strict 비교.
        // 같은 알고리즘으로 만든 SHA-256 이므로 본문이 동일하면 정확히 일치.
        // legacy audit row (V9 migration 이전) 는 fingerprint 가 null 이므로 비교 skip
        // (운영 데이터 호환성 — 본 분기는 실제로는 마이그레이션 이후 발생하지 않음).
        String existingFingerprint = lookupFingerprintFromAudit(existing);
        if (existingFingerprint != null && !existingFingerprint.equals(newFingerprint)) {
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
                                                               DataIntegrityViolationException ex) {
        // partial UNIQUE INDEX 가 동시 INSERT 를 차단했을 가능성 — 다시 select 시도.
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            // EntityManager clear 로 영속성 컨텍스트 초기화 후 재조회 (DataIntegrityViolation 후)
            entityManager.clear();
            Optional<Slip> raceWinner = slipRepository.findByIdempotencyKeyAndIsDeletedFalse(idempotencyKey);
            if (raceWinner.isPresent()) {
                return assertReplayOrConflict(raceWinner.get(), fingerprint);
            }
        }
        throw new BusinessException(ErrorCode.CONFLICT,
                "전표 동시 발행 충돌 — 잠시 후 재시도하세요. (cause=" + ex.getMostSpecificCause().getMessage() + ")");
    }

    private LocalDate parseIoDate(String ioDate) {
        if (ioDate == null || ioDate.isBlank()) {
            return LocalDate.now();
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
                    l.remarks(),
                    l.sourceOrderLineId()));
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
        canonical.put("lines", req.lines().stream().map(this::canonicalLine).toList());
        return sha256(toJsonOrThrow(canonical));
    }

    private String computeFingerprint(PublishFromPartnerOrderRequest req) {
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
        canonical.put("lines", req.lines().stream().map(this::canonicalLine).toList());
        return sha256(toJsonOrThrow(canonical));
    }

    private Map<String, Object> canonicalLine(PublishLineRequest l) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productCode", l.productCode());
        m.put("qty", l.qty());
        m.put("spec", normalizeSpec(l.spec()));
        m.put("unitPriceVat", l.unitPriceVat());
        m.put("supplyAmount", l.supplyAmount());
        m.put("vatAmount", l.vatAmount());
        m.put("remarks", l.remarks());
        return m;
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
                    .map(e -> SlipLine.create(slip, e.productId, e.productName, e.modelName,
                            e.specification, e.quantity, e.unitPrice, e.note, e.sourceOrderLineId))
                    .toList();
        }

        record Entry(UUID productId, String productName, String modelName, String specification,
                     int quantity, BigDecimal unitPrice, String note, UUID sourceOrderLineId) {
        }
    }

    // OUTBOUND 만 발행 가능 (입고전표는 본 endpoint 범위 밖) — 정적 가드용 reference.
    @SuppressWarnings("unused")
    private static final SlipType ENFORCED_TYPE = SlipType.OUTBOUND;
}
