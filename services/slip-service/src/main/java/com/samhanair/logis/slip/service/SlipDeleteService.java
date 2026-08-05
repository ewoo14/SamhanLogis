package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.SlipDeleteRequest;
import com.samhanair.logis.slip.service.dispatchgroup.DispatchGroupSlipReferenceGuard;
import jakarta.persistence.OptimisticLockException;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매입 전표 soft delete 서비스 — SP-08-5-3.
 *
 * <p>WAREHOUSE / MANAGER / MASTER 권한자가 INBOUND 전표를 즉시 삭제한다.
 * 삭제는 {@link Slip#deleteForPurchase(String)} 도메인 메서드를 통해 수행되며
 * 물리 삭제(hard delete)는 절대 허용하지 않는다.
 *
 * <p>낙관적 잠금은 {@link SlipUpdateService#verifyVersion} 과 동일하게 {@code updatedAt}
 * 마이크로초 truncation 비교 방식을 사용한다. stale {@code updatedAt} 이 전달되면
 * 409 {@link ErrorCode#SLIP_OPTIMISTIC_LOCK_CONFLICT} 를 반환한다.
 *
 * <p>검수/처리 진행 단계(INSPECTING 이후) 전표는 도메인 메서드에서
 * 422 {@link ErrorCode#SLIP_DELETE_INSPECTION_COMPLETED} 를 던진다.
 */
@Service
@RequiredArgsConstructor
public class SlipDeleteService {

    private final SlipRepository slipRepository;
    private final SlipAuditLogService auditLogService;
    private final DispatchGroupSlipReferenceGuard dispatchGroupSlipReferenceGuard;

    /**
     * 매입 전표를 soft delete 처리한다.
     *
     * <p>처리 순서:
     * <ol>
     *   <li>전표 조회 (soft-deleted 는 404)</li>
     *   <li>낙관적 잠금 {@code updatedAt} 검증 (stale → 409)</li>
     *   <li>삭제 전 스냅샷 {@code before} 캡처</li>
     *   <li>{@link Slip#deleteForPurchase(String)} 호출 — INBOUND + EDITABLE 가드 + cascade</li>
     *   <li>{@link SlipRepository#saveAndFlush} 후 audit log {@code SLIP_DELETE} 1건 기록</li>
     * </ol>
     *
     * @param slipId    삭제 대상 전표 UUID
     * @param request   삭제 요청 (updatedAt 낙관적 잠금 값)
     * @param actorId   삭제 수행자 UUID (audit 기록용)
     * @param actorName 삭제 수행자 표시명 (audit 기록용)
     * @throws BusinessException(NOT_FOUND)                       전표 미존재 또는 이미 삭제됨
     * @throws BusinessException(SLIP_OPTIMISTIC_LOCK_CONFLICT)   stale updatedAt
     * @throws BusinessException(SLIP_DELETE_NON_INBOUND)         INBOUND 아닌 전표
     * @throws BusinessException(SLIP_DELETE_INSPECTION_COMPLETED) 삭제 불가 단계
     */
    @Transactional
    public void delete(UUID slipId, SlipDeleteRequest request,
                       UUID actorId, String actorName) {
        Slip slip = load(slipId);
        verifyVersion(slip, request.updatedAt());
        slip.validateDeleteForPurchase();
        dispatchGroupSlipReferenceGuard.assertDeletable(slipId);

        String before = summarize(slip);
        try {
            slip.deleteForPurchase(actorId.toString());
            Slip saved = slipRepository.saveAndFlush(slip);
            String after = "deleted=true|deletedAt=" + saved.getDeletedAt();
            auditLogService.recordBatch(saved.getId(), actorId, actorName, null,
                    List.of(new SlipAuditLogService.ChangeEntry("SLIP_DELETE", before, after)));
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            throw optimisticLockConflict();
        }
    }

    /**
     * 전표를 ID로 조회한다. soft-deleted 전표는 404 를 반환한다.
     *
     * @param id 전표 UUID
     * @return 활성 전표 엔티티
     * @throws BusinessException(NOT_FOUND) 전표 미존재 또는 soft-deleted
     */
    private Slip load(UUID id) {
        Slip slip = slipRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "전표를 찾을 수 없습니다."));
        if (Boolean.TRUE.equals(slip.getIsDeleted())) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다.");
        }
        return slip;
    }

    /**
     * {@code updatedAt} 낙관적 잠금 검증.
     *
     * <p>PostgreSQL {@code timestamp(6)} 은 마이크로초 단위. Java {@code LocalDateTime} 도
     * 나노초를 지원하므로 양쪽을 {@link ChronoUnit#MICROS} 로 truncate 후 비교하여
     * 정밀도 불일치로 인한 오탐을 방지한다 (SP-08-5-2 {@code SlipUpdateService} 동일 방식).
     *
     * @param slip              현재 전표
     * @param requestUpdatedAt  클라이언트 전송 타임스탬프
     * @throws BusinessException(SLIP_OPTIMISTIC_LOCK_CONFLICT) updatedAt 불일치
     */
    private void verifyVersion(Slip slip, LocalDateTime requestUpdatedAt) {
        LocalDateTime current = slip.getModifiedAt() == null
                ? slip.getCreatedAt() : slip.getModifiedAt();
        if (current == null || requestUpdatedAt == null) {
            throw optimisticLockConflict();
        }
        LocalDateTime currentMicros = current.truncatedTo(ChronoUnit.MICROS);
        LocalDateTime requestMicros = requestUpdatedAt.truncatedTo(ChronoUnit.MICROS);
        if (!currentMicros.isEqual(requestMicros)) {
            throw optimisticLockConflict();
        }
    }

    /**
     * 전표 삭제 전 스냅샷 문자열 생성 — audit log before 값으로 기록한다.
     *
     * @param slip 스냅샷 대상 전표
     * @return 핵심 필드 요약 문자열
     */
    private String summarize(Slip slip) {
        return "slipNo=%s|slipType=%s|status=%s|partnerName=%s|slipDate=%s".formatted(
                slip.getSlipNo(),
                slip.getSlipType(),
                slip.getStatus(),
                slip.getPartnerName() == null ? "" : slip.getPartnerName(),
                slip.getSlipDate());
    }

    private BusinessException optimisticLockConflict() {
        return new BusinessException(
                ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT,
                ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT.getDefaultMessage());
    }
}
