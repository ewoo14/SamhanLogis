package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.domain.SlipType;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 시리얼/배치 보상 실패 복구 화면용 응답.
 *
 * <p>{@code id} 는 resolve PATCH 대상 식별자이며 화면 표시용 식별자는 {@code slipNo} 만 사용한다.
 * 내부 전표 UUID({@code slipId}) 는 UUID 비공개 원칙에 따라 포함하지 않는다.
 *
 * @param id 보상 실패 감사 행 ID
 * @param slipNo 전표번호
 * @param slipType 전표 유형
 * @param phase 보상 실패 단계
 * @param productCode 품목 코드
 * @param attemptedOperation 실패한 보상 동작
 * @param failureReason 보상 실패 사유
 * @param originalFailureReason 원본 실패 사유
 * @param resolved 수동 정합 완료 여부
 * @param occurredAt 보상 실패 발생시각
 * @param createdAt 감사 행 저장시각
 */
public record CompensationFailureResponse(
        UUID id,
        String slipNo,
        SlipType slipType,
        CompensationPhase phase,
        String productCode,
        CompensationOperation attemptedOperation,
        String failureReason,
        String originalFailureReason,
        boolean resolved,
        LocalDateTime occurredAt,
        LocalDateTime createdAt) {

    /** entity 를 복구 API 응답으로 변환한다. */
    public static CompensationFailureResponse from(SerialCompensationFailure failure) {
        return new CompensationFailureResponse(
                failure.getId(),
                failure.getSlipNo(),
                failure.getSlipType(),
                failure.getPhase(),
                failure.getProductCode(),
                failure.getAttemptedOperation(),
                failure.getFailureReason(),
                failure.getOriginalFailureReason(),
                failure.isResolved(),
                failure.getOccurredAt(),
                failure.getCreatedAt());
    }
}
