// Data Layer (IndexedDB via LocalStorage simulation)
const DB_VERSION = 2;

// Migration from V1 (Simple Subs) to V2 (Relational)
function migrateData() {
    const oldSubs = JSON.parse(localStorage.getItem('subtrack_subs'));
    const version = localStorage.getItem('subtrack_version');
    
    if (oldSubs && !version) {
        console.log("Migrating V1 to V2");
        const newSubs = oldSubs.map(s => ({
            id: s.id,
            name: s.name,
            category: s.category || 'Other',
            cost: parseFloat(s.price || 0),
            cycle: s.cycle === 'monthly' ? 'Monthly' : 'Yearly',
            startDate: new Date().toISOString().split('T')[0],
            nextRenewalDate: s.nextPayment || new Date().toISOString().split('T')[0],
            status: 'Active',
            notes: '',
            logoUrl: ''
        }));
        localStorage.setItem('subtrack_subscriptions', JSON.stringify(newSubs));
        localStorage.removeItem('subtrack_subs');
    }
    localStorage.setItem('subtrack_version', DB_VERSION);
}

// Data store
let db = {
    subscriptions: [],
    alerts: [],
    reports: [],
    user: null
};

// Load Data
function loadData() {
    migrateData();
    db.subscriptions = JSON.parse(localStorage.getItem('subtrack_subscriptions')) || [];
    db.alerts = JSON.parse(localStorage.getItem('subtrack_alerts')) || [];
    db.reports = JSON.parse(localStorage.getItem('subtrack_reports')) || [];
    db.settings = JSON.parse(localStorage.getItem('subtrack_settings')) || { currency: 'USD' };
    db.user = JSON.parse(localStorage.getItem('subtrack_user')) || null;
}

function saveData(table) {
    localStorage.setItem(`subtrack_${table}`, JSON.stringify(db[table]));
}

// Generate ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Helper: Dates
function daysBetween(date1, date2) {
    const d1 = new Date(date1); d1.setHours(0,0,0,0);
    const d2 = new Date(date2); d2.setHours(0,0,0,0);
    return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
}

function getMonthlyCost(sub) {
    if (sub.cycle === 'Weekly') return sub.cost * 4.33;
    if (sub.cycle === 'Yearly') return sub.cost / 12;
    return sub.cost;
}

function formatMoney(amount) {
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: db.settings ? db.settings.currency : 'USD'
    }).format(amount);
}

// Generate Alerts & Push Notifications
function generateAlerts() {
    const today = new Date().toISOString().split('T')[0];
    
    db.subscriptions.forEach(sub => {
        if(sub.status !== 'Active') return;
        
        const days = daysBetween(today, sub.nextRenewalDate);
        if (days >= 0 && days <= 7) {
            const existingAlert = db.alerts.find(a => 
                a.subscriptionId === sub.id && a.alertDate === today
            );
            
            if (!existingAlert) {
                const msg = `${sub.name} renews in ${days === 0 ? 'today' : days + ' days'}.`;
                db.alerts.push({
                    id: generateId(),
                    subscriptionId: sub.id,
                    alertDate: today,
                    message: msg,
                    isSent: false
                });

                // Push Notification (only if renewing in <= 3 days)
                if (days <= 3 && Notification.permission === "granted") {
                    new Notification("SubTrack Alert", {
                        body: msg,
                        icon: "https://img.icons8.com/nolan/256/subscription.png"
                    });
                } else if (days <= 3) {
                    console.log(`[SIMULATED EMAIL SENT] to user: ${msg}`);
                }
            }
        }
    });
    saveData('alerts');
    showPendingAlerts();
}

function showPendingAlerts() {
    const pending = db.alerts.filter(a => !a.isSent);
    const toastContainer = document.getElementById('toast-container');
    
    pending.forEach((alert, i) => {
        setTimeout(() => {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = `<i data-lucide="bell-ringing"></i> <div>${alert.message}</div>`;
            toastContainer.appendChild(toast);
            lucide.createIcons();
            
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 4000);
            
            alert.isSent = true;
            saveData('alerts');
        }, i * 500);
    });
}

