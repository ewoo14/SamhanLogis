package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.domain.StockTransfer;
import com.samhanair.logis.inventory.domain.StockTransferLine;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.repository.StockTransferRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.CreateTransferRequest;
import com.samhanair.logis.inventory.web.dto.TransferDetailResponse;
import com.samhanair.logis.inventory.web.dto.TransferResponse;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 이동전표 워크플로우 — create / approve / reject / ship / receive / confirm / cancel.
 * 상태 전이 규칙은 도메인 메서드({@link StockTransfer}) 안에서 강제. 가상창고 source/destination
 * 한쪽이라도 있으면 ship() 단계에서 IN_TRANSIT 스킵.
 */
@Service
@Transactional
@RequiredArgsConstructor
public class StockTransferService {

    private static final DateTimeFormatter NO_DATE_FMT = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    private final StockTransferRepository transferRepository;
    private final WarehouseRepository warehouseRepository;
    private final ProductClient productClient;
    private final StockService stockService;
    private final EntityManager entityManager;

    /**
     * 새 이동전표를 REQUESTED 상태로 생성한다. 라인의 productId 들을 ProductClient 로 일괄 검증 후
     * transferNo 채번(YYYY/MM/DD-N) → 헤더+라인 영속화.
     *
     * @param req source/destination warehouse, reason, lines (productId+requestedQuantity[]) 묶음
     * @param requesterId 신청자 user-id (gateway X-User-Id 또는 "system")
     * @return 생성된 이동전표 상세 응답 (라인 포함)
     * @throws BusinessException(NOT_FOUND) source/destination warehouse 가 없거나 productId 가 product-service 에 없을 때
     * @throws BusinessException(INVALID_INPUT) source 와 destination 이 동일하거나 라인 productId 미발견
     * @throws BusinessException(INTERNAL_ERROR) product-service 호출 실패
     */
    public TransferDetailResponse create(CreateTransferRequest req, String requesterId) {
        Warehouse source = loadWarehouseOrThrow(req.sourceWarehouseId());
        Warehouse destination = loadWarehouseOrThrow(req.destinationWarehouseId());
        if (source.getId().equals(destination.getId())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "출발 창고와 도착 창고가 동일할 수 없습니다");
        }

        // 라인의 productId 일괄 검증 (한 번의 batch lookup)
        var productIds = req.lines().stream()
                .map(CreateTransferRequest.TransferLineRequest::productId)
                .distinct()
                .toList();
        productClient.lookup(productIds);

        String transferNo = nextTransferNo(LocalDate.now());

        StockTransfer transfer = StockTransfer.create(
                transferNo, source, destination, req.reason(), req.reasonDetail(), requesterId);
        for (CreateTransferRequest.TransferLineRequest lineReq : req.lines()) {
            transfer.addLine(StockTransferLine.create(transfer, lineReq.productId(), lineReq.requestedQuantity()));
        }

