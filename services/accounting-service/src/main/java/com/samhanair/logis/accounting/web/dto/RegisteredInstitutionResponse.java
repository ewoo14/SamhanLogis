package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.service.CodefConnectionService.RegisteredInstitutionView;
import java.time.LocalDateTime;

/**
 * CODEF 등록 기관 응답. 내부 UUID와 connectedId, 로그인 자격은 포함하지 않는다.
 *
 * @param businessType      업무 구분
 * @param organizationCode  기관 코드
 * @param accountIdentifier 마스킹된 계좌·카드 식별자
 * @param nickname          별칭
 * @param status            등록 상태
 * @param registeredAt      등록 시각
 * @param lastVerifiedAt    마지막 검증 시각
 * @param message           등록 안내 메시지
 */
public record RegisteredInstitutionResponse(
        String businessType,
        String organizationCode,
        String accountIdentifier,
        String nickname,
        String status,
        LocalDateTime registeredAt,
        LocalDateTime lastVerifiedAt,
        String message
) {
    public static RegisteredInstitutionResponse from(RegisteredInstitutionView view) {
        return new RegisteredInstitutionResponse(
                view.businessType().name(),
                view.organizationCode(),
                view.accountIdentifier(),
                view.nickname(),
                view.status().name(),
                view.registeredAt(),
                view.lastVerifiedAt(),
                view.message());
    }
}
