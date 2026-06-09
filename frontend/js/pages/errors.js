import { apiFetch, formatDate, truncate } from '../api.js';
import { el, clear, buildTable, buildPagination, showLoading, showError } from '../dom.js';
import { pageShell } from '../layout.js';

pageShell('系統報錯', '依使用者分組的系統報錯統計與完整錯誤列表', '/html/errors.html');

let groupPage = 1;
let allPage = 1;
let filterUserId = '';
const limit = 20;

const byUserSection = document.getElementById('by-user-section');
const allErrorsSection = document.getElementById('all-errors-section');

async function loadByUser() {
    showLoading(byUserSection);
    try {
        const data = await apiFetch('/api/errors/by-user', { page: groupPage, limit });
        clear(byUserSection);
        byUserSection.appendChild(el('div', { className: 'card' },
            el('div', { className: 'card-title', textContent: '依使用者分組' }),
            buildTable([
                { label: 'Email', key: 'email' },
                { label: 'Username', key: 'username' },
                { label: '錯誤次數', render: r => String(r.error_count) },
                { label: '首次錯誤', render: r => formatDate(r.first_error_at) },
                { label: '最近錯誤', render: r => formatDate(r.last_error_at) },
                { label: '操作', render: r => {
                    const btn = el('button', { className: 'btn btn-sm', textContent: '篩選' });
                    btn.addEventListener('click', () => {
                        filterUserId = r.user_id;
                        allPage = 1;
                        loadAllErrors();
                    });
                    return btn;
                }},
            ], data.items),
            buildPagination(groupPage, data.total, limit, (p) => { groupPage = p; loadByUser(); }),
        ));
    } catch (err) {
        showError(byUserSection, err.message);
    }
}

async function loadAllErrors() {
    showLoading(allErrorsSection);
    try {
        const data = await apiFetch('/api/errors/all', {
            user_id: filterUserId, page: allPage, limit,
        });
        clear(allErrorsSection);

        const toolbar = el('div', { className: 'toolbar' });
        if (filterUserId) {
            toolbar.appendChild(el('span', { textContent: `篩選使用者: ${filterUserId.slice(0, 8)}…` }));
            const clearBtn = el('button', { className: 'btn btn-sm', textContent: '清除篩選' });
            clearBtn.addEventListener('click', () => { filterUserId = ''; allPage = 1; loadAllErrors(); });
            toolbar.appendChild(clearBtn);
        }

        allErrorsSection.appendChild(el('div', { className: 'card' },
            el('div', { className: 'card-title', textContent: '全部系統報錯' }),
            toolbar,
            buildTable([
                { label: '使用者', render: r => r.email || r.username },
                { label: '對話', render: r => truncate(r.chat_title, 30) },
                { label: '錯誤訊息', render: r => truncate(r.error_message, 80) },
                { label: '模式', render: r => r.response_mode || '-' },
                { label: '時間', render: r => formatDate(r.created_at) },
            ], data.items),
            buildPagination(allPage, data.total, limit, (p) => { allPage = p; loadAllErrors(); }),
        ));
    } catch (err) {
        showError(allErrorsSection, err.message);
    }
}

loadByUser();
loadAllErrors();
