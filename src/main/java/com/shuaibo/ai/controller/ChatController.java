package com.shuaibo.ai.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shuaibo.ai.model.ChatRequest;
import com.shuaibo.ai.model.ChatResponse;
import com.shuaibo.ai.service.ChatService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
    public ChatResponse chat(@RequestBody ChatRequest request) {
        return chatService.chat(request);
    }

    /**
     * AI对话（SSE流式输出）
     */
    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chatStream(@RequestBody ChatRequest request) {
        SseEmitter emitter = new SseEmitter(120_000L); // 2分钟超时

        chatService.chatStream(request, new ChatService.StreamCallback() {
            @Override
            public void onToken(String token) {
                try {
                    // JSON 编码 token，保留其中的 \n 等特殊字符
                    // SSE 用 \n 分隔行，token 内的 \n 会导致数据丢失
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
                emitter.completeWithError(error);
            }
        });

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
