package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.repository.DpsByProductPivotRow;
import com.samhanair.logis.inventory.repository.InboundInspectionLineRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.DpsByProductResponse;
import com.samhanair.logis.inventory.web.dto.DpsByProductRow;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 품목별 DPS 입고내역 pivot 분석 서비스 — P0-B GAS 보강 (legacy GAS 16번 이식).
 *
 * <p>legacy GAS 16번 (품목별 DPS 입고내역 비교) 의 상품코드 × 입고단계 pivot 을 자동화.
 * {@link InboundInspectionLineRepository#findPivotByProductAndDateRange} 를 통해
 * {@code inbound_inspections} 상태별(PENDING/COMPLETED/CANCELED) SUM 을 집계하고,
 * 응답 DTO {@link DpsByProductRow} 로 매핑하여 반환한다.
 *
 * <p>집계 규칙:
 * <ul>
 *   <li>PENDING → pendingQty (입고대기 = expected_qty 합계)</li>
 *   <li>COMPLETED → completedQty (검수완료 = inspected_qty - defect_qty 합계)</li>
 *   <li>COMPLETED → qcQty (품질검사 = defect_qty 합계)</li>
 *   <li>CANCELED → returnQty (반품 = expected_qty 합계, 응답에서 음수 변환)</li>
 *   <li>totalQty = pendingQty + completedQty + qcQty + returnQty(음수)</li>
 *   <li>diffFromDps = 0 (DPS 엑셀 연동은 Step-2 에서 확장)</li>
 * </ul>
 *
 * <p>warehouseId 필터 처리:
 * <ul>
 *   <li>warehouseId 가 null 이면 전체 창고 집계</li>
 *   <li>warehouseId 가 non-null 이면 warehouse 존재 여부 검증 후 현재 슬라이스에서 meta 로 전달
 *       (inspection 자체에 warehouse_id 없음 — MSA 경계). Step-2 에서 stock_lots JOIN 으로 확장 예정.</li>
 * </ul>
 *
 * <p>UUID 비공개 원칙 준수 — 응답에는 productCode / productName 비즈니스 식별자만 포함.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DpsByProductService {

    private final InboundInspectionLineRepository lineRepository;
    private final WarehouseRepository warehouseRepository;

    /**
     * 품목별 DPS 입고내역 pivot 분석 실행.
     *
     * <p>기간 범위 내 {@code inbound_inspections} 를 상태별로 집계하여 품목별 pivot 을 반환한다.
     * {@code fromDate} 는 해당 일 00:00:00, {@code toDate} 는 해당 일 다음 날 00:00:00 (exclusive).
     *
     * @param fromDate    조회 시작일 (포함, yyyy-MM-dd)
     * @param toDate      조회 종료일 (포함, yyyy-MM-dd)
     * @param warehouseId 창고 UUID 필터 (null 이면 전체 창고)
     * @return 품목별 pivot 분석 결과 ({@link DpsByProductResponse})
     * @throws BusinessException(INVALID_INPUT) fromDate 또는 toDate null, from &gt; to
     * @throws BusinessException(NOT_FOUND) warehouseId 지정 시 창고 미존재
     */
    public DpsByProductResponse analyze(LocalDate fromDate, LocalDate toDate, UUID warehouseId) {
        validateDateRange(fromDate, toDate);
        validateWarehouse(warehouseId);

        LocalDateTime from = fromDate.atStartOfDay();
        LocalDateTime to = toDate.plusDays(1).atTime(LocalTime.MIDNIGHT);

        List<DpsByProductPivotRow> pivotRows =
                lineRepository.findPivotByProductAndDateRange(from, to);

        List<DpsByProductRow> rows = pivotRows.stream()
                .map(DpsByProductRow::from)
                .toList();

        return DpsByProductResponse.of(rows);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 내부 헬퍼
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * 날짜 범위 유효성 검사 — null 체크 + from &le; to 검증.
     *
     * @param from 시작일
     * @param to   종료일
     * @throws BusinessException(INVALID_INPUT) null 또는 from &gt; to
     */
    private void validateDateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "조회 기간 (fromDate / toDate) 은 필수입니다");
        }
        if (from.isAfter(to)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "fromDate 는 toDate 보다 이전이어야 합니다 (from=" + from + ", to=" + to + ")");
        }
    }

    /**
     * warehouseId 지정 시 창고 존재 여부 검증.
     *
     * <p>warehouseId 가 null 이면 검증 생략 (전체 창고 집계).
     *
     * @param warehouseId 창고 UUID (null 허용)
     * @throws BusinessException(NOT_FOUND) 창고 미존재 시
     */
    private void validateWarehouse(UUID warehouseId) {
        if (warehouseId == null) {
            return;
        }
        warehouseRepository.findById(warehouseId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "창고를 찾을 수 없습니다: " + warehouseId));
    }
}
