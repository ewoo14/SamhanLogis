package com.samhanair.logis.collab;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class CollabSuggestionStatusMessageTest {

    @Test
    void record_종결제안_재처리는_상태_표시명을_사용한다() {
        TestSuggestion suggestion = TestSuggestion.create();
        suggestion.accept(UUID.randomUUID(), "승인자");

        assertThatThrownBy(() -> suggestion.reject(UUID.randomUUID(), "반려자", "사유"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 종결된 제안입니다")
                .hasMessageContaining("수락")
                .hasMessageNotContaining(CollabSuggestionStatus.ACCEPTED.name());
    }

    @Test
    void service_종결제안_재처리는_상태_표시명을_사용한다() {
        TestSuggestion suggestion = TestSuggestion.create();
        suggestion.reject(UUID.randomUUID(), "반려자", "사유");
        CollabSuggestionService<TestSuggestion> service = new CollabSuggestionService<>(
                new StaticRepository(suggestion),
                (documentType, documentId, proposerId, proposerName, changeSetJson, reason) -> TestSuggestion.create(),
                new CollabRealtimePublisher(new NoopRealtimeBroker()));

        assertThatThrownBy(() -> service.accept(suggestion.getId(), new AllowAllPort(),
                UUID.randomUUID(), "승인자"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 종결된 제안입니다")
                .hasMessageContaining("반려")
                .hasMessageNotContaining(CollabSuggestionStatus.REJECTED.name());
    }

    private static final class TestSuggestion extends CollabSuggestionRecord {
        private final UUID id = UUID.randomUUID();

        static TestSuggestion create() {
            TestSuggestion suggestion = new TestSuggestion();
            suggestion.init(CollabDocumentType.SLIP_OUTBOUND, UUID.randomUUID(), UUID.randomUUID(),
                    "제안자", "{\"title\":{\"before\":\"A\",\"after\":\"B\"}}", null);
            return suggestion;
        }

        @Override
        public UUID getId() {
            return id;
        }
    }

    private record StaticRepository(TestSuggestion suggestion)
            implements CollabSuggestionService.SuggestionRepository<TestSuggestion> {
        @Override
        public TestSuggestion save(TestSuggestion suggestion) {
            return suggestion;
        }

        @Override
        public Optional<TestSuggestion> findById(UUID suggestionId) {
            return suggestion.getId().equals(suggestionId) ? Optional.of(suggestion) : Optional.empty();
        }
    }

    private static final class AllowAllPort implements DocumentCollaborationPort {
        @Override
        public CollabDocumentType documentType() {
            return CollabDocumentType.SLIP_OUTBOUND;
        }

        @Override
        public String loadSnapshot(UUID documentId) {
            return "{}";
        }

        @Override
        public boolean canPropose(UUID actorId, UUID documentId) {
            return true;
        }

        @Override
        public boolean canDecide(UUID actorId, UUID documentId) {
            return true;
        }

        @Override
        public void applyChangeSet(UUID documentId, String changeSetJson) {
        }

        @Override
        public void restoreSnapshot(UUID documentId, String snapshotJson) {
        }
    }

    private static final class NoopRealtimeBroker implements RealtimeBroker {
        @Override
        public SseEmitter subscribe(UUID entityId) {
            return new SseEmitter(0L);
        }

        @Override
        public void publish(UUID entityId, String eventName, Object payload) {
        }

        @Override
        public void publishLocal(UUID entityId, String eventName, Object payload) {
        }

        @Override
        public void heartbeat() {
        }

        @Override
        public int subscriberCount(UUID entityId) {
            return 0;
        }

        @Override
        public long publishCount() {
            return 0;
        }

        @Override
        public long publishFailureCount() {
            return 0;
        }

        @Override
        public long heartbeatCount() {
            return 0;
        }
    }
}
