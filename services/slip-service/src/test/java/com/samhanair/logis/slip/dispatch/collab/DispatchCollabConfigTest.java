package com.samhanair.logis.slip.dispatch.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.collab.CollabCommentService;
import com.samhanair.logis.collab.CollabCommentRecord;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabRealtimePublisher;
import com.samhanair.logis.collab.coedit.CollabCoeditService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.web.dispatch.DispatchCollabCommentController;
import com.samhanair.logis.slip.web.dispatch.dto.AddDispatchCommentRequest;
import com.samhanair.logis.slip.web.dispatch.dto.DispatchCommentResponse;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 배차 협업 댓글 설정 테스트.
 *
 * <p>shared/collab-core 의 {@link CollabCommentService} 를 DispatchTask concrete entity 로
 * 실배선하는 첫 레퍼런스가 DISPATCH_TASK 문서 타입과 RealtimeBroker publish 를 보존하는지 검증한다.
 */
class DispatchCollabConfigTest {

    @Test
    void commentService_addDispatchTaskComment_persistsAndPublishes() {
        DispatchCollabCommentRepository repository =
                org.mockito.Mockito.mock(DispatchCollabCommentRepository.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        CollabRealtimePublisher publisher = new CollabRealtimePublisher(broker);
        CollabCommentService<DispatchCollabComment> service =
                new DispatchCollabConfig().dispatchCollabCommentService(repository, publisher);
        UUID taskId = UUID.randomUUID();
        UUID authorId = UUID.randomUUID();

        when(repository.save(any(DispatchCollabComment.class))).thenAnswer(inv -> {
            DispatchCollabComment comment = inv.getArgument(0);
            ReflectionTestUtils.setField(comment, "id", UUID.randomUUID());
            return comment;
        });

        DispatchCollabComment saved = service.add(
                CollabDocumentType.DISPATCH_TASK,
                taskId,
                "vehicleGroups[0]",
                authorId,
                "배차담당자",
                "1톤 차량 확인 필요",
                null);

        assertThat(saved.getDocumentType()).isEqualTo(CollabDocumentType.DISPATCH_TASK);
        assertThat(saved.getDocumentId()).isEqualTo(taskId);
        assertThat(saved.getAuthorName()).isEqualTo("배차담당자");
        verify(repository, times(1)).save(any(DispatchCollabComment.class));
        verify(broker, times(1))
                .publish(eq(taskId), eq(CollabCommentService.EVENT_COMMENT_CREATED), any());
    }

    @Test
    void commentService_listRecent_clampsLimitAndUsesDispatchDocumentType() {
        DispatchCollabCommentRepository repository =
                org.mockito.Mockito.mock(DispatchCollabCommentRepository.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        CollabRealtimePublisher publisher = new CollabRealtimePublisher(broker);
        CollabCommentService<DispatchCollabComment> service =
                new DispatchCollabConfig().dispatchCollabCommentService(repository, publisher);
        UUID taskId = UUID.randomUUID();
        when(repository.findRecent(eq(CollabDocumentType.DISPATCH_TASK), eq(taskId), any(Pageable.class)))
                .thenReturn(List.of());

        service.listRecent(CollabDocumentType.DISPATCH_TASK, taskId, 999);

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findRecent(
                eq(CollabDocumentType.DISPATCH_TASK),
                eq(taskId),
                pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageSize())
                .isEqualTo(CollabCommentService.MAX_RECENT_LIMIT);
    }

    @Test
    void commentService_rejectsParentCommentFromDifferentDispatchTask() {
        DispatchCollabCommentRepository repository =
                org.mockito.Mockito.mock(DispatchCollabCommentRepository.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        CollabRealtimePublisher publisher = new CollabRealtimePublisher(broker);
        CollabCommentService<DispatchCollabComment> service =
                new DispatchCollabConfig().dispatchCollabCommentService(repository, publisher);
        UUID taskId = UUID.randomUUID();
        UUID otherTaskParentId = UUID.randomUUID();

        when(repository.findByIdAndDocumentTypeAndDocumentId(
                otherTaskParentId, CollabDocumentType.DISPATCH_TASK, taskId))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.add(
                CollabDocumentType.DISPATCH_TASK,
                taskId,
                "vehicleGroups[0]",
                UUID.randomUUID(),
                "배차담당자",
                "다른 task 댓글에 답글 금지",
                otherTaskParentId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.NOT_FOUND);

        verify(repository, never()).save(any(DispatchCollabComment.class));
        verify(broker, never()).publish(any(UUID.class), anyString(), any());
    }

    @Test
    void commentService_resolveScopesCommentByDispatchTask() {
        DispatchCollabCommentRepository repository =
                org.mockito.Mockito.mock(DispatchCollabCommentRepository.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        CollabRealtimePublisher publisher = new CollabRealtimePublisher(broker);
        CollabCommentService<DispatchCollabComment> service =
                new DispatchCollabConfig().dispatchCollabCommentService(repository, publisher);
        UUID taskId = UUID.randomUUID();
        UUID commentId = UUID.randomUUID();

        when(repository.findByIdAndDocumentTypeAndDocumentId(
                commentId, CollabDocumentType.DISPATCH_TASK, taskId))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.resolve(
                CollabDocumentType.DISPATCH_TASK, taskId, commentId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.NOT_FOUND);

        verify(repository, never()).save(any(DispatchCollabComment.class));
        verify(broker, never()).publish(any(UUID.class), anyString(), any());
    }

    @Test
    void commentService_softDeleteScopesCommentByDispatchTask() {
        DispatchCollabCommentRepository repository =
                org.mockito.Mockito.mock(DispatchCollabCommentRepository.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        CollabRealtimePublisher publisher = new CollabRealtimePublisher(broker);
        CollabCommentService<DispatchCollabComment> service =
                new DispatchCollabConfig().dispatchCollabCommentService(repository, publisher);
        UUID taskId = UUID.randomUUID();
        UUID commentId = UUID.randomUUID();

        when(repository.findByIdAndDocumentTypeAndDocumentId(
                commentId, CollabDocumentType.DISPATCH_TASK, taskId))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.softDelete(
                CollabDocumentType.DISPATCH_TASK, taskId, commentId, "deleter"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.NOT_FOUND);

        verify(repository, never()).save(any(DispatchCollabComment.class));
        verify(broker, never()).publish(any(UUID.class), anyString(), any());
    }

    @Test
    void dispatchController_masksUuidShapedCallerName() {
        @SuppressWarnings("unchecked")
        CollabCommentService<DispatchCollabComment> commentService =
                org.mockito.Mockito.mock(CollabCommentService.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        DispatchTaskRepository taskRepository = org.mockito.Mockito.mock(DispatchTaskRepository.class);
        DispatchCollabCommentController controller =
                new DispatchCollabCommentController(
                        commentService,
                        org.mockito.Mockito.mock(DispatchCollabEditService.class),
                        org.mockito.Mockito.mock(DispatchCollabSuggestionRepository.class),
                        org.mockito.Mockito.mock(DispatchDocumentCollaborationPort.class),
                        broker,
                        taskRepository,
                        org.mockito.Mockito.mock(com.samhanair.logis.shared.realtime.presence.PresenceService.class),
                        org.mockito.Mockito.mock(CollabCoeditService.class));
        UUID taskId = UUID.randomUUID();
        UUID callerId = UUID.randomUUID();
        String uuidShapedCallerName = UUID.randomUUID().toString();
        DispatchCollabComment saved = DispatchCollabComment.create(
                CollabDocumentType.DISPATCH_TASK,
                taskId,
                "vehicleGroups[0]",
                callerId,
                "변경자 미상",
                "UUID 이름 마스킹",
                null);
        ReflectionTestUtils.setField(saved, "id", UUID.randomUUID());

        when(taskRepository.existsByIdAndIsDeletedFalse(taskId)).thenReturn(true);
        when(commentService.add(
                eq(CollabDocumentType.DISPATCH_TASK),
                eq(taskId),
                eq("vehicleGroups[0]"),
                eq(callerId),
                eq("변경자 미상"),
                eq("UUID 이름 마스킹"),
                isNull()))
                .thenReturn(saved);

        ApiResponse<DispatchCommentResponse> response = controller.add(
                taskId,
                new AddDispatchCommentRequest("UUID 이름 마스킹", null, "vehicleGroups[0]"),
                callerId.toString(),
                uuidShapedCallerName);

        assertThat(response.getData().authorName()).isEqualTo("변경자 미상");
        verify(commentService).add(
                eq(CollabDocumentType.DISPATCH_TASK),
                eq(taskId),
                eq("vehicleGroups[0]"),
                eq(callerId),
                eq("변경자 미상"),
                eq("UUID 이름 마스킹"),
                isNull());
    }

    @Test
    void dispatchController_truncatesLongCallerNameToAuthorNameLimit() {
        @SuppressWarnings("unchecked")
        CollabCommentService<DispatchCollabComment> commentService =
                org.mockito.Mockito.mock(CollabCommentService.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        DispatchTaskRepository taskRepository = org.mockito.Mockito.mock(DispatchTaskRepository.class);
        DispatchCollabCommentController controller =
                new DispatchCollabCommentController(
                        commentService,
                        org.mockito.Mockito.mock(DispatchCollabEditService.class),
                        org.mockito.Mockito.mock(DispatchCollabSuggestionRepository.class),
                        org.mockito.Mockito.mock(DispatchDocumentCollaborationPort.class),
                        broker,
                        taskRepository,
                        org.mockito.Mockito.mock(com.samhanair.logis.shared.realtime.presence.PresenceService.class),
                        org.mockito.Mockito.mock(CollabCoeditService.class));
        UUID taskId = UUID.randomUUID();
        UUID callerId = UUID.randomUUID();
        String callerName = "A".repeat(60);
        String truncated = callerName.substring(0, CollabCommentRecord.MAX_AUTHOR_NAME_LENGTH);
        DispatchCollabComment saved = DispatchCollabComment.create(
                CollabDocumentType.DISPATCH_TASK,
                taskId,
                "vehicleGroups[0]",
                callerId,
                truncated,
                "long author name",
                null);
        ReflectionTestUtils.setField(saved, "id", UUID.randomUUID());

        when(taskRepository.existsByIdAndIsDeletedFalse(taskId)).thenReturn(true);
        when(commentService.add(
                eq(CollabDocumentType.DISPATCH_TASK),
                eq(taskId),
                eq("vehicleGroups[0]"),
                eq(callerId),
                eq(truncated),
                eq("long author name"),
                isNull()))
                .thenReturn(saved);

        ApiResponse<DispatchCommentResponse> response = controller.add(
                taskId,
                new AddDispatchCommentRequest("long author name", null, "vehicleGroups[0]"),
                callerId.toString(),
                callerName);

        assertThat(response.getData().authorName()).isEqualTo(truncated);
        verify(commentService).add(
                eq(CollabDocumentType.DISPATCH_TASK),
                eq(taskId),
                eq("vehicleGroups[0]"),
                eq(callerId),
                eq(truncated),
                eq("long author name"),
                isNull());
    }

    @Test
    void dispatchController_usesAlreadyDecodedCallerNameAsAuthor() {
        @SuppressWarnings("unchecked")
        CollabCommentService<DispatchCollabComment> commentService =
                org.mockito.Mockito.mock(CollabCommentService.class);
        RealtimeBroker broker = org.mockito.Mockito.mock(RealtimeBroker.class);
        DispatchTaskRepository taskRepository = org.mockito.Mockito.mock(DispatchTaskRepository.class);
        DispatchCollabCommentController controller =
                new DispatchCollabCommentController(
                        commentService,
                        org.mockito.Mockito.mock(DispatchCollabEditService.class),
                        org.mockito.Mockito.mock(DispatchCollabSuggestionRepository.class),
                        org.mockito.Mockito.mock(DispatchDocumentCollaborationPort.class),
                        broker,
                        taskRepository,
                        org.mockito.Mockito.mock(com.samhanair.logis.shared.realtime.presence.PresenceService.class),
                        org.mockito.Mockito.mock(CollabCoeditService.class));
        UUID taskId = UUID.randomUUID();
        UUID callerId = UUID.randomUUID();
        DispatchCollabComment saved = DispatchCollabComment.create(
                CollabDocumentType.DISPATCH_TASK,
                taskId,
                "vehicleGroups[0]",
                callerId,
                "홍길동",
                "실명 표시 확인",
                null);
        ReflectionTestUtils.setField(saved, "id", UUID.randomUUID());

        when(taskRepository.existsByIdAndIsDeletedFalse(taskId)).thenReturn(true);
        when(commentService.add(
                eq(CollabDocumentType.DISPATCH_TASK),
                eq(taskId),
                eq("vehicleGroups[0]"),
                eq(callerId),
                eq("홍길동"),
                eq("실명 표시 확인"),
                isNull()))
                .thenReturn(saved);

        ApiResponse<DispatchCommentResponse> response = controller.add(
                taskId,
                new AddDispatchCommentRequest("실명 표시 확인", null, "vehicleGroups[0]"),
                callerId.toString(),
                "홍길동");

        assertThat(response.getData().authorName()).isEqualTo("홍길동");
        verify(commentService).add(
                eq(CollabDocumentType.DISPATCH_TASK),
                eq(taskId),
                eq("vehicleGroups[0]"),
                eq(callerId),
                eq("홍길동"),
                eq("실명 표시 확인"),
                isNull());
    }
}