        StockTransfer saved = transferRepository.save(transfer);
        return TransferDetailResponse.from(saved);
    }

    /**
     * 결재 승인 — REQUESTED/PENDING_APPROVAL → APPROVED. 도메인 메서드에 위임.
     *
     * @param id 이동전표 ID
     * @param approverId 승인자 user-id
     * @return 갱신된 이동전표 상세
     * @throws BusinessException(NOT_FOUND) 이동전표 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 승인 가능 단계 밖일 때
     */
    public TransferDetailResponse approve(UUID id, String approverId) {
        StockTransfer t = loadOrThrow(id);
        t.approve(approverId);
        return TransferDetailResponse.from(t);
    }

    /**
     * 결재 반려 — REQUESTED/PENDING_APPROVAL → REJECTED. reason 이 있으면 reasonDetail 갱신.
     *
     * @param id 이동전표 ID
     * @param approverId 반려자 user-id
     * @param reason 반려 사유 (null 가능)
     * @return 갱신된 이동전표 상세
     * @throws BusinessException(NOT_FOUND) 이동전표 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 반려 가능 단계 밖일 때
     */
    public TransferDetailResponse reject(UUID id, String approverId, String reason) {
        StockTransfer t = loadOrThrow(id);
        t.reject(approverId, reason);
        return TransferDetailResponse.from(t);
    }

    /**
     * 출하 — APPROVED → SHIPPED (또는 가상창고면 즉시 RECEIVED 로 점프).
     *
     * @param id 이동전표 ID
     * @return 갱신된 이동전표 상세
     * @throws BusinessException(NOT_FOUND) 이동전표 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 APPROVED 가 아닐 때
     */
    public TransferDetailResponse ship(UUID id) {
        StockTransfer t = loadOrThrow(id);
        t.ship(); // 가상창고면 RECEIVED 로 자동 점프
        return TransferDetailResponse.from(t);
    }

    /**
     * 입고 — SHIPPED/IN_TRANSIT → RECEIVED.
     *
     * @param id 이동전표 ID
     * @return 갱신된 이동전표 상세
     * @throws BusinessException(NOT_FOUND) 이동전표 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 SHIPPED/IN_TRANSIT 둘 다 아닐 때
     */
    public TransferDetailResponse receive(UUID id) {
        StockTransfer t = loadOrThrow(id);
        t.receive();
        return TransferDetailResponse.from(t);
    }

    /**
     * 입고 확정 — RECEIVED → CONFIRMED.
     *
     * @param id 이동전표 ID
     * @param approverId 확정자 user-id
     * @return 갱신된 이동전표 상세
     * @throws BusinessException(NOT_FOUND) 이동전표 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 RECEIVED 가 아닐 때
     */
    public TransferDetailResponse confirm(UUID id, String approverId) {
        StockTransfer t = loadOrThrow(id);
        stockService.transfer(t, approverId);
        t.confirm(approverId);
        return TransferDetailResponse.from(t);
    }

    /**
     * 취소 — REQUESTED/PENDING_APPROVAL/APPROVED 단계에서만 가능 → CANCELED.
     *
     * @param id 이동전표 ID
     * @param callerId 취소자 user-id
     * @return 갱신된 이동전표 상세
     * @throws BusinessException(NOT_FOUND) 이동전표 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 취소 가능 단계 밖일 때
     */
    public TransferDetailResponse cancel(UUID id, String callerId) {
        StockTransfer t = loadOrThrow(id);
        t.cancel(callerId);
        return TransferDetailResponse.from(t);
    }

    /**
     * 단건 조회 — 상세 응답.
     *
     * @param id 이동전표 ID
     * @return 라인 포함 상세 응답
     * @throws BusinessException(NOT_FOUND) 이동전표 미발견
     */
    @Transactional(readOnly = true)
    public TransferDetailResponse getOne(UUID id) {
        return TransferDetailResponse.from(loadOrThrow(id));
    }

    /**
     * 페이지 조회 — status 가 null 이면 전체, 아니면 해당 상태만.
     *
     * @param status 필터 상태 (null 가능)
     * @param pageable 페이지 정보
     * @return 요약 응답 페이지
     */
    @Transactional(readOnly = true)
    public Page<TransferResponse> list(com.samhanair.logis.inventory.domain.TransferStatus status,
                                       Pageable pageable) {
        Page<StockTransfer> page = (status == null)
                ? transferRepository.findAllByIsDeletedFalse(pageable)
                : transferRepository.findAllByStatusAndIsDeletedFalse(status, pageable);
        return page.map(TransferResponse::from);
    }

    /**
     * {@code YYYY/MM/DD-N} 채번 — 그날 prefix 의 마지막 순번에 +1.
     * 이동전표라는 메뉴/업무 타입이 이미 구분자이므로 별도 {@code T-}/{@code TR-} prefix 는 붙이지 않는다.
     *
     * <p>D-LOAD-04 fix5: 보조 sequence table 이 없는 기존 구조를 유지하되, 같은 날짜 prefix 에
     * 대해 PostgreSQL transaction advisory lock 을 잡은 뒤 max(seq)+1 을 계산한다. 번호 계산과
     * INSERT 는 {@link #create(CreateTransferRequest, String)} 의 같은 트랜잭션 안에서 완료되므로
     * 병렬 생성도 직렬 순번을 받는다. {@code ux_stock_transfers_no_active} 는 최종 백업이다.
     *
     * @param date 채번 기준 날짜
     * @return 채번된 transferNo 문자열
     */
    String nextTransferNo(LocalDate date) {
        String prefix = date.format(NO_DATE_FMT) + "-";
        lockNumberSeries("stock_transfer_seq_" + prefix);
        int seq = transferRepository.findMaxSequenceByTransferNoPrefix(prefix) + 1;
        return prefix + seq;
    }

    /**
     * PostgreSQL transaction advisory lock 으로 prefix 단위 채번 구간을 직렬화한다.
     *
     * @param key 채번 계열 lock key
     */
    private void lockNumberSeries(String key) {
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(?1) AS bigint))")
                .setParameter(1, key)
                .getSingleResult();
    }

    private StockTransfer loadOrThrow(UUID id) {
        return transferRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "이동전표를 찾을 수 없습니다"));
    }

    private Warehouse loadWarehouseOrThrow(UUID id) {
        return warehouseRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "창고를 찾을 수 없습니다"));
    }
}
