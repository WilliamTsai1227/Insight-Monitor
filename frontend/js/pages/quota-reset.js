import { apiFetch, formatNumber, formatCost, formatDate } from '../api.js';
import { el, clear, buildTable, showLoading, showError, badge } from '../dom.js';
import { pageShell } from '../layout.js';

pageShell('配額管理', '重置使用者當期 Token 配額、變更訂閱方案', '/html/quota-reset.html');

const params = new URLSearchParams(window.location.search);
let userId = params.get('user_id') || '';

const toolbar = document.getElementById('toolbar');
const quotaInfo = document.getElementById('quota-info');
const periodHistory = document.getElementById('period-history');
const tierSection = document.getElementById('tier-section');
const tierHistory = document.getElementById('tier-history');
const tierCatalog = document.getElementById('tier-catalog');

// 與 Stock-Insight-Chat usage_quota.DEFAULT_FALLBACK_MONTHLY_LIMIT 一致
const DEFAULT_FALLBACK_LIMIT = 200000;
let tiers = [];

const userInput = el('input', {
    className: 'input-field',
    placeholder: '使用者 UUID',
    value: userId,
    style: 'min-width:320px',
});
const loadBtn = el('button', { className: 'btn btn-primary', textContent: '載入' });
const resetBtn = el('button', { className: 'btn', textContent: '重置配額', style: 'border-color:rgba(248,113,113,0.4);color:var(--danger)' });
const noteInput = el('input', { className: 'input-field', placeholder: '備註（可選）', style: 'min-width:200px' });

loadBtn.addEventListener('click', () => {
    userId = userInput.value.trim();
    if (!userId) return;
    loadQuota();
});
userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadBtn.click(); });

resetBtn.addEventListener('click', async () => {
    userId = userInput.value.trim();
    if (!userId) return;
    const confirmed = window.confirm(
        `確定要重置使用者 ${userId} 的配額計數器嗎？\n\n` +
        '這會將 used_tokens 歸零並開始新週期，但不會刪除 token_usage_logs 的花費紀錄。'
    );
    if (!confirmed) return;

    resetBtn.disabled = true;
    try {
        const note = noteInput.value.trim() || null;
        const result = await apiFetch(`/api/quota/user/${userId}/reset`, {}, {
            method: 'POST',
            body: { note },
        });
        alert(result.message || '重置成功');
        loadQuota();
    } catch (err) {
        alert('重置失敗：' + err.message);
    } finally {
        resetBtn.disabled = false;
    }
});

toolbar.appendChild(userInput);
toolbar.appendChild(noteInput);
toolbar.appendChild(loadBtn);
toolbar.appendChild(resetBtn);

function copyBtn(text) {
    const btn = el('button', { className: 'btn btn-sm', textContent: '複製' });
    btn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(text);
            btn.textContent = '已複製';
            setTimeout(() => { btn.textContent = '複製'; }, 1500);
        } catch {
            btn.textContent = '失敗';
        }
    });
    return btn;
}

