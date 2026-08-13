package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.repository.JournalRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * P0-1 Slice A — 손익계산서 / 재무상태표 보고서 검증용 seed 분개 7건 정합성 IT.
 *
 * <p>검증 목적:
 * <ul>
 *   <li>V6 Flyway seed (2026/01/15-1 ~ 2026/12/31-1) 7건이 DB 에 POSTED 상태로 적재됨</li>
 *   <li>각 분개의 복식부기 균형 (sum debit = sum credit) 통과</li>
 *   <li>보고서 집계 대상 계정코드 (401/404/501/801/819/901/991) 가 라인에 존재함</li>
 * </ul>
 *
 * <p>이중 가드: {@code AbstractPostgresIT} Testcontainers PostgreSQL + Flyway V1~V6 자동 적용.
 * Docker 미가용 환경에서는 {@link AbstractPostgresIT.DockerAvailableCondition} 이 skip 처리.
 *
 * <p>외부 client {@code @MockBean} 격리 ({@code feedback_it_mockbean_external_clients}) — Eureka
 * 비활성 환경에서 외부 RestClient 초기화 실패로 인한 5xx 회피.
 *
 * <p>{@code @Transactional} 적용 — {@code journal.getLines()} 등 Lazy 컬렉션 호출 시
 * Hibernate Session 이 유지되어 {@code LazyInitializationException} 을 방지한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@Transactional
class ReportValidationSeedIT extends AbstractPostgresIT {

    /** 외부 client @MockBean 격리 (feedback_it_mockbean_external_clients 가드 준수). */
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private ProductClient productClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    /** SP-D2 동적 권한 client 격리 — auth-service 호출 차단 (기본값 false = fallback 통과). */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    /**
     * V6 seed 분개 UUID — V6 SQL 에 하드코딩된 결정적 UUID 와 일치.
     * Objects.requireNonNull 로 감싸서 @NonNull 파라미터 경고 제거
     * (UUID.fromString 반환값은 실질적으로 non-null 이지만 IDE 추적 불가).
     */
    private static final UUID ID_RPT_001 =
            Objects.requireNonNull(UUID.fromString("fd0a7b35-3f5a-3b2d-ab94-44f45d25c7f6")); // 상품매출
    private static final UUID ID_RPT_002 =
            Objects.requireNonNull(UUID.fromString("9b9d37e4-7623-3e55-87a1-8fd4e3a06e70")); // 제품매출
    private static final UUID ID_RPT_003 =
            Objects.requireNonNull(UUID.fromString("51e4a24e-cf18-3b54-a10b-a5e7b831f52d")); // 상품매출원가
    private static final UUID ID_RPT_004 =
            Objects.requireNonNull(UUID.fromString("4e60aa22-c45a-3a4e-9f0c-f7a3c5b9d6e1")); // 급여
    private static final UUID ID_RPT_005 =
            Objects.requireNonNull(UUID.fromString("2a7f1c8b-5e3d-3c6a-b2f8-d9e4a1c7f3b0")); // 임차료
    private static final UUID ID_RPT_006 =
            Objects.requireNonNull(UUID.fromString("c3d5e8a1-b4f2-3d7c-98e6-a2f9b0c4e7d3")); // 이자수익
    private static final UUID ID_RPT_007 =
            Objects.requireNonNull(UUID.fromString("7f2e9c4b-d1a3-3e8f-b5c7-e0d6a4f2b9c8")); // 법인세비용

    private static final List<UUID> ALL_SEED_IDS = List.of(
            ID_RPT_001, ID_RPT_002, ID_RPT_003, ID_RPT_004,
            ID_RPT_005, ID_RPT_006, ID_RPT_007);

    @Autowired
    private JournalRepository journalRepository;

    @Test
    @DisplayName("V6 seed — 7건 분개가 모두 POSTED 상태로 존재")
    void sevenPostedSeedJournalsExist() {
        for (UUID id : ALL_SEED_IDS) {
            Journal journal = journalRepository.findById(Objects.requireNonNull(id))
                    .orElseThrow(() -> new AssertionError(
                            "V6 seed 분개 미존재 — id=" + id));
            assertThat(journal.getStatus())
                    .as("분개 %s 가 POSTED 상태여야 함", journal.getJournalNo())
                    .isEqualTo(JournalStatus.POSTED);
        }
    }

