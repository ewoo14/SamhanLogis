package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.service.CodefConnectionService.RegisteredInstitutionView;
import java.util.List;

/** CODEF 등록 기관 목록 응답. */
public record RegisteredInstitutionListResponse(
        List<RegisteredInstitutionResponse> institutions
) {
    public static RegisteredInstitutionListResponse from(List<RegisteredInstitutionView> views) {
        return new RegisteredInstitutionListResponse(views.stream()
                .map(RegisteredInstitutionResponse::from)
                .toList());
    }
}
