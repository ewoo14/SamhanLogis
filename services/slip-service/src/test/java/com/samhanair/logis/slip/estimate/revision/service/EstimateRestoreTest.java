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
        // 합계 재계산 (스냅샷 무시, 라인 기준): 30000+15000=45000 공급, VAT 4500, 합계 49500
        assertThat(estimate.getTotalSupply()).isEqualByComparingTo("45000.00");
        assertThat(estimate.getTotalVat()).isEqualByComparingTo("4500.00");
        assertThat(estimate.getTotalAmount()).isEqualByComparingTo("49500.00");
        // RESTORE revision (source=1, revisionNo=2)
        assertThat(restored.getRevisionType()).isEqualTo(EstimateRevisionType.RESTORE);
        assertThat(restored.getSourceRevisionNo()).isEqualTo(1);
        assertThat(restored.getRevisionNo()).isEqualTo(2);
        assertThat(restored.getSnapshot().lines()).hasSize(2);
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
