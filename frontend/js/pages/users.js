import { apiFetch, formatNumber, formatCost, formatDate, truncate, truncateUuid } from '../api.js';
import { el, clear, buildTable, buildPagination, showLoading, showError, createModal, badge } from '../dom.js';
import { pageShell } from '../layout.js';

pageShell('使用者', '註冊使用者清單與詳細資訊', '/html/users.html');

let currentPage = 1;
const limit = 20;
let searchVal = '';
let statusVal = '';

const tableContainer = document.getElementById('table-container');
const paginationContainer = document.getElementById('pagination-container');
const toolbar = document.getElementById('toolbar');
const modalRoot = document.getElementById('modal-root');

const searchInput = el('input', { className: 'input-field', placeholder: '搜尋 email 或 username…', type: 'search' });
const statusSelect = el('select', { className: 'input-field' });
['', 'active', 'disabled', 'pending'].forEach(v => {
    const opt = el('option', { value: v, textContent: v || '全部狀態' });
    statusSelect.appendChild(opt);
});
const searchBtn = el('button', { className: 'btn btn-primary', textContent: '搜尋' });

searchBtn.addEventListener('click', () => {
    searchVal = searchInput.value.trim();
    statusVal = statusSelect.value;
    currentPage = 1;
    load();
});
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchBtn.click(); });

toolbar.appendChild(searchInput);
toolbar.appendChild(statusSelect);
toolbar.appendChild(searchBtn);

async function load() {
    showLoading(tableContainer);
    clear(paginationContainer);
    try {
        const data = await apiFetch('/api/users', {
            search: searchVal, status: statusVal, page: currentPage, limit,
        });

        const headers = [
            { label: 'UUID', render: r => {
                const wrap = el('span');
                wrap.title = r.id;
                wrap.textContent = truncateUuid(r.id);
                return wrap;
            }},
            { label: 'Email', render: r => r.email },
            { label: 'Username', render: r => r.username },
            { label: '狀態', render: r => badge(r.status, r.status === 'active' ? 'success' : r.status === 'disabled' ? 'danger' : 'warning') },
            { label: '等級', render: r => r.tier_name || '-' },
            { label: '已用 Token', render: r => formatNumber(r.used_tokens) },
            { label: '對話數', render: r => formatNumber(r.chat_count) },
            { label: '註冊時間', render: r => formatDate(r.created_at) },
            { label: '操作', render: r => {
                const btn = el('button', { className: 'btn btn-sm', textContent: '詳情' });
                btn.addEventListener('click', () => showDetail(r.id));
                return btn;
            }},
        ];

        clear(tableContainer);
        tableContainer.appendChild(buildTable(headers, data.items));
        paginationContainer.appendChild(buildPagination(currentPage, data.total, limit, (p) => {
            currentPage = p;
            load();
        }));
    } catch (err) {
        showError(tableContainer, err.message);
    }
}

async function showDetail(userId) {
    const { overlay, body, close } = createModal('使用者詳情');
    modalRoot.appendChild(overlay);
    showLoading(body);

    try {
        const user = await apiFetch(`/api/users/${userId}`);
        clear(body);

        const grid = el('div', { className: 'detail-grid' });
        const uid = user.user_id || user.id;
        const uuidBlock = el('div', { className: 'detail-item', style: 'grid-column:1/-1' });
        uuidBlock.appendChild(el('div', { className: 'label', textContent: 'UUID' }));
        const uuidRow = el('div', { className: 'value', style: 'display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap' });
        uuidRow.appendChild(el('code', { textContent: uid, style: 'font-size:0.82rem;word-break:break-all' }));
        const copyBtn = el('button', { className: 'btn btn-sm', textContent: '複製' });
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(uid);
                copyBtn.textContent = '已複製';
                setTimeout(() => { copyBtn.textContent = '複製'; }, 1500);
            } catch { copyBtn.textContent = '失敗'; }
        });
        uuidRow.appendChild(copyBtn);
        uuidBlock.appendChild(uuidRow);
        grid.appendChild(uuidBlock);

        const fields = [
            ['Email', user.email], ['Username', user.username], ['狀態', user.status],
            ['Google Sub', user.google_sub], ['等級', user.tier_name],
            ['月 Token 上限', formatNumber(user.monthly_token_limit)],
            ['已用 Token', formatNumber(user.used_tokens)],
            ['總花費', formatCost(user.token_summary?.total_cost_usd)],
            ['專案數', formatNumber(user.project_count)],
            ['對話數', formatNumber(user.chat_count)],
            ['最後登入', formatDate(user.last_login_at)],
            ['註冊時間', formatDate(user.created_at)],
        ];
        fields.forEach(([label, val]) => {
            grid.appendChild(el('div', { className: 'detail-item' },
                el('div', { className: 'label', textContent: label }),
                el('div', { className: 'value', textContent: String(val ?? '-') }),
            ));
        });
        body.appendChild(grid);

        if (user.roles?.length) {
            body.appendChild(el('div', { className: 'card', style: 'margin-top:1rem' },
                el('div', { className: 'card-title', textContent: '角色' }),
                el('div', { textContent: user.roles.map(r => r.name).join(', ') }),
            ));
        }

        const actions = el('div', { className: 'toolbar', style: 'margin-top:1rem' });
        const convLink = el('a', { className: 'btn', href: `/html/conversations.html?user_id=${userId}`, textContent: '查看問答紀錄' });
        const tokenLink = el('a', { className: 'btn', href: `/html/tokens.html?user_id=${userId}`, textContent: '查看 Token 用量' });
        const quotaLink = el('a', { className: 'btn', href: `/html/quota-reset.html?user_id=${userId}`, textContent: '配額重置' });
        actions.appendChild(convLink);
        actions.appendChild(tokenLink);
        actions.appendChild(quotaLink);
        body.appendChild(actions);
    } catch (err) {
        showError(body, err.message);
    }

    if (window.lucide) lucide.createIcons();
}

load();
