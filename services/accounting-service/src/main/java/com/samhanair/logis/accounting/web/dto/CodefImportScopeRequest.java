package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 사용자별 은행·카드·대출 가져오기 선택 저장 요청. */
public record CodefImportScopeRequest(
        @NotBlank(message = "연결 식별자는 필수입니다")
        @Size(max = 128, message = "연결 식별자는 최대 128자입니다")
        String connectedId,

        List<@NotBlank(message = "계좌 식별값은 비어있을 수 없습니다") String> accountRefs,

        List<@NotBlank(message = "카드 식별값은 비어있을 수 없습니다") String> cardRefs,

        List<@NotBlank(message = "대출 식별값은 비어있을 수 없습니다") String> loanRefs,

        @NotNull(message = "기본 가져오기 구분은 필수입니다")
        CodefImportType defaultImportType,

        @NotNull(message = "scopeMode 는 필수입니다")
        @Pattern(regexp = "ALL|SELECTED", message = "scopeMode 는 ALL 또는 SELECTED 이어야 합니다")
        String scopeMode,

        /** 조회 당시 행 버전. null은 아직 저장된 행이 없는 첫 저장을 뜻한다. */
        @jakarta.validation.constraints.PositiveOrZero(message = "잠금값은 0 이상이어야 합니다")
        Long version
) {

    /** 잠금값 도입 전 호출자와의 소스 호환을 위한 생성자. 첫 저장으로만 해석된다. */
    public CodefImportScopeRequest(String connectedId, List<String> accountRefs, List<String> cardRefs,
                                   List<String> loanRefs, CodefImportType defaultImportType, String scopeMode) {
        this(connectedId, accountRefs, cardRefs, loanRefs, defaultImportType, scopeMode, null);
    }

    /** 선택 모드와 계좌·카드·대출 선택 목록의 모순 입력을 DTO 단계에서 차단한다. */
    @AssertTrue(message = "scopeMode 와 선택 목록이 일치하지 않습니다")
    public boolean isScopeSelectionConsistent() {
        if (scopeMode == null) {
            return true;
        }
        boolean hasSelection = hasValues(accountRefs) || hasValues(cardRefs) || hasValues(loanRefs);
        return ("ALL".equals(scopeMode) && !hasSelection)
                || ("SELECTED".equals(scopeMode) && hasSelection);
    }

    private static boolean hasValues(List<String> refs) {
        return refs != null && !refs.isEmpty();
    }
}