// Calculate Reports
function generateReports() {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    let totalSpend = 0;
    
    db.subscriptions.forEach(sub => {
        if (sub.status === 'Active') {
            totalSpend += getMonthlyCost(sub);
        }
    });

    const reportIndex = db.reports.findIndex(r => r.month === currentMonth);
    const reportData = {
        id: reportIndex !== -1 ? db.reports[reportIndex].id : generateId(),
        month: currentMonth,
        totalSpend: parseFloat(totalSpend.toFixed(2)),
        count: db.subscriptions.filter(s => s.status === 'Active').length,
        generatedOn: new Date().toISOString()
    };

    if (reportIndex !== -1) {
        db.reports[reportIndex] = reportData;
    } else {
        db.reports.push(reportData);
    }
    saveData('reports');
}


// --- UI Logic ---
let currentChart = null;
let selectedDate = new Date(); // For calendar

// DOM
const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');
const form = document.getElementById('sub-form');
const modal = document.getElementById('subscription-modal');
const modalBackdrop = document.getElementById('modal-backdrop');

document.addEventListener('DOMContentLoaded', () => {
    // Request Notification Permission
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
    
    loadData();
    generateAlerts();
    generateReports();
    setupEventListeners();
    updateUI();
    
    // Init Google One Tap Auth functionality
    setTimeout(initGoogleAuth, 500);
});

function setupEventListeners() {
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-target');
            navItems.forEach(nav => nav.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            views.forEach(view => {
                view.classList.toggle('active', view.id === targetId);
            });
            
            if (targetId === 'view-reports') renderReports();
        });
    });

    document.getElementById('add-btn').addEventListener('click', () => openModal());
    document.getElementById('close-modal').addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);
    form.addEventListener('submit', handleFormSubmit);

    // Setting Button opens the view-settings
    document.getElementById('settings-btn').addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        views.forEach(view => {
            view.classList.toggle('active', view.id === 'view-settings');
        });
        renderSettings();
    });

    // Profile photo upload
    const editPhotoBtn = document.getElementById('edit-photo-btn');
    if(editPhotoBtn) {
        editPhotoBtn.addEventListener('click', () => {
            document.getElementById('photo-upload-input').click();
        });
    }

    const photoInput = document.getElementById('photo-upload-input');
    if(photoInput) {
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    const b64 = evt.target.result;
                    document.getElementById('settings-avatar').src = b64;
                    if(!db.user) db.user = { loginMethod: 'Email Account' };
                    db.user.picture = b64;
                    localStorage.setItem('subtrack_user', JSON.stringify(db.user));
                    showUserProfile(db.user);
                    showAuthToast("Profile photo updated");
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Edit Profile
    const editProfileBtn = document.getElementById('edit-profile-btn');
    if(editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            document.getElementById('settings-name-display').style.display = 'none';
            document.getElementById('settings-name-input').style.display = 'block';
            document.getElementById('edit-profile-btn').style.display = 'none';
            document.getElementById('save-profile-btn').style.display = 'block';
        });
    }

    const saveProfileBtn = document.getElementById('save-profile-btn');
    if(saveProfileBtn) {
        saveProfileBtn.addEventListener('click', () => {
            const newName = document.getElementById('settings-name-input').value;
            if(newName.trim()) {
                if(!db.user) db.user = { loginMethod: 'Email Account' };
                db.user.name = newName;
                localStorage.setItem('subtrack_user', JSON.stringify(db.user));
                document.getElementById('settings-name-display').textContent = newName;
                showUserProfile(db.user);
                showAuthToast("Profile updated");
            }
            
            document.getElementById('settings-name-display').style.display = 'block';
            document.getElementById('settings-name-input').style.display = 'none';
            document.getElementById('edit-profile-btn').style.display = 'block';
            document.getElementById('save-profile-btn').style.display = 'none';
        });
    }

    // Currency Settings (auto-save)
    const currencySelect = document.getElementById('settings-currency');
    if(currencySelect) {
        currencySelect.addEventListener('change', (e) => {
            db.settings.currency = e.target.value;
            saveData('settings');
            updateUI();
            showAuthToast("Currency updated to " + e.target.value);
        });
    }

    // Privacy & Security
    const appLockToggle = document.getElementById('settings-app-lock');
    if(appLockToggle) {
        appLockToggle.addEventListener('change', (e) => {
            db.settings.appLock = e.target.checked;
            saveData('settings');
            const lockOptions = document.getElementById('app-lock-options');
            if(lockOptions) lockOptions.style.display = e.target.checked ? 'block' : 'none';
        });
    }

    const lockTypeSelect = document.getElementById('settings-lock-type');
    if(lockTypeSelect) {
        lockTypeSelect.addEventListener('change', (e) => {
            db.settings.appLockType = e.target.value;
            saveData('settings');
        });
    }

    const twoFaToggle = document.getElementById('settings-2fa');
    if(twoFaToggle) {
        twoFaToggle.addEventListener('change', (e) => {
            db.settings.twoFactor = e.target.checked;
            saveData('settings');
        });
    }

    const autoLogoutSelect = document.getElementById('settings-auto-logout');
    if(autoLogoutSelect) {
        autoLogoutSelect.addEventListener('change', (e) => {
            db.settings.autoLogout = e.target.value;
            saveData('settings');
        });
    }

    // List Filters & Sort
    document.getElementById('filter-text').addEventListener('input', renderAllSubs);
    document.getElementById('sort-select').addEventListener('change', renderAllSubs);

    // Calendar
    document.getElementById('prev-month').addEventListener('click', () => { selectedDate.setMonth(selectedDate.getMonth() - 1); renderCalendar(); });
    document.getElementById('next-month').addEventListener('click', () => { selectedDate.setMonth(selectedDate.getMonth() + 1); renderCalendar(); });
}

