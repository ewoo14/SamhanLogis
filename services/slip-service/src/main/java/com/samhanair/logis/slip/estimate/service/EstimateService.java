package com.samhanair.logis.slip.estimate.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.ExpandedLineDto;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.estimate.domain.EstimateStatus;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import com.samhanair.logis.slip.estimate.repository.EstimateLineRepository;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevisionType;
import com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import com.samhanair.logis.slip.estimate.web.dto.CreateEstimateRequest;
import com.samhanair.logis.slip.estimate.web.dto.EstimateDetailResponse;
import com.samhanair.logis.slip.estimate.web.dto.EstimateResponse;
import com.samhanair.logis.slip.estimate.web.dto.UpdateEstimateRequest;
import com.samhanair.logis.slip.price.domain.PartnerProductPriceMemory;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.realtime.EstimateListRealtime;
import com.samhanair.logis.slip.service.BundleLineageResolver;
import com.samhanair.logis.slip.service.AuthoritativeAmountValidator;
import com.samhanair.logis.slip.service.LineIdContractGate;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import jakarta.persistence.OptimisticLockException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 견적서 워크플로우 — P2-1 (Stage 4) 영업 견적서 도메인.
 *
 * <p>API:
 * <ul>
 *   <li>create — DRAFT 상태로 생성, ProductClient 라인 검증, 채번</li>
 *   <li>update — DRAFT/SENT 단계만, 라인 replace</li>
 *   <li>send / accept / reject — 상태 전이</li>
 *   <li>convert — ACCEPTED → CONVERTED 전이 + EstimateToSlipConverter 호출</li>
 *   <li>list / getOne — 필터 페이지 / 단건 상세</li>
 * </ul>
 *
 * <p>도메인 mutation 의 IllegalState/OptimisticLock 은 모두 BusinessException(CONFLICT) 으로 매핑.
 */
