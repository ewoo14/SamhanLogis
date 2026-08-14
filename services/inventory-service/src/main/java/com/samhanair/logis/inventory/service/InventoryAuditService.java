package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.AccountingClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.AuditStatus;
import com.samhanair.logis.inventory.domain.InventoryAudit;
import com.samhanair.logis.inventory.domain.InventoryAuditLine;
import com.samhanair.logis.inventory.domain.InventoryAuditNumberSequence;
import com.samhanair.logis.inventory.domain.MovementType;
import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.StockLot;
import com.samhanair.logis.inventory.domain.StockMovement;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.repository.InventoryAuditLineRepository;
import com.samhanair.logis.inventory.repository.InventoryAuditNumberSequenceRepository;
import com.samhanair.logis.inventory.repository.InventoryAuditRepository;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.repository.StockLotRepository;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.AuditDetailResponse;
import com.samhanair.logis.inventory.realtime.service.InventoryAuditLogRecorder;
import com.samhanair.logis.inventory.realtime.service.InventoryEditRequestService;
import com.samhanair.logis.inventory.realtime.service.InventoryLockPolicies;
import com.samhanair.logis.inventory.web.dto.AuditLineRequest;
import com.samhanair.logis.inventory.web.dto.AuditResponse;
import com.samhanair.logis.inventory.web.dto.CreateAuditRequest;
import com.samhanair.logis.shared.realtime.lock.EditLockGuard;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 재고 실사 워크플로우 (Phase 10 P2-6 슬라이스 9). 한국 일반기업회계기준 연 1회 의무 실사.
 *
 * <p>라이프사이클:
 * <ol>
 *   <li>{@link #create} — PLANNED 생성 + 해당 창고 모든 product 의 expected_qty snapshot</li>
 *   <li>{@link #start} — IN_PROGRESS 전이</li>
 *   <li>{@link #recordLine} / {@link #updateLine} — 실사자 actual_qty 입력 (바코드 / 수동)</li>
 *   <li>{@link #complete} — COMPLETED 전이 + 차이 자동 분개 trigger + Stock 조정</li>
 *   <li>{@link #cancel} — CANCELLED 전이 (PLANNED/IN_PROGRESS 단계만)</li>
 * </ol>
 *
 * <p>차이 자동 분개 (한국 일반기업회계기준 코드):
 * <ul>
 *   <li>차이 (+) — 차변 1462 재고자산 / 대변 9399 재고감모손실 (환입)</li>
 *   <li>차이 (-) — 차변 9399 재고감모손실 / 대변 1462 재고자산</li>
 *   <li>차이 = 0 — 분개 생략 (no-op)</li>
 * </ul>
 *
 * <p>Stock 조정 — 라인의 actual_qty 로 stock_balance 직접 update. 차이만큼 ADJUST movement 기록.
 * Lot 단위 분배는 별도 운영 정책 (현 슬라이스 미구현 — balance 만 보정).
 *
 * <p>Phase 11 후 Kafka 이벤트 기반으로 InventoryAuditCommittedEvent publish 권고. 본 슬라이스는
 * AccountingClient Feign 동기 호출 (outbox stub fallback).
 */
@Service
@Transactional
@RequiredArgsConstructor
public class InventoryAuditService {

    private static final Logger log = LoggerFactory.getLogger(InventoryAuditService.class);
    private static final DateTimeFormatter NO_DATE_FMT = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    private final InventoryAuditRepository auditRepository;
    private final InventoryAuditNumberSequenceRepository auditNumberSequenceRepository;
    private final InventoryAuditLineRepository auditLineRepository;
    private final WarehouseRepository warehouseRepository;
    private final StockBalanceRepository stockBalanceRepository;
    private final StockLotRepository stockLotRepository;
    private final StockMovementRepository stockMovementRepository;
    private final ProductClient productClient;
    private final AccountingClient accountingClient;

    /**
     * PR-H4b (Phase 12 Step 4b) — shared:realtime-abstraction 잠금 정책 가드 + 활성 APPROVED lookup.
     * COMPLETED 단계 InventoryAudit 의 mutation 채널은 InventoryEditRequestService 통한 요청만.
     */
    private final EditLockGuard editLockGuard;
    private final InventoryEditRequestService editRequestService;
    private final InventoryAuditLogRecorder auditLogRecorder;

    /**
     * 재고 실사 신규 등록 — PLANNED 상태로 생성. 해당 창고의 모든 활성 stock_balance 를 조회하여
     * snapshot 라인을 자동 생성한다. product_name / unit_cost 는 ProductClient 일괄 조회로 채움.
     *
     * <p>해당 창고에 stock_balance row 가 없으면 빈 라인으로 생성 (이후 manual 추가 가능).
     *
     * @param req         CreateAuditRequest (warehouseId / auditDate)
     * @param requesterId 신청자 user-id (audit log)
     * @return 신규 생성된 실사 상세 (라인 snapshot 포함)
     * @throws BusinessException(NOT_FOUND) warehouseId 미발견
     */
    public AuditDetailResponse create(CreateAuditRequest req, String requesterId) {
        Warehouse warehouse = loadWarehouseOrThrow(req.warehouseId());

        // 해당 창고의 모든 활성 stock_balance snapshot
        Page<StockBalance> firstPage = stockBalanceRepository
                .findAllByWarehouse_IdAndIsDeletedFalse(warehouse.getId(), Pageable.unpaged());
        List<StockBalance> balances = firstPage.getContent();

        Map<UUID, ProductSummary> productMap = new HashMap<>();
        if (!balances.isEmpty()) {
            List<UUID> productIds = balances.stream().map(StockBalance::getProductId).distinct().toList();
            // ProductClient 가 batch 한도 100건이므로 분할 호출
            for (int from = 0; from < productIds.size(); from += 100) {
                int to = Math.min(from + 100, productIds.size());
                List<ProductSummary> chunk = productClient.lookup(productIds.subList(from, to));
                for (ProductSummary p : chunk) {
                    productMap.put(p.id(), p);
                }
            }
        }

        List<AuditLineSnapshot> snapshots = new ArrayList<>();
        for (StockBalance balance : balances) {
            ProductSummary product = productMap.get(balance.getProductId());
            if (product != null && InventoryProductGate.isExcluded(product)) {
                continue;
            }
            String name = product == null ? "(미상)" : product.name();
            BigDecimal unitCost = resolveUnitCost(balance.getProductId(), warehouse.getId(), product);
            int expected = balance.getTotalQty();
            snapshots.add(new AuditLineSnapshot(balance.getProductId(), name, expected, unitCost));
        }

        String auditNo = nextAuditNo(LocalDate.now());
        InventoryAudit audit = InventoryAudit.create(auditNo, warehouse, req.auditDate());
        for (AuditLineSnapshot snapshot : snapshots) {
            audit.addLine(InventoryAuditLine.snapshot(
                    audit, snapshot.productId(), snapshot.productName(), snapshot.expectedQty(), snapshot.unitCost()));
        }

        InventoryAudit saved = auditRepository.save(audit);
        log.info("재고 실사 생성 — auditNo={}, warehouse={}, lineCount={}, requester={}",
                saved.getAuditNo(), warehouse.getCode(), saved.getLines().size(), requesterId);
        return AuditDetailResponse.from(saved);
    }

    /**
     * 실사 시작 — PLANNED → IN_PROGRESS.
     *
     * @param id 실사 UUID
     * @return 갱신된 실사 상세
     * @throws BusinessException(NOT_FOUND) 실사 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 PLANNED 가 아닐 때
     */
    public AuditDetailResponse start(UUID id) {
        InventoryAudit audit = loadOrThrow(id);
        AuditStatus oldStatus = audit.getStatus();
        audit.start();
        // PR-H4b: status 변경 audit overlay + SSE broadcast
        recordStatusAudit(id, "status", oldStatus.name(), audit.getStatus().name());
        return AuditDetailResponse.from(audit);
    }

    /**
     * 라인 입력 (POST) — productId 로 snapshot 라인을 검색해 actual_qty set.
     * snapshot 시점에 없던 productId 는 INVALID_INPUT (snapshot 누락 보정은 별도 기능).
     *
     * @param id  실사 UUID
     * @param req AuditLineRequest (productId / actualQty / scanned)
     * @return 갱신된 실사 상세
     * @throws BusinessException(NOT_FOUND)     실사 미발견
     * @throws BusinessException(CONFLICT)      현재 상태가 IN_PROGRESS 가 아닐 때
     * @throws BusinessException(INVALID_INPUT) snapshot 라인에 해당 productId 없음
     */
    public AuditDetailResponse recordLine(UUID id, AuditLineRequest req) {
        InventoryAudit audit = loadOrThrow(id);
        audit.requireInProgressForLineInput();

        UUID productId = resolveProductId(req);

        InventoryAuditLine line = audit.getLines().stream()
                .filter(l -> l.getProductId().equals(productId))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT,
                        "snapshot 라인에 해당 제품이 없습니다"));
        line.recordActual(req.actualQty(), req.scannedOrFalse());
        return AuditDetailResponse.from(audit);
    }

    /**
     * 라인 수정 (PUT) — lineId path 직접 수정. audit-line 매핑 검증 포함.
     *
     * @param id     실사 UUID
     * @param lineId 라인 UUID
     * @param req    AuditLineRequest (productId 는 검증용으로 line.productId 와 일치 필요)
     * @return 갱신된 실사 상세
     * @throws BusinessException(NOT_FOUND)     실사 또는 라인 미발견
     * @throws BusinessException(CONFLICT)      현재 상태가 IN_PROGRESS 가 아닐 때
     * @throws BusinessException(INVALID_INPUT) productId mismatch
     */
    public AuditDetailResponse updateLine(UUID id, UUID lineId, AuditLineRequest req) {
        InventoryAudit audit = loadOrThrow(id);
        audit.requireInProgressForLineInput();

        UUID productId = resolveProductId(req);

        InventoryAuditLine line = auditLineRepository.findByIdAndAudit_Id(lineId, id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "라인을 찾을 수 없습니다"));
        if (!line.getProductId().equals(productId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "productId 불일치 — path 의 lineId 와 body 의 productId 가 다릅니다");
        }
        line.recordActual(req.actualQty(), req.scannedOrFalse());
        return AuditDetailResponse.from(audit);
    }

    private UUID resolveProductId(AuditLineRequest req) {
        if (req.productId() != null) {
            return req.productId();
        }
        if (req.productCode() != null && !req.productCode().isBlank()) {
            return productClient.requireExistsByCode(req.productCode().trim()).id();
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT, "productId 또는 productCode 는 필수입니다");
    }

    /**
     * 실사 완료 — IN_PROGRESS → COMPLETED + 차이 자동 분개 trigger + Stock 조정.
     *
     * <p>처리 순서 (단일 트랜잭션):
     * <ol>
     *   <li>도메인 {@code complete()} 호출 (totalDiffAmount 산출)</li>
     *   <li>각 라인 차이 만큼 stock_balance.adjust(diff) + ADJUST movement 기록</li>
     *   <li>totalDiffAmount != 0 이면 AccountingClient.createAuditAdjustmentJournal 동기 호출</li>
     * </ol>
     *
     * <p>actual_qty 가 null 인 라인은 차이 0 으로 간주 (입력 누락 = 시스템 재고 그대로).
     *
     * @param id          실사 UUID
     * @param actorUserId 완료 처리자 user-id
     * @return COMPLETED 실사 상세
     * @throws BusinessException(NOT_FOUND) 실사 미발견
     * @throws BusinessException(CONFLICT)  현재 상태가 IN_PROGRESS 가 아닐 때
     */
    public AuditDetailResponse complete(UUID id, String actorUserId) {
        InventoryAudit audit = loadOrThrow(id);
        AuditStatus oldStatus = audit.getStatus();
        audit.complete();
        // PR-H4b: status 변경 audit overlay + SSE broadcast
        recordStatusAudit(id, "status", oldStatus.name(), audit.getStatus().name());

        // 실제로 조정된 라인만 누적한다. 이 값이 재고 조정과 분개의 유일한 게이트다.
        BigDecimal adjustedDiffAmount = BigDecimal.ZERO;
        for (InventoryAuditLine line : audit.getLines()) {
            if (line.getActualQty() == null || line.getDiffQty() == 0) {
                continue;
            }
            adjustedDiffAmount = adjustedDiffAmount.add(adjustStockForLine(audit, line, actorUserId));
        }

        // 실제 재고 조정이 일어난 차이만 자동 분개한다.
        BigDecimal total = adjustedDiffAmount;
        if (total != null && total.signum() != 0) {
            try {
                accountingClient.createAuditAdjustmentJournal(
                        audit.getId(), audit.getAuditNo(), audit.getAuditDate(), total);
                log.info("실사 차이 자동 분개 발행 — auditNo={}, total={}",
                        audit.getAuditNo(), total);
            } catch (BusinessException ex) {
                // accounting-service 5xx fallback — outbox stub 미발행 시 본 PR 에서는 로그 + 재발행 필요 표기.
                // Phase 11 Kafka 전환 시 여기서 outbox row insert 로 대체.
                log.error("실사 차이 분개 발행 실패 (수동 재발행 필요) — auditNo={}, total={}, err={}",
                        audit.getAuditNo(), total, ex.getMessage());
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "회계 연동에 실패했습니다. 실사 완료와 재고 조정이 취소되었습니다. 잠시 후 다시 시도해 주세요.", ex);
            }
        }

        return AuditDetailResponse.from(audit);
    }

    /**
     * 실사 취소 — PLANNED 또는 IN_PROGRESS → CANCELLED. Stock 조정 / 분개는 발행 안 함.
     *
     * @param id 실사 UUID
     * @return CANCELLED 실사 상세
     * @throws BusinessException(NOT_FOUND) 실사 미발견
     * @throws BusinessException(CONFLICT)  현재 상태가 취소 가능 단계 밖일 때
     */
    public AuditDetailResponse cancel(UUID id) {
        InventoryAudit audit = loadOrThrow(id);
        // PR-H4b: 잠금 정책 가드 — COMPLETED 는 LOCKED_REQUIRES_APPROVAL, CANCELLED 는 TERMINAL
        // (도메인 cancel() 가 PLANNED/IN_PROGRESS 만 허용하므로 COMPLETED 도 자체 가드되지만
        // 본 호출로 일관 잠금 정책 적용 — APPROVED 활성 시 진행).
        boolean hasApproval = editRequestService.findActiveApproval(id).isPresent();
        editLockGuard.guardCanDelete(audit.getStatus(), InventoryLockPolicies.AUDIT_POLICY, hasApproval);
        AuditStatus oldStatus = audit.getStatus();
        audit.cancel();
        recordStatusAudit(id, "status", oldStatus.name(), audit.getStatus().name());
        return AuditDetailResponse.from(audit);
    }

    /**
     * 단건 조회 — 라인 포함 상세.
     *
     * @param id 실사 UUID
     * @return AuditDetailResponse
     * @throws BusinessException(NOT_FOUND) 실사 미발견
     */
    @Transactional(readOnly = true)
    public AuditDetailResponse getOne(UUID id) {
        return AuditDetailResponse.from(loadOrThrow(id));
    }

    /**
     * 페이지 조회 — warehouse / year / status 필터.
     *
     * @param warehouseId 창고 필터 (null 가능)
     * @param year        연도 필터 (null 가능 — 해당 연도 1/1 ~ 12/31 범위)
     * @param status      상태 필터 (null 가능)
     * @param pageable    페이지 정보
     * @return AuditResponse 요약 페이지
     */
    @Transactional(readOnly = true)
    public Page<AuditResponse> list(UUID warehouseId, Integer year, AuditStatus status,
                                    Pageable pageable) {
        // PostgreSQL 타입 추론 가드 — 모든 파라미터에 non-null sentinel 부여 (boolean flag 가
        // false 면 WHERE 절이 short-circuit). null 값은 PostgreSQL JDBC 가 SQLState 42P18 발생.
        boolean hasWarehouse = warehouseId != null;
        boolean hasStatus = status != null;
        int yearValue;
        boolean hasYear;
        if (year == null) {
            hasYear = false;
            yearValue = 1970;
        } else {
            hasYear = true;
            yearValue = year.intValue();
        }
        UUID warehouseSentinel = hasWarehouse ? warehouseId : new UUID(0L, 0L);
        LocalDate fromSentinel = LocalDate.of(yearValue, 1, 1);
        LocalDate toSentinel = LocalDate.of(yearValue, 12, 31);
        AuditStatus statusSentinel = hasStatus ? status : AuditStatus.PLANNED;
        return auditRepository.findByFilters(
                        hasWarehouse, warehouseSentinel,
                        hasYear, fromSentinel,
                        hasYear, toSentinel,
                        hasStatus, statusSentinel,
                        pageable)
                .map(AuditResponse::from);
    }

    /**
     * {@code yyyy/MM/dd-N} 채번 — 발행일별 시퀀스 row 를 배타 잠금으로 증가.
     *
     * @param date 채번 기준 날짜
     * @return 채번된 auditNo
     */
    String nextAuditNo(LocalDate date) {
        InventoryAuditNumberSequence sequence = loadOrCreateLockedSequence(date);
        return date.format(NO_DATE_FMT) + "-" + sequence.next();
    }

    private InventoryAuditNumberSequence loadOrCreateLockedSequence(LocalDate auditDate) {
        auditNumberSequenceRepository.insertIfAbsent(UUID.randomUUID(), auditDate);
        return auditNumberSequenceRepository.findLockedByAuditDate(auditDate)
                .orElseThrow(() -> new IllegalStateException("재고 실사번호 시퀀스 생성 실패"));
    }

    private BigDecimal adjustStockForLine(InventoryAudit audit, InventoryAuditLine line, String actorUserId) {
        ProductSummary product = productClient.requireExists(line.getProductId());
        if (InventoryProductGate.isExcluded(product)) {
            log.info("비상품/세트 품목 실사 조정 생략 — auditNo={}, productId={}",
                    audit.getAuditNo(), line.getProductId());
            return BigDecimal.ZERO;
        }
        StockBalance balance = stockBalanceRepository
                .findByProductIdAndWarehouse_IdAndIsDeletedFalse(
                        line.getProductId(), audit.getWarehouse().getId())
                .orElse(null);
        if (balance == null) {
            // snapshot 이후 row 가 사라진 케이스 — 이 슬라이스에서는 신규 생성하지 않고 skip + log
            log.warn("실사 완료 시 stock_balance 누락 — auditNo={}, productId={} (skip)",
                    audit.getAuditNo(), line.getProductId());
            return BigDecimal.ZERO;
        }
        try {
            balance.adjust(line.getDiffQty());
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
        stockMovementRepository.save(StockMovement.of(
                balance.getId(), line.getProductId(), audit.getWarehouse().getId(),
                MovementType.ADJUST, line.getDiffQty(),
                "AUDIT", audit.getId(),
                "재고 실사 조정 (" + audit.getAuditNo() + ")",
                actorUserId));
        return line.getDiffAmount();
    }

    /**
     * snapshot 단가 결정 — FIFO lot 의 가장 최근 unit_cost 우선, 없으면 product 의 sellingPrice 차선,
     * 둘 다 null 이면 0.
     */
    private BigDecimal resolveUnitCost(UUID productId, UUID warehouseId, ProductSummary product) {
        List<StockLot> lots = stockLotRepository.findAvailableLotsForFifo(productId, warehouseId);
        for (StockLot lot : lots) {
            if (lot.getUnitCost() != null) {
                return lot.getUnitCost();
            }
        }
        if (product != null && product.sellingPrice() != null) {
            return product.sellingPrice();
        }
        return BigDecimal.ZERO;
    }

    private InventoryAudit loadOrThrow(UUID id) {
        return auditRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "실사를 찾을 수 없습니다"));
    }

    /**
     * PR-H4b — InventoryAudit status 변경 audit overlay + SSE broadcast helper.
     *
     * <p>actor 정보는 본 서비스 시그니처가 caller user id 를 받지 않는 호환성 유지 이유로 system
     * sentinel (UUID 0/0). 호출자 (Controller) 가 명시 actor 정보를 전달하는 별도 channel 은
     * Phase 12 후속 step 에서 service 시그니처 확장 예정.
     */
    private void recordStatusAudit(UUID auditId, String fieldName, String oldValue, String newValue) {
        try {
            auditLogRecorder.recordOverlayPatch(auditId, new UUID(0L, 0L), "system", null,
                    fieldName, oldValue, newValue);
        } catch (RuntimeException ex) {
            // audit overlay 실패는 회계/도메인 로직 진행을 막지 않음 (graceful fallback)
            log.warn("[PR-H4b] audit overlay 실패 — auditId={} field={} cause={}",
                    auditId, fieldName, ex.getMessage());
        }
    }

    private Warehouse loadWarehouseOrThrow(UUID id) {
        return warehouseRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "창고를 찾을 수 없습니다"));
    }

    private record AuditLineSnapshot(UUID productId, String productName, int expectedQty, BigDecimal unitCost) {
    }
}