function updateUI() {
    renderDashboard();
    renderAllSubs();
    renderCalendar();
    renderReminders();
    lucide.createIcons();
}

// Modal handling
function openModal(id = null) {
    document.getElementById('modal-title').textContent = id ? 'Edit Subscription' : 'Add Subscription';
    
    if (id) {
        const sub = db.subscriptions.find(s => s.id === id);
        if (sub) {
            document.getElementById('sub-id').value = sub.id;
            document.getElementById('sub-name').value = sub.name;
            document.getElementById('sub-logo').value = sub.logoUrl || '';
            document.getElementById('sub-category').value = sub.category;
            document.getElementById('sub-status').value = sub.status;
            document.getElementById('sub-price').value = sub.cost;
            document.getElementById('sub-cycle').value = sub.cycle;
            document.getElementById('sub-start').value = sub.startDate;
            document.getElementById('sub-next').value = sub.nextRenewalDate;
            document.getElementById('sub-notes').value = sub.notes || '';
        }
    } else {
        form.reset();
        document.getElementById('sub-id').value = '';
        document.getElementById('sub-start').value = new Date().toISOString().split('T')[0];
    }

    modalBackdrop.classList.add('open');
    setTimeout(() => modal.classList.add('open'), 10);
}

function closeModal() {
    modal.classList.remove('open');
    setTimeout(() => modalBackdrop.classList.remove('open'), 300);
}

function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('sub-id').value;
    
    const subData = {
        id: id || generateId(),
        name: document.getElementById('sub-name').value,
        logoUrl: document.getElementById('sub-logo').value,
        category: document.getElementById('sub-category').value,
        status: document.getElementById('sub-status').value,
        cost: parseFloat(document.getElementById('sub-price').value),
        cycle: document.getElementById('sub-cycle').value,
        startDate: document.getElementById('sub-start').value,
        nextRenewalDate: document.getElementById('sub-next').value,
        notes: document.getElementById('sub-notes').value
    };

    if (id) {
        const idx = db.subscriptions.findIndex(s => s.id === id);
        if(idx !== -1) db.subscriptions[idx] = subData;
    } else {
        db.subscriptions.push(subData);
    }

    saveData('subscriptions');
    generateReports(); // Refresh spending
    closeModal();
    updateUI();
}

function deleteSubscription(id) {
    if(confirm('Delete this subscription?')) {
        db.subscriptions = db.subscriptions.filter(s => s.id !== id);
        saveData('subscriptions');
        generateReports();
        updateUI();
    }
}

