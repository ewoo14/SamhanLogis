package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.UserCodefImportScope;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * 사용자별 은행·카드·대출 가져오기 선택 저장 응답.
 *
 * @param scopeMode 저장된 선택 범위("ALL"/"SELECTED"). 저장된 행이 아예 없으면(한 번도
 *                  저장한 적 없음) {@code null} — '전체 저장'과 '미저장'을 FE 가 재방문 시에도
 *                  구별할 수 있도록 #825 슬5 R1(H-4)에서 추가한 3-상태 필드다.
 */
public record CodefImportScopeResponse(
        String connectedId,
        List<String> accountRefs,
        List<String> cardRefs,
        List<String> loanRefs,
        CodefImportType defaultImportType,
        @JsonInclude(JsonInclude.Include.ALWAYS)
        String scopeMode
) {
    public static CodefImportScopeResponse from(UserCodefImportScope scope) {
        return new CodefImportScopeResponse(
                scope.getConnectedId(),
                scope.getAccountRefSelections(),
                scope.getCardRefSelections(),
                scope.getLoanRefSelections(),
                scope.getDefaultImportType(),
                scope.getScopeMode() == null ? null : scope.getScopeMode().name());
    }

    /** 저장된 행이 없을 때(한 번도 저장한 적 없음) 응답 — scopeMode=null 로 '미저장'을 명시한다. */
    public static CodefImportScopeResponse empty(String connectedId) {
        return new CodefImportScopeResponse(connectedId, List.of(), List.of(), List.of(), CodefImportType.ALL, null);
    }
}
