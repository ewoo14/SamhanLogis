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
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevisionType;
import com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import com.samhanair.logis.slip.estimate.web.dto.CreateEstimateRequest;
import com.samhanair.logis.slip.estimate.web.dto.EstimateDetailResponse;
import com.samhanair.logis.slip.estimate.web.dto.EstimateResponse;
import com.samhanair.logis.slip.estimate.web.dto.UpdateEstimateRequest;
import jakarta.persistence.OptimisticLockException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
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
public class EstimateService {

    private final EstimateRepository estimateRepository;
    private final EstimateNumberService estimateNumberService;
    private final ProductClient productClient;
    private final EstimateToSlipConverter slipConverter;
    private final EstimateRevisionService estimateRevisionService;

    /**
     * 견적 라인 추가 — BUNDLE(세트) 품목이면 product-service expand 로 구성품 라인 N개로 전개(옵션 A,
     * 첫 구성품 setHead + parentSetModel), 아니면 1 라인. 단가는 요청값(setUnitOverride)을 base 로 재배분.
     *
     * @return 다음 lineNo
     */
    private int addEstimateLines(Estimate estimate, int lineNo, UUID productId, ProductSummary summary,
                                 String reqName, String reqModel, String specification, int quantity,
                                 BigDecimal unitPrice, String note, BundleSetOptions setOptions,
                                 boolean priceVatInclusive) {
        boolean bundle = summary != null && "BUNDLE".equals(summary.productType())
                && summary.modelCode() != null && !summary.modelCode().isBlank();
        if (!bundle) {
            String productName = reqName != null ? reqName : (summary != null ? summary.name() : null);
            String modelName = reqModel != null ? reqModel : (summary != null ? summary.modelName() : null);
            // 단가 부가세포함: priceVatInclusive 면 라인 단위로 공급가액/부가세 분리.
            estimate.addLine(priceVatInclusive
                    ? EstimateLine.createFromVatInclusive(estimate, lineNo, productId, productName, modelName,
                            specification, quantity, unitPrice, note)
                    : EstimateLine.create(estimate, lineNo, productId, productName, modelName,
                            specification, quantity, unitPrice, note));
            return lineNo + 1;
        }
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
            EstimateLine line = priceVatInclusive
                    ? EstimateLine.createFromVatInclusive(estimate, lineNo++, el.productId(),
                            el.name(), el.modelName(), specification, q, compUnit, note)
                    : EstimateLine.create(estimate, lineNo++, el.productId(),
                            el.name(), el.modelName(), specification, q, compUnit, note);
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
        for (CreateEstimateRequest.EstimateLineRequest lineReq : req.lines()) {
            lineNo = addEstimateLines(estimate, lineNo, lineReq.productId(),
                    byId.get(lineReq.productId()), lineReq.productName(), lineReq.modelName(),
                    lineReq.specification(), lineReq.quantity(), lineReq.unitPrice(),
                    lineReq.note(), lineReq.setOptions(),
                    Boolean.TRUE.equals(lineReq.priceVatInclusive()));
        }

        Estimate saved = estimateRepository.save(estimate);
        // 권한 재편 Phase 2.2 Task 2 — 생성 직후 CREATE 스냅샷 1건 캡처 (revision 1)
        estimateRevisionService.capture(saved, EstimateRevisionType.CREATE, null,
                parseActorId(requesterId), resolveActorName(requesterName, requesterId), null);
        return EstimateDetailResponse.from(saved);
    }

