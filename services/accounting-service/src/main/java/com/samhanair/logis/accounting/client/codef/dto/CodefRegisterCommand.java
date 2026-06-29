package com.samhanair.logis.accounting.client.codef.dto;

import java.util.Map;

/**
 * CODEF 기관 등록 명령.
 *
 * @param connectedId  기존 CODEF 연결 식별자. null이면 최초 생성 경로
 * @param businessType 업무 구분(BANK/CARD/LOAN)
 * @param organization CODEF 기관 코드
 * @param loginType    CODEF 로그인 방식
 * @param credentials  일회성 로그인 자격. 엔티티·로그에 저장하지 않는다.
 */
public record CodefRegisterCommand(
        String connectedId,
        String businessType,
        String organization,
        String loginType,
        Map<String, String> credentials
) {
    @Override
    public String toString() {
        return "CodefRegisterCommand[connectedId=%s, businessType=%s, organization=%s, loginType=%s, credentials=****]"
                .formatted(connectedId, businessType, organization, loginType);
    }
}
