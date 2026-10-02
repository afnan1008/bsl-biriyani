// ========== APP STATE ==========
const state = {
    mosques: [],
    biriyaniPosts: [],
    currentTab: 'biriyani-today',
    surveys: {}
};

// ========== UTILITY FUNCTIONS ==========
function getTodayString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

function getBanglaDate() {
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    return new Date().toLocaleDateString('bn-BD', options);
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toast.className = isError ? 'toast error show' : 'toast show';
    setTimeout(() => {
        toast.className = 'toast';
    }, 3500);
}

function showLoading() {
    document.getElementById('loadingOverlay').classList.add('show');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}

function validatePhone(phone) {
    const cleaned = phone.replace(/\s+/g, '');
    return /^01[3-9]\d{8}$/.test(cleaned);
}

function timeAgo(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const time = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Math.floor((now - time) / 1000);
    
    if (diff < 60) return 'এইমাত্র';
    if (diff < 3600) return `${Math.floor(diff / 60)} মিনিট আগে`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ঘন্টা আগে`;
    return `${Math.floor(diff / 86400)} দিন আগে`;
}

// ========== TAB NAVIGATION ==========
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        const tabId = tab.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        state.currentTab = tabId;
        
        if (tabId === 'add-biriyani') {
            loadMosqueDropdown();
        }
        if (tabId === 'survey') {
            loadSurvey();
        }
    });
});

// ========== SET TODAY'S DATE ==========
document.getElementById('todayDate').textContent = getBanglaDate();
document.getElementById('biriyaniDate').value = getTodayString();

// ========== LOAD MOSQUES ==========
function loadMosques() {
    db.collection('mosques').orderBy('name').onSnapshot(snapshot => {
        state.mosques = [];
        const areas = new Set();
        
        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            state.mosques.push(data);
            if (data.area) areas.add(data.area);
        });
        
        renderMosques(state.mosques);
        updateStats();
        populateAreaFilter(areas);
    });
}

function renderMosques(mosques) {
    const container = document.getElementById('mosqueList');
    const today = getTodayString();
    
    const todayBiriyaniMosqueIds = state.biriyaniPosts
        .filter(b => b.date === today)
        .map(b => b.mosqueId);
    
    if (mosques.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-icon">🕌</div>
                <h3>কোন মসজিদ যোগ করা হয়নি</h3>
                <p>"মসজিদ যোগ করুন" ট্যাবে গিয়ে মসজিদ যোগ করুন</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = mosques.map(mosque => {
        const hasBiriyani = todayBiriyaniMosqueIds.includes(mosque.id);
        return `
            <div class="mosque-card ${hasBiriyani ? 'has-biriyani-today' : ''}">
                <button class="delete-btn" onclick="deleteMosque('${mosque.id}', '${mosque.name.replace(/'/g, "\\'")}')" title="মসজিদ ডিলিট করুন">
                    <i class="fas fa-trash"></i>
                </button>
                <div class="mosque-card-top">
                    <div class="mosque-avatar">🕌</div>
                    <div>
                        <h3>${mosque.name}</h3>
                        <span class="mosque-area-badge">📍 ${mosque.area}</span>
                    </div>
                </div>
                <div class="mosque-card-meta">
                    ${mosque.address ? `<span><i class="fas fa-road"></i> ${mosque.address}</span>` : ''}
                    <span><i class="fas fa-user"></i> যোগ করেছেন: ${mosque.addedBy || 'অজানা'}</span>
                    <span><i class="fas fa-clock"></i> ${timeAgo(mosque.createdAt)}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ========== DELETE MOSQUE ==========
async function deleteMosque(mosqueId, mosqueName) {
    // Custom confirm modal
    const confirmed = await showConfirmModal(
        `"${mosqueName}" মসজিদটি ডিলিট করতে চান?`,
        'এই মসজিদের সব বিরিয়ানি পোস্টও মুছে যাবে। এটি ফিরিয়ে আনা যাবে না।'
    );
    
    if (!confirmed) return;
    
    showLoading();
    
    try {
        // Delete all biriyani posts for this mosque first
        const biriyaniSnapshot = await db.collection('biriyaniPosts')
            .where('mosqueId', '==', mosqueId)
            .get();
        
        const batch = db.batch();
        biriyaniSnapshot.forEach(doc => batch.delete(doc.ref));
        
        // Delete the mosque itself
        batch.delete(db.collection('mosques').doc(mosqueId));
        
        await batch.commit();
        
        hideLoading();
        showToast(`✅ "${mosqueName}" সফলভাবে ডিলিট হয়েছে!`);
    } catch (error) {
        hideLoading();
        console.error('Delete error:', error);
        showToast('❌ ডিলিট করতে সমস্যা হয়েছে!', true);
    }
}