// Generate UI Item
function createSubHtml(sub, options = {}) {
    const avatar = sub.logoUrl ? 
        `<img src="${sub.logoUrl}" class="sub-logo" alt="${sub.name}">` : 
        `<div class="sub-logo">${sub.name.charAt(0)}</div>`;
    
    let actions = '';
    if (options.showCancel) {
        actions = `<button class="btn-cancel" onclick="deleteSubscription('${sub.id}')">Cancel Subs</button>`;
    } else if (options.showEdit) {
        actions = `
            <div style="display:flex; gap:8px; margin-top:8px;">
                <button class="badge" onclick="openModal('${sub.id}')">Edit</button>
            </div>
        `;
    }

    // Days calculation for badges
    const today = new Date().toISOString().split('T')[0];
    const daysUntil = daysBetween(today, sub.nextRenewalDate);
    let renewalBadge = sub.nextRenewalDate;
    if (daysUntil === 0) renewalBadge = "Today";
    else if (daysUntil === 1) renewalBadge = "Tomorrow";
    else if (daysUntil > 1 && daysUntil <= 30) renewalBadge = `In ${daysUntil}d`;

    return `
        <div class="sub-item status-${sub.status.toLowerCase()}">
            ${avatar}
            <div class="sub-info">
                <span class="sub-name">${sub.name}</span>
                <div class="sub-badges">
                    <span class="badge ${daysUntil <= 3 && sub.status === 'Active' ? 'alert' : ''}">${renewalBadge}</span>
                    <span class="badge">${sub.category}</span>
                </div>
                ${actions}
            </div>
            <div class="sub-cost-block">
                <span class="sub-price">${formatMoney(sub.cost)}</span>
                <span class="sub-cycle">/${sub.cycle.substring(0,2)}</span>
            </div>
        </div>
    `;
}

// Dashboard
function renderDashboard() {
    const activeSubs = db.subscriptions.filter(s => s.status === 'Active');
    const totalSpend = activeSubs.reduce((acc, sub) => acc + getMonthlyCost(sub), 0);
    
    document.getElementById('dash-monthly-spend').textContent = formatMoney(totalSpend);
    document.getElementById('dash-active-count').textContent = activeSubs.length;

    const today = new Date().toISOString().split('T')[0];
    const upcoming = activeSubs.filter(s => {
        const d = daysBetween(today, s.nextRenewalDate);
        return d >= 0 && d <= 7;
    }).sort((a, b) => daysBetween(today, a.nextRenewalDate) - daysBetween(today, b.nextRenewalDate));

    document.getElementById('dash-upcoming-count').textContent = upcoming.length;

    if (activeSubs.length > 0) {
        // Most expensive normalized by month
        const max = [...activeSubs].sort((a, b) => getMonthlyCost(b) - getMonthlyCost(a))[0];
        document.getElementById('dash-most-expensive').textContent = max.name;
    } else {
        document.getElementById('dash-most-expensive').textContent = '-';
    }

    const upcomingList = document.getElementById('dash-upcoming-list');
    if (upcoming.length === 0) {
        upcomingList.innerHTML = '<div class="empty-state">No renewals in next 7 days.</div>';
    } else {
        upcomingList.innerHTML = upcoming.slice(0, 4).map(sub => createSubHtml(sub)).join('');
    }
}

// Subscription List
function renderAllSubs() {
    const filterTxt = document.getElementById('filter-text').value.toLowerCase();
    const sortVal = document.getElementById('sort-select').value;
    
    let list = [...db.subscriptions];
    
    if (filterTxt) {
        list = list.filter(s => s.name.toLowerCase().includes(filterTxt) || s.category.toLowerCase().includes(filterTxt));
    }
    
    list.sort((a, b) => {
        if (sortVal === 'name') return a.name.localeCompare(b.name);
        if (sortVal === 'cost-desc') return getMonthlyCost(b) - getMonthlyCost(a);
        if (sortVal === 'cost-asc') return getMonthlyCost(a) - getMonthlyCost(b);
        if (sortVal === 'date') return new Date(a.nextRenewalDate) - new Date(b.nextRenewalDate);
        return 0;
    });

    const listEl = document.getElementById('all-subs-list');
    if (list.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No subscriptions found.</div>';
    } else {
        listEl.innerHTML = list.map(sub => createSubHtml(sub, { showEdit: true })).join('');
    }
}

