package com.shuaibo.ai.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shuaibo.ai.model.ChatRequest;
import com.shuaibo.ai.model.ChatResponse;
import com.shuaibo.ai.service.ChatService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;

/**
 * AI对话接口
 */
@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * AI对话（非流式）
     */
    @PostMapping("/chat")
    public ChatResponse chat(@Valid @RequestBody ChatRequest request) {
        return chatService.chat(request);
    }

    /**
     * AI对话（SSE流式输出）
     */
    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chatStream(@Valid @RequestBody ChatRequest request) {
        SseEmitter emitter = new SseEmitter(120_000L); // 2分钟超时

        try {
            chatService.chatStream(request, new ChatService.StreamCallback() {
                @Override
                public void onToken(String token) {
                    try {
                        String jsonToken = objectMapper.writeValueAsString(token);
                        emitter.send(SseEmitter.event()
                                .name("token")
                                .data(jsonToken));
                    } catch (IOException e) {
                        emitter.completeWithError(e);
                    }
                }

                @Override
                public void onComplete(ChatResponse response) {
                    try {
                        emitter.send(SseEmitter.event()
                                .name("done")
                                .data(response));
                        emitter.complete();
                    } catch (IOException e) {
                        emitter.completeWithError(e);
                    }
                }

                @Override
                public void onError(Throwable error) {
                    log.error("Streaming error", error);
                    try {
                        emitter.send(SseEmitter.event()
                                .name("error")
                                .data(error.getMessage() == null ? "请求失败" : error.getMessage()));
                        emitter.complete();
                    } catch (IOException e) {
                        emitter.completeWithError(e);
                    }
                }
            });
        } catch (RuntimeException e) {
            emitter.completeWithError(e);
            throw e;
        }

        return emitter;
    }

    /**
     * 清除会话历史
     */
    @DeleteMapping("/chat/{sessionId}")
    public String clearHistory(@PathVariable String sessionId) {
        chatService.clearHistory(sessionId);
        return "ok";
    }

    /**
     * 健康检查
     */
    @GetMapping("/health")
    public String health() {
        return "OmniAgent is running";
    }
}