// ========== CUSTOM CONFIRM MODAL ==========
function showConfirmModal(title, message) {
    return new Promise(resolve => {
        // Remove existing modal
        const existing = document.getElementById('confirmModal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'confirmModal';
        modal.className = 'confirm-modal';
        modal.innerHTML = `
            <div class="confirm-modal-backdrop"></div>
            <div class="confirm-modal-content">
                <div class="confirm-modal-icon">⚠️</div>
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirm-modal-buttons">
                    <button class="btn-cancel" id="cancelBtn">
                        <i class="fas fa-times"></i> বাতিল
                    </button>
                    <button class="btn-confirm" id="confirmBtn">
                        <i class="fas fa-trash"></i> হ্যাঁ, ডিলিট করুন
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        setTimeout(() => modal.classList.add('show'), 10);
        
        const close = (result) => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
            resolve(result);
        };
        
        document.getElementById('confirmBtn').onclick = () => close(true);
        document.getElementById('cancelBtn').onclick = () => close(false);
        modal.querySelector('.confirm-modal-backdrop').onclick = () => close(false);
    });
}

function populateAreaFilter(areas) {
    const select = document.getElementById('areaFilter');
    const currentValue = select.value;
    select.innerHTML = '<option value="all">সকল এলাকা</option>';
    
    Array.from(areas).sort().forEach(area => {
        select.innerHTML += `<option value="${area}">${area}</option>`;
    });
    
    select.value = currentValue || 'all';
}

// ========== LOAD BIRIYANI POSTS ==========
function loadBiriyaniPosts() {
    db.collection('biriyaniPosts').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        state.biriyaniPosts = [];
        
        snapshot.forEach(doc => {
            state.biriyaniPosts.push({ id: doc.id, ...doc.data() });
        });
        
        renderBiriyaniToday();
        updateStats();
        renderMosques(state.mosques);
    });
}

function renderBiriyaniToday(filter = 'all') {
    const container = document.getElementById('biriyaniList');
    const noData = document.getElementById('noBiriyani');
    const today = getTodayString();
    
    let todayPosts = state.biriyaniPosts.filter(b => b.date === today);
    
    if (filter === 'verified') {
        todayPosts = todayPosts.filter(b => b.verified === true);
    } else if (filter === 'unverified') {
        todayPosts = todayPosts.filter(b => !b.verified);
    }
    
    if (todayPosts.length === 0) {
        container.innerHTML = '';
        noData.style.display = 'block';
        return;
    }
    
    noData.style.display = 'none';
    
    container.innerHTML = todayPosts.map(post => {
        const mosque = state.mosques.find(m => m.id === post.mosqueId);
        const mosqueName = mosque ? mosque.name : post.mosqueName || 'অজানা মসজিদ';
        const mosqueArea = mosque ? mosque.area : '';
        const verified = post.verified;
        
        return `
            <div class="biriyani-card" data-verified="${verified ? 'true' : 'false'}">
                <button class="delete-btn" onclick="deleteBiriyaniPost('${post.id}', '${mosqueName.replace(/'/g, "\\'")}')" title="পোস্ট ডিলিট করুন">
                    <i class="fas fa-trash"></i>
                </button>
                <div class="biriyani-card-header">
                    <h3>🍛 ${mosqueName}</h3>
                    <span class="waqt-badge">${post.waqt || 'জুমা'}</span>
                </div>
                <div class="biriyani-card-body">
                    ${mosqueArea ? `
                        <div class="biriyani-info-row">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>${mosqueArea}</span>
                        </div>
                    ` : ''}
                    <div class="biriyani-info-row">
                        <i class="fas fa-user"></i>
                        <span>জানিয়েছেন: ${post.addedBy || 'অজানা'}</span>
                    </div>
                    <div class="biriyani-info-row">
                        <i class="fas fa-phone"></i>
                        <span>${post.phone || 'নেই'}</span>
                    </div>
                    ${post.note ? `
                        <div class="biriyani-note">
                            <strong>📝 নোট:</strong> ${post.note}
                        </div>
                    ` : ''}
                </div>
                <div class="biriyani-card-footer">
                    <span>${timeAgo(post.createdAt)}</span>
                    ${verified ? 
                        '<span class="verified-badge">✅ যাচাইকৃত</span>' : 
                        '<span class="unverified-badge">⏳ যাচাই হয়নি</span>'
                    }
                </div>
            </div>
        `;
    }).join('');
}

// ========== DELETE BIRIYANI POST ==========
async function deleteBiriyaniPost(postId, mosqueName) {
    const confirmed = await showConfirmModal(
        `বিরিয়ানি পোস্ট ডিলিট করবেন?`,
        `"${mosqueName}" এর বিরিয়ানি পোস্টটি মুছে যাবে।`
    );
    
    if (!confirmed) return;
    
    showLoading();
    
    try {
        await db.collection('biriyaniPosts').doc(postId).delete();
        hideLoading();
        showToast('✅ বিরিয়ানি পোস্ট ডিলিট হয়েছে!');
    } catch (error) {
        hideLoading();
        console.error('Delete error:', error);
        showToast('❌ ডিলিট করতে সমস্যা হয়েছে!', true);
    }
}

// ========== UPDATE STATS ==========
function updateStats() {
    const today = getTodayString();
    document.getElementById('totalMosques').textContent = state.mosques.length;
    document.getElementById('totalBiriyani').textContent = 
        state.biriyaniPosts.filter(b => b.date === today).length;
}

// ========== ADD MOSQUE ==========
document.getElementById('mosqueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('mosqueName').value.trim();
    const area = document.getElementById('mosqueArea').value;
    const address = document.getElementById('mosqueAddress').value.trim();
    const adderName = document.getElementById('mosqueAdderName').value.trim();
    const adderPhone = document.getElementById('mosqueAdderPhone').value.trim();
    
    if (!name || !area || !adderName || !adderPhone) {
        showToast('সকল প্রয়োজনীয় ফিল্ড পূরণ করুন!', true);
        return;
    }
    
    if (!validatePhone(adderPhone)) {
        showToast('সঠিক ফোন নম্বর দিন (01XXXXXXXXX)', true);
        return;
    }
    
    const duplicate = state.mosques.find(m => 
        m.name.toLowerCase() === name.toLowerCase() && m.area === area
    );
    if (duplicate) {
        showToast('এই মসজিদটি ইতোমধ্যে যোগ করা আছে!', true);
        return;
    }
    
    showLoading();
    
    try {
        await db.collection('mosques').add({
            name: name,
            area: area,
            address: address,
            addedBy: adderName,
            addedByPhone: adderPhone,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideLoading();
        showToast('মসজিদ সফলভাবে যোগ করা হয়েছে! ✅');
        document.getElementById('mosqueForm').reset();
    } catch (error) {
        hideLoading();
        console.error('Error adding mosque:', error);
        showToast('কিছু সমস্যা হয়েছে! আবার চেষ্টা করুন।', true);
    }
});

// ========== ADD BIRIYANI POST ==========
function loadMosqueDropdown() {
    const select = document.getElementById('biriyaniMosque');
    const currentValue = select.value;
    select.innerHTML = '<option value="">মসজিদ সিলেক্ট করুন</option>';
    
    state.mosques.forEach(mosque => {
        select.innerHTML += `<option value="${mosque.id}">${mosque.name} (${mosque.area})</option>`;
    });
    
    if (currentValue) select.value = currentValue;
}

document.getElementById('biriyaniForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const mosqueId = document.getElementById('biriyaniMosque').value;
    const waqt = document.getElementById('biriyaniWaqt').value;
    const date = document.getElementById('biriyaniDate').value;
    const note = document.getElementById('biriyaniNote').value.trim();
    const adderName = document.getElementById('biriyaniAdderName').value.trim();
    const adderPhone = document.getElementById('biriyaniAdderPhone').value.trim();
    
    if (!mosqueId || !adderName || !adderPhone) {
        showToast('সকল প্রয়োজনীয় ফিল্ড পূরণ করুন!', true);
        return;
    }
    
    if (!validatePhone(adderPhone)) {
        showToast('সঠিক ফোন নম্বর দিন (01XXXXXXXXX)', true);
        return;
    }
    
    const targetDate = date || getTodayString();
    
    const alreadyPosted = state.biriyaniPosts.find(b => 
        b.mosqueId === mosqueId && b.date === targetDate
    );
    if (alreadyPosted) {
        showToast('এই মসজিদে এই তারিখের বিরিয়ানি আপডেট ইতোমধ্যে দেওয়া আছে!', true);
        return;
    }
    
    const mosque = state.mosques.find(m => m.id === mosqueId);
    
    showLoading();
    
    try {
        await db.collection('biriyaniPosts').add({
            mosqueId: mosqueId,
            mosqueName: mosque ? mosque.name : 'অজানা',
            waqt: waqt,
            date: targetDate,
            note: note,
            addedBy: adderName,
            phone: adderPhone,
            verified: false,
            surveyYes: 0,
            surveyNo: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideLoading();
        showToast('বিরিয়ানি আপডেট সফলভাবে দেওয়া হয়েছে! 🍛');
        document.getElementById('biriyaniForm').reset();
        document.getElementById('biriyaniDate').value = getTodayString();
    } catch (error) {
        hideLoading();
        console.error('Error adding biriyani post:', error);
        showToast('কিছু সমস্যা হয়েছে! আবার চেষ্টা করুন।', true);
    }
});

// ========== SURVEY ==========
function loadSurvey() {
    const container = document.getElementById('surveyList');
    const resultsContainer = document.getElementById('surveyResults');
    const noSurvey = document.getElementById('noSurvey');
    const today = getTodayString();
    
    const todayPosts = state.biriyaniPosts.filter(b => b.date === today);
    
    if (todayPosts.length === 0) {
        container.innerHTML = '';
        resultsContainer.innerHTML = '';
        noSurvey.style.display = 'block';
        return;
    }
    
    noSurvey.style.display = 'none';
    
    const votedSurveys = JSON.parse(localStorage.getItem('votedSurveys') || '{}');
    
    container.innerHTML = todayPosts.map(post => {
        const mosque = state.mosques.find(m => m.id === post.mosqueId);
        const mosqueName = mosque ? mosque.name : post.mosqueName || 'অজানা মসজিদ';
        const hasVoted = votedSurveys[post.id];
        
        return `
            <div class="survey-card">
                <div class="survey-card-header">
                    <h3>🕌 ${mosqueName}</h3>
                    <p>${post.waqt} নামাজে বিরিয়ানির খবর দেওয়া হয়েছিল</p>
                </div>
                <div class="survey-card-body">
                    ${hasVoted ? `
                        <div class="survey-voted">
                            <i class="fas fa-check-circle" style="color: var(--success); font-size: 1.5rem;"></i>
                            <p>আপনি ভোট দিয়েছেন: <strong>${hasVoted === 'yes' ? '✅ হ্যাঁ' : '❌ না'}</strong></p>
                        </div>
                    ` : `
                        <p class="survey-question">এই মসজিদে কি আসলেই বিরিয়ানি দিয়েছিল?</p>
                        <div class="survey-buttons">
                            <button class="btn-yes" onclick="voteSurvey('${post.id}', 'yes')">
                                <i class="fas fa-check"></i> হ্যাঁ, দিয়েছে ✅
                            </button>
                            <button class="btn-no" onclick="voteSurvey('${post.id}', 'no')">
                                <i class="fas fa-times"></i> না, দেয়নি ❌
                            </button>
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
    
    resultsContainer.innerHTML = todayPosts.map(post => {
        const mosque = state.mosques.find(m => m.id === post.mosqueId);
        const mosqueName = mosque ? mosque.name : post.mosqueName || 'অজানা মসজিদ';
        const yes = post.surveyYes || 0;
        const no = post.surveyNo || 0;
        const total = yes + no;
        const yesPercent = total > 0 ? Math.round((yes / total) * 100) : 0;
        const noPercent = total > 0 ? Math.round((no / total) * 100) : 0;
        
        let resultIcon = '⏳';
        let resultText = 'অপেক্ষমান';
        if (total >= 3) {
            if (yesPercent >= 70) {
                resultIcon = '✅';
                resultText = 'যাচাইকৃত - বিরিয়ানি দিয়েছে';
            } else if (noPercent >= 70) {
                resultIcon = '❌';
                resultText = 'ভুল তথ্য - বিরিয়ানি দেয়নি';
            } else {
                resultIcon = '🤔';
                resultText = 'মিশ্র মতামত';
            }
        }
        
        return `
            <div class="survey-card">
                <div class="survey-card-header" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);">
                    <h3>${resultIcon} ${mosqueName}</h3>
                    <p>${resultText} | মোট ভোট: ${total}</p>
                </div>
                <div class="survey-card-body">
                    <div class="survey-result-bar">
                        <div class="result-label">
                            <span>✅ হ্যাঁ (${yes} জন - ${yesPercent}%)</span>
                            <span>❌ না (${no} জন - ${noPercent}%)</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-yes" style="width: ${yesPercent}%"></div>
                            <div class="progress-no" style="width: ${noPercent}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function voteSurvey(postId, vote) {
    const votedSurveys = JSON.parse(localStorage.getItem('votedSurveys') || '{}');
    
    if (votedSurveys[postId]) {
        showToast('আপনি ইতোমধ্যে এই সার্ভেতে ভোট দিয়েছেন!', true);
        return;
    }
    
    showLoading();
    
    try {
        const postRef = db.collection('biriyaniPosts').doc(postId);
        
        if (vote === 'yes') {
            await postRef.update({
                surveyYes: firebase.firestore.FieldValue.increment(1)
            });
        } else {
            await postRef.update({
                surveyNo: firebase.firestore.FieldValue.increment(1)
            });
        }
        
        const updatedDoc = await postRef.get();
        const data = updatedDoc.data();
        const total = (data.surveyYes || 0) + (data.surveyNo || 0);
        const yesPercent = total > 0 ? ((data.surveyYes || 0) / total) * 100 : 0;
        
        if (total >= 3 && yesPercent >= 70) {
            await postRef.update({ verified: true });
        } else if (total >= 3 && yesPercent < 30) {
            await postRef.update({ verified: false });
        }
        
        votedSurveys[postId] = vote;
        localStorage.setItem('votedSurveys', JSON.stringify(votedSurveys));
        
        hideLoading();
        showToast(vote === 'yes' ? 'ধন্যবাদ! আপনি "হ্যাঁ" ভোট দিয়েছেন ✅' : 'ধন্যবাদ! আপনি "না" ভোট দিয়েছেন ❌');
        loadSurvey();
    } catch (error) {
        hideLoading();
        console.error('Error voting:', error);
        showToast('ভোট দিতে সমস্যা হয়েছে!', true);
    }
}

// ========== SEARCH & FILTER ==========
document.getElementById('searchBiriyani').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const cards = document.querySelectorAll('#biriyaniList .biriyani-card');
    
    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(query) ? '' : 'none';
    });
});

