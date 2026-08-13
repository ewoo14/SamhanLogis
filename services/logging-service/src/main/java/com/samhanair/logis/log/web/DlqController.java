package com.samhanair.logis.log.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.log.dlq.DlqOperations;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

/** DLQ 확인·재처리·폐기를 운영자 명령으로만 제공한다. */
@RestController
@RequestMapping("/logs/dlq")
@RequiredArgsConstructor
@ConditionalOnBean({RabbitTemplate.class, RabbitAdmin.class})
public class DlqController {
    private final DlqOperations operations;

    @GetMapping
    public ApiResponse<List<Map<String, Object>>> inspect(
            @RequestParam(defaultValue = "20") int limit) {
        return ApiResponse.ok(operations.inspect(limit));
    }

    @PostMapping("/{messageId}/retry")
    public ApiResponse<Boolean> retry(@PathVariable String messageId) {
        return ApiResponse.ok(operations.retry(messageId));
    }

    @PostMapping("/{messageId}/discard")
    public ApiResponse<Boolean> discard(@PathVariable String messageId, @RequestParam String reason) {
        return ApiResponse.ok(operations.discard(messageId, reason));
    }
}
