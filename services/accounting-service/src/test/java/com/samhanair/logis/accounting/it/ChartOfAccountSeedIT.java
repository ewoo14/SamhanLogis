package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
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
 * 모두 존재 + 핵심 계정 (101 현금, 401 상품매출, 991 법인세비용 등) 존재 검증.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
class ChartOfAccountSeedIT extends AbstractPostgresIT {

    @Autowired
    private ChartOfAccountRepository repository;

    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean
    private ETaxClient eTaxClient;

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
    @DisplayName("핵심 leaf 계정 존재 — 101 현금 / 110 외상매출금 / 401 상품매출 / 814 통신비 / 991 법인세비용")
    void coreLeafAccountsExist() {
        assertLeaf("101", "현금", AccountCategory.ASSET);
        assertLeaf("110", "외상매출금", AccountCategory.ASSET);
        assertLeaf("201", "외상매입금", AccountCategory.LIABILITY);
        assertLeaf("301", "자본금", AccountCategory.EQUITY);
        assertLeaf("401", "상품매출", AccountCategory.REVENUE);
        assertLeaf("501", "상품매출원가", AccountCategory.COST_OF_SALES);
        assertLeaf("814", "통신비", AccountCategory.SGA);
        assertLeaf("901", "이자수익", AccountCategory.NON_OPERATING);
        assertLeaf("991", "법인세비용", AccountCategory.INCOME_TAX);
    }

    @Test
    @DisplayName("Root 통제 계정 — 100/200/300/400/500/800/900 isLeaf=false")
    void rootAccountsAreNotLeaf() {
        for (String rootCode : List.of("100", "200", "300", "400", "500", "800", "900")) {
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
