// =========================================
// CodeLens AI - 前端应用逻辑
// =========================================

// ===== 配置 =====
const API_BASE = window.location.origin;
const messages = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');

// 流式中断控制
let currentAbort = null;
let streamingMsgEl = null;

// ===== Markdown 渲染 =====
let useMarked = false;
try {
    marked.setOptions({ breaks: true, gfm: true });
    useMarked = true;
    console.log('[CodeLens] marked.js loaded');
} catch (e) {
    console.warn('[CodeLens] marked.js not available', e);
}

function parseMarkdown(text) {
    if (!useMarked || !text) return fallbackMd(text || '');
    const opens = (text.match(/```/g) || []).length;
    if (opens % 2 === 1) {
        const lastIdx = text.lastIndexOf('```');
        const closed = text.substring(0, lastIdx);
        const unclosed = text.substring(lastIdx);
        let html = '';
        if (closed) {
            try { html = marked.parse(closed); } catch { html = fallbackMd(closed); }
        }
        html += '<pre><code>' + escapeHtml(unclosed) + '</code></pre>';
        return html;
    }
    try { return marked.parse(text); }
    catch { return fallbackMd(text); }
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fallbackMd(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
}

// ===== Mermaid 渲染 =====
let useMermaid = false;
let mermaidCounter = 0;

try {
    mermaid.initialize({
        startOnLoad: false, theme: 'dark',
        themeVariables: {
            primaryColor: '#7e5adc', primaryTextColor: '#fff',
            primaryBorderColor: '#a894df', lineColor: '#a894df',
            secondaryColor: '#3d2966', tertiaryColor: '#1a1030',
            background: 'transparent', mainBkg: '#3d2966',
            nodeBorder: '#a894df', titleColor: '#fff'
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
    container.querySelectorAll('code.language-mermaid').forEach((codeEl) => {
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
                wrapper.innerHTML = '<pre style="color:#f87171;">Mermaid: ' + escapeHtml(err.message || err) + '</pre>';
            });
        } catch (err) {
            wrapper.innerHTML = '<pre style="color:#f87171;">Mermaid 渲染失败</pre>';
        }
    });
}

// ===== 智能滚动 =====
function scrollToBottom(force) {
    const cursor = messages.querySelector('.streaming-cursor');
    if (cursor) {
        cursor.scrollIntoView({ behavior: 'auto', block: 'end' });
    } else {
        messages.scrollTop = messages.scrollHeight;
    }
}

// ===== 发送消息 =====
async function send() {
    const question = input.value.trim();
    if (!question) return;

    addMessage('user', question);
    input.value = '';
    autoResize();

    // 切换为停止按钮
    setSending(true);

    const aiMsgEl = createStreamingMessage();
    streamingMsgEl = aiMsgEl;
    const bubbleEl = aiMsgEl.querySelector('.bubble');
    let fullText = '';

    // 中断控制器
    const controller = new AbortController();
    currentAbort = () => {
        controller.abort();
        fullText = finalizeStopped(aiMsgEl, fullText);
    };

    try {
        const res = await fetch(`${API_BASE}/api/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question }),
            signal: controller.signal
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
                        let token;
                        try { token = JSON.parse(raw); } catch { token = raw; }
                        fullText += token;
                        bubbleEl.innerHTML = parseMarkdown(fullText) +
                            '<span class="streaming-cursor"></span>';
                        renderMermaidInElement(bubbleEl);
                        scrollToBottom();
                    } else if (currentEvent === 'done') {
                        try {
                            const result = JSON.parse(raw);
                            finalizeStreamingMessage(aiMsgEl, result.latencyMs, result.ragHits);
                            updateStats(result.latencyMs, result.ragHits);
                        } catch { finalizeStreamingMessage(aiMsgEl); }
                    }
                }
            }
        }

        bubbleEl.innerHTML = parseMarkdown(fullText);
        renderMermaidInElement(bubbleEl);
        if (bubbleEl.querySelector('.streaming-cursor')) {
            finalizeStreamingMessage(aiMsgEl);
        }

    } catch (e) {
        if (e.name === 'AbortError') {
            // 用户中断，已在 currentAbort 中处理
        } else {
            bubbleEl.innerHTML = parseMarkdown(fullText || '') +
                '<br><br>⚠️ 连接失败：' + escapeHtml(e.message);
            const cursor = bubbleEl.querySelector('.streaming-cursor');
            if (cursor) cursor.remove();
            finalizeStreamingMessage(aiMsgEl);
        }
    } finally {
        setSending(false);
        currentAbort = null;
        streamingMsgEl = null;
        input.focus();
    }
}

// ===== 中断后处理 =====
function finalizeStopped(msgEl, fullText) {
    const bubbleEl = msgEl.querySelector('.bubble');
    bubbleEl.innerHTML = parseMarkdown(fullText) +
        '<br><em style="color:var(--brand-light);font-size:0.85em;">⏸ 已中断</em>';
    renderMermaidInElement(bubbleEl);
    finalizeStreamingMessage(msgEl);
    addActionButtons(msgEl, fullText);
    return fullText;
}

// ===== 操作按钮 (复制 / 继续) =====
function addActionButtons(msgEl, text) {
    // 移除已有按钮
    const old = msgEl.querySelector('.msg-actions');
    if (old) old.remove();

    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.innerHTML = `
        <button class="action-btn" onclick="copyText(this, '${escapeAttr(text)}')" title="复制">
            <span class="material-symbols-outlined">content_copy</span>
        </button>
        <button class="action-btn" onclick="continueGenerate(this)" title="继续生成">
            <span class="material-symbols-outlined">play_arrow</span>
        </button>
    `;
    msgEl.querySelector('.msg-body').appendChild(actions);
}

function escapeAttr(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
}

function copyText(btn, text) {
    const decoded = text.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    navigator.clipboard.writeText(decoded).then(() => {
        btn.innerHTML = '<span class="material-symbols-outlined">check</span>';
        setTimeout(() => {
            btn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
        }, 1500);
    });
}

function continueGenerate(btn) {
    const msgEl = btn.closest('.message');
    const bubbleEl = msgEl.querySelector('.bubble');
    // 移除中断提示和按钮
    const stopped = bubbleEl.querySelector('em');
    if (stopped) stopped.remove();
    const actions = msgEl.querySelector('.msg-actions');
    if (actions) actions.remove();
    // 获取当前文本
    const rawText = bubbleEl.textContent || '';
    // 重新发送最后一条用户消息
    const userMsgs = messages.querySelectorAll('.message.user');
    if (userMsgs.length > 0) {
        const lastUserMsg = userMsgs[userMsgs.length - 1];
        const question = lastUserMsg.querySelector('.bubble').textContent;
        // 移除当前不完整的 AI 消息
        msgEl.remove();
        // 重新发送
        input.value = question;
        send();
    }
}

// ===== 发送/停止按钮切换 =====
function setSending(sending) {
    if (sending) {
        sendBtn.disabled = false;
        sendBtn.classList.add('stop-btn');
        sendBtn.innerHTML = '<span class="material-symbols-outlined">stop_circle</span> 停止';
        sendBtn.onclick = () => { if (currentAbort) currentAbort(); };
    } else {
        sendBtn.classList.remove('stop-btn');
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span class="material-symbols-outlined">send</span> 发送';
        sendBtn.onclick = () => send();
    }
}

// ===== 创建流式消息 =====
function createStreamingMessage() {
    const div = document.createElement('div');
    div.className = 'message ai streaming';
    div.innerHTML = `
        <div class="msg-avatar">🤖</div>
        <div class="msg-body">
            <div class="bubble"><span class="streaming-cursor"></span></div>
            <div class="msg-meta">
                <span class="generating-text">正在生成</span>
                <span class="generating-dots"><i></i><i></i><i></i></span>
            </div>
        </div>`;
    messages.appendChild(div);
    scrollToBottom();
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

    // 添加操作按钮
    const bubbleEl = msgEl.querySelector('.bubble');
    const text = bubbleEl ? bubbleEl.textContent : '';
    if (text) addActionButtons(msgEl, text);

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

    const content = role === 'ai' ? parseMarkdown(text) : escapeHtml(text).replace(/\n/g, '<br>');

    div.innerHTML = `
        <div class="msg-avatar">${avatarIcon}</div>
        <div class="msg-body">
            <div class="bubble">${content}</div>
            ${meta}
        </div>`;

    messages.appendChild(div);

    if (role === 'ai') {
        renderMermaidInElement(div.querySelector('.bubble'));
        addActionButtons(div, text);
    }

    scrollToBottom();
    const count = messages.querySelectorAll('.message').length;
    document.getElementById('msgCount').textContent = `消息: ${count}`;
}

// ===== 输入框自适应高度 =====
function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

input.addEventListener('input', autoResize);

// ===== 键盘事件 =====
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (currentAbort) {
            currentAbort();
        } else {
            send();
        }
    }
});

// ===== 更新统计 =====
function updateStats(latency, ragHits) {
    if (latency) document.getElementById('latencyDisplay').textContent = `延迟: ${latency}ms`;
    if (ragHits !== undefined) document.getElementById('ragDisplay').textContent = `RAG: ${ragHits} 命中`;
}

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
            duration: 0.8, opacity: 1, visibility: 'visible',
            y: 0, stagger: 0.15, ease: 'power3.out', delay: 0.1
        });
    } else {
        document.querySelectorAll('.gsap-reveal').forEach(el => {
            el.style.opacity = '1';
            el.style.visibility = 'visible';
        });
    }
});