// Calendar
function renderCalendar() {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('cal-month-year').textContent = `${monthNames[month]} ${year}`;
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const grid = document.getElementById('calendar-days');
    grid.innerHTML = '';
    
    // Empty prefix cells
    for(let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="cal-day empty"></div>`;
    }
    
    // Days
    for(let i = 1; i <= daysInMonth; i++) {
        const currentDateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        
        // Find if any active subs renew on this day
        const renewingSubs = db.subscriptions.filter(s => s.status === 'Active' && s.nextRenewalDate === currentDateStr);
        const hasRenewal = renewingSubs.length > 0;
        
        const isToday = (new Date().toISOString().split('T')[0] === currentDateStr);
        let classes = `cal-day ${hasRenewal ? 'has-renewal' : ''} ${isToday ? 'selected' : ''}`;
        
        const dayEl = document.createElement('div');
        dayEl.className = classes;
        dayEl.textContent = i;
        dayEl.onclick = () => renderCalendarSubs(currentDateStr);
        grid.appendChild(dayEl);
    }

    // Default load today's or selected 1st
    const targetDate = `${year}-${String(month+1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
    renderCalendarSubs(targetDate);
}

function renderCalendarSubs(dateStr) {
    document.getElementById('selected-date-label').textContent = dateStr;
    const subs = db.subscriptions.filter(s => s.nextRenewalDate === dateStr);
    
    const container = document.getElementById('calendar-subs-list');
    if (subs.length === 0) {
        container.innerHTML = '<div class="empty-state text-small">No renewals on this date.</div>';
    } else {
        container.innerHTML = subs.map(s => createSubHtml(s)).join('');
    }
}

// Reminders & Ghost Subscription Checks
function renderReminders() {
    const today = new Date().toISOString().split('T')[0];
    
    // Standard 3-Day Reminders
    const reminders = db.subscriptions.filter(s => {
        if(s.status !== 'Active') return false;
        const d = daysBetween(today, s.nextRenewalDate);
        return d >= 0 && d <= 3;
    });

    const listEl = document.getElementById('reminders-list');
    if (reminders.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No imminent renewals. You are safe!</div>';
    } else {
        listEl.innerHTML = reminders.map(s => createSubHtml(s, { showCancel: true })).join('');
    }

    // Ghost Subscriptions: >= 6 months (180 days) and no notes
    const ghostList = db.subscriptions.filter(s => {
        if(s.status !== 'Active') return false;
        const d = daysBetween(s.startDate, today);
        return d >= 180 && (!s.notes || s.notes.trim().length <= 3);
    });

    const ghostEl = document.getElementById('ghost-list');
    const ghostHeader = document.getElementById('ghost-list-header');
    if (ghostList.length > 0) {
        ghostHeader.style.display = 'block';
        ghostEl.innerHTML = ghostList.map(s => createSubHtml(s, { showCancel: true })).join('');
    } else {
        ghostHeader.style.display = 'none';
        ghostEl.innerHTML = '';
    }
}

// Reports & Insights
let categoryChart = null;

function renderReports() {
    // Analytics Math
    const activeSubs = db.subscriptions.filter(s => s.status === 'Active');
    let totalMonthlySpend = 0;
    const categoryTotals = {};
    
    activeSubs.forEach(sub => {
        const mc = getMonthlyCost(sub);
        totalMonthlySpend += mc;
        categoryTotals[sub.category] = (categoryTotals[sub.category] || 0) + mc;
    });

    // 1. Projected Yearly Spend
    const projected = totalMonthlySpend * 12;
    document.getElementById('reports-yearly-proj').textContent = formatMoney(projected);

    // 2. Top 5 Most Expensive List
    const top5 = [...activeSubs].sort((a,b) => getMonthlyCost(b) - getMonthlyCost(a)).slice(0, 5);
    const top5El = document.getElementById('reports-top-5');
    if(top5.length > 0) {
        top5El.innerHTML = top5.map(s => createSubHtml(s)).join('');
    } else {
        top5El.innerHTML = '<div class="empty-state">No active subscriptions.</div>';
    }

    // 3. Category Pie Chart
    const pieCtx = document.getElementById('category-pie-chart').getContext('2d');
    if (categoryChart) categoryChart.destroy();
    
    const catLabels = Object.keys(categoryTotals);
    const catData = Object.values(categoryTotals);
    
    categoryChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: catLabels,
            datasets: [{
                data: catData,
                backgroundColor: ['#00ffff', '#ff00ff', '#0A66C2', '#39ff14', '#ff9900'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'right', labels: { color: '#9ca3af', font: { family: 'Outfit', size: 12 } } }
            }
        }
    });

    // 4. Monthly Spend Trend (Bar)
    if (db.reports.length === 0) {
        db.reports.push({ month: new Date().toISOString().slice(0, 7), totalSpend: parseFloat(totalMonthlySpend.toFixed(2)) });
    }

    const sortedReports = [...db.reports].sort((a,b) => a.month.localeCompare(b.month)).slice(-6);
    const barLabels = sortedReports.map(r => r.month);
    const barData = sortedReports.map(r => r.totalSpend);

    const barCtx = document.getElementById('monthly-bar-chart').getContext('2d');
    if (currentChart) currentChart.destroy();

    currentChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: barLabels,
            datasets: [{
                label: `Total Spend (${db.settings.currency})`,
                data: barData,
                backgroundColor: '#b026ff',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { 
                    grid: { color: 'rgba(255,255,255,0.05)' }, 
                    ticks: { 
                        color: '#9ca3af',
                        callback: function(value) { return formatMoney(value); } 
                    } 
                },
                x: { grid: { display: false }, ticks: { color: '#9ca3af' } }
            }
        }
    });
}

