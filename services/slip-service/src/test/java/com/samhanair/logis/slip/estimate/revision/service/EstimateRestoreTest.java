package com.samhanair.logis.slip.estimate.revision.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevision;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevisionType;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateSnapshot;
import com.samhanair.logis.slip.estimate.revision.repository.EstimateRevisionRepository;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 견적 point-in-time 복원 단위 테스트 (권한 재편 Phase 2.2 Task 3).
 *
 * <p>검증 시나리오:
 * <ul>
 *   <li>rev1(라인 N) → update(라인 추가/변경) → restore(rev1) 시 헤더/라인이 rev1 시점으로 회귀하고,
 *       신규 RESTORE revision(sourceRevisionNo=1)이 캡처된다.</li>
 *   <li>라인 add / remove / 수정 케이스가 스냅샷 기준으로 정확히 반영된다.</li>
 *   <li>복원 대상 revision 미존재 시 NOT_FOUND.</li>
 *   <li>편집 불가 단계(QUOTE_ACCEPTED) 견적의 {@code restoreFromSnapshot} 은 CONFLICT (도메인 가드).</li>
 * </ul>
 *
 * <p>{@code SlipRevisionServiceTest} 의 restore 케이스 미러.
 */
@ExtendWith(MockitoExtension.class)
class EstimateRestoreTest {

    @Mock
    private EstimateRevisionRepository repository;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @InjectMocks
    private EstimateRevisionService service;

    private static void injectId(Estimate estimate, UUID id) throws Exception {
        Field f = Estimate.class.getDeclaredField("id");
        f.setAccessible(true);
        f.set(estimate, id);
    }

    /** rev1 시점 헤더 2라인 견적 생성. */
    private Estimate rev1Estimate(UUID estimateId) throws Exception {
        Estimate estimate = Estimate.create("2026/05/29-3", LocalDate.of(2026, 5, 29), 3,
                UUID.randomUUID(), "삼한물산", "123-45-67890", "서울시 주소",
                LocalDate.of(2026, 6, 29), "rev1-비고", "user-1");
        injectId(estimate, estimateId);
        // 라인1: 15000 × 2 = 30000 공급 + VAT 3000 = lineTotal 33000.00
        estimate.addLine(EstimateLine.create(estimate, 1, UUID.randomUUID(),
                "펌프", "MX-100", "220V", 2, new BigDecimal("15000.00"), "라인메모"));
        // 라인2: 3000 × 5 = 15000 공급 + VAT 1500 = lineTotal 16500.00
        estimate.addLine(EstimateLine.create(estimate, 2, UUID.randomUUID(),
                "밸브", null, null, 5, new BigDecimal("3000.00"), null));
        return estimate;
    }

