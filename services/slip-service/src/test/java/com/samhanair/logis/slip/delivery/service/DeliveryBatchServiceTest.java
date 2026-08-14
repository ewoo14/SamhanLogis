package com.samhanair.logis.slip.delivery.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.delivery.domain.DeliveryBatch;
import com.samhanair.logis.slip.delivery.repository.DeliveryBatchRepository;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.delivery.sms.SmsResult;
import com.samhanair.logis.slip.delivery.web.dto.DeliveryBatchResponse;
import com.samhanair.logis.slip.delivery.web.dto.PublicBatchResponse;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * DeliveryBatchService — Mockito 기반 unit. SmsGateway / 두 Repository 모두 @Mock.
 *
 * <p>memory {@code feedback_it_mockbean_external_clients.md} 의 SmsGateway 격리 패턴 준수.
 */
@ExtendWith(MockitoExtension.class)
class DeliveryBatchServiceTest {

    @Mock private DeliveryBatchRepository batchRepository;
    @Mock private SlipRepository slipRepository;
    @Mock private SmsGateway smsGateway;

    @InjectMocks private DeliveryBatchService service;

    // 시간 의존 회귀 회피 — 항상 오늘 날짜 사용 (PR #94 fix, 2026-05-05 하드코딩 → batch token 만료)
    private final LocalDate date = LocalDate.now();
    private UUID batchId;
    private UUID slipId;
    private UUID sourceWh;
    private UUID destWh;

    @BeforeEach
    void setUp() {
        batchId = UUID.randomUUID();
        slipId = UUID.randomUUID();
        sourceWh = UUID.randomUUID();
        destWh = UUID.randomUUID();
        ReflectionTestUtils.setField(service, "publicBaseUrl", "https://sign.samhan-air.com");
    }

    @Test
    void autoGroupByDate_createsNewBatchPerDriverPhone() {
        Slip s1 = newSlipWithDriver("김기사", "010-1111-2222");
        Slip s2 = newSlipWithDriver("김기사", "010-1111-2222");
        Slip s3 = newSlipWithDriver("박기사", "010-3333-4444");
        when(slipRepository.findAllBySlipDateAndDriverPhoneIsNotNullAndIsDeletedFalse(date))
                .thenReturn(List.of(s1, s2, s3));
        when(batchRepository.findByDriverPhoneAndBatchDate(anyString(), eq(date)))
                .thenReturn(Optional.empty());
        when(batchRepository.save(any(DeliveryBatch.class)))
                .thenAnswer(inv -> {
                    DeliveryBatch b = inv.getArgument(0);
                    ReflectionTestUtils.setField(b, "id", UUID.randomUUID());
                    return b;
                });
        // list() 후속 호출 — 빈 결과로 단순화
        when(batchRepository.findByBatchDateWithSentFilter(date, null))
                .thenReturn(List.of());

        List<DeliveryBatchResponse> result = service.autoGroupByDate(date);

        // 2 개 phone → 2 개 batch.save
        verify(batchRepository, org.mockito.Mockito.times(2)).save(any(DeliveryBatch.class));
        assertThat(result).isNotNull();
    }

    @Test
    void autoGroupByDate_reusesExistingBatchForSameDriverPhone() {
        Slip s1 = newSlipWithDriver("김기사", "010-1111-2222");
        DeliveryBatch existing = DeliveryBatch.create("김기사", "010-1111-2222", date, List.of());
        ReflectionTestUtils.setField(existing, "id", batchId);
        when(slipRepository.findAllBySlipDateAndDriverPhoneIsNotNullAndIsDeletedFalse(date))
                .thenReturn(List.of(s1));
        when(batchRepository.findByDriverPhoneAndBatchDate("010-1111-2222", date))
                .thenReturn(Optional.of(existing));
        when(batchRepository.findByBatchDateWithSentFilter(date, null))
                .thenReturn(List.of());

        service.autoGroupByDate(date);

        // 기존 재사용 — save 호출 없음
        verify(batchRepository, never()).save(any(DeliveryBatch.class));
        assertThat(s1.getDeliveryBatchId()).isEqualTo(batchId);
    }