document.getElementById('searchMosque').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const areaFilter = document.getElementById('areaFilter').value;
    
    let filtered = state.mosques.filter(m => 
        m.name.toLowerCase().includes(query) || 
        (m.area && m.area.toLowerCase().includes(query)) ||
        (m.address && m.address.toLowerCase().includes(query))
    );
    
    if (areaFilter !== 'all') {
        filtered = filtered.filter(m => m.area === areaFilter);
    }
    
    renderMosques(filtered);
});

document.getElementById('areaFilter').addEventListener('change', (e) => {
    const area = e.target.value;
    const query = document.getElementById('searchMosque').value.toLowerCase().trim();
    
    let filtered = state.mosques;
    
    if (area !== 'all') {
        filtered = filtered.filter(m => m.area === area);
    }
    
    if (query) {
        filtered = filtered.filter(m => 
            m.name.toLowerCase().includes(query) || 
            (m.address && m.address.toLowerCase().includes(query))
        );
    }
    
    renderMosques(filtered);
});

document.querySelectorAll('.filter-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderBiriyaniToday(chip.getAttribute('data-filter'));
    });
});

// ========== INITIALIZE APP ==========
function initApp() {
    showLoading();
    loadMosques();
    loadBiriyaniPosts();
    setTimeout(() => hideLoading(), 1500);
}

initApp();