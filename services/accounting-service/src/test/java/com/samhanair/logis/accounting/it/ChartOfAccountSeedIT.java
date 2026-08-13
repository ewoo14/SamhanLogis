package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

/**
 * Flyway V1 한국 표준 계정과목 시드 검증 (Plan §3 + 메모리 project_korean_accounting.md).
 *
 * <p>50+ 행 + 7-그룹 (ASSET/LIABILITY/EQUITY/REVENUE/COST_OF_SALES/SGA/NON_OPERATING/INCOME_TAX)
 * 모두 존재 + 핵심 계정 (1019 현금, 4019 상품매출, 9719 법인세비용 등) 존재 검증.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
class ChartOfAccountSeedIT extends AbstractPostgresIT {

    @Autowired
    private ChartOfAccountRepository repository;


    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean
    private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean
    private KftcClient kftcClient;
    /** SP-D2 동적 권한 client 격리 — auth-service 호출 차단 (기본값 false = fallback 통과). */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @Test
    @DisplayName("V1 시드 — 50+ 계정 + 8 카테고리 (7-그룹 + INCOME_TAX) 모두 존재")
    void seed50PlusAndAllCategories() {
        List<ChartOfAccount> all = repository.findAll();
        assertThat(all).hasSizeGreaterThanOrEqualTo(50);

        // 8 카테고리 모두 1개 이상.
        for (AccountCategory cat : AccountCategory.values()) {
            assertThat(repository.findByCategoryOrderByCodeAsc(cat))
                    .as("카테고리 " + cat + " 가 1개 이상 시드되어야 함")
                    .isNotEmpty();
        }
    }

    @Test
    @DisplayName("핵심 leaf 계정 존재 — 1019 현금 / 1089 외상매출금 / 4019 상품매출 / 8139 통신비 / 9719 법인세비용")
    void coreLeafAccountsExist() {
        assertLeaf("1019", "현금", AccountCategory.ASSET);
        assertLeaf("1089", "외상매출금", AccountCategory.ASSET);
        assertLeaf("2519", "외상매입금", AccountCategory.LIABILITY);
        assertLeaf("3329", "보통주자본금", AccountCategory.EQUITY);
        assertLeaf("4019", "상품매출", AccountCategory.REVENUE);
        assertLeaf("5019", "재료비", AccountCategory.COST_OF_SALES);
        assertLeaf("8139", "통신비(판)", AccountCategory.SGA);
        assertLeaf("9019", "이자수익", AccountCategory.NON_OPERATING);
        assertLeaf("9719", "법인세등", AccountCategory.NON_OPERATING);
    }

    @Test
    @DisplayName("V101 root 통제 계정 — 활성 자식이 있는 root는 isLeaf=false")
    void rootAccountsAreNotLeaf() {
        List<ChartOfAccount> all = repository.findAll();
        List<String> rootCodes = all.stream()
                .filter(account -> account.getParentCode() == null)
                .filter(root -> all.stream().anyMatch(child -> root.getCode().equals(child.getParentCode())))
                .map(ChartOfAccount::getCode)
                .toList();

        assertThat(rootCodes).isNotEmpty();
        for (String rootCode : rootCodes) {
            ChartOfAccount root = repository.findById(rootCode).orElseThrow();
            assertThat(root.isLeaf()).as("root " + rootCode + " 는 통제 계정").isFalse();
            assertThat(root.getParentCode()).as("root " + rootCode + " parent null").isNull();
        }
    }

    private void assertLeaf(String code, String expectedName, AccountCategory expectedCategory) {
        ChartOfAccount a = repository.findById(code)
                .orElseThrow(() -> new AssertionError("계정 " + code + " 시드 누락"));
        assertThat(a.getName()).isEqualTo(expectedName);
        assertThat(a.getCategory()).isEqualTo(expectedCategory);
        assertThat(a.isLeaf()).as("계정 " + code + " 는 leaf").isTrue();
    }
}