    @Test
    @DisplayName("restore: rev1(2라인) → update(헤더 변경 + 라인 add/remove/수정) → restore(rev1) 시 "
            + "헤더·라인이 rev1 로 회귀하고 RESTORE revision(source=1)이 캡처된다")
    void restoreRollsBackHeaderAndLinesToTargetRevision() throws Exception {
        UUID estimateId = UUID.randomUUID();
        Estimate estimate = rev1Estimate(estimateId);
        UUID actorId = UUID.randomUUID();

        // rev1 스냅샷 캡처 (복원 대상)
        estimate.getLines().get(0).changeSpecificationSource("CATALOG");
        estimate.getLines().get(1).changeSpecificationSource("USER");
        EstimateSnapshot rev1Snapshot = estimate.toSnapshot();
        assertThat(rev1Snapshot.lines()).hasSize(2);

        // update — 헤더 변경 + 라인 전량 교체(라인1 수정 + 라인2 제거 + 라인3 신규)
        estimate.editHeader(null, "변경물산", null, null, null, "rev2-비고");
        // 기존 라인 제거 (EstimateService.update 패턴 미러)
        for (EstimateLine line : java.util.List.copyOf(estimate.getLines())) {
            estimate.removeLine(line);
        }
        estimate.addLine(EstimateLine.create(estimate, 1, UUID.randomUUID(),
                "교체펌프", "ZZ-9", "380V", 1, new BigDecimal("99000.00"), "수정"));
        assertThat(estimate.getPartnerName()).isEqualTo("변경물산");
        assertThat(estimate.getLines()).hasSize(1);

        // restore(rev1) — repository 가 rev1 스냅샷 반환, capture 채번 = 2
        when(repository.findByEstimateIdAndRevisionNo(estimateId, 1))
                .thenReturn(Optional.of(EstimateRevision.of(estimateId, 1,
                        EstimateRevisionType.CREATE, null, "2026/05/29-3",
                        LocalDate.of(2026, 5, 29), rev1Snapshot, actorId, "홍길동", null)));
        when(repository.maxRevisionNo(estimateId)).thenReturn(1);
        when(repository.saveAndFlush(any(EstimateRevision.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        EstimateRevision restored = service.restore(estimate, 1, actorId, "홍길동", null);

        // 헤더 회귀
        assertThat(estimate.getPartnerName()).isEqualTo("삼한물산");
        assertThat(estimate.getMemo()).isEqualTo("rev1-비고");
        // 라인 회귀 (2건, lineTotal 정합)
        assertThat(estimate.getLines()).hasSize(2);
        assertThat(estimate.getLines().get(0).getProductName()).isEqualTo("펌프");
        assertThat(estimate.getLines().get(0).getLineTotal()).isEqualByComparingTo("33000.00");
        assertThat(estimate.getLines().get(1).getProductName()).isEqualTo("밸브");
        assertThat(estimate.getLines().get(1).getLineTotal()).isEqualByComparingTo("16500.00");
        assertThat(estimate.getLines().get(0).getSpecificationSource()).isEqualTo("CATALOG");
        assertThat(estimate.getLines().get(1).getSpecificationSource()).isEqualTo("USER");
        // 합계 재계산 (스냅샷 무시, 라인 기준): 30000+15000=45000 공급, VAT 4500, 합계 49500
        assertThat(estimate.getTotalSupply()).isEqualByComparingTo("45000.00");
        assertThat(estimate.getTotalVat()).isEqualByComparingTo("4500.00");
        assertThat(estimate.getTotalAmount()).isEqualByComparingTo("49500.00");
        // RESTORE revision (source=1, revisionNo=2)
        assertThat(restored.getRevisionType()).isEqualTo(EstimateRevisionType.RESTORE);
        assertThat(restored.getSourceRevisionNo()).isEqualTo(1);
        assertThat(restored.getRevisionNo()).isEqualTo(2);
        assertThat(restored.getSnapshot().lines()).hasSize(2);
        assertThat(restored.getSnapshot().lines().get(0).specificationSource()).isEqualTo("CATALOG");
    }

    @Test
    @DisplayName("restore: 복원 대상 revision 이 없으면 NOT_FOUND")
    void restoreThrowsNotFoundWhenTargetMissing() throws Exception {
        UUID estimateId = UUID.randomUUID();
        Estimate estimate = rev1Estimate(estimateId);

        when(repository.findByEstimateIdAndRevisionNo(eq(estimateId), eq(99)))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.restore(estimate, 99,
                UUID.randomUUID(), "홍길동", null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NOT_FOUND);
    }

    @Test
    @DisplayName("[#822] restoreFromSnapshot: VAT 포함 단가 라인은 unit_price_with_vat 권위값이 "
            + "복원된다 (11의 배수가 아닌 단가 — 결함: 전량 NULL 화 + 합계 드리프트, 라이브 QA 16b)")
    void restoreFromSnapshotPreservesVatInclusiveUnitPrice() throws Exception {
        UUID estimateId = UUID.randomUUID();
        Estimate estimate = Estimate.create("2026/07/16-1", LocalDate.of(2026, 7, 16), 1,
                UUID.randomUUID(), "삼한물산", "123-45-67890", "서울시 주소",
                LocalDate.of(2026, 8, 16), "VAT포함 복원", "user-1");
        injectId(estimate, estimateId);
        // 87,999(비 11배수) × 3 = 263,997 → 공급 239,997 / 부가세 24,000 (라인 단위 권위값)
        estimate.addLine(EstimateLine.createFromVatInclusive(estimate, 1, UUID.randomUUID(),
                "컴프레서", "CP-9", "380V", 3, new BigDecimal("87999"), "VAT포함 라인"));

        EstimateSnapshot snapshot = estimate.toSnapshot();
        // 캡처 자체가 권위값을 담아야 한다 (결함: EstimateSnapshot.Line 에 필드 부재)
        assertThat(snapshot.lines().get(0).unitPriceWithVat()).isEqualByComparingTo("87999.00");

        // 라인 전량 교체(공급 단가 라인) 후 복원
        for (EstimateLine line : java.util.List.copyOf(estimate.getLines())) {
            estimate.removeLine(line);
        }
        estimate.addLine(EstimateLine.create(estimate, 1, UUID.randomUUID(),
                "교체품목", null, null, 1, new BigDecimal("50000.00"), null));

        estimate.restoreFromSnapshot(snapshot);

        EstimateLine restored = estimate.getLines().get(0);
        // 결함(수정 전): create 공급 semantics 재생성 → withVat NULL(legacy provenance 오전환)
        assertThat(restored.getUnitPriceWithVat()).isEqualByComparingTo("87999.00");
        assertThat(restored.getUnitPrice()).isEqualByComparingTo("79999.00");
        assertThat(restored.getSupplyAmount()).isEqualByComparingTo("239997");
        assertThat(restored.getVatAmount()).isEqualByComparingTo("24000");
        assertThat(restored.getLineTotal()).isEqualByComparingTo("263997");
        // 헤더 합계 = 복원 라인 권위값 기준 재계산 (편집 폼 총합 ≠ DB 총합 불일치 재발 방지)
        assertThat(estimate.getTotalSupply()).isEqualByComparingTo("239997");
        assertThat(estimate.getTotalVat()).isEqualByComparingTo("24000");
        assertThat(estimate.getTotalAmount()).isEqualByComparingTo("263997");
    }

    @Test
    @DisplayName("restoreFromSnapshot: snapshot에 저장된 비표준 S/V/T 권위 금액을 재분해하지 않고 복원한다")
    void restoreFromSnapshotPreservesAuthoritativeAmounts() throws Exception {
        UUID estimateId = UUID.randomUUID();
        Estimate estimate = rev1Estimate(estimateId);
        EstimateSnapshot snapshot = new EstimateSnapshot(
                "2026/07/23-1", LocalDate.of(2026, 7, 23), estimate.getPartnerId(),
                "권위 금액 거래처", "123-45-67890", "서울 주소",
                LocalDate.of(2026, 8, 23), "권위 금액 메모",
                java.util.List.of(new EstimateSnapshot.Line(
                        UUID.randomUUID(), "권위 품목", "AUTH-1", "규격", 1,
                        new BigDecimal("100005"), new BigDecimal("100005"),
                        new BigDecimal("9999"), new BigDecimal("110004"), "메모",
                        new BigDecimal("110004"), null, null)));

        estimate.restoreFromSnapshot(snapshot);

        EstimateLine restored = estimate.getLines().get(0);
        assertThat(restored.getSupplyAmount()).isEqualByComparingTo("100005");
        assertThat(restored.getVatAmount()).isEqualByComparingTo("9999");
        assertThat(restored.getLineTotal()).isEqualByComparingTo("110004");
    }

    @Test
    @DisplayName("[#822] restoreFromSnapshot: 구 스냅샷(unitPriceWithVat 부재=null)은 종전 공급 "
            + "semantics 재계산을 유지한다 (하위호환)")
    void restoreFromSnapshotLegacySnapshotKeepsSupplyRecalculation() throws Exception {
        UUID estimateId = UUID.randomUUID();
        Estimate estimate = rev1Estimate(estimateId);
        // 구 시그니처 생성자(10-arg) = #822 이전 JSONB 형상과 동형 (withVat 키 부재 → null 역직렬화)
        EstimateSnapshot legacy = new EstimateSnapshot("2026/05/29-3", LocalDate.of(2026, 5, 29),
                estimate.getPartnerId(), "삼한물산", "123-45-67890", "서울시 주소",
                LocalDate.of(2026, 6, 29), "레거시 스냅샷",
                java.util.List.of(new EstimateSnapshot.Line(UUID.randomUUID(), "펌프", "MX-100",
                        "220V", 2, new BigDecimal("15000.00"), new BigDecimal("30000.00"),
                        new BigDecimal("3000.00"), new BigDecimal("33000.00"), "라인메모")));

        estimate.restoreFromSnapshot(legacy);

        EstimateLine restored = estimate.getLines().get(0);
        assertThat(restored.getUnitPriceWithVat()).isNull();
        assertThat(restored.getUnitPrice()).isEqualByComparingTo("15000.00");
        assertThat(restored.getSupplyAmount()).isEqualByComparingTo("30000.00");
        assertThat(restored.getVatAmount()).isEqualByComparingTo("3000.00");
        assertThat(restored.getLineTotal()).isEqualByComparingTo("33000.00");
    }

    @Test
    @DisplayName("S20 RED-A: toSnapshot → restoreFromSnapshot 왕복에서 규격 provenance를 보존한다")
    void restoreFromSnapshotPreservesSpecificationSource() throws Exception {
        Estimate estimate = rev1Estimate(UUID.randomUUID());
        estimate.getLines().get(0).changeSpecificationSource("CATALOG");
        estimate.getLines().get(1).changeSpecificationSource("USER");

        EstimateSnapshot snapshot = estimate.toSnapshot();
        estimate.restoreFromSnapshot(snapshot);

        assertThat(estimate.getLines().get(0).getSpecificationSource()).isEqualTo("CATALOG");
        assertThat(estimate.getLines().get(1).getSpecificationSource()).isEqualTo("USER");
    }

    @Test
    @DisplayName("restoreFromSnapshot: keyless 다중 BUNDLE 인스턴스는 인스턴스별 키를 복원한다")
    void restoreFromSnapshotMaterializesKeysForLegacyMultiInstanceBundle() throws Exception {
        Estimate estimate = rev1Estimate(UUID.randomUUID());
        java.util.List<EstimateSnapshot.Line> lines = new java.util.ArrayList<>();
        for (int instance = 0; instance < 2; instance++) {
            for (int component = 0; component < 2; component++) {
                lines.add(new EstimateSnapshot.Line(UUID.randomUUID(), "구성품" + component,
                        "COMP-" + component, null, 1, new BigDecimal("1000"),
                        new BigDecimal("1000"), new BigDecimal("100"), new BigDecimal("1100"),
                        null, null, component == 0, "SET-RESTORE", null,
                        new BundleSetOptions(null, false, null, null, false, null)));
            }
        }
        EstimateSnapshot snapshot = new EstimateSnapshot("2026/08/11-1", LocalDate.of(2026, 8, 11),
                estimate.getPartnerId(), "삼한물산", "123-45-67890", "서울", LocalDate.of(2026, 9, 11),
                "legacy multi instance", lines);

        estimate.restoreFromSnapshot(snapshot);

        assertThat(estimate.getLines()).hasSize(4);
        assertThat(estimate.getLines()).extracting(line -> line.getBundleSetOptions().instanceKey())
                .doesNotContainNull()
                .containsExactly(estimate.getLines().get(0).getBundleSetOptions().instanceKey(),
                        estimate.getLines().get(0).getBundleSetOptions().instanceKey(),
                        estimate.getLines().get(2).getBundleSetOptions().instanceKey(),
                        estimate.getLines().get(2).getBundleSetOptions().instanceKey());
        assertThat(estimate.getLines().get(0).getBundleSetOptions().instanceKey())
                .isNotEqualTo(estimate.getLines().get(2).getBundleSetOptions().instanceKey());
    }

    @Test
    @DisplayName("restoreFromSnapshot: QUOTE_ACCEPTED(편집 불가) 견적은 복원도 CONFLICT (도메인 가드)")
    void restoreFromSnapshotThrowsConflictWhenNotEditable() throws Exception {
        UUID estimateId = UUID.randomUUID();
        Estimate estimate = rev1Estimate(estimateId);
        EstimateSnapshot snapshot = estimate.toSnapshot();

        // DRAFT → SENT → ACCEPTED (편집 불가 단계로 전이)
        estimate.send();
        estimate.accept();

        assertThatThrownBy(() -> estimate.restoreFromSnapshot(snapshot))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.CONFLICT);
    }
}