async function loadQuota() {
    showLoading(quotaInfo);
    clear(periodHistory);
    clear(tierSection);
    clear(tierHistory);
    try {
        const data = await apiFetch(`/api/quota/user/${userId}`);
        clear(quotaInfo);

        const stats = el('div', { className: 'stats-grid' });
        [
            { label: '當期已用（配額）', value: formatNumber(data.used_tokens) },
            { label: '月上限', value: formatNumber(data.monthly_token_limit) },
            { label: '剩餘', value: formatNumber(data.remaining_tokens) },
            { label: '當期流水 Token', value: formatNumber(data.current_period?.total_tokens) },
            { label: '當期流水花費', value: formatCost(data.current_period?.total_cost_usd) },
            { label: '累計花費（永不重置）', value: formatCost(data.all_time?.total_cost_usd) },
        ].forEach(s => {
            stats.appendChild(el('div', { className: 'stat-card' },
                el('div', { className: 'label', textContent: s.label }),
                el('div', { className: 'value', textContent: s.value }),
            ));
        });

        const uuidRow = el('div', { className: 'toolbar', style: 'margin-bottom:1rem' });
        uuidRow.appendChild(el('span', { textContent: 'UUID: ' }));
        uuidRow.appendChild(el('code', { textContent: data.user_id || data.id, style: 'font-size:0.85rem' }));
        uuidRow.appendChild(copyBtn(data.user_id || data.id));

        quotaInfo.appendChild(el('div', { className: 'card' },
            el('div', { className: 'card-title', textContent: `${data.email} (${data.username})` }),
            uuidRow,
            el('div', { className: 'detail-grid', style: 'margin-bottom:1rem' },
                el('div', { className: 'detail-item' },
                    el('div', { className: 'label', textContent: '等級' }),
                    el('div', { className: 'value', textContent: data.tier_name || '-' }),
                ),
                el('div', { className: 'detail-item' },
                    el('div', { className: 'label', textContent: '週期起始' }),
                    el('div', { className: 'value', textContent: formatDate(data.current_period_start) }),
                ),
            ),
            stats,
        ));

        renderTierSection(data);
        loadTierHistory(data.user_id || data.id);

        if (data.period_history?.length) {
            periodHistory.appendChild(el('div', { className: 'card' },
                el('div', { className: 'card-title', textContent: '各重置區間用量' }),
                buildTable([
                    { label: '類型', render: r => badge(r.type === 'current' ? '當期' : '已結束', r.type === 'current' ? 'info' : 'neutral') },
                    { label: '區間起始', render: r => formatDate(r.period_start) },
                    { label: '區間結束', render: r => r.period_end ? formatDate(r.period_end) : '進行中' },
                    { label: '配額計數', render: r => r.quota_used_tokens != null ? formatNumber(r.quota_used_tokens) : '-' },
                    { label: '流水 Token', render: r => formatNumber(r.total_tokens) },
                    { label: '流水花費', render: r => formatCost(r.total_cost_usd) },
                    { label: '備註', render: r => r.note || '-' },
                ], data.period_history),
            ));
        }
    } catch (err) {
        showError(quotaInfo, err.message);
    }
}

function tierLabel(t) {
    return `${t.name}（${formatNumber(t.monthly_token_limit)} tokens/月）`;
}

function renderTierSection(user) {
    clear(tierSection);
    const uid = user.user_id || user.id;

    const select = el('select', { className: 'input-field', style: 'min-width:260px' });
    if (!user.tier_id) {
        select.appendChild(el('option', {
            value: '',
            textContent: `（未設定，視同 free：${formatNumber(DEFAULT_FALLBACK_LIMIT)}）`,
        }));
    }
    tiers.forEach(t => {
        const opt = el('option', { value: t.id, textContent: tierLabel(t) });
        if (t.id === user.tier_id) opt.selected = true;
        select.appendChild(opt);
    });

    const note = el('input', { className: 'input-field', placeholder: '變更原因（可選）', style: 'min-width:200px' });
    const btn = el('button', { className: 'btn btn-primary', textContent: '變更方案' });

    btn.addEventListener('click', async () => {
        const tierId = select.value;
        if (!tierId || tierId === user.tier_id) {
            alert('請選擇一個不同的方案');
            return;
        }
        const target = tiers.find(t => t.id === tierId);
        const confirmed = window.confirm(
            `確定要將 ${user.email} 的方案改為 ${target ? tierLabel(target) : tierId} 嗎？\n\n` +
            '新上限立即生效；當期已用量（used_tokens）不會變動。'
        );
        if (!confirmed) return;

        btn.disabled = true;
        try {
            const result = await apiFetch(`/api/users/${uid}/tier`, {}, {
                method: 'PUT',
                body: { tier_id: tierId, note: note.value.trim() || null },
            });
            alert(result.message || '變更成功');
            await loadTiers();
            loadQuota();
        } catch (err) {
            alert('變更失敗：' + err.message);
        } finally {
            btn.disabled = false;
        }
    });

    tierSection.appendChild(el('div', { className: 'card' },
        el('div', { className: 'card-title', textContent: '變更訂閱方案' }),
        el('div', { className: 'toolbar' }, select, note, btn),
        el('p', {
            style: 'font-size:0.82rem;color:var(--text-dim)',
            textContent: '修改 users.tier_id，Stock-Insight-Chat 下一次請求即套用新方案的 monthly_token_limit。若要無上限，可在下方「方案列表」新增一個超大上限的方案再指派。',
        }),
    ));
}

