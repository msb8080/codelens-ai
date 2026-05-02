// =========================================
// CodeLens AI - 前端应用逻辑
// =========================================

// ===== 配置 =====
const API_BASE = window.location.origin;
const messages = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');

// ===== Markdown 渲染 =====
let useMarked = false;
try {
    marked.setOptions({ breaks: true, gfm: true });
    useMarked = true;
    console.log('[CodeLens] marked.js loaded');
} catch (e) {
    console.warn('[CodeLens] marked.js not available, fallback to regex', e);
}

function parseMarkdown(text) {
    if (useMarked) {
        try {
            return marked.parse(text);
        } catch (e) {
            // 部分 markdown 解析失败时回退
        }
    }
    // 回退: 简易正则
    return text
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>');
}

// 流式渲染: 只做转义+换行，避免不完整 markdown 产生错误 HTML
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderStreaming(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
}

// ===== Mermaid 渲染 =====
let useMermaid = false;
let mermaidCounter = 0;

try {
    mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
            primaryColor: '#7e5adc',
            primaryTextColor: '#fff',
            primaryBorderColor: '#a894df',
            lineColor: '#a894df',
            secondaryColor: '#3d2966',
            tertiaryColor: '#1a1030',
            background: 'transparent',
            mainBkg: '#3d2966',
            nodeBorder: '#a894df',
            titleColor: '#fff'
        },
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        securityLevel: 'loose'
    });
    useMermaid = true;
    console.log('[CodeLens] mermaid.js loaded');
} catch (e) {
    console.warn('[CodeLens] mermaid.js not available', e);
}

function renderMermaidInElement(container) {
    if (!useMermaid) return;

    // 查找 ```mermaid 代码块 (marked 会渲染为 <pre><code class="language-mermaid">)
    const codeEls = container.querySelectorAll('code.language-mermaid');
    codeEls.forEach((codeEl) => {
        const preEl = codeEl.closest('pre');
        if (!preEl) return;

        const graphDef = codeEl.textContent.trim();
        if (!graphDef) return;

        const id = 'mermaid-' + (++mermaidCounter);
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid';
        wrapper.id = id;

        preEl.replaceWith(wrapper);

        try {
            mermaid.render(id + '-svg', graphDef).then(({ svg }) => {
                wrapper.innerHTML = svg;
            }).catch(err => {
                wrapper.innerHTML = '<pre style="color:#f87171;">Mermaid 语法错误: ' +
                    (err.message || err) + '</pre>';
                wrapper.textContent = graphDef;
            });
        } catch (err) {
            wrapper.innerHTML = '<pre style="color:#f87171;">Mermaid 渲染失败</pre>';
        }
    });
}