    @Test
    @DisplayName("V6 seed — 모든 분개의 복식부기 균형 (sum debit = sum credit)")
    void allSeedJournalsAreBalanced() {
        for (UUID id : ALL_SEED_IDS) {
            Journal journal = journalRepository.findById(Objects.requireNonNull(id))
                    .orElseThrow(() -> new AssertionError(
                            "V6 seed 분개 미존재 — id=" + id));
            BigDecimal debit  = journal.totalDebit();
            BigDecimal credit = journal.totalCredit();
            assertThat(debit)
                    .as("분개 %s 복식부기 균형 위반 — debit=%s credit=%s",
                            journal.getJournalNo(), debit, credit)
                    .isEqualByComparingTo(credit);
        }
    }

    @Test
    @DisplayName("V6 seed — 2026/01/15-1 상품매출 분개 금액 정확성")
    void rpt001ProductSalesAmount() {
        Journal j = journalRepository.findById(Objects.requireNonNull(ID_RPT_001)).orElseThrow();
        // 차변 합계: 외상매출금 2,200,000
        assertThat(j.totalDebit()).isEqualByComparingTo(new BigDecimal("2200000.00"));
        // 대변 합계: 상품매출 2,000,000 + 부가세예수금 200,000
        assertThat(j.totalCredit()).isEqualByComparingTo(new BigDecimal("2200000.00"));
        // 계정코드 4019(상품매출) 라인 존재
        boolean hasRevenue = j.getLines().stream()
                .anyMatch(l -> "4019".equals(l.getAccountCode())
                        && l.getCreditAmount().compareTo(new BigDecimal("2000000.00")) == 0);
        assertThat(hasRevenue).as("4019 상품매출 라인 2,000,000 존재").isTrue();
    }

    @Test
    @DisplayName("V6 seed — 2026/02/10-1 제품매출 분개 금액 정확성")
    void rpt002ProductManufactureSalesAmount() {
        Journal j = journalRepository.findById(Objects.requireNonNull(ID_RPT_002)).orElseThrow();
        assertThat(j.totalDebit()).isEqualByComparingTo(new BigDecimal("5500000.00"));
        assertThat(j.totalCredit()).isEqualByComparingTo(new BigDecimal("5500000.00"));
        boolean hasRevenue = j.getLines().stream()
                .anyMatch(l -> "4049".equals(l.getAccountCode())
                        && l.getCreditAmount().compareTo(new BigDecimal("5000000.00")) == 0);
        assertThat(hasRevenue).as("4049 제품매출 라인 5,000,000 존재").isTrue();
    }

    @Test
    @DisplayName("V6 seed — 2026/01/31-1 급여 분개 원천세 예수금 분리 확인")
    void rpt004SalaryWithholdingTax() {
        Journal j = journalRepository.findById(Objects.requireNonNull(ID_RPT_004)).orElseThrow();
        // 차변 801(급여) 3,000,000
        boolean hasSalary = j.getLines().stream()
                .anyMatch(l -> "8029".equals(l.getAccountCode())
                        && l.getDebitAmount().compareTo(new BigDecimal("3000000.00")) == 0);
        // 대변 221(예수금) 300,000
        boolean hasWithholding = j.getLines().stream()
                .anyMatch(l -> "2549".equals(l.getAccountCode())
                        && l.getCreditAmount().compareTo(new BigDecimal("300000.00")) == 0);
        // 대변 102(보통예금) 2,700,000
        boolean hasBank = j.getLines().stream()
                .anyMatch(l -> "1039".equals(l.getAccountCode())
                        && l.getCreditAmount().compareTo(new BigDecimal("2700000.00")) == 0);
        assertThat(hasSalary).as("8029 급여 차변 3,000,000").isTrue();
        assertThat(hasWithholding).as("2549 예수금 대변 300,000").isTrue();
        assertThat(hasBank).as("1039 보통예금 대변 2,700,000").isTrue();
    }

    @Test
    @DisplayName("V6 seed — 2026/12/31-1 법인세비용 부채 계상 확인")
    void rpt007IncomeTaxExpense() {
        Journal j = journalRepository.findById(Objects.requireNonNull(ID_RPT_007)).orElseThrow();
        boolean hasExpense = j.getLines().stream()
                .anyMatch(l -> "9719".equals(l.getAccountCode())
                        && l.getDebitAmount().compareTo(new BigDecimal("700000.00")) == 0);
        boolean hasLiability = j.getLines().stream()
                .anyMatch(l -> "2539".equals(l.getAccountCode())
                        && l.getCreditAmount().compareTo(new BigDecimal("700000.00")) == 0);
        assertThat(hasExpense).as("9719 법인세비용 차변 700,000").isTrue();
        assertThat(hasLiability).as("2539 미지급금 대변 700,000 (법인세 부채 계상)").isTrue();
    }
}
