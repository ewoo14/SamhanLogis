package com.samhanair.logis.groupware.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ChatRoom;
import com.samhanair.logis.groupware.domain.Message;
import com.samhanair.logis.groupware.repository.MessageRepository;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class ChatMessageService {
    private final ConcurrentHashMap<UUID, Object> sequenceLocks = new ConcurrentHashMap<>();
    private final ChatRoomService roomService;
    private final MessageRepository messageRepository;
    private final UserClient userClient;
    private final RealtimeBroker broker;

    @Transactional
    public Message send(String roomCode, UUID senderId, UUID recipientId, String body) {
        return send(roomCode, senderId, java.util.List.of(recipientId), body);
    }

    @Transactional
    public Message send(String roomCode, UUID senderId, java.util.List<UUID> recipientIds, String body) {
        ChatRoom room = roomService.requireParticipant(roomCode, senderId);
        if (body == null || body.isBlank() || body.length() > 2000)
            throw new BusinessException(ErrorCode.INVALID_INPUT, "본문은 1자 이상 2000자 이하로 입력하십시오");
        boolean recipientsValid = recipientIds != null && !recipientIds.isEmpty()
                && (recipientIds.size() == 1 ? userClient.exists(recipientIds.get(0))
                : userClient.verifyActiveBulk(recipientIds).values().stream().allMatch(Boolean.TRUE::equals));
        if (!recipientsValid)
            throw new BusinessException(ErrorCode.NOT_FOUND, "수신자를 찾을 수 없습니다");
        Message saved;
        UUID batchId = recipientIds.size() > 1 ? UUID.randomUUID() : null;
        synchronized (sequenceLocks.computeIfAbsent(room.getId(), ignored -> new Object())) {
            messageRepository.lockRoomSequence(room.getId());
            long sequence = messageRepository.findMaxSequence(room.getId()) + 1;
            var messages = java.util.stream.IntStream.range(0, recipientIds.size())
                    .mapToObj(index -> Message.sendInRoom(room.getId(), sequence + index,
                            senderId, recipientIds.get(index), body.trim(), batchId)).toList();
            saved = recipientIds.size() == 1 ? messageRepository.save(messages.get(0)) : messageRepository.saveAll(messages).get(0);
        }
        Runnable publish = () -> broker.publish(room.getId(), "chat:message-created", java.util.Map.of(
                "roomCode", roomCode, "sequence", saved.getSequence()));
        if (TransactionSynchronizationManager.isSynchronizationActive())
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() { @Override public void afterCommit() { publish.run(); } });
        else publish.run();
        return saved;
    }

    @Transactional(readOnly = true)
    public java.util.List<Message> list(String roomCode, UUID actor) {
        ChatRoom room = roomService.requireParticipant(roomCode, actor);
        var messages = messageRepository.findTop50ByRoomIdOrderBySequenceDesc(room.getId());
        java.util.ArrayList<Message> ordered = new java.util.ArrayList<>(messages);
        java.util.Collections.reverse(ordered);
        var logicalMessages = new java.util.ArrayList<Message>();
        var batchIndexes = new java.util.LinkedHashMap<UUID, Integer>();
        for (Message message : ordered) {
            UUID batchId = message.getBatchId();
            if (batchId == null) {
                logicalMessages.add(message);
                continue;
            }
            Integer existingIndex = batchIndexes.get(batchId);
            if (existingIndex == null) {
                batchIndexes.put(batchId, logicalMessages.size());
                logicalMessages.add(message);
            } else if (message.getRecipientId().equals(actor)
                    && !logicalMessages.get(existingIndex).getRecipientId().equals(actor)) {
                logicalMessages.set(existingIndex, message);
            }
        }
        return logicalMessages;
    }

    @Transactional
    public void markRead(String roomCode, UUID actor, long sequence) {
        ChatRoom room = roomService.requireParticipant(roomCode, actor);
        messageRepository.findAllByRoomIdAndRecipientIdAndSequenceLessThanEqual(room.getId(), actor, sequence)
                .forEach(message -> message.markRead(actor));
    }
}
