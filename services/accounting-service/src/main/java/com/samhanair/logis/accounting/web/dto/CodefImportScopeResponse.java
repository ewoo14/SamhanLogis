package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.UserCodefImportScope;
import java.util.List;

/** 사용자별 은행·카드·대출 가져오기 선택 저장 응답. */
public record CodefImportScopeResponse(
        String connectedId,
        List<String> accountRefs,
        List<String> cardRefs,
        List<String> loanRefs,
        CodefImportType defaultImportType
) {
    public static CodefImportScopeResponse from(UserCodefImportScope scope) {
        return new CodefImportScopeResponse(
                scope.getConnectedId(),
                scope.getAccountRefSelections(),
                scope.getCardRefSelections(),
                scope.getLoanRefSelections(),
                scope.getDefaultImportType());
    }

    public static CodefImportScopeResponse empty(String connectedId) {
        return new CodefImportScopeResponse(connectedId, List.of(), List.of(), List.of(), CodefImportType.ALL);
    }
}