    @Test
    void autoGroupByDate_skipsAlreadyAssignedSlips() {
        Slip s1 = newSlipWithDriver("김기사", "010-1111-2222");
        UUID otherBatch = UUID.randomUUID();
        s1.assignToBatch(otherBatch);  // 이미 다른 배치
        DeliveryBatch existing = DeliveryBatch.create("김기사", "010-1111-2222", date, List.of());
        ReflectionTestUtils.setField(existing, "id", batchId);
        when(slipRepository.findAllBySlipDateAndDriverPhoneIsNotNullAndIsDeletedFalse(date))
                .thenReturn(List.of(s1));
        when(batchRepository.findByDriverPhoneAndBatchDate("010-1111-2222", date))
                .thenReturn(Optional.of(existing));
        when(batchRepository.findByBatchDateWithSentFilter(date, null))
                .thenReturn(List.of());

        service.autoGroupByDate(date);

        // 기존 배치 ID 유지 — 다른 배치로 재할당 안 됨
        assertThat(s1.getDeliveryBatchId()).isEqualTo(otherBatch);
    }

    @Test
    void sendSms_success_marksSent_andCallsGateway() {
        DeliveryBatch batch = newBatchWithId(batchId);
        Slip slip = newSlipWithDriver("기사", "010-1111-2222");
        when(batchRepository.findById(batchId)).thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batchId))
                .thenReturn(List.of(slip));
        when(smsGateway.sendSms(eq("010-1111-2222"), anyString()))
                .thenReturn(SmsResult.success("msg-001"));

        DeliveryBatchResponse res = service.sendSms(batchId);

        assertThat(batch.isSent()).isTrue();
        assertThat(batch.getSmsLastError()).isNull();
        assertThat(res.smsSentAt()).isNotNull();
        verify(smsGateway).sendSms(eq("010-1111-2222"),
                org.mockito.ArgumentMatchers.contains("/d/" + batch.getBatchToken()));
    }

    @Test
    void sendSms_failure_marksError_andThrows() {
        DeliveryBatch batch = newBatchWithId(batchId);
        Slip slip = newSlipWithDriver("기사", "010-1111-2222");
        when(batchRepository.findById(batchId)).thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batchId))
                .thenReturn(List.of(slip));
        when(smsGateway.sendSms(anyString(), anyString()))
                .thenReturn(SmsResult.failure("Aligo 4xx"));

        assertThatThrownBy(() -> service.sendSms(batchId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        assertThat(batch.isSent()).isFalse();
        assertThat(batch.getSmsLastError()).isEqualTo("Aligo 4xx");
    }

    @Test
    void sendSms_alreadySent_throwsConflict_withoutCallingGateway() {
        DeliveryBatch batch = newBatchWithId(batchId);
        batch.markSmsSent();
        Slip slip = newSlipWithDriver("기사", "010-1111-2222");
        when(batchRepository.findById(batchId)).thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batchId))
                .thenReturn(List.of(slip));

        assertThatThrownBy(() -> service.sendSms(batchId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
        verify(smsGateway, never()).sendSms(anyString(), anyString());
    }

    @Test
    void sendSms_emptySlips_throwsConflict_withoutCallingGateway() {
        DeliveryBatch batch = newBatchWithId(batchId);
        when(batchRepository.findById(batchId)).thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batchId))
                .thenReturn(List.of());

        assertThatThrownBy(() -> service.sendSms(batchId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
        verify(smsGateway, never()).sendSms(anyString(), anyString());
    }

    @Test
    void findByToken_expired_throwsConflict() {
        // 어제 batchDate → 오늘 호출 시 만료
        DeliveryBatch batch = DeliveryBatch.create(
                "기사", "010-1111-2222", LocalDate.now().minusDays(3), List.of());
        ReflectionTestUtils.setField(batch, "id", batchId);
        when(batchRepository.findByBatchToken("expired-token"))
                .thenReturn(Optional.of(batch));

        assertThatThrownBy(() -> service.findByToken("expired-token"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void findByToken_unknown_throwsNotFound() {
        when(batchRepository.findByBatchToken("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findByToken("nope"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void findByToken_active_returnsPublicResponse_withSlipNos() {
        DeliveryBatch batch = newBatchWithId(batchId);
        Slip slip = newSlipWithDriver("기사", "010-1111-2222");
        when(batchRepository.findByBatchToken(batch.getBatchToken()))
                .thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batchId))
                .thenReturn(List.of(slip));

        PublicBatchResponse res = service.findByToken(batch.getBatchToken());

        assertThat(res.driverName()).isEqualTo(batch.getDriverName());
        assertThat(res.batchDate()).isEqualTo(batch.getBatchDate());
        assertThat(res.slips()).hasSize(1);
        assertThat(res.slips().get(0).slipNo()).isEqualTo(slip.getSlipNo());
        // UUID 미노출 가드 — PublicSlipSummary 에 id 필드 자체가 없음 (record 컴파일 타임)
    }

    @Test
    void addSlip_movesFromOtherBatch() {
        DeliveryBatch target = newBatchWithId(batchId);
        UUID previousId = UUID.randomUUID();
        DeliveryBatch previous = DeliveryBatch.create("이전기사", "010-9999-8888", date, List.of());
        ReflectionTestUtils.setField(previous, "id", previousId);
        Slip slip = newSlipWithDriver("기사", "010-1111-2222");
        slip.assignToBatch(previousId);
        when(batchRepository.findById(batchId)).thenReturn(Optional.of(target));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(batchRepository.findById(previousId)).thenReturn(Optional.of(previous));
        ReflectionTestUtils.setField(slip, "id", slipId);
        // toAdminResponse 후속 lookup
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batchId))
                .thenReturn(List.of(slip));

        service.addSlip(batchId, slipId);

        assertThat(slip.getDeliveryBatchId()).isEqualTo(batchId);
    }

    @Test
    void removeSlip_notInBatch_throwsConflict() {
        DeliveryBatch batch = newBatchWithId(batchId);
        Slip slip = newSlipWithDriver("기사", "010-1111-2222");
        slip.assignToBatch(UUID.randomUUID());  // 다른 배치
        when(batchRepository.findById(batchId)).thenReturn(Optional.of(batch));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> service.removeSlip(batchId, slipId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void regenerateToken_replacesTokenAndResetsSent() {
        DeliveryBatch batch = newBatchWithId(batchId);
        batch.markSmsSent();
        String original = batch.getBatchToken();
        when(batchRepository.findById(batchId)).thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batchId))
                .thenReturn(List.of());

        DeliveryBatchResponse res = service.regenerateToken(batchId);

        assertThat(res.batchToken()).isNotEqualTo(original);
        assertThat(batch.isSent()).isFalse();
    }

    @Test
    void getOne_notFound_throwsNotFound() {
        when(batchRepository.findById(batchId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getOne(batchId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    private DeliveryBatch newBatchWithId(UUID id) {
        DeliveryBatch batch = DeliveryBatch.create("기사", "010-1111-2222", date, List.of());
        ReflectionTestUtils.setField(batch, "id", id);
        return batch;
    }

    private Slip newSlipWithDriver(String name, String phone) {
        Slip slip = Slip.createOutbound("2026/05/05-001", date, 1,
                sourceWh, destWh, UUID.randomUUID(), "거래처",
                DeliveryTag.SALE, "메모", "user-1");
        slip.setDriverContact(name, phone);
        return slip;
    }
}
