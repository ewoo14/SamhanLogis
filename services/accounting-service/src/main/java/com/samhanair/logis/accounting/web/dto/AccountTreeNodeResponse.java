package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.service.AccountEcountMapping;

/**
 * 계정 트리 1노드 응답. 트리 표시는 FE 가 parentCode 로 nest. UUID 노출 X (계정 코드만).
 */
public record AccountTreeNodeResponse(
        String code,
        String name,
        AccountCategory category,
        String categoryDisplayName,
        String parentCode,
        boolean isLeaf,
        int displayOrder,
        String ecountCode,
        AccountEcountMapping.Status mappingStatus,
        String mappingLabel
) {
    public static AccountTreeNodeResponse of(ChartOfAccount account) {
        AccountEcountMapping.Mapping mapping = AccountEcountMapping.resolve(account.getCode());
        return new AccountTreeNodeResponse(
                account.getCode(),
                account.getName(),
                account.getCategory(),
                account.getCategory().getDisplayName(),
                account.getParentCode(),
                account.isLeaf(),
                account.getDisplayOrder(),
                mapping.ecountCode(),
                mapping.status(),
                mapping.displayLabel()
        );
    }
}
