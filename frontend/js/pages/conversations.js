import { apiFetch, formatDate, truncate } from '../api.js';
import { el, clear, showLoading, showError } from '../dom.js';
import { pageShell } from '../layout.js';

pageShell('問答紀錄', '搜尋使用者問答紀錄，查看完整對話', '/html/conversations.html');

const params = new URLSearchParams(window.location.search);
let userId = params.get('user_id') || '';
let searchQ = '';

const toolbar = document.getElementById('toolbar');
const chatList = document.getElementById('chat-list');
const chatDetail = document.getElementById('chat-detail');
const chatDetailTitle = document.getElementById('chat-detail-title');

const userInput = el('input', { className: 'input-field', placeholder: '使用者 UUID（可選）', value: userId });
const searchInput = el('input', { className: 'input-field', placeholder: '搜尋訊息內容…', type: 'search' });
const searchBtn = el('button', { className: 'btn btn-primary', textContent: '搜尋' });
const loadChatsBtn = el('button', { className: 'btn', textContent: '載入對話列表' });

searchBtn.addEventListener('click', () => {
    userId = userInput.value.trim();
    searchQ = searchInput.value.trim();
    if (searchQ) searchMessages();
    else loadChats();
});
loadChatsBtn.addEventListener('click', () => {
    userId = userInput.value.trim();
    loadChats();
});

toolbar.appendChild(userInput);
toolbar.appendChild(searchInput);
toolbar.appendChild(searchBtn);
toolbar.appendChild(loadChatsBtn);

async function loadChats() {
    if (!userId) {
        clear(chatList);
        chatList.appendChild(el('div', { className: 'empty-state', textContent: '請輸入使用者 UUID 後載入對話列表' }));
        return;
    }
    showLoading(chatList);
    try {
        const data = await apiFetch(`/api/conversations/user/${userId}/chats`, { limit: 50 });
        clear(chatList);
        if (!data.items.length) {
            chatList.appendChild(el('div', { className: 'empty-state', textContent: '沒有對話紀錄' }));
            return;
        }
        data.items.forEach(chat => {
            const item = el('div', { className: 'list-item' });
            item.appendChild(el('div', { className: 'item-title', textContent: chat.title || '未命名對話' }));
            item.appendChild(el('div', { className: 'item-sub', textContent: `${formatDate(chat.updated_at)} · ${chat.message_count} 則訊息` }));
            if (chat.first_question) {
                item.appendChild(el('div', { className: 'item-sub', textContent: truncate(chat.first_question, 60) }));
            }
            item.addEventListener('click', () => {
                document.querySelectorAll('.list-item').forEach(li => li.classList.remove('active'));
                item.classList.add('active');
                loadChatDetail(chat.id, chat.title);
            });
            chatList.appendChild(item);
        });
    } catch (err) {
        showError(chatList, err.message);
    }
}

async function searchMessages() {
    showLoading(chatList);
    try {
        const data = await apiFetch('/api/conversations/search', {
            user_id: userId, q: searchQ, limit: 50,
        });
        clear(chatList);
        if (!data.items.length) {
            chatList.appendChild(el('div', { className: 'empty-state', textContent: '找不到符合的訊息' }));
            return;
        }
        data.items.forEach(msg => {
            const item = el('div', { className: 'list-item' });
            const roleLabel = msg.role === 'user' ? '使用者' : 'AI';
            item.appendChild(el('div', { className: 'item-title', textContent: `[${roleLabel}] ${truncate(msg.content, 50)}` }));
            item.appendChild(el('div', { className: 'item-sub', textContent: `${msg.username || msg.email} · ${formatDate(msg.created_at)}` }));
            item.addEventListener('click', () => {
                document.querySelectorAll('.list-item').forEach(li => li.classList.remove('active'));
                item.classList.add('active');
                loadChatDetail(msg.chat_id, msg.chat_title);
            });
            chatList.appendChild(item);
        });
    } catch (err) {
        showError(chatList, err.message);
    }
}

async function loadChatDetail(chatId, title) {
    chatDetailTitle.textContent = title || '對話內容';
    showLoading(chatDetail);
    try {
        const data = await apiFetch(`/api/conversations/${chatId}`);
        clear(chatDetail);
        const view = el('div', { className: 'chat-view' });
        data.messages.forEach(msg => {
            const bubble = el('div', { className: `chat-msg ${msg.role}` });
            bubble.appendChild(el('div', { textContent: msg.content }));
            bubble.appendChild(el('div', { className: 'msg-meta', textContent: `${msg.role} · ${formatDate(msg.created_at)}` }));
            view.appendChild(bubble);
        });
        chatDetail.appendChild(view);
    } catch (err) {
        showError(chatDetail, err.message);
    }
}

if (userId) loadChats();
