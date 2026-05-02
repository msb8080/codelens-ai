package com.shuaibo.ai.service;

import com.shuaibo.ai.model.ChatRequest;
import com.shuaibo.ai.model.ChatResponse;
import com.shuaibo.ai.service.rag.RagService;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.stereotype.Service;
import reactor.core.Disposable;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AI对话服务
 * 核心链路：用户提问 → RAG检索 → Prompt组装 → LLM调用 → 可观测性记录
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatModel chatModel;
    private final RagService ragService;
    private final MeterRegistry meterRegistry;

    /** 多轮对话上下文缓存 */
    private final Map<String, List<Message>> conversationHistory = new ConcurrentHashMap<>();

    /** 流式回调接口 */
    public interface StreamCallback {
        void onToken(String token);
        void onComplete(ChatResponse response);
        void onError(Throwable error);
    }

    /** 系统Prompt */
    private static final String SYSTEM_PROMPT = """
            你是一个专业的代码分析助手 CodeLens AI。
            你的能力：
            1. 分析代码结构、设计模式、潜在问题
            2. 基于提供的代码片段回答技术问题
            3. 给出代码改进建议
            
            回答要求：
            - 使用中文回答
            - 如果没有相关代码上下文，请说明无法基于具体代码分析
            - 代码建议要具体可操作
            """;

    /**
     * 处理用户对话
     */
    public ChatResponse chat(ChatRequest request) {
        long startTime = System.currentTimeMillis();
        String sessionId = request.getSessionId() != null ? request.getSessionId() : "default";

        try {
            // 1. RAG检索相关代码片段
            List<String> codeSnippets = ragService.search(request.getQuestion(), 3);
            String context = ragService.buildContext(codeSnippets);

            // 2. 组装Prompt
            List<Message> messages = getOrCreateHistory(sessionId);
            if (context != null && !context.isEmpty()) {
                messages.add(new UserMessage(context + "\n\n用户问题：" + request.getQuestion()));
            } else {
                messages.add(new UserMessage(request.getQuestion()));
            }

            Prompt prompt = new Prompt(messages);

            // 3. 调用LLM
            org.springframework.ai.chat.model.ChatResponse aiResponse = chatModel.call(prompt);
            AssistantMessage assistantMessage = aiResponse.getResult().getOutput();
            String answer = assistantMessage.getContent();

            // 4. 保存对话历史
            messages.add(assistantMessage);

            // 5. 计算耗时
            long latencyMs = System.currentTimeMillis() - startTime;

            // 6. 记录指标
            meterRegistry.counter("codelens.chat.total").increment();
            meterRegistry.timer("codelens.chat.latency").record(java.time.Duration.ofMillis(latencyMs));

            log.info("Chat completed: sessionId={}, ragHits={}, latency={}ms",
                    sessionId, codeSnippets.size(), latencyMs);

            return ChatResponse.builder()
                    .answer(answer)
                    .ragHits(codeSnippets.size())
                    .latencyMs(latencyMs)
                    .build();

        } catch (Exception e) {
            log.error("Chat error: sessionId={}", sessionId, e);
            throw new RuntimeException("对话处理失败: " + e.getMessage(), e);
        }
    }

    /**
     * 流式对话 - 逐token输出
     */
    public void chatStream(ChatRequest request, StreamCallback callback) {
        long startTime = System.currentTimeMillis();
        String sessionId = request.getSessionId() != null ? request.getSessionId() : "default";

        try {
            // 1. RAG检索相关代码片段
            List<String> codeSnippets = ragService.search(request.getQuestion(), 3);
            String context = ragService.buildContext(codeSnippets);

            // 2. 组装Prompt
            List<Message> messages = getOrCreateHistory(sessionId);
            if (context != null && !context.isEmpty()) {
                messages.add(new UserMessage(context + "\n\n用户问题：" + request.getQuestion()));
            } else {
                messages.add(new UserMessage(request.getQuestion()));
            }

            Prompt prompt = new Prompt(messages);

            // 3. 流式调用LLM
            StringBuilder fullAnswer = new StringBuilder();
            final org.springframework.ai.chat.model.ChatResponse[] lastResponse = {null};

            Disposable disposable = chatModel.stream(prompt)
                    .subscribe(
                            chatResponse -> {
                                lastResponse[0] = chatResponse;
                                String content = chatResponse.getResult().getOutput().getContent();
                                if (content != null) {
                                    fullAnswer.append(content);
                                    callback.onToken(content);
                                }
                            },
                            error -> {
                                log.error("Streaming error: sessionId={}", sessionId, error);
                                callback.onError(error);
                            },
                            () -> {
                                // 4. 保存对话历史
                                AssistantMessage assistantMsg = new AssistantMessage(fullAnswer.toString());
                                messages.add(assistantMsg);

                                // 5. 计算耗时
                                long latencyMs = System.currentTimeMillis() - startTime;

                                // 6. 记录指标
                                meterRegistry.counter("codelens.chat.total").increment();
                                meterRegistry.timer("codelens.chat.latency").record(java.time.Duration.ofMillis(latencyMs));

                                log.info("Stream chat completed: sessionId={}, ragHits={}, latency={}ms",
                                        sessionId, codeSnippets.size(), latencyMs);

                                // 7. 构建响应（含 token 用量）
                                ChatResponse.TokenUsage tokenUsage = null;
                                try {
                                    if (lastResponse[0] != null && lastResponse[0].getMetadata() != null) {
                                        var usage = lastResponse[0].getMetadata().getUsage();
                                        if (usage != null) {
                                            tokenUsage = ChatResponse.TokenUsage.builder()
                                                    .promptTokens(usage.getPromptTokens() != null ? usage.getPromptTokens().intValue() : 0)
                                                    .completionTokens(usage.getGenerationTokens() != null ? usage.getGenerationTokens().intValue() : 0)
                                                    .totalTokens(usage.getTotalTokens() != null ? usage.getTotalTokens().intValue() : 0)
                                                    .build();
                                        }
                                    }
                                } catch (Exception ignored) {}

                                callback.onComplete(ChatResponse.builder()
                                        .answer(fullAnswer.toString())
                                        .ragHits(codeSnippets.size())
                                        .latencyMs(latencyMs)
                                        .tokenUsage(tokenUsage)
                                        .build());
                            }
                    );

        } catch (Exception e) {
            log.error("Stream chat error: sessionId={}", sessionId, e);
            callback.onError(e);
        }
    }

    /**
     * 获取或创建会话历史
     */
    private List<Message> getOrCreateHistory(String sessionId) {
        return conversationHistory.computeIfAbsent(sessionId, k -> {
            List<Message> history = new ArrayList<>();
            history.add(new SystemMessage(SYSTEM_PROMPT));
            return history;
        });
    }

    /**
     * 清除会话历史
     */
    public void clearHistory(String sessionId) {
        conversationHistory.remove(sessionId);
    }
}
