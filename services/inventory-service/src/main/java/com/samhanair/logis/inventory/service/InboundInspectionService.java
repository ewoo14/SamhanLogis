package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.client.SlipClient;
import com.samhanair.logis.inventory.client.SlipDetail;
import com.samhanair.logis.inventory.client.SlipLineDetail;
import com.samhanair.logis.inventory.domain.InboundInspection;
import com.samhanair.logis.inventory.domain.InboundInspectionLine;
import com.samhanair.logis.inventory.domain.InspectionStatus;
import com.samhanair.logis.inventory.domain.MovementType;
import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.StockLot;
import com.samhanair.logis.inventory.domain.StockMovement;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.repository.InboundInspectionLineRepository;
import com.samhanair.logis.inventory.repository.InboundInspectionRepository;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.repository.StockLotRepository;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.InboundInspectionDetailResponse;
import com.samhanair.logis.inventory.web.dto.InboundInspectionLineResult;
import com.samhanair.logis.inventory.web.dto.InboundInspectionRequest;
import com.samhanair.logis.inventory.web.dto.InboundInspectionSummaryResponse;
import jakarta.persistence.OptimisticLockException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 입고 검수 서비스 — P0-9 검수 UI 슬라이스.
 *
 * <p>검수 흐름:
 * <ol>
 *   <li>{@link #getOrCreateInspection} — 슬립 ID 로 검수 헤더 조회. 없으면 slip-service 에서
 *       슬립 정보를 가져와 검수 헤더 + 라인을 신규 생성한다 (PENDING).</li>
 *   <li>{@link #saveInspectionResult} — 검수 결과(inspectedQty, defectQty, defectReason)를
 *       라인별로 저장한다. 상태는 PENDING 유지.</li>
 *   <li>{@link #completeInspection} — 검수 완료. PENDING → COMPLETED 전이 후 정상 수량을
 *       {@link StockLot} + {@link StockBalance} 에 반영하고 INBOUND_INSPECTION movement 를 기록.</li>
 * </ol>
 *
 * <p>비즈니스 규칙:
 * <ul>
 *   <li>입고 슬립 status: SAVED / CONFIRMED / COMPLETED / PROCESSING / INSPECTING — 검수 대상.
 *       구매조회 CTA 는 업무 발견성 기준으로 SAVED / CONFIRMED 에만 노출한다.</li>
 *   <li>슬립 type 은 INBOUND 만 허용.</li>
 *   <li>정상 수량 = inspectedQty - defectQty. 불량 수량은 별도 추적 (본 슬라이스 X).</li>
 *   <li>{@link InboundInspection#stockApplied} 플래그로 중복 재고 반영 방지.</li>
 *   <li>재고 반영 창고는 슬립의 destinationWarehouseId.</li>
 * </ul>
 *
 * <p>낙관적 락 충돌 시 1회 재시도 후 CONFLICT 반환.
 */
@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class InboundInspectionService {

    /** 검수 허용 슬립 상태 집합. */
    private static final List<String> INSPECTABLE_STATUS_ORDER =
            List.of("SAVED", "CONFIRMED", "COMPLETED", "PROCESSING", "INSPECTING");
    private static final Set<String> INSPECTABLE_STATUSES = Set.copyOf(INSPECTABLE_STATUS_ORDER);
    /**
     * slip-service {@code SlipStatus.displayName} 의 로컬 사본(MSA 경계상 enum 직접 공유 불가·SlipDetail 은
     * status 를 raw 문자열로만 내려줌). ⚠️ slip-service {@code SlipStatus} 라벨 변경/추가 시 본 맵 동기화 필요.
     * 근본 해소는 SlipDetail 에 statusDisplayName 필드 추가(계약 변경·별도 후속).
     */
    private static final Map<String, String> SLIP_STATUS_DISPLAY_NAMES = Map.ofEntries(
            Map.entry("DRAFT", "작성중"),
            Map.entry("SAVED", "저장완료"),
            Map.entry("SENT", "전송완료"),
            Map.entry("ACCEPTED", "수락"),
            Map.entry("PROCESSING", "처리중"),
            Map.entry("INSPECTING", "검수중"),
            Map.entry("COMPLETED", "처리완료"),
            Map.entry("SHIPPING", "배송중"),
            Map.entry("DELIVERED", "배송완료"),
            Map.entry("CONFIRMED", "확정"),
            Map.entry("REJECTED", "반려"),
            Map.entry("CANCELED", "취소"));
    private static final String PRODUCT_TYPE_BUNDLE = "BUNDLE";

    private final InboundInspectionRepository inspectionRepository;
    private final InboundInspectionLineRepository inspectionLineRepository;
    private final StockLotRepository stockLotRepository;
    private final StockBalanceRepository stockBalanceRepository;
    private final StockMovementRepository stockMovementRepository;
    private final WarehouseRepository warehouseRepository;
    private final ProductClient productClient;
    private final SlipClient slipClient;

    // ─────────────────── 조회 ───────────────────

    /**
     * 검수 대상 입고 슬립의 검수 헤더 + 라인 상세를 반환한다.
     * 검수 레코드가 없으면 slip-service 에서 슬립 정보를 가져와 신규 생성 후 반환한다.
     * 항상 slip-service 를 호출해 거래처명 / 창고명 / 입고일 부가 정보를 포함한다.
     *
     * @param slipId slip-service Slip UUID
     * @return 검수 헤더 + 라인 상세 응답 (partnerName/destinationWarehouseName/slipDate 포함)
     * @throws BusinessException(NOT_FOUND) slip-service 에서 슬립을 찾을 수 없을 때
     * @throws BusinessException(CONFLICT)  슬립 type 이 INBOUND 가 아니거나 검수 불가 상태일 때
     */
    @Transactional
    public InboundInspectionDetailResponse getOrCreateInspection(UUID slipId) {
        SlipDetail slipDetail = slipClient.getSlip(slipId);

        InboundInspection inspection = inspectionRepository
                .findBySlipIdAndIsDeletedFalse(slipId)
                .orElseGet(() -> createInspectionFromSlipDetail(slipId, slipDetail));

        return InboundInspectionDetailResponse.from(
                inspection,
                slipDetail.partnerName(),
                slipDetail.destinationWarehouseName(),
                slipDetail.slipDate(),
                null   // inspectorName: user-service 조회는 본 슬라이스 범위 외 — null 폴백
        );
    }

    /**
     * 검수 history 페이지 조회 — status 필터 옵션.
     *
     * @param status   필터 상태 (null 이면 전체)
     * @param pageable 페이지 정보
     * @return 검수 요약 페이지
     */
    @Transactional(readOnly = true)
    public Page<InboundInspectionSummaryResponse> listInspections(
            InspectionStatus status, Pageable pageable) {
        if (status != null) {
            return inspectionRepository
                    .findAllByStatusAndIsDeletedFalse(status, pageable)
                    .map(this::toSummaryResponse);
        }
        return inspectionRepository
                .findAllByIsDeletedFalse(pageable)
                .map(this::toSummaryResponse);
    }

    // ─────────────────── 검수 결과 저장 ───────────────────

    /**
     * 검수 결과를 라인별로 일괄 저장한다 — PENDING 상태에서만 허용.
     * 상태는 PENDING 유지 (complete 는 별도 endpoint).
     *
     * @param slipId      slip-service Slip UUID
     * @param request     검수 결과 요청 (lines: lineId / inspectedQty / defectQty / defectReason)
     * @param actorUserId 검수 담당자 user-id
     * @return 갱신된 검수 상세 응답
     * @throws BusinessException(NOT_FOUND) 검수 레코드 또는 라인을 찾을 수 없을 때
     * @throws BusinessException(CONFLICT)  PENDING 이 아닌 상태에서 호출 시
     */
    @Transactional
    public InboundInspectionDetailResponse saveInspectionResult(
            UUID slipId, InboundInspectionRequest request, String actorUserId) {

        InboundInspection inspection = loadInspectionBySlipOrThrow(slipId);
        inspection.recordInspectorId(actorUserId);

        // 라인 ID → 엔티티 맵
        Map<UUID, InboundInspectionLine> lineMap = inspection.getLines().stream()
                .collect(Collectors.toMap(InboundInspectionLine::getId, Function.identity()));

        for (InboundInspectionLineResult result : request.lines()) {
            InboundInspectionLine line = lineMap.get(result.lineId());
            if (line == null) {
                throw new BusinessException(ErrorCode.NOT_FOUND,
                        "검수 라인을 찾을 수 없습니다");
            }
            line.recordResult(result.inspectedQty(), result.defectQty(), result.defectReason());
        }

        // slip 부가 정보 재조회 (partnerName / destinationWarehouseName / slipDate 포함)
        SlipDetail slipDetail = slipClient.getSlip(slipId);
        return InboundInspectionDetailResponse.from(
                inspection,
                slipDetail.partnerName(),
                slipDetail.destinationWarehouseName(),
                slipDetail.slipDate(),
                null
        );
    }

    // ─────────────────── 검수 완료 ───────────────────

    /**
     * 검수 완료 — PENDING → COMPLETED 전이 후 정상 수량을 재고에 반영한다.
     *
     * <p>재고 반영 순서:
     * <ol>
     *   <li>헤더 상태 전이 (complete)</li>
     *   <li>destinationWarehouseId 로 창고 조회</li>
     *   <li>라인별 정상 수량(normalQty) 이 1 이상이면 StockLot 생성 + StockBalance 가산 + INBOUND_INSPECTION movement 기록</li>
     *   <li>stockApplied = true 마킹</li>
     * </ol>
     *
     * @param slipId      slip-service Slip UUID
     * @param actorUserId 처리 담당자 user-id
     * @return 완료된 검수 상세 응답
     * @throws BusinessException(NOT_FOUND)  검수 레코드 또는 창고를 찾을 수 없을 때
     * @throws BusinessException(CONFLICT)   PENDING 이 아니거나 검수 미입력 라인이 있을 때,
     *                                       이미 재고 반영 완료된 경우, 낙관적 락 재시도 실패 시
     * @throws BusinessException(INVALID_INPUT) 슬립에 destinationWarehouseId 가 없을 때
     */
    @Transactional
    public InboundInspectionDetailResponse completeInspection(UUID slipId, String actorUserId) {
        InboundInspection inspection = loadInspectionBySlipOrThrow(slipId);

        if (inspection.isStockApplied()) {
            // 이미 완료 — 멱등 응답 반환
            return InboundInspectionDetailResponse.from(inspection);
        }

        // 상태 전이 (미입력 라인 있으면 BusinessException(CONFLICT))
        inspection.complete();

        // 슬립 정보에서 destinationWarehouseId 조회
        SlipDetail slipDetail = slipClient.getSlip(slipId);
        if (slipDetail.destinationWarehouseId() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "슬립에 입고 창고(destinationWarehouseId)가 지정되지 않았습니다");
        }
        Warehouse warehouse = warehouseRepository.findById(slipDetail.destinationWarehouseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "입고 창고를 찾을 수 없습니다: " + slipDetail.destinationWarehouseId()));

        // 라인별 slipLineId → SlipLineDetail 맵 (productId 조회용)
        Map<UUID, SlipLineDetail> slipLineMap = slipDetail.lines().stream()
                .collect(Collectors.toMap(SlipLineDetail::id, Function.identity()));

        // 재고 반영
        for (InboundInspectionLine line : inspection.getLines()) {
            int normalQty = line.normalQty();
            if (normalQty <= 0) {
                continue; // 정상 수량 없음 — skip
            }

            SlipLineDetail slipLine = slipLineMap.get(line.getSlipLineId());
            if (slipLine == null || slipLine.productId() == null) {
                continue; // productId 불명 — skip (운영 정책: 불명 라인은 건너뜀)
            }

            UUID productId = slipLine.productId();
            ProductSummary product = productClient.requireExists(productId);
            if (isInventoryExcluded(product)) {
                // 비상품/세트 SKU — StockService.inbound 와 동일하게 재고 생성 no-op skip.
                // 세트는 구성품(SINGLE)만 재고 대상이다.
                continue;
            }

            // StockLot 생성
            StockLot lot = stockLotRepository.save(StockLot.create(
                    productId, warehouse,
                    inspection.getSlipNo(),   // lotNo = slipNo
                    normalQty,
                    LocalDateTime.now(),
                    inboundUnitCost(slipLine)));

            // StockBalance 가산 (낙관적 락 1회 재시도)
            StockBalance balance = loadOrCreateBalance(productId, warehouse);
            applyWithRetry(() -> balance.addInbound(normalQty));

            // StockMovement 기록 (INBOUND 유형, referenceType = INBOUND_INSPECTION)
            stockMovementRepository.save(StockMovement.of(
                    lot.getId(), productId, warehouse.getId(),
                    MovementType.INBOUND, normalQty,
                    "INBOUND_INSPECTION", inspection.getId(),
                    "검수 완료 입고 — slipNo=" + inspection.getSlipNo(),
                    actorUserId));
        }

        // 재고 반영 완료 마킹
        inspection.markStockApplied();

        return InboundInspectionDetailResponse.from(
                inspection,
                slipDetail.partnerName(),
                slipDetail.destinationWarehouseName(),
                slipDetail.slipDate(),
                null
        );
    }

    // ─────────────────── 내부 유틸 ───────────────────

    /**
     * 이미 조회된 {@link SlipDetail} 로부터 검수 헤더 + 라인을 신규 생성한다.
     * 슬립 유효성 검증(INBOUND type / 검수 허용 상태)을 수행한다.
     *
     * @param slipId     slip-service Slip UUID
     * @param slipDetail 이미 조회된 슬립 상세 (중복 호출 방지)
     * @return 영속화된 InboundInspection
     * @throws BusinessException(CONFLICT) 슬립 type 이 INBOUND 가 아니거나 검수 불가 상태일 때
     */
    private InboundInspection createInspectionFromSlipDetail(UUID slipId, SlipDetail slipDetail) {
        if (!"INBOUND".equals(slipDetail.slipType())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "입고전표만 검수 가능합니다 (해당 전표는 검수 대상이 아닙니다)");
        }
        if (slipDetail.status() == null || !INSPECTABLE_STATUSES.contains(slipDetail.status())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "검수 가능한 슬립 상태가 아닙니다: 현재 " + slipStatusDisplayName(slipDetail.status())
                            + " (허용: " + inspectableStatusDisplayNames() + ")");
        }

        InboundInspection inspection = InboundInspection.create(slipId, slipDetail.slipNo());
        InboundInspection saved = inspectionRepository.save(inspection);

        for (SlipLineDetail slipLine : slipDetail.lines()) {
            InboundInspectionLine line = InboundInspectionLine.create(
                    saved,
                    slipLine.id(),
                    slipLine.modelName(),       // modelCode = modelName snapshot
                    slipLine.productName(),
                    slipLine.quantity());
            inspectionLineRepository.save(line);
            saved.addLine(line);
        }

        return saved;
    }

    private InboundInspection loadInspectionBySlipOrThrow(UUID slipId) {
        return inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "해당 슬립의 검수 레코드가 없습니다. 먼저 GET 으로 검수를 초기화하세요."));
    }

    /**
     * 입고검수 목록 행 → 요약 응답. slip snapshot(partnerName/businessNumber/slipDate)을 slipClient 로 보강.
     *
     * <p>⚠️ N+1 known issue(기존 부채): listInspections 의 페이지 행마다 {@code slipClient.getSlip()}
     * 단건 HTTP 호출. 행수 증가 시 latency — 후속에서 InboundInspection 스냅샷 컬럼 백필 또는
     * slip-service batch-detail 엔드포인트로 해소 예정. slip 조회 실패는 fail-soft(보강값 null → FE '—').
     */
    private InboundInspectionSummaryResponse toSummaryResponse(InboundInspection inspection) {
        try {
            SlipDetail slipDetail = slipClient.getSlip(inspection.getSlipId());
            return InboundInspectionSummaryResponse.from(inspection, slipDetail, null);
        } catch (BusinessException ex) {
            log.warn("입고검수 목록 slip snapshot 조회 실패 — slipNo={}, slipId={}, code={}",
                    inspection.getSlipNo(), inspection.getSlipId(), ex.getErrorCode());
            return InboundInspectionSummaryResponse.from(inspection);
        }
    }

    private StockBalance loadOrCreateBalance(UUID productId, Warehouse warehouse) {
        return stockBalanceRepository
                .findByProductIdAndWarehouse_IdAndIsDeletedFalse(productId, warehouse.getId())
                .orElseGet(() -> stockBalanceRepository.save(
                        StockBalance.create(productId, warehouse)));
    }

    private boolean isInventoryExcluded(ProductSummary product) {
        return !product.goods() || PRODUCT_TYPE_BUNDLE.equals(product.productType());
    }

    /**
     * 검수 입고 원가를 공급가액 기준으로 정규화한다.
     * 정상 라인은 supplyAmount가 unitPrice×quantity라 기존 원가가 유지되고, 권위 금액 라인은
     * 화면 입력 단가가 VAT 포함일 수 있으므로 공급가액/수량으로 VAT를 제외한다. 공급가액이
     * 없는 legacy 응답은 기존 unitPrice를 그대로 사용한다.
     */
    private BigDecimal inboundUnitCost(SlipLineDetail line) {
        if (line.supplyAmount() != null && line.quantity() > 0) {
            return line.supplyAmount()
                    .divide(BigDecimal.valueOf(line.quantity()), 2, RoundingMode.HALF_UP);
        }
        return line.unitPrice();
    }

    private static String slipStatusDisplayName(String status) {
        if (status == null) {
            return "미지정";
        }
        return SLIP_STATUS_DISPLAY_NAMES.getOrDefault(status, status);
    }

    private static String inspectableStatusDisplayNames() {
        return INSPECTABLE_STATUS_ORDER.stream()
                .map(InboundInspectionService::slipStatusDisplayName)
                .collect(Collectors.joining(", "));
    }

    /**
     * 낙관적 락 충돌 발생 시 1회 재시도. 도메인 메서드의 IllegalStateException 은 CONFLICT 로 변환.
     */
    private void applyWithRetry(Runnable mutation) {
        try {
            tryApply(mutation);
        } catch (OptimisticLockException | OptimisticLockingFailureException firstFailure) {
            try {
                tryApply(mutation);
            } catch (OptimisticLockException | OptimisticLockingFailureException secondFailure) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "재고 동시 수정 충돌 — 잠시 후 재시도하세요");
            }
        }
    }

    private void tryApply(Runnable mutation) {
        try {
            mutation.run();
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
    }
}
