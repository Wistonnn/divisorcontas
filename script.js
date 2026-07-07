// ==========================================
// CONFIGURAÇÃO SUPABASE
// ==========================================
const SUPABASE_URL = 'https://lrbmineygusspbialpnv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyYm1pbmV5Z3Vzc3BiaWFscG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjQ1MjcsImV4cCI6MjA5MDA0MDUyN30.5IC9m4D4Tz4P2N8sY40fgtDl41Lpvg-In3cvZ_kCbLY';

// Inicializa o cliente Supabase
let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error('Supabase SDK não foi carregado corretamente.');
}

// Controle de Inicialização
let isInitializing = false;

// Estado Global
let isOfflineMode = localStorage.getItem('bill-splitter-offline') === 'true';
let sortConfig = JSON.parse(localStorage.getItem('bs-sort-config') || '{"luz":{"field":"date","asc":false},"agua":{"field":"date","asc":false},"entradas":{"field":"date","asc":false}}');
let filterConfig = JSON.parse(localStorage.getItem('bs-filter-config') || '{"luz":"todas","agua":"todas"}');

// ==========================================
// SERVIÇO DE DADOS (ABSTRAÇÃO)
// ==========================================
const DataService = {
    async getBills() {
        if (isOfflineMode) {
            return JSON.parse(localStorage.getItem('bs-bills') || '[]');
        }
        const { data, error } = await supabaseClient.from('bills').select('*').order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    async getPayments() {
        if (isOfflineMode) {
            return JSON.parse(localStorage.getItem('bs-payments') || '[]');
        }
        const { data, error } = await supabaseClient.from('payments').select('*').order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    async saveBill(bill) {
        if (isOfflineMode) {
            const bills = await this.getBills();
            const newBill = { ...bill, id: crypto.randomUUID(), created_at: new Date().toISOString() };
            bills.push(newBill);
            localStorage.setItem('bs-bills', JSON.stringify(bills));
            return;
        }
        const { error } = await supabaseClient.from('bills').insert([bill]);
        if (error) throw error;
    },

    async savePayment(payment) {
        if (isOfflineMode) {
            const payments = await this.getPayments();
            const newPayment = { ...payment, id: crypto.randomUUID(), created_at: new Date().toISOString() };
            payments.push(newPayment);
            localStorage.setItem('bs-payments', JSON.stringify(payments));
            return;
        }
        const { error } = await supabaseClient.from('payments').insert([payment]);
        if (error) throw error;
    },

    async deleteBill(id) {
        if (isOfflineMode) {
            const bills = (await this.getBills()).filter(b => b.id !== id);
            localStorage.setItem('bs-bills', JSON.stringify(bills));
            return;
        }
        const { error } = await supabaseClient.from('bills').delete().eq('id', id);
        if (error) throw error;
    },

    async deletePayment(id) {
        if (isOfflineMode) {
            const payments = (await this.getPayments()).filter(p => p.id !== id);
            localStorage.setItem('bs-payments', JSON.stringify(payments));
            return;
        }
        const { error } = await supabaseClient.from('payments').delete().eq('id', id);
        if (error) throw error;
    },

    async updateBill(id, updated) {
        if (isOfflineMode) {
            const bills = await this.getBills();
            const idx = bills.findIndex(b => b.id === id);
            if (idx !== -1) {
                bills[idx] = { ...bills[idx], ...updated };
                localStorage.setItem('bs-bills', JSON.stringify(bills));
            }
            return;
        }
        const { error } = await supabaseClient.from('bills').update(updated).eq('id', id);
        if (error) throw error;
    },

    async updatePayment(id, updated) {
        if (isOfflineMode) {
            const payments = await this.getPayments();
            const idx = payments.findIndex(p => p.id === id);
            if (idx !== -1) {
                payments[idx] = { ...payments[idx], ...updated };
                localStorage.setItem('bs-payments', JSON.stringify(payments));
            }
            return;
        }
        const { error } = await supabaseClient.from('payments').update(updated).eq('id', id);
        if (error) throw error;
    },

    async seedIfEmpty() {
        if (isOfflineMode) {
            const b = await this.getBills();
            const p = await this.getPayments();
            if (b.length === 0 && p.length === 0) {
                console.log('Semeando dados offline...');
                localStorage.setItem('bs-bills', JSON.stringify(SEED_BILLS));
                localStorage.setItem('bs-payments', JSON.stringify(SEED_PAYMENTS));
            }
            return;
        }

        // Se já semeou nesta sessão ou existe a flag, pula
        if (localStorage.getItem('bs-seeded-online')) return;

        try {
            const [b, p] = await Promise.all([
                supabaseClient.from('bills').select('id', { count: 'exact', head: true }),
                supabaseClient.from('payments').select('id', { count: 'exact', head: true })
            ]);

            // Se houver QUALQUER registro em uma das tabelas, não semeia
            if ((b.count === 0 || b.count === null) && (p.count === 0 || p.count === null)) {
                console.log('Banco vazio. Semeando dados iniciais...');
                await Promise.all([
                    supabaseClient.from('bills').insert(SEED_BILLS),
                    supabaseClient.from('payments').insert(SEED_PAYMENTS)
                ]);
                localStorage.setItem('bs-seeded-online', 'true');
            } else {
                // Se já tem dados, marca como semeado para não checar mais o count (performance)
                localStorage.setItem('bs-seeded-online', 'true');
            }
        } catch (err) {
            console.warn('Falha ao checar/semear dados:', err.message);
        }
    }
};

// Utilitários de UI
const formatCurrency = (value) => {
    return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

function parseDate(dateStr) {
    if (!dateStr || dateStr === 'Inicial') return new Date(0);
    const parts = dateStr.split('/');
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    let year = parts[2] ? parseInt(parts[2]) : new Date().getFullYear();
    if (year < 100) {
        year += 2000;
    }
    return new Date(year, month, day);
}

function toggleSort(listKey, field) {
    if (sortConfig[listKey].field === field) {
        sortConfig[listKey].asc = !sortConfig[listKey].asc;
    } else {
        sortConfig[listKey].field = field;
        sortConfig[listKey].asc = field === 'amount' ? false : true; // Valor default desc, Data default asc
    }
    localStorage.setItem('bs-sort-config', JSON.stringify(sortConfig));
    initApp();
}

function toggleFilter(listKey, value) {
    filterConfig[listKey] = value;
    localStorage.setItem('bs-filter-config', JSON.stringify(filterConfig));
    initApp();
}

function showError(msg) {
    const banner = document.getElementById('error-banner') || document.createElement('div');
    banner.id = 'error-banner';
    banner.style.cssText = 'background:#EF4444;color:white;padding:1rem;font-weight:700;text-align:center;position:sticky;top:0;z-index:9999;';
    banner.textContent = '⚠️ ' + msg;
    if (!document.getElementById('error-banner')) document.body.prepend(banner);
    setTimeout(() => banner.remove(), 5000);
}

// Funções de Renderização
function renderList(containerId, items, isEntrada = false) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (items.length === 0) {
        container.innerHTML = '<div class="list-item"><span class="item-month" style="opacity: 0.5;">Nenhum registro</span></div>';
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        const isPaid = !isEntrada && item.is_paid;
        div.className = `list-item ${isPaid ? 'is-paid' : ''}`;
        div.style.animationDelay = `${items.indexOf(item) * 0.05}s`;
        
        const actionCheck = isEntrada ? '' : `
            <button class="btn-icon btn-check" onclick="handleTogglePaid('${item.id}', ${item.is_paid})" title="${item.is_paid ? 'Marcar como não pago' : 'Marcar como pago'}">
                ${item.is_paid ? '✅' : '✔️'}
            </button>
        `;

        // Limpa resíduos e remove "Paula" do título se for entrada (já que a coluna já diz que é dela)
        let rawMonth = item.month || item.description || 'Pagamento';
        let displayMonth = rawMonth.replace(/🕘|🕘|📅|Venc:|Pago em:|Venc|Pago em/g, '').trim();
        
        if (isEntrada) {
            displayMonth = displayMonth.replace(/Paula/g, '').trim();
            if (!displayMonth) displayMonth = 'Pagamento';
        }

        div.innerHTML = `
            <div class="item-info">
                <span class="item-month">${displayMonth}</span>
                <span class="item-date">${isEntrada ? '📅 Pago em' : '🕘 Venc'}: ${item.due_date || item.date}</span>
            </div>
            <span class="item-value" style="${isEntrada ? 'color:var(--color-positive)' : ''}">${formatCurrency(item.amount)}</span>
            <div class="item-actions">
                ${actionCheck}
                <button class="btn-icon btn-edit" onclick="handleEdit('${isEntrada ? 'entrada' : 'conta'}', '${item.id}')" title="Editar">✏️</button>
                <button class="btn-icon btn-delete" onclick="handleDelete('${isEntrada ? 'entrada' : 'conta'}', '${item.id}')" title="Excluir">🗑️</button>
            </div>
        `;
        container.appendChild(div);
    });
}

async function handleTogglePaid(id, currentStatus) {
    try {
        await DataService.updateBill(id, { is_paid: !currentStatus });
        await initApp();
    } catch (err) {
        showError("Erro ao atualizar status: " + err.message);
    }
}

async function handleDelete(type, id) {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return;
    try {
        if (type === 'conta') {
            await DataService.deleteBill(id);
        } else {
            await DataService.deletePayment(id);
        }
        await initApp();
    } catch (err) {
        showError("Erro ao deletar: " + err.message);
    }
}

let editingId = null;
let editingType = null;

async function handleEdit(type, id) {
    editingId = id;
    editingType = type;
    
    try {
        if (type === 'conta') {
            const bills = await DataService.getBills();
            const bill = bills.find(b => b.id === id);
            if (!bill) return;
            
            document.getElementById('tipo-conta').value = bill.type;
            document.getElementById('mes-conta').value = bill.month;
            document.getElementById('venc-conta').value = bill.due_date;
            document.getElementById('valor-conta').value = bill.amount;
            
            document.querySelector('#modal-conta h2').textContent = 'Editar Conta';
            document.getElementById('btn-save-conta').textContent = 'Atualizar Conta';
            openModal('modal-conta');
        } else {
            const payments = await DataService.getPayments();
            const payment = payments.find(p => p.id === id);
            if (!payment) return;
            
            document.getElementById('data-entrada').value = payment.date;
            document.getElementById('valor-entrada').value = payment.amount;
            
            document.querySelector('#modal-entrada h2').textContent = 'Editar Pagamento';
            document.getElementById('btn-save-entrada').textContent = 'Atualizar Pagamento';
            openModal('modal-entrada');
        }
    } catch (err) {
        showError("Erro ao carregar dados para edição: " + err.message);
    }
}

function calculateDashboard(luzData, aguaData, entradasData) {
    // Totais Totais (Histórico)
    const totalLuzHistorico = luzData.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const totalAguaHistorico = aguaData.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const totalEntradas = entradasData.reduce((acc, curr) => acc + Number(curr.amount), 0);

    // Totais Ativos (Apenas o que NÃO foi pago)
    const totalLuzAtivo = luzData.filter(b => !b.is_paid).reduce((acc, curr) => acc + Number(curr.amount), 0);
    const totalAguaAtivo = aguaData.filter(b => !b.is_paid).reduce((acc, curr) => acc + Number(curr.amount), 0);

    const valorGeralContas = totalLuzHistorico + totalAguaHistorico;
    const valorDivisao = valorGeralContas / 2;
    const paulaPagou = totalEntradas;
    const residual = valorDivisao - paulaPagou;

    document.getElementById('val-total-contas').textContent = formatCurrency(valorGeralContas);
    document.getElementById('val-metade').textContent = formatCurrency(valorDivisao);
    document.getElementById('val-pago').textContent = formatCurrency(paulaPagou);
    
    const elResidual = document.getElementById('val-residual');
    elResidual.textContent = formatCurrency(Math.abs(residual));
    const labelResidual = document.querySelector('.summary-card.residual h3');
    
    if (residual > 0) {
        elResidual.className = 'value negative';
        labelResidual.textContent = 'Falta a Paula Pagar';
    } else {
        elResidual.className = 'value positive';
        labelResidual.textContent = 'Crédito da Paula';
    }

    // Títulos das colunas mostram apenas o "A pagar" (Ativo)
    document.getElementById('total-luz').textContent = formatCurrency(totalLuzAtivo);
    document.getElementById('total-agua').textContent = formatCurrency(totalAguaAtivo);
    document.getElementById('total-entradas').textContent = formatCurrency(totalEntradas);
}

// ==========================================
// AUTENTICAÇÃO
// ==========================================

async function handleLogin(e) {
    e.preventDefault();
    console.log('Tentando login...');
    
    if (!supabaseClient) {
        showError('Erro: O serviço de login não foi carregado. Verifique sua conexão.');
        return;
    }

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login');
    const errorEl = document.getElementById('login-error');

    btn.disabled = true;
    const originalBtnText = btn.textContent;
    btn.textContent = 'Entrando...';
    errorEl.style.display = 'none';

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            console.error('Erro no Supabase:', error.message);
            errorEl.textContent = 'E-mail ou senha incorretos.'; // Mensagem amigável
            errorEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = originalBtnText;
        } else {
            console.log('Login bem-sucedido!');
            await checkSession();
        }
    } catch (err) {
        console.error('Erro inesperado no login:', err);
        errorEl.textContent = 'Erro de conexão. Tente novamente.';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = originalBtnText;
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    checkSession();
}