// --- Google Auth (One Tap) ---

function parseJwt(token) {
    try {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch(e) {
        return null;
    }
}

function initGoogleAuth() {
    if (db.user) {
        showUserProfile(db.user);
        return; // Already logged in automatically
    }

    const clientId = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
    
    // MOCK LOGIN FOR DEVELOPMENT / TESTING
    if (clientId === "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com") {
        const btnContainer = document.getElementById("google-login-btn");
        if(btnContainer) {
            btnContainer.innerHTML = `<button id="mock-google-btn" style="background:#fff; color:#444; border:none; padding:8px 16px; border-radius:30px; font-weight:500; font-family:'Outfit', sans-serif; display:flex; align-items:center; gap:8px; cursor:pointer; font-size:14px;"><svg style="width:16px;height:16px;" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Test Sign In</button>`;
            btnContainer.style.display = 'block';
            document.getElementById('mock-google-btn').addEventListener('click', () => {
                db.user = { name: "Demo User", email: "demo@subtrack.app", picture: "https://ui-avatars.com/api/?name=Demo+User&background=0D8ABC&color=fff", token: "mock_token", loginMethod: "Google Account" };
                localStorage.setItem('subtrack_user', JSON.stringify(db.user));
                showUserProfile(db.user);
                showAuthToast(`Signed in as ${db.user.name}`);
                renderSettings();
            });
        }
        return;
    }

    if (window.google && google.accounts) {
        google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            auto_select: true // Automatically sign in returning users
        });
        
        // Show Google One Tap prompt in the corner
        google.accounts.id.prompt();
        
        // Render a backup fallback login button in the header just in case One-Tap is closed/blocked
        const btnContainer = document.getElementById("google-login-btn");
        if(btnContainer) {
            google.accounts.id.renderButton(
                btnContainer,
                { theme: "outline", size: "medium", type: "standard", shape: "pill" }
            );
            btnContainer.style.display = 'block';
        }
    } else {
        setTimeout(initGoogleAuth, 200); // Wait for GIS script to finish loading dynamically
    }
}

function handleCredentialResponse(response) {
    const data = parseJwt(response.credential);
    if(data) {
        db.user = {
            name: data.name,
            email: data.email,
            picture: data.picture,
            token: response.credential
        };
        
        localStorage.setItem('subtrack_user', JSON.stringify(db.user));
        showUserProfile(db.user);
        
        showAuthToast(`Signed in as ${data.name}`);
    }
}

function showUserProfile(user) {
    const loginBtn = document.getElementById('google-login-btn');
    if(loginBtn) loginBtn.style.display = 'none';
    
    const profileEl = document.getElementById('user-profile');
    if(profileEl) {
        document.getElementById('user-avatar').src = user.picture;
        document.getElementById('user-name').textContent = user.name;
        profileEl.style.display = 'flex';
    }
    
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) {
        logoutBtn.onclick = handleSignOut;
    }
}

function handleSignOut() {
    if(window.google && google.accounts) {
        google.accounts.id.disableAutoSelect(); // Stop instant auto-login loop
    }
    localStorage.removeItem('subtrack_user');
    db.user = null;
    
    document.getElementById('user-profile').style.display = 'none';
    const loginBtn = document.getElementById('google-login-btn');
    if(loginBtn) loginBtn.style.display = 'block';
    
    // Optionally trigger prompt again after sign out
    if(window.google && google.accounts) {
        google.accounts.id.prompt();
    }
    
    showAuthToast("Signed out successfully");
}

