package com.samhanair.logis.product.editrequest.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.editrequest.config.ProductEditRequestProperties;
import com.samhanair.logis.product.editrequest.domain.ProductEditRequest;
import com.samhanair.logis.product.editrequest.repository.ProductEditRequestRepository;
import com.samhanair.logis.product.realtime.ProductRealtimeBroker;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class ProductEditRequestServiceTest {

    @Mock private ProductEditRequestRepository requestRepository;
    @Mock private ProductRepository productRepository;
    @Mock private ProductRealtimeBroker broker;

    private ProductEditRequestService service;
    private UUID productId;
    private UUID requesterId;
    private UUID approverId;

    @BeforeEach
    void setUp() {
        service = new ProductEditRequestService(requestRepository, productRepository,
                broker, new ProductEditRequestProperties());
        productId = UUID.randomUUID();
        requesterId = UUID.randomUUID();
        approverId = UUID.randomUUID();
    }

    @Test
    void approve_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        UUID requestId = UUID.randomUUID();
        ProductEditRequest request = request(EditRequestType.EDIT);
        request.approve(approverId, "관리자A", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.approve(requestId, UUID.randomUUID(), "관리자B", null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
        verify(broker, never()).publish(eq(productId),
                eq(ProductEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void reject_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        UUID requestId = UUID.randomUUID();
        ProductEditRequest request = request(EditRequestType.DELETE);
        request.approve(approverId, "관리자A", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.reject(requestId, UUID.randomUUID(), "관리자B", "불가"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
        verify(broker, never()).publish(eq(productId),
                eq(ProductEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void consumeApproval_throwsConflict_whenAlreadyConsumed() {
        UUID requestId = UUID.randomUUID();
        ProductEditRequest request = request(EditRequestType.EDIT);
        request.approve(approverId, "관리자A", null);
        request.consumeApproval("user-1");
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.consumeApproval(requestId, "system"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
    }

    private ProductEditRequest request(EditRequestType requestType) {
        ProductEditRequest request = ProductEditRequest.create(productId, requesterId,
                "요청자", requestType, "사유", EditTargetRole.MANAGER, null);
        ReflectionTestUtils.setField(request, "id", UUID.randomUUID());
        return request;
    }
}