@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class EstimateService {

    private final EstimateRepository estimateRepository;
    private final EstimateLineRepository estimateLineRepository;
    private final EstimateNumberService estimateNumberService;
    private final ProductClient productClient;
    private final EstimateToSlipConverter slipConverter;
    private final EstimateRevisionService estimateRevisionService;
    private final CollectionRealtimePublisher collectionRealtimePublisher;
    /** #809 — 거래처+품목 최근 VAT 포함 입력단가 기억. 실패해도 견적 저장은 계속된다. */
    private final PartnerProductPriceMemoryService priceMemoryService;

    @PersistenceContext
    private EntityManager entityManager;

    /**
     * 견적 라인 추가 — BUNDLE(세트) 품목이면 product-service expand 로 구성품 라인 N개로 전개(옵션 A,
     * 첫 구성품 setHead + parentSetModel), 아니면 1 라인. 단가는 요청값(setUnitOverride)을 base 로 재배분.
     *
     * @return 다음 lineNo
     */
    private int addEstimateLines(Estimate estimate, int lineNo, UUID productId, ProductSummary summary,
                                 String reqName, String reqModel, String specification, int quantity,
                                 BigDecimal unitPrice, String note, BundleSetOptions setOptions,
                                 boolean priceVatInclusive, BigDecimal supplyAmount, BigDecimal vatAmount,
                                 BigDecimal lineTotalWithVat, UUID sourceLineId, String actor,
                                 List<PartnerProductPriceMemoryCommand> priceMemoryCommands,
                                 List<PendingPlainLine> pendingPlainLines) {
        boolean authoritative = AuthoritativeAmountValidator.isComplete(
                supplyAmount, vatAmount, lineTotalWithVat);
        boolean bundle = summary != null && "BUNDLE".equals(summary.productType())
                && summary.modelCode() != null && !summary.modelCode().isBlank();
        if (bundle && authoritative) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "세트 구성품의 공급가액·부가세는 개별 편집할 수 없습니다");
        }
        if (!bundle) {
            String productName = reqName != null ? reqName : (summary != null ? summary.name() : null);
            String modelName = reqModel != null ? reqModel : (summary != null ? summary.modelName() : null);
            // 단가 부가세포함: priceVatInclusive 면 라인 단위로 공급가액/부가세 분리.
            EstimateLine line = authoritative
                    ? EstimateLine.createFromAuthoritativeAmounts(estimate, lineNo, productId, productName,
                            modelName, specification, quantity, supplyAmount, vatAmount,
                            lineTotalWithVat, note)
                    : priceVatInclusive
                    ? EstimateLine.createFromVatInclusive(estimate, lineNo, productId, productName, modelName,
                            specification, quantity, unitPrice, note)
                    : EstimateLine.create(estimate, lineNo, productId, productName, modelName,
                            specification, quantity, unitPrice, note);
            estimate.addLine(line);
            // PUT 의 기존 라인은 sourceLineId 로 계보를 복원해야 하므로, 전 라인 저장 후
            // lineId 기반 복원 결과를 반영할 수 있도록 LINE_SAVE 기억 수집과 함께 지연한다
            // — {@link #resolveLineageAndCollectPlainLineMemory}.
            pendingPlainLines.add(new PendingPlainLine(line, unitPrice, priceVatInclusive, sourceLineId,
                    authoritative));
            return lineNo + 1;
        }
        collectPriceMemory(priceMemoryCommands, estimate.getPartnerId(), productId, unitPrice,
                priceVatInclusive, PartnerProductPriceMemory.SOURCE_BUNDLE_SET, actor);
        ExpandedLineDto.Options opts = setOptions == null ? null : new ExpandedLineDto.Options(
                setOptions.remoteOption(), Boolean.TRUE.equals(setOptions.remoteExcluded()),
                setOptions.panelOption(), setOptions.panelShape360(),
                Boolean.TRUE.equals(setOptions.materialIncluded()));
        List<ExpandedLineDto> expanded = productClient.expand(
                summary.modelCode(), BigDecimal.valueOf(quantity), opts, unitPrice);
        int added = 0;
        for (ExpandedLineDto el : expanded) {
            if (el.productId() == null) {
                continue; // 구성품 product 미존재 → 영속 불가, skip
            }
            int q = el.quantity() == null ? quantity
                    : el.quantity().setScale(0, RoundingMode.HALF_UP).intValue();
            if (q <= 0) {
                q = 1;
            }
            BigDecimal compUnit = el.unitPrice() == null ? BigDecimal.ZERO : el.unitPrice();
            // #24: 구성품 규격은 GAS '규격'(el.specification) 우선, 없으면 요청 규격.
            String compSpec = el.specification() != null && !el.specification().isBlank()
                    ? el.specification() : specification;
            EstimateLine line = priceVatInclusive
                    ? EstimateLine.createFromVatInclusive(estimate, lineNo++, el.productId(),
                            el.name(), el.modelName(), compSpec, q, compUnit, note)
                    : EstimateLine.create(estimate, lineNo++, el.productId(),
                            el.name(), el.modelName(), compSpec, q, compUnit, note);
            line.assignBundleComponent(summary.modelCode(), el.setHead());
            estimate.addLine(line);
            added++;
        }
        // 구성품 일부라도 미등록(productId null)으로 skip 되면 6:4 재배분된 세트가 일부가 silent 손실되어
        // 금액 정합이 깨진다(단종 구성품이 BundleComponent 에 잔존하는 케이스). 전부/일부 모두 명시 예외.
        if (added == 0 || added < expanded.size()) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "세트 구성품 일부를 찾을 수 없습니다(미등록/단종): " + summary.modelCode());
        }
        return lineNo;
    }

    /**
     * 견적서 신규 생성 — DRAFT 상태로 출발.
     *
     * @param req 생성 요청 (라인 1건 이상 필수)
     * @param requesterId 작성자 user-id (gateway X-User-Id)
     * @param requesterName 작성자 표시명 (gateway X-User-Name, UUID 비공개 가드, 없으면 null)
     * @return 상세 응답 (lines 포함)
     * @throws BusinessException(INVALID_INPUT) productId 미존재
     */
    public EstimateDetailResponse create(CreateEstimateRequest req, String requesterId,
                                         String requesterName) {
        // 1. 라인 productId 일괄 검증 + snapshot 보강
        List<UUID> productIds = req.lines().stream()
                .map(CreateEstimateRequest.EstimateLineRequest::productId)
                .distinct()
                .toList();
        List<ProductSummary> summaries = productClient.lookup(productIds);
        Map<UUID, ProductSummary> byId = new HashMap<>();
        for (ProductSummary s : summaries) {
            byId.put(s.id(), s);
        }

        // 2. 채번
        LocalDate estimateDate = req.estimateDate() == null ? LocalDate.now() : req.estimateDate();
        String estimateNo = estimateNumberService.next(estimateDate);
        int seqNo = estimateNumberService.extractSeqNo(estimateNo);

        // 3. 헤더 생성
        Estimate estimate = Estimate.create(estimateNo, estimateDate, seqNo,
                req.partnerId(), req.partnerName(), req.partnerBusinessNo(),
                req.partnerAddress(), req.validUntil(), req.memo(), requesterId);

        // 4. 라인 추가 — BUNDLE(세트)면 product-service expand 로 구성품 라인 N개 전개(옵션 A), 아니면 1 라인.
        int lineNo = 1;
        List<PartnerProductPriceMemoryCommand> priceMemoryCommands = new java.util.ArrayList<>();
        List<PendingPlainLine> pendingPlainLines = new java.util.ArrayList<>();
        for (CreateEstimateRequest.EstimateLineRequest lineReq : req.lines()) {
            lineNo = addEstimateLines(estimate, lineNo, lineReq.productId(),
                    byId.get(lineReq.productId()), lineReq.productName(), lineReq.modelName(),
                    lineReq.specification(), lineReq.quantity(), lineReq.unitPrice(),
                    lineReq.note(), lineReq.setOptions(),
                    Boolean.TRUE.equals(lineReq.priceVatInclusive()), lineReq.supplyAmount(),
                    lineReq.vatAmount(), lineReq.lineTotalWithVat(), null, requesterId, priceMemoryCommands,
                    pendingPlainLines);
        }
        // 신규 생성은 승계할 기존 계보가 없다 — 빈 resolver 로 기억 수집만 수행.
        resolveLineageAndCollectPlainLineMemory(BundleLineageResolver.empty(), pendingPlainLines,
                estimate.getPartnerId(), requesterId, priceMemoryCommands);

        Estimate saved = estimateRepository.save(estimate);
        // 권한 재편 Phase 2.2 Task 2 — 생성 직후 CREATE 스냅샷 1건 캡처 (revision 1)
        estimateRevisionService.capture(saved, EstimateRevisionType.CREATE, null,
                parseActorId(requesterId), resolveActorName(requesterName, requesterId), null);
        priceMemoryService.rememberBatchAfterCommit(priceMemoryCommands, "estimate.create");
        publishListChanged("CREATED");
        return EstimateDetailResponse.from(saved);
    }

    /**
     * 견적서 수정 — DRAFT/SENT 단계만. lines 가 null 이 아니면 기존 라인 모두 replace.
     */
    public EstimateDetailResponse update(UUID id, UpdateEstimateRequest req, String callerId,
                                         String callerName) {
        // [D-R8-9] 계약 마커 검증은 조회·헤더 갱신보다 <b>반드시</b> 먼저다. 이 메서드는
        // validateLineIds 보다 앞서 editHeader 로 헤더를 변경하고, req.lines() == null 이면
        // validateLineIds 를 아예 호출하지 않는다 — 게이트를 라인 검증 안에 두면 구 클라이언트의
        // 헤더 변경이 이미 적용된 뒤에 거부되거나(부분 적용), 헤더 전용 수정은 게이트를 통째로
        // 우회한다. 거부는 어떤 상태 변경보다 앞서야 한다.
        requireLineIdContract(req);
        Estimate estimate = loadOrThrow(id);
        applyMutation(() -> estimate.editHeader(req.partnerId(), req.partnerName(),
                req.partnerBusinessNo(), req.partnerAddress(), req.validUntil(), req.memo()));

        if (req.lines() != null) {
            // 기존 라인 모두 제거 (orphan removal)
            estimate.requireEditable();
            List<EstimateLine> existing = List.copyOf(estimate.getLines());
            validateLineIds(existing, req.lines());
            BundleLineageResolver bundleLineage = BundleLineageResolver.fromEstimateLines(existing);
            // [R9] 기존 계보 구성품 ID를 요청과 per-line 대조한다. 빈 목록은 명시 전체삭제로 허용하고,
            // 누락 구성품과 익명 라인이 함께 있는 모호한 부분 재생성만 전표 미러와 같이 거부한다.
            LineIdContractGate.requireLineIdsForLineage(
                    bundleLineage.bundleComponentLineIds(),
                    req.lines().stream()
                            .map(UpdateEstimateRequest.EstimateLineUpdate::lineId)
                            .toList());
            for (EstimateLine line : existing) {
                estimate.removeLine(line);
            }

            // 신규 라인 productId 검증
            List<UUID> productIds = req.lines().stream()
                    .map(UpdateEstimateRequest.EstimateLineUpdate::productId)
                    .distinct()
                    .toList();
            // 빈 목록은 명시 전체삭제다. 조회할 품목이 없으므로 외부 호출 없이 정상 경로를 완결한다.
            List<ProductSummary> summaries = productIds.isEmpty()
                    ? List.of()
                    : productClient.lookup(productIds);
            Map<UUID, ProductSummary> byId = new HashMap<>();
            for (ProductSummary s : summaries) {
                byId.put(s.id(), s);
            }

            int lineNo = 1;
            List<PartnerProductPriceMemoryCommand> priceMemoryCommands = new java.util.ArrayList<>();
            List<PendingPlainLine> pendingPlainLines = new java.util.ArrayList<>();
            for (UpdateEstimateRequest.EstimateLineUpdate lineReq : req.lines()) {
                lineNo = addEstimateLines(estimate, lineNo, lineReq.productId(),
                        byId.get(lineReq.productId()), lineReq.productName(), lineReq.modelName(),
                        lineReq.specification(), lineReq.quantity(), lineReq.unitPrice(),
                        lineReq.note(), lineReq.setOptions(),
                        Boolean.TRUE.equals(lineReq.priceVatInclusive()), lineReq.supplyAmount(),
                        lineReq.vatAmount(), lineReq.lineTotalWithVat(), lineReq.lineId(), callerId,
                        priceMemoryCommands,
                        pendingPlainLines);
            }
            // 전 라인 구성 완료 후 sourceLineId 로 기존 계보를 복원하고 비구성품만 기억 수집.
            resolveLineageAndCollectPlainLineMemory(bundleLineage, pendingPlainLines,
                    estimate.getPartnerId(), callerId, priceMemoryCommands);
            priceMemoryService.rememberBatchAfterCommit(priceMemoryCommands, "estimate.update");
        }

        // 권한 재편 Phase 2.2 — 헤더/라인 변경 후 EDIT 스냅샷 캡처. 도메인 가드를 통과한 성공 경로에서만 도달한다.
        estimateRevisionService.capture(estimate, EstimateRevisionType.EDIT, null,
                parseActorId(callerId), resolveActorName(callerName, callerId), null);
        publishListChanged("UPDATED");
        return EstimateDetailResponse.from(estimate);
    }

    /** DRAFT → SENT. */
    public EstimateDetailResponse send(UUID id, String callerId) {
        Estimate estimate = loadOrThrow(id);
        applyMutation(estimate::send);
        publishListChanged("STATUS_CHANGED");
        return EstimateDetailResponse.from(estimate);
    }

    /** SENT → ACCEPTED. */
    public EstimateDetailResponse accept(UUID id, String callerId) {
        Estimate estimate = loadOrThrow(id);
        applyMutation(estimate::accept);
        publishListChanged("STATUS_CHANGED");
        return EstimateDetailResponse.from(estimate);
    }

    /** SENT → REJECTED. */
    public EstimateDetailResponse reject(UUID id, String callerId) {
        Estimate estimate = loadOrThrow(id);
        applyMutation(estimate::reject);
        publishListChanged("STATUS_CHANGED");
        return EstimateDetailResponse.from(estimate);
    }

    /**
     * 견적 → 출고전표 전환 — Slip(OUTBOUND DRAFT) 자동 발행 + estimate.markConverted(slipId).
     *
     * <p>개발책임자 정책(2026-06-09): "견적서나 주문서는 언제든지 출고전표로 전환할 수 있어야 한다."
     * 따라서 QUOTE_ACCEPTED 강제 게이트를 폐기하고 DRAFT/SENT/ACCEPTED 어느 단계에서도 전환 허용한다.
     * 이미 전환됨(QUOTE_CONVERTED)·거절됨(QUOTE_REJECTED)만 차단 — 차단 로직은
     * {@link Estimate#markConverted} 가 단일 진실원으로 보유(이중 발행/거절 후 전환 방지).
     *
     * @return 변환 후 견적 상세 (convertedSlipId / convertedAt 채워짐)
     * @throws IllegalStateException 이미 변환됐거나 거절된 견적일 때 (markConverted 가 던짐)
     */
    public EstimateDetailResponse convert(UUID id, String callerId) {
        Estimate estimate = loadOrThrow(id);
        // 언제든지 전환 허용 — 이미 전환됨/거절됨만 차단(이중 발행·거절 후 전환 방지).
        // markConverted 도 동일 가드를 보유하나, 여기서 CONFLICT 로 매핑해 409 계약을 유지한다
        // (slip-service GlobalExceptionHandler 는 IllegalStateException → 500 이므로 BE 단에서 선차단).
        if (estimate.getStatus() == EstimateStatus.QUOTE_CONVERTED) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 출고전표로 변환된 견적입니다");
        }
        if (estimate.getStatus() == EstimateStatus.QUOTE_REJECTED) {
            throw new BusinessException(ErrorCode.CONFLICT, "거절된 견적은 출고전표로 변환할 수 없습니다");
        }
        Slip slip = slipConverter.convert(estimate);
        applyMutation(() -> estimate.markConverted(slip.getId()));
        publishListChanged("STATUS_CHANGED");
        return EstimateDetailResponse.from(estimate);
    }

    /**
     * 견적을 특정 revision 시점으로 복원한다 (권한 재편 Phase 2.2 Task 3).
     *
     * <p>처리 순서: 견적 조회(404) → {@link EstimateRevisionService#restore}(편집 가능 가드 +
     * 헤더/라인 복원 + RESTORE revision 캡처) → 라인 전량 교체 영속화 → 상세 응답.
     *
     * <p>{@link com.samhanair.logis.slip.service.SlipService#restoreToRevision} 미러 —
     * 단 견적은 SSE broadcast 가 없다 (동시 편집 broker 미적용).
     *
     * @param estimateId 복원 대상 견적 UUID
     * @param revisionNo 복원할 시점의 revisionNo
     * @param callerId 복원 주체 user-id (gateway X-User-Id, 감사용)
     * @param callerName 복원 주체 표시명 (UUID 비공개 가드, 없거나 UUID 형태면 null)
     * @return 복원 후 견적 상세 (lines 포함)
     * @throws BusinessException(NOT_FOUND) 견적 또는 복원 대상 revision 미존재
     * @throws BusinessException(CONFLICT) 편집 불가 단계의 견적
     */
    public EstimateDetailResponse restoreToRevision(UUID estimateId, int revisionNo,
                                                    String callerId, String callerName) {
        Estimate estimate = loadOrThrow(estimateId);
        // [UUID 비공개 가드] X-User-Name 헤더를 우선 사용하되, 부재 시 callerId(=X-User-Id) 로
        // 폴백하면 버전이력에 계정 UUID 가 그대로 노출된다([[uuid-no-user-visibility]]).
        // 표시명이 UUID 형태이거나 헤더가 없으면 null 로 처리해 화면에 UUID 가 새어나가지 않게 한다.
        String actorName = resolveActorName(callerName, callerId);
        applyMutation(() -> estimateRevisionService.restore(estimate, revisionNo,
                parseActorId(callerId), actorName, null));
        // 라인 전량 교체(clear + 신규 라인 add) 영속화
        estimateRepository.save(estimate);
        return EstimateDetailResponse.from(estimate);
    }

    /**
     * 견적 목록 soft-delete.
     *
     * <p>CONVERTED 견적도 삭제 가능하다. 본 삭제는 출고전표 전환 결과를 되돌리는 업무 취소가 아니라
     * 목록 표시 tombstone 처리이며, {@code converted_slip_id} / 전표 원장은 건드리지 않는다.
     */
    public void delete(UUID id, String callerId, String callerName) {
        Estimate estimate = loadOrThrow(id);
        estimate.markDeletedWithName(callerOrSystem(callerId), resolveActorName(callerName, callerId));
        publishListChanged("DELETED");
    }

    /**
     * 견적 목록 soft-delete 복원.
     *
     * <p>동일 견적번호 활성행이 이미 존재하면 partial unique 위반을 사전 409 로 차단하고, 경합으로
     * {@link DataIntegrityViolationException} 이 발생해도 409 로 매핑한다.
     */
    public EstimateDetailResponse restore(UUID id) {
        Estimate estimate = estimateRepository.findByIdIncludingDeleted(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "견적서를 찾을 수 없습니다"));
        if (!Boolean.TRUE.equals(estimate.getIsDeleted())) {
            return EstimateDetailResponse.from(estimate);
        }
        if (estimateRepository.findByEstimateNo(estimate.getEstimateNo()).isPresent()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 사용 중인 견적번호로 활성 견적이 존재하여 복원할 수 없습니다: "
                            + estimate.getEstimateNo());
        }
        try {
            List<EstimateLine> allLines = estimateLineRepository
                    .findAllIncludingDeletedByEstimateId(estimate.getId());
            String deletedBy = estimate.getDeletedBy();
            if (isNonCanonicalQaResidue(estimate, allLines)) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "비정본 QA 잔재 견적은 일반 복원할 수 없습니다: " + estimate.getEstimateNo());
            }
            long deletedLineCount = allLines.stream()
                    .filter(line -> Boolean.TRUE.equals(line.getIsDeleted()))
                    .count();
            long restorableLines = allLines.stream()
                    .filter(line -> Boolean.TRUE.equals(line.getIsDeleted()))
                    .filter(line -> deletedBy != null && deletedBy.equals(line.getDeletedBy()))
                    .count();
            if (deletedLineCount != restorableLines) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "견적의 삭제 라인 그래프를 정확히 복원할 수 없습니다: " + estimate.getEstimateNo());
            }
            estimate.markRestoredWithNameCleared();
            allLines.stream()
                    .filter(line -> Boolean.TRUE.equals(line.getIsDeleted()))
                    .forEach(EstimateLine::markRestored);
            Estimate restored = estimateRepository.saveAndFlush(estimate);
            estimateLineRepository.saveAll(allLines);
            entityManager.refresh(restored);
            restored.recalculateTotals();
            estimateRepository.saveAndFlush(restored);
            publishListChanged("RESTORED");
            return EstimateDetailResponse.from(restored);
        } catch (DataIntegrityViolationException ex) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 사용 중인 견적번호로 활성 견적이 존재하여 복원할 수 없습니다: "
                            + estimate.getEstimateNo(), ex);
        }
    }

    /** 단건 조회. */
    /**
     * QA797 잔재와 이번 이슈의 테스트 시더 정리 산물을 일반 복원 경로에서 격리한다.
     * 행은 감사 판정을 위해 soft-delete 상태로 보존하며, 정본 문서에는 적용하지 않는다.
     */
    private boolean isNonCanonicalQaResidue(Estimate estimate, List<EstimateLine> lines) {
        if ("issue-1096-test-seed-cleanup".equals(estimate.getDeletedBy())) {
            return true;
        }
        return lines.stream()
                .filter(line -> Boolean.TRUE.equals(line.getIsDeleted()))
                .anyMatch(line -> startsWithQa797(line.getModelName())
                        || startsWithQa797(line.getProductName()));
    }

    private boolean startsWithQa797(String value) {
        return value != null && value.trim().toUpperCase().startsWith("QA797-");
    }

    @Transactional(readOnly = true)
    public EstimateDetailResponse getOne(UUID id) {
        return EstimateDetailResponse.from(loadOrThrow(id));
    }

    /**
     * 단건 조회 path-id 해석.
     *
     * <p>기존 상세/수정 화면은 UUID 를 전달하고, 인쇄 route 는 사용자 표시 견적번호
     * {@code yyyy/MM/dd-N} 를 URL-safe 하이픈 slug 로 전달한다. 조회 전용 endpoint 에서만
     * 두 형식을 모두 허용한다.
     */
    @Transactional(readOnly = true)
    public EstimateDetailResponse getOne(String id) {
        if (id == null || id.isBlank()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "견적서를 찾을 수 없습니다");
        }
        try {
            return getOne(UUID.fromString(id));
        } catch (IllegalArgumentException ignored) {
            String canonicalEstimateNo = toSlashDocumentNo(id);
            Estimate estimate = estimateRepository.findByEstimateNo(id)
                    .or(() -> estimateRepository.findByEstimateNo(canonicalEstimateNo))
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "견적서를 찾을 수 없습니다"));
            return EstimateDetailResponse.from(estimate);
        }
    }

    /**
     * 페이지 조회 — status / partnerId / 기간 필터.
     */
    @Transactional(readOnly = true)
    public Page<EstimateResponse> list(EstimateStatus status, UUID partnerId,
                                       LocalDate startDate, LocalDate endDate, Pageable pageable) {
        return estimateRepository.searchIncludingDeleted(
                        status == null ? null : status.name(), partnerId, startDate, endDate, pageable)
                .map(EstimateResponse::from);
    }

    /**
     * 감사용 actor UUID 파싱 (SlipService 동형). X-User-Id 가 UUID 가 아닌 legacy employeeCode 등이면
     * 가상 system UUID(0,0) 로 폴백한다 (revision actorId 컬럼은 nullable 이나 일관성 위해 비-null 유지).
     */
    private UUID parseActorId(String callerId) {
        if (callerId == null || callerId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(callerId);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }

    /**
     * 버전이력 actorName 안전 변환 — UUID 비공개 가드 ([[uuid-no-user-visibility]],
     * partner-service {@code Partner4TabController.displayNameOrNull} 패턴 미러).
     *
     * <p>header 인증 환경에서 {@code callerId} (X-User-Id) 는 계정 UUID 이다. 이를 actorName 으로
     * 저장하면 버전이력 화면에 raw UUID 가 새어나가므로:
     * <ol>
     *   <li>{@code callerName} (X-User-Name) 이 있고 UUID 형태가 아니면 그대로 사용한다.</li>
     *   <li>그 외(헤더 부재 / UUID 형태)는 {@code null} 을 반환한다 — 버전이력에 UUID 미노출.</li>
     * </ol>
     *
     * <p>{@code callerId} 폴백을 의도적으로 제거했다 — 폴백하면 다시 UUID 가 actorName 으로 들어간다.
     * {@code callerId} 는 감사용 actorId({@link #parseActorId}) 로만 별도 사용한다.
     *
     * @param callerName X-User-Name 헤더 값 (없으면 null)
     * @param callerId   X-User-Id 헤더 값 (actorId 전용 — actorName 으로는 미사용, 시그니처 명시용)
     * @return UUID 가 아닌 표시명, 또는 {@code null}
     */
    private String resolveActorName(String callerName, String callerId) {
        if (callerName == null || callerName.isBlank()) {
            return null;
        }
        try {
            UUID.fromString(callerName.trim());
            return null; // UUID → 비공개
        } catch (IllegalArgumentException notUuid) {
            return callerName;
        }
    }

    private Estimate loadOrThrow(UUID id) {
        return estimateRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "견적서를 찾을 수 없습니다"));
    }

    private String callerOrSystem(String callerId) {
        return (callerId == null || callerId.isBlank()) ? "system" : callerId.trim();
    }

    /**
     * #809 가격기억 저장 단가 정규화.
     *
     * <p>전표와 공유하는 store basis 는 VAT 포함 입력 단가다. 견적도
     * {@code priceVatInclusive=true} 경로에서 화면 입력값을 {@code unitPriceWithVat} 로 보존하므로
     * 같은 값을 저장한다. legacy 공급단가 입력은 1.1 배로 정규화한다.
     */
    /**
     * 지연된 일반(비세트전개) 라인에 요청의 sourceLineId 로 기존 세트 계보를 복원한 뒤,
     * 복원 결과 비구성품으로 남은 라인만 LINE_SAVE 기억 후보로 수집한다.
     *
     * <p>lineId 는 문서 서비스가 소유권을 검증한 기존 라인 ID이거나 신규 라인을 뜻하는
     * {@code null} 이다. 세트 전개 경로에서 직접 계보가 부여된 구성품 라인은 본 대상에
     * 포함하지 않는다.
     *
     * @param bundleLineage replace 전 캡처한 기존 라인 계보 (신규 생성은 {@code empty()})
     * @param pendingPlainLines 비세트전개 경로로 생성된 라인 + 원 요청 단가/부가세포함 여부
     * @param partnerId 거래처 UUID (null 이면 기억 수집 생략)
     * @param actor 기억 actor (audit)
     * @param priceMemoryCommands 수집 대상 command 버킷
     */
    private void resolveLineageAndCollectPlainLineMemory(
            BundleLineageResolver bundleLineage, List<PendingPlainLine> pendingPlainLines,
            UUID partnerId, String actor, List<PartnerProductPriceMemoryCommand> priceMemoryCommands) {
            bundleLineage.restoreEstimateLines(pendingPlainLines.stream()
                .map(PendingPlainLine::line)
                .toList(),
                pendingPlainLines.stream().map(PendingPlainLine::sourceLineId).toList());
        rejectAuthoritativeBundleComponents(pendingPlainLines, priceMemoryCommands);
        for (PendingPlainLine pending : pendingPlainLines) {
            if (!BundleLineageResolver.isBundleComponent(pending.line())) {
                collectPriceMemory(priceMemoryCommands, partnerId, pending.line().getProductId(),
                        pending.unitPrice(), pending.priceVatInclusive(),
                        PartnerProductPriceMemory.SOURCE_LINE_SAVE, actor);
            }
        }
    }

    /** 세트 계보를 승계한 라인에는 권위 금액 편집을 허용하지 않는다. */
    private void rejectAuthoritativeBundleComponents(
            List<PendingPlainLine> pendingPlainLines,
            List<PartnerProductPriceMemoryCommand> ignoredCommands) {
        // 권위 금액은 라인 생성 시점에만 보존되므로, 계보 승계 후 구성품인 경우를
        // PendingPlainLine 의 라인 상태에서 검사한다. 요청의 부분 전송은 팩토리 전에 이미
        // AuthoritativeAmountValidator 가 거부한다.
        for (PendingPlainLine pending : pendingPlainLines) {
            if (BundleLineageResolver.isBundleComponent(pending.line())
                    && pending.authoritative()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "세트 구성품의 공급가액·부가세는 개별 편집할 수 없습니다");
            }
        }
    }

    /**
     * 계보 복원 대기 중인 일반 라인 1건 — 복원 결과에 따라 LINE_SAVE 기억 여부가 갈리므로
     * 원 요청 단가(부가세포함 여부 포함)를 함께 보존한다.
     */
    private record PendingPlainLine(EstimateLine line, BigDecimal unitPrice, boolean priceVatInclusive,
                                    UUID sourceLineId, boolean authoritative) {
    }

    /**
     * 요청 lineId 가 현재 견적의 활성 라인인지 검증한다.
     *
     * <p>타 견적 UUID 주입은 400 INVALID_INPUT 으로 통일해 다른 문서 존재 여부를 노출하지
     * 않는다. 개별 라인의 {@code lineId == null} 은 편집 중 추가된 신규 라인을 뜻하는 정상 값이다.
     * 다만 기존 계보 구성품 ID가 누락된 요청에 신규 익명 라인이 함께 있으면 부분 재생성으로 계보가
     * 파괴될 수 있어 {@link LineIdContractGate}가 별도로 거부한다. 빈 목록은 명시 전체삭제로
     * 허용하며 fingerprint 휴리스틱 폴백은 사용하지 않는다.
     */
    private void validateLineIds(List<EstimateLine> existingLines,
                                 List<UpdateEstimateRequest.EstimateLineUpdate> requestedLines) {
        Set<UUID> ownedLineIds = existingLines.stream()
                .map(EstimateLine::getId)
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        Set<UUID> requestedLineIds = new HashSet<>();
        for (UpdateEstimateRequest.EstimateLineUpdate line : requestedLines) {
            UUID lineId = line.lineId();
            if (lineId == null) {
                continue;
            }
            if (!ownedLineIds.contains(lineId) || !requestedLineIds.add(lineId)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "lineId 는 현재 견적의 활성 라인에서 중복 없이 지정해야 합니다");
            }
        }
    }

    /**
     * [D-R8-6 · D-R8-9] 견적 수정은 lineId 계약 선언을 의무화한다 —
     * {@code SlipUpdateService.requireLineIdContract} 미러 (전표/견적 비대칭 재발 차단).
     * 판정은 공용 {@link LineIdContractGate} 단일 구현에 위임하므로 세 미러는 드리프트할 수 없다.
     *
     * <p>종전 미러는 {@code requestedLines.isEmpty()} 를 게이트 면제 조건으로 두어 <b>전표 미러와
     * 이미 비대칭</b>이었다. 마커 판정은 라인을 보지 않으므로 그 비대칭도 함께 사라진다.
     */
    private void requireLineIdContract(UpdateEstimateRequest request) {
        LineIdContractGate.require(request.lineIdContract());
    }

    private void collectPriceMemory(List<PartnerProductPriceMemoryCommand> commands,
                                    UUID partnerId, UUID productId, BigDecimal unitPrice,
                                    boolean priceVatInclusive, String source, String actor) {
        if (partnerId == null || productId == null || unitPrice == null) {
            return;
        }
        BigDecimal vatInclusiveUnitPrice = priceVatInclusive
                ? unitPrice
                : unitPrice.multiply(new BigDecimal("1.1")).setScale(2, RoundingMode.HALF_UP);
        commands.add(new PartnerProductPriceMemoryCommand(
                partnerId, productId, vatInclusiveUnitPrice, source, actor));
    }

    /** 견적 목록 변경 발화 (커밋 후). */
    private void publishListChanged(String changeType) {
        collectionRealtimePublisher.publishChange(
                EstimateListRealtime.CHANNEL_ID,
                EstimateListRealtime.EVENT_CHANGED,
                Map.of("changeType", changeType));
    }

    private static String toSlashDocumentNo(String value) {
        if (value == null || value.length() < 12) {
            return value;
        }
        if (value.matches("^\\d{4}-\\d{2}-\\d{2}-.+$")) {
            return value.substring(0, 4) + "/" + value.substring(5, 7) + "/" + value.substring(8);
        }
        return value;
    }

    private void applyMutation(Runnable mutation) {
        try {
            mutation.run();
        } catch (BusinessException ex) {
            throw ex;
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "견적서 동시 수정 충돌 — 새로고침 후 재시도하세요");
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
    }
}