async function checkSession() {
    // Se o usuário já escolheu offline, nem tenta conectar
    if (isOfflineMode) {
        document.getElementById('login-screen').classList.add('hide');
        document.querySelector('.dashboard-container').style.display = 'block';
        document.getElementById('user-email').textContent = '👤 Modo Offline (Local)';
        document.getElementById('btn-logout').style.display = 'none';
        initApp();
        return;
    }

    // Tenta pegar a sessão com um timeout
    const sessionPromise = supabaseClient.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout ao conectar ao servidor")), 5000)
    );

    try {
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
        const loginScreen = document.getElementById('login-screen');
        const dashboard = document.querySelector('.dashboard-container');
        const userEmail = document.getElementById('user-email');
        const btnLogout = document.getElementById('btn-logout');

        if (session) {
            loginScreen.classList.add('hide');
            dashboard.style.display = 'block';
            userEmail.textContent = `Conectado: ${session.user.email}`;
            btnLogout.style.display = 'block';
            initApp();
        } else {
            loginScreen.classList.remove('hide');
            dashboard.style.display = 'none';
            userEmail.textContent = 'Aguardando Login...';
            btnLogout.style.display = 'none';
        }
    } catch (err) {
        console.warn("Supabase connection failed or timed out:", err.message);
        showError("Servidor indisponível. Você pode usar o Modo Offline.");
        // Se falhar a conexão, não mostramos tela de erro bloqueante, apenas deixamos o badge em alerta
        document.getElementById('user-email').textContent = '⚠️ Erro de Conexão';
    }
}