function showAuthToast(message) {
    const toastContainer = document.getElementById('toast-container');
    if(!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i data-lucide="shield-check" style="color:var(--neon-cyan)"></i> <div>${message}</div>`;
    toastContainer.appendChild(toast);
    if(window.lucide) lucide.createIcons();
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Settings View
function renderSettings() {
    // Populate Currency
    const currencySelect = document.getElementById('settings-currency');
    if(currencySelect) currencySelect.value = db.settings.currency || 'USD';

    // Populate Profile
    let loginMethodType = 'Email Account';
    let userName = 'Guest User';
    let userEmail = 'Not signed in';
    let userPic = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzMzMyIvPjwvc3ZnPg==';

    if (db.user) {
        if (db.user.token) loginMethodType = 'Google Account';
        else if (db.user.loginMethod) loginMethodType = db.user.loginMethod;
        
        if (db.user.name) userName = db.user.name;
        if (db.user.email) userEmail = db.user.email;
        if (db.user.picture) userPic = db.user.picture;
    }

    const avatarEl = document.getElementById('settings-avatar');
    if(avatarEl) avatarEl.src = userPic;
    
    const nameDisplayEl = document.getElementById('settings-name-display');
    if(nameDisplayEl) nameDisplayEl.textContent = userName;
    
    const nameInputEl = document.getElementById('settings-name-input');
    if(nameInputEl) nameInputEl.value = userName;
    
    const emailEl = document.getElementById('settings-email');
    if(emailEl) emailEl.textContent = userEmail;
    
    const badgeEl = document.getElementById('settings-login-badge');
    if(badgeEl) {
        badgeEl.innerHTML = loginMethodType === 'Google Account' 
            ? `<i data-lucide="chrome" style="width:10px; height:10px; margin-right:4px;"></i> Google Account`
            : `<i data-lucide="mail" style="width:10px; height:10px; margin-right:4px;"></i> Email Account`;
    }
        
    const pwdWrapper = document.getElementById('change-password-wrapper');
    if(pwdWrapper) {
        pwdWrapper.style.display = loginMethodType === 'Google Account' ? 'none' : 'block';
    }
    
    // Switch back to non-edit mode
    if(nameDisplayEl) nameDisplayEl.style.display = 'block';
    if(nameInputEl) nameInputEl.style.display = 'none';
    const editBtn = document.getElementById('edit-profile-btn');
    if(editBtn) editBtn.style.display = 'block';
    const saveBtn = document.getElementById('save-profile-btn');
    if(saveBtn) saveBtn.style.display = 'none';
    
    // Populate Privacy & Security
    const appLockToggle = document.getElementById('settings-app-lock');
    if(appLockToggle) {
        appLockToggle.checked = !!db.settings.appLock;
        const lockOptions = document.getElementById('app-lock-options');
        if(lockOptions) lockOptions.style.display = appLockToggle.checked ? 'block' : 'none';
    }

    const lockTypeSelect = document.getElementById('settings-lock-type');
    if(lockTypeSelect) lockTypeSelect.value = db.settings.appLockType || 'PIN';

    const twoFaToggle = document.getElementById('settings-2fa');
    if(twoFaToggle) twoFaToggle.checked = !!db.settings.twoFactor;

    const autoLogoutSelect = document.getElementById('settings-auto-logout');
    if(autoLogoutSelect) autoLogoutSelect.value = db.settings.autoLogout || 'never';
    
    // Mock Login Activity
    const activityList = document.getElementById('login-activity-list');
    if(activityList) {
        const platform = navigator.platform || 'Windows';
        const browser = navigator.userAgent.includes("Chrome") ? "Chrome" : "Browser";
        
        // Generate a consistent mock log based on today's date
        const d = new Date();
        const logs = [
            { date: 'Today, ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), device: browser + ' on ' + platform, loc: 'Current Session' },
            { date: 'Yesterday, 14:23', device: 'Safari on iPhone', loc: 'New York, USA' },
            { date: '3 days ago, 09:12', device: browser + ' on ' + platform, loc: 'New York, USA' }
        ];
        
        activityList.innerHTML = logs.map(l => `
            <div class="activity-item">
                <div class="activity-icon"><i data-lucide="monitor-smartphone" style="width:16px; height:16px;"></i></div>
                <div style="flex:1;">
                    <div style="font-weight:600; color:#fff;">${l.device}</div>
                    <div style="color:var(--text-secondary);">${l.date}</div>
                </div>
                <div style="text-align:right;">
                    <div style="color:var(--neon-green); font-weight: 500;">${l.loc === 'Current Session' ? 'Active now' : ''}</div>
                    <div style="color:var(--text-secondary); font-size:10px;">${l.loc}</div>
                </div>
            </div>
        `).join('');
    }
    
    if(window.lucide) lucide.createIcons();
}
