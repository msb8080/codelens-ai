package com.shuaibo.ai.service;

import com.shuaibo.ai.config.ModelFactory;
import com.shuaibo.ai.exception.ApiKeyInvalidException;
import com.shuaibo.ai.exception.ModelNotFoundException;
import com.shuaibo.ai.exception.RateLimitedException;
import com.shuaibo.ai.exception.TimeoutException;
import com.shuaibo.ai.exception.UpstreamServiceException;
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
    private final ModelFactory modelFactory;

    /** 获取实际使用的模型 */
    private ChatModel resolveModel(String modelName, String baseUrl, String apiKey) {
        if (modelName != null || baseUrl != null || apiKey != null) {
            ChatModel dynamic = modelFactory.getModel(modelName, baseUrl, apiKey);
            if (dynamic != null) {
                log.debug("Using dynamic model: model={}, baseUrl={}", modelName, baseUrl);
                return dynamic;
            }
        }
        return chatModel; // 回退到默认
    }

    /** 多轮对话上下文缓存 */
    private final Map<String, List<Message>> conversationHistory = new ConcurrentHashMap<>();

    /** 流式回调接口 */
    public interface StreamCallback {
        void onToken(String token);
        void onComplete(ChatResponse response);
        void onError(Throwable error);
    }

    /** 默认系统 Prompt */
    private static final String DEFAULT_SYSTEM_PROMPT = """
            你是 OmniAgent，一个全能的 AI 智能体助手。
            
            核心能力：
            1. 代码分析 — 分析代码结构、设计模式、潜在问题，给出具体改进建议
            2. 技术问答 — 基于代码片段和技术上下文回答问题
            3. 写作辅助 — 帮助撰写文档、PRD、设计方案
            4. 通用问答 — 回答各类知识性问题
            
            回答规范：
            - 使用中文回答
            - 使用 Markdown 格式组织内容（标题、列表、代码块、表格）
            - 代码块必须标注语言类型
            - 关键信息用 **加粗** 强调
            - 回答要简洁专业，避免冗余
            - 不确定的信息要明确说明
            - 涉及医疗/法律/财务时必须附免责声明
            """;

    /**
     * 处理用户对话
     */
    public ChatResponse chat(ChatRequest request) {
        long startTime = System.currentTimeMillis();
        String sessionId = request.getSessionId() != null ? request.getSessionId() : "default";
        String systemPrompt = request.getSystemPrompt() != null && !request.getSystemPrompt().isEmpty()
                ? request.getSystemPrompt() : DEFAULT_SYSTEM_PROMPT;

        try {
            // 1. RAG检索相关代码片段
            List<String> codeSnippets = ragService.search(request.getQuestion(), 3);
            String context = ragService.buildContext(codeSnippets);

            // 2. 组装Prompt
            List<Message> messages = getOrCreateHistory(sessionId, systemPrompt);
            if (context != null && !context.isEmpty()) {
                messages.add(new UserMessage(context + "\n\n用户问题：" + request.getQuestion()));
            } else {
                messages.add(new UserMessage(request.getQuestion()));
            }

            Prompt prompt = new Prompt(messages);

            // 3. 调用LLM（支持动态模型）
            ChatModel model = resolveModel(request.getModel(), request.getBaseUrl(), request.getApiKey());
            org.springframework.ai.chat.model.ChatResponse aiResponse = model.call(prompt);
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

        } catch (org.springframework.web.client.HttpClientErrorException.Unauthorized e) {
            logUpstreamError(sessionId, request);
            throw new ApiKeyInvalidException("API Key 无效，请检查配置", e);
        } catch (org.springframework.web.client.HttpClientErrorException.NotFound e) {
            logUpstreamError(sessionId, request);
            throw new ModelNotFoundException("模型不存在，请检查模型 ID 或 Base URL", e);
        } catch (org.springframework.web.client.HttpClientErrorException.TooManyRequests e) {
            logUpstreamError(sessionId, request);
            throw new RateLimitedException("请求过于频繁，请稍后重试", e);
        } catch (org.springframework.web.client.ResourceAccessException e) {
            logUpstreamError(sessionId, request);
            if (isTimeout(e)) {
                throw new TimeoutException("请求超时，请重试", e);
            }
            throw new UpstreamServiceException("连接失败，请检查网络或 API 地址", e);
        } catch (Exception e) {
            log.error("Chat error: sessionId={}, model={}, baseUrl={}", sessionId, request.getModel(), request.getBaseUrl(), e);
            throw new UpstreamServiceException("对话处理失败: " + e.getMessage(), e);
        }
    }

    /**
     * 流式对话 - 逐token输出
     */
    public void chatStream(ChatRequest request, StreamCallback callback) {
        long startTime = System.currentTimeMillis();
        String sessionId = request.getSessionId() != null ? request.getSessionId() : "default";
        String systemPrompt = request.getSystemPrompt() != null && !request.getSystemPrompt().isEmpty()
                ? request.getSystemPrompt() : DEFAULT_SYSTEM_PROMPT;

        try {
            // 1. RAG检索相关代码片段
            List<String> codeSnippets = ragService.search(request.getQuestion(), 3);
            String context = ragService.buildContext(codeSnippets);

            // 2. 组装Prompt
            List<Message> messages = getOrCreateHistory(sessionId, systemPrompt);
            if (context != null && !context.isEmpty()) {
                messages.add(new UserMessage(context + "\n\n用户问题：" + request.getQuestion()));
            } else {
                messages.add(new UserMessage(request.getQuestion()));
            }

            Prompt prompt = new Prompt(messages);

            // 3. 流式调用LLM（支持动态模型）
            ChatModel model = resolveModel(request.getModel(), request.getBaseUrl(), request.getApiKey());
            StringBuilder fullAnswer = new StringBuilder();
            final org.springframework.ai.chat.model.ChatResponse[] lastResponse = {null};

            Disposable disposable = model.stream(prompt)
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

        } catch (org.springframework.web.client.HttpClientErrorException.Unauthorized e) {
            logUpstreamError(sessionId, request);
            callback.onError(new ApiKeyInvalidException("API Key 无效，请检查配置", e));
        } catch (org.springframework.web.client.HttpClientErrorException.NotFound e) {
            logUpstreamError(sessionId, request);
            callback.onError(new ModelNotFoundException("模型不存在，请检查模型 ID 或 Base URL", e));
        } catch (org.springframework.web.client.HttpClientErrorException.TooManyRequests e) {
            logUpstreamError(sessionId, request);
            callback.onError(new RateLimitedException("请求过于频繁，请稍后重试", e));
        } catch (org.springframework.web.client.ResourceAccessException e) {
            logUpstreamError(sessionId, request);
            if (isTimeout(e)) {
                callback.onError(new TimeoutException("请求超时，请重试", e));
            } else {
                callback.onError(new UpstreamServiceException("连接失败，请检查网络或 API 地址", e));
            }
        } catch (Exception e) {
            log.error("Stream chat error: sessionId={}, model={}, baseUrl={}", sessionId, request.getModel(), request.getBaseUrl(), e);
            callback.onError(new UpstreamServiceException("对话处理失败: " + e.getMessage(), e));
        }
    }

    /**
     * 获取或创建会话历史（支持动态 systemPrompt）
     */
    private List<Message> getOrCreateHistory(String sessionId, String systemPrompt) {
        return conversationHistory.computeIfAbsent(sessionId, k -> {
            List<Message> history = new ArrayList<>();
            history.add(new SystemMessage(systemPrompt));
            return history;
        });
    }

    /** @deprecated 使用带 systemPrompt 的版本 */
    private List<Message> getOrCreateHistory(String sessionId) {
        return getOrCreateHistory(sessionId, DEFAULT_SYSTEM_PROMPT);
    }

    /**
     * 清除会话历史
     */
    public void clearHistory(String sessionId) {
        conversationHistory.remove(sessionId);
    }

    private void logUpstreamError(String sessionId, ChatRequest request) {
        log.warn("Upstream chat error: sessionId={}, model={}, baseUrl={}, apiKeyPresent={}",
                sessionId,
                request.getModel(),
                request.getBaseUrl(),
                request.getApiKey() != null && !request.getApiKey().isBlank());
    }

    private boolean isTimeout(Throwable e) {
        String message = e.getMessage();
        return message != null && message.toLowerCase().contains("timeout");
    }
}