async function loadTierHistory(uid) {
    clear(tierHistory);
    try {
        const { items } = await apiFetch(`/api/users/${uid}/tier-changes`);
        if (!items.length) return;
        tierHistory.appendChild(el('div', { className: 'card' },
            el('div', { className: 'card-title', textContent: '方案異動紀錄' }),
            buildTable([
                { label: '時間', render: r => formatDate(r.changed_at) },
                { label: '原方案', render: r => `${r.previous_tier_name || '（未設定）'} / ${formatNumber(r.previous_monthly_token_limit)}` },
                { label: '新方案', render: r => `${r.new_tier_name || '-'} / ${formatNumber(r.new_monthly_token_limit)}` },
                { label: '備註', render: r => r.note || '-' },
                { label: '操作者', render: r => r.changed_by || '-' },
            ], items),
        ));
    } catch (err) {
        showError(tierHistory, '載入方案異動紀錄失敗：' + err.message);
    }
}

async function loadTiers() {
    try {
        const { items } = await apiFetch('/api/tiers');
        tiers = items;
        renderTierCatalog();
    } catch (err) {
        showError(tierCatalog, '載入方案列表失敗：' + err.message);
    }
}

function renderTierCatalog() {
    clear(tierCatalog);

    const nameInput = el('input', { className: 'input-field', placeholder: '方案名稱（如 unlimited）', maxlength: '50' });
    const limitInput = el('input', {
        className: 'input-field', type: 'number', min: '0', step: '1',
        placeholder: '每月 Token 上限', style: 'min-width:200px',
    });
    const projInput = el('input', {
        className: 'input-field', type: 'number', min: '0', step: '1',
        placeholder: '專案上限', value: '10', style: 'width:110px',
    });
    const unlimitedBtn = el('button', { className: 'btn btn-sm', textContent: '填入極大值' });
    unlimitedBtn.addEventListener('click', () => {
        limitInput.value = String(Number.MAX_SAFE_INTEGER);
        if (!nameInput.value) nameInput.value = 'unlimited';
        projInput.value = '999999';
    });
    const createBtn = el('button', { className: 'btn btn-primary', textContent: '新增方案' });

    createBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const limit = Number(limitInput.value);
        const maxProjects = Number(projInput.value || 10);
        if (!name) { alert('請輸入方案名稱'); return; }
        if (!Number.isSafeInteger(limit) || limit < 0) {
            alert(`上限需為 0 ~ ${formatNumber(Number.MAX_SAFE_INTEGER)} 的整數`);
            return;
        }
        if (!Number.isSafeInteger(maxProjects) || maxProjects < 0) {
            alert('專案上限需為非負整數');
            return;
        }
        if (!window.confirm(`確定新增方案 ${name}（${formatNumber(limit)} tokens/月）嗎？\n此表與 Stock-Insight-Chat 共用。`)) return;

        createBtn.disabled = true;
        try {
            await apiFetch('/api/tiers', {}, {
                method: 'POST',
                body: { name, monthly_token_limit: limit, max_projects: maxProjects },
            });
            await loadTiers();
            if (userId) loadQuota();
        } catch (err) {
            alert('新增失敗：' + err.message);
        } finally {
            createBtn.disabled = false;
        }
    });

    tierCatalog.appendChild(el('div', { className: 'card' },
        el('div', { className: 'card-title', textContent: '方案列表（subscription_tiers）' }),
        buildTable([
            { label: '名稱', key: 'name' },
            { label: '每月 Token 上限', render: r => formatNumber(r.monthly_token_limit) },
            { label: '專案上限', render: r => formatNumber(r.max_projects) },
            { label: '使用者數', render: r => formatNumber(r.user_count) },
            { label: '建立時間', render: r => formatDate(r.created_at) },
        ], tiers),
        el('div', { className: 'toolbar', style: 'margin-top:1rem' },
            nameInput, limitInput, projInput, unlimitedBtn, createBtn),
    ));
}

loadTiers().then(() => { if (userId) loadQuota(); });