    /**
     * 견적서 수정 — DRAFT/SENT 단계만. lines 가 null 이 아니면 기존 라인 모두 replace.
     */
    public EstimateDetailResponse update(UUID id, UpdateEstimateRequest req, String callerId,
                                         String callerName) {
        Estimate estimate = loadOrThrow(id);
        applyMutation(() -> estimate.editHeader(req.partnerId(), req.partnerName(),
                req.partnerBusinessNo(), req.partnerAddress(), req.validUntil(), req.memo()));

        if (req.lines() != null) {
            // 기존 라인 모두 제거 (orphan removal)
            estimate.requireEditable();
            List<EstimateLine> existing = List.copyOf(estimate.getLines());
            for (EstimateLine line : existing) {
                estimate.removeLine(line);
            }

            // 신규 라인 productId 검증
            List<UUID> productIds = req.lines().stream()
                    .map(UpdateEstimateRequest.EstimateLineUpdate::productId)
                    .distinct()
                    .toList();
            List<ProductSummary> summaries = productClient.lookup(productIds);
            Map<UUID, ProductSummary> byId = new HashMap<>();
            for (ProductSummary s : summaries) {
                byId.put(s.id(), s);
            }

            int lineNo = 1;
            for (UpdateEstimateRequest.EstimateLineUpdate lineReq : req.lines()) {
                lineNo = addEstimateLines(estimate, lineNo, lineReq.productId(),
                        byId.get(lineReq.productId()), lineReq.productName(), lineReq.modelName(),
                        lineReq.specification(), lineReq.quantity(), lineReq.unitPrice(),
                        lineReq.note(), lineReq.setOptions(),
                        Boolean.TRUE.equals(lineReq.priceVatInclusive()));
            }
        }

        // 권한 재편 Phase 2.2 — 헤더/라인 변경 후 EDIT 스냅샷 캡처. 도메인 가드를 통과한 성공 경로에서만 도달한다.
        estimateRevisionService.capture(estimate, EstimateRevisionType.EDIT, null,
                parseActorId(callerId), resolveActorName(callerName, callerId), null);
        return EstimateDetailResponse.from(estimate);
    }

    /** DRAFT → SENT. */
    public EstimateDetailResponse send(UUID id, String callerId) {
        Estimate estimate = loadOrThrow(id);
        applyMutation(estimate::send);
        return EstimateDetailResponse.from(estimate);
    }

    /** SENT → ACCEPTED. */
    public EstimateDetailResponse accept(UUID id, String callerId) {
        Estimate estimate = loadOrThrow(id);
        applyMutation(estimate::accept);
        return EstimateDetailResponse.from(estimate);
    }

    /** SENT → REJECTED. */
    public EstimateDetailResponse reject(UUID id, String callerId) {
        Estimate estimate = loadOrThrow(id);
        applyMutation(estimate::reject);
        return EstimateDetailResponse.from(estimate);
    }

    /**
     * ACCEPTED → CONVERTED — Slip(OUTBOUND DRAFT) 자동 발행 + estimate.markConverted(slipId).
     *
     * @return 변환 후 견적 상세 (convertedSlipId / convertedAt 채워짐)
     * @throws BusinessException(CONFLICT) ACCEPTED 가 아닐 때
     */
    public EstimateDetailResponse convert(UUID id, String callerId) {
        Estimate estimate = loadOrThrow(id);
        if (estimate.getStatus() != EstimateStatus.QUOTE_ACCEPTED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "변환 가능한 상태가 아닙니다: " + estimate.getStatus() + " (필요: QUOTE_ACCEPTED)");
        }
        Slip slip = slipConverter.convert(estimate);
        applyMutation(() -> estimate.markConverted(slip.getId()));
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

    /** 단건 조회. */
    @Transactional(readOnly = true)
    public EstimateDetailResponse getOne(UUID id) {
        return EstimateDetailResponse.from(loadOrThrow(id));
    }

    /**
     * 페이지 조회 — status / partnerId / 기간 필터.
     */
    @Transactional(readOnly = true)
    public Page<EstimateResponse> list(EstimateStatus status, UUID partnerId,
                                       LocalDate startDate, LocalDate endDate, Pageable pageable) {
        Page<Estimate> page;
        if (status != null && partnerId != null) {
            page = estimateRepository.findAllByStatusAndPartnerIdAndIsDeletedFalse(
                    status, partnerId, pageable);
        } else if (status != null && startDate != null && endDate != null) {
            page = estimateRepository.findAllByStatusAndEstimateDateBetweenAndIsDeletedFalse(
                    status, startDate, endDate, pageable);
        } else if (status != null) {
            page = estimateRepository.findAllByStatusAndIsDeletedFalse(status, pageable);
        } else if (partnerId != null) {
            page = estimateRepository.findAllByPartnerIdAndIsDeletedFalse(partnerId, pageable);
        } else if (startDate != null && endDate != null) {
            page = estimateRepository.findAllByEstimateDateBetweenAndIsDeletedFalse(
                    startDate, endDate, pageable);
        } else {
            page = estimateRepository.findAllByIsDeletedFalse(pageable);
        }
        return page.map(EstimateResponse::from);
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