// ===== 发送消息（流式版） =====
async function send() {
    const question = input.value.trim();
    if (!question) return;

    addMessage('user', question);
    input.value = '';
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="material-symbols-outlined">pending</span> 思考中...';

    const aiMsgEl = createStreamingMessage();
    const bubbleEl = aiMsgEl.querySelector('.bubble');
    let fullText = '';

    try {
        const res = await fetch(`${API_BASE}/api/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop();

            let currentEvent = '';
            for (const line of lines) {
                if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    const raw = line.slice(5);
                    if (currentEvent === 'token') {
                        // JSON 解码 token（后端已编码，保留换行符）
                        let token;
                        try { token = JSON.parse(raw); } catch { token = raw; }
                        fullText += token;
                        // 流式中: 只转义+换行，不做 markdown 解析
                        bubbleEl.innerHTML = renderStreaming(fullText) +
                            '<span class="streaming-cursor"></span>';
                        messages.scrollTop = messages.scrollHeight;
                    } else if (currentEvent === 'done') {
                        try {
                            const result = JSON.parse(raw);
                            finalizeStreamingMessage(aiMsgEl, result.latencyMs, result.ragHits);
                            updateStats(result.latencyMs, result.ragHits);
                        } catch (e) {
                            finalizeStreamingMessage(aiMsgEl);
                        }
                    }
                }
            }
        }

        // 流式结束后最终渲染 + mermaid
        bubbleEl.innerHTML = parseMarkdown(fullText);
        renderMermaidInElement(bubbleEl);

        if (bubbleEl.querySelector('.streaming-cursor')) {
            finalizeStreamingMessage(aiMsgEl);
        }

    } catch (e) {
        // 出错: 先用简单渲染显示已有内容
        bubbleEl.innerHTML = renderStreaming(fullText || '') +
            '<br><br>⚠️ 连接失败：' + escapeHtml(e.message);
        const cursor = bubbleEl.querySelector('.streaming-cursor');
        if (cursor) cursor.remove();
        const meta = aiMsgEl.querySelector('.msg-meta');
        if (meta) meta.textContent = '错误 · ' +
            new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span class="material-symbols-outlined">send</span> 发送';
    }
}

// ===== 创建流式消息容器 =====
function createStreamingMessage() {
    const div = document.createElement('div');
    div.className = 'message ai streaming';
    div.innerHTML = `
        <div class="msg-avatar">🤖</div>
        <div class="msg-body">
            <div class="bubble"><span class="streaming-cursor"></span></div>
            <div class="msg-meta">正在生成...</div>
        </div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
}

// ===== 完成流式消息 =====
function finalizeStreamingMessage(msgEl, latency, ragHits) {
    msgEl.classList.remove('streaming');
    const cursor = msgEl.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();

    const meta = msgEl.querySelector('.msg-meta');
    if (meta) {
        const parts = [];
        if (latency) parts.push(`${latency}ms`);
        if (ragHits !== undefined) parts.push(`RAG: ${ragHits}条`);
        parts.push(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
        meta.textContent = parts.join(' · ');
    }

    const count = messages.querySelectorAll('.message').length;
    document.getElementById('msgCount').textContent = `消息: ${count}`;
}

// ===== 添加消息 =====
function addMessage(role, text, latency, ragHits) {
    const div = document.createElement('div');
    div.className = `message ${role}`;

    const avatarIcon = role === 'user' ? '👤' : '🤖';

    let meta = '';
    if (role === 'ai') {
        const parts = [];
        if (latency) parts.push(`${latency}ms`);
        if (ragHits !== undefined) parts.push(`RAG: ${ragHits}条`);
        parts.push(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
        meta = `<div class="msg-meta">${parts.join(' · ')}</div>`;
    } else {
        meta = `<div class="msg-meta">${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>`;
    }

    const content = role === 'ai' ? parseMarkdown(text) : text.replace(/\n/g, '<br>');

    div.innerHTML = `
        <div class="msg-avatar">${avatarIcon}</div>
        <div class="msg-body">
            <div class="bubble">${content}</div>
            ${meta}
        </div>`;

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;

    if (role === 'ai') {
        renderMermaidInElement(div.querySelector('.bubble'));
    }

    const count = messages.querySelectorAll('.message').length;
    document.getElementById('msgCount').textContent = `消息: ${count}`;
}

// ===== 打字指示器 =====
function addTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'message ai';
    div.id = 'typing-' + Date.now();
    div.innerHTML = `
        <div class="msg-avatar">🤖</div>
        <div class="msg-body">
            <div class="bubble">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div.id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// ===== 更新统计 =====
function updateStats(latency, ragHits) {
    if (latency) document.getElementById('latencyDisplay').textContent = `延迟: ${latency}ms`;
    if (ragHits !== undefined) document.getElementById('ragDisplay').textContent = `RAG: ${ragHits} 命中`;
}

// ===== 键盘事件 =====
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

// ===== 3D 卡片鼠标追踪 =====
const chatCard = document.getElementById('chatCard');
const wrapper = document.querySelector('.chat-card-wrapper');

if (wrapper && chatCard) {
    wrapper.addEventListener('mousemove', (e) => {
        const rect = wrapper.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        chatCard.style.transform = `rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
    });
    wrapper.addEventListener('mouseleave', () => {
        chatCard.style.transform = '';
    });
}

// ===== GSAP 入场动画 =====
document.addEventListener('DOMContentLoaded', () => {
    if (typeof gsap !== 'undefined') {
        gsap.set('.gsap-reveal', { y: 30 });
        gsap.to('.gsap-reveal', {
            duration: 0.8,
            opacity: 1,
            visibility: 'visible',
            y: 0,
            stagger: 0.15,
            ease: 'power3.out',
            delay: 0.1
        });
    } else {
        // 没有 gsap 时直接显示
        document.querySelectorAll('.gsap-reveal').forEach(el => {
            el.style.opacity = '1';
            el.style.visibility = 'visible';
        });
    }
});