// ==========================================
// INICIALIZAÇÃO E CRUD
// ==========================================

async function initApp() {
    if (isInitializing) return;
    isInitializing = true;

    try {
        await DataService.seedIfEmpty();
        const [bills, payments] = await Promise.all([
            DataService.getBills(),
            DataService.getPayments()
        ]);

        const luz = bills.filter(b => b.type === 'luz');
        const agua = bills.filter(b => b.type === 'agua');

        const sortFn = (a, b, listKey) => {
            const config = sortConfig[listKey];
            let valA, valB;
            if (config.field === 'date') {
                valA = parseDate(a.due_date || a.date);
                valB = parseDate(b.due_date || b.date);
            } else {
                valA = Number(a.amount);
                valB = Number(b.amount);
            }
            return config.asc ? valA - valB : valB - valA;
        };

        const updateSortButtons = (listKey) => {
            const config = sortConfig[listKey];
            document.querySelectorAll(`.list-header.${listKey} .btn-sort`).forEach(btn => {
                const isDate = btn.textContent.includes('📅');
                const isAmount = btn.textContent.includes('💰');
                btn.classList.remove('active');
                if (config.field === 'date' && isDate) btn.classList.add('active');
                if (config.field === 'amount' && isAmount) btn.classList.add('active');
            });
        };

        luz.sort((a, b) => sortFn(a, b, 'luz'));
        agua.sort((a, b) => sortFn(a, b, 'agua'));
        payments.sort((a, b) => sortFn(a, b, 'entradas'));

        updateSortButtons('luz');
        updateSortButtons('agua');
        updateSortButtons('entradas');

        // Atualiza os valores dos filtros na tela
        const elFilterLuz = document.getElementById('filter-luz');
        const elFilterAgua = document.getElementById('filter-agua');
        if (elFilterLuz) elFilterLuz.value = filterConfig.luz;
        if (elFilterAgua) elFilterAgua.value = filterConfig.agua;

        // Filtra as listas para exibição
        let filteredLuz = [...luz];
        if (filterConfig.luz === 'pendentes') {
            filteredLuz = filteredLuz.filter(b => !b.is_paid);
        } else if (filterConfig.luz === 'pagas') {
            filteredLuz = filteredLuz.filter(b => b.is_paid);
        }

        let filteredAgua = [...agua];
        if (filterConfig.agua === 'pendentes') {
            filteredAgua = filteredAgua.filter(b => !b.is_paid);
        } else if (filterConfig.agua === 'pagas') {
            filteredAgua = filteredAgua.filter(b => b.is_paid);
        }

        renderList('list-luz', filteredLuz);
        renderList('list-agua', filteredAgua);
        renderList('list-entradas', payments, true);
        calculateDashboard(luz, agua, payments);

        // Atualiza badge de status
        const statusBadge = document.getElementById('status-badge');
        statusBadge.textContent = isOfflineMode ? 'OFFLINE' : 'ONLINE';
        statusBadge.className = 'status-badge ' + (isOfflineMode ? 'offline' : 'online');

    } catch (e) {
        showError("Erro ao carregar dados: " + e.message);
    } finally {
        isInitializing = false;
    }
}

async function handleNovaConta(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-conta');
    btn.disabled = true;
    try {
        const bill = {
            type: document.getElementById('tipo-conta').value,
            month: document.getElementById('mes-conta').value,
            due_date: document.getElementById('venc-conta').value,
            amount: parseFloat(document.getElementById('valor-conta').value)
        };

        if (editingId && editingType === 'conta') {
            await DataService.updateBill(editingId, bill);
            editingId = null;
            editingType = null;
            document.querySelector('#modal-conta h2').textContent = 'Nova Conta Fixa';
            document.getElementById('btn-save-conta').textContent = 'Salvar Conta';
        } else {
            await DataService.saveBill(bill);
        }

        closeModal('modal-conta');
        document.getElementById('form-conta').reset();
        await initApp();
    } catch (err) {
        alert("Erro: " + err.message);
    } finally {
        btn.disabled = false;
    }
}

async function handleNovaEntrada(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-entrada');
    btn.disabled = true;
    try {
        const payment = {
            date: document.getElementById('data-entrada').value,
            amount: parseFloat(document.getElementById('valor-entrada').value),
            description: 'Pagamento Paula'
        };

        if (editingId && editingType === 'entrada') {
            await DataService.updatePayment(editingId, payment);
            editingId = null;
            editingType = null;
            document.querySelector('#modal-entrada h2').textContent = 'Novo Pagamento da Paula';
            document.getElementById('btn-save-entrada').textContent = 'Registrar Pagamento';
        } else {
            await DataService.savePayment(payment);
        }

        closeModal('modal-entrada');
        document.getElementById('form-entrada').reset();
        await initApp();
    } catch (err) {
        alert("Erro: " + err.message);
    } finally {
        btn.disabled = false;
    }
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// Dados Iniciais (Seeds)
const SEED_BILLS = [
    { type: 'luz', month: 'Dezembro', due_date: '07/12', amount: 701.40 },
    { type: 'luz', month: 'Janeiro', due_date: '07/01', amount: 691.00 },
    { type: 'luz', month: 'Fevereiro', due_date: '07/02', amount: 569.44 },
    { type: 'agua', month: 'Dezembro', due_date: '17/12', amount: 169.73 }
];
const SEED_PAYMENTS = [
    { date: 'Inicial', amount: 4.90, description: 'Pagamento Paula' },
    { date: '22/01', amount: 200.00, description: 'Pagamento Paula' }
];

// ==========================================
// FUNÇÕES DE OCR (IA)
// ==========================================

async function handleOCR(event) {
    const file = event.target.files[0];
    if (!file) return;

    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = 'flex';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/ocr', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Erro ao processar imagem.");
        }

        const result = await response.json();
        if (result.success && result.data) {
            preFillBillModal(result.data);
        }
    } catch (err) {
        showError("IA: " + err.message);
    } finally {
        overlay.style.display = 'none';
        event.target.value = ''; // Limpa o input
    }
}

function preFillBillModal(data) {
    // Abre o modal de conta
    openModal('modal-conta');
    
    // Preenche os campos se eles existirem na resposta da IA
    if (data.type) document.getElementById('tipo-conta').value = data.type;
    if (data.month) document.getElementById('mes-conta').value = data.month;
    if (data.due_date) document.getElementById('venc-conta').value = data.due_date;
    if (data.amount) document.getElementById('valor-conta').value = data.amount;

    // Muda o título para destacar que veio da IA
    document.querySelector('#modal-conta h2').textContent = 'Confirmar Fatura (Lida por IA)';
    document.getElementById('btn-save-conta').textContent = 'Salvar Dados Identificados';
}

document.addEventListener('DOMContentLoaded', checkSession);
