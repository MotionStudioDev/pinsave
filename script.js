document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Güvenli Seçim
    const getElement = (id) => {
        const el = document.getElementById(id);
        if (!el) console.warn(`Element not found: ${id}`);
        return el;
    };

    const urlInput = getElement('url-input');
    const downloadBtn = getElement('download-btn');
    const pasteBtn = getElement('paste-btn');
    // const clearBtn = getElement('clear-btn'); // HTML'de yoksa sorun değil
    const loading = getElement('loading');
    const resultContainer = getElement('result-container'); // Düzeltilmiş ID
    const errorSection = getElement('error-message');
    const themeToggle = getElement('theme-toggle');
    const themeIcon = getElement('theme-icon');
    
    // History Elements
    const historyBtn = getElement('history-btn');
    const historyModal = getElement('history-modal');
    const closeHistoryBtn = getElement('close-history');
    const historyList = getElement('history-list');
    const clearHistoryBtn = getElement('clear-history');

    // Eğer kritik elementler yoksa çalışmayı durdurma, sadece uyar
    if (!urlInput || !downloadBtn) {
        console.error('Kritik elementler eksik!');
        return;
    }

    // Constants
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.hostname === '';
    const API_BASE = isLocal ? 'http://localhost:8000/api' : '/api';

    // Theme Logic
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (themeIcon) updateThemeIcon(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            if (themeIcon) updateThemeIcon(newTheme);
        });
    }

    function updateThemeIcon(theme) {
        if (!themeIcon) return;
        themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
    }

    // Paste Button Logic
    if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                urlInput.value = text;
                urlInput.focus();
            } catch (err) {
                console.error('Failed to read clipboard:', err);
                alert('Pano içeriği okunamadı. Lütfen manuel yapıştırın.');
            }
        });
    }

    // Download Button Logic
    downloadBtn.addEventListener('click', handleDownload);
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleDownload();
    });

    // History Modal Logic
    if (historyBtn && historyModal) {
        historyBtn.addEventListener('click', () => {
            renderHistory();
            historyModal.classList.remove('hidden');
        });

        if (closeHistoryBtn) {
            closeHistoryBtn.addEventListener('click', () => {
                historyModal.classList.add('hidden');
            });
        }

        window.addEventListener('click', (e) => {
            if (e.target === historyModal) {
                historyModal.classList.add('hidden');
            }
        });
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('Tüm indirme geçmişini silmek istediğinize emin misiniz?')) {
                localStorage.removeItem('downloadHistory');
                renderHistory();
            }
        });
    }

    async function handleDownload() {
        const url = urlInput.value.trim();
        
        if (!url) {
            alert('Lütfen geçerli bir Pinterest bağlantısı girin.');
            return;
        }

        resetUI();
        if (loading) loading.classList.remove('hidden');
        downloadBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE}/extract`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'İçerik alınamadı.');
            }

            const data = await response.json();
            showResult(data);
            addToHistory(data);

        } catch (error) {
            console.error('Error:', error);
            if (loading) loading.classList.add('hidden');
            
            let userMsg = error.message || 'Bir hata oluştu. Lütfen tekrar deneyin.';
            if (userMsg.includes('Failed to fetch')) {
                userMsg = 'Sunucuya bağlanılamadı. Lütfen arka planda "main.py" uygulamasının çalıştığından emin olun.';
            }
            
            showError(userMsg);
        } finally {
            downloadBtn.disabled = false;
        }
    }

    function showResult(data) {
        if (loading) loading.classList.add('hidden');
        if (resultContainer) resultContainer.classList.remove('hidden');
        
        // Setup Media Preview
        const previewContainer = document.querySelector('.media-preview');
        if (previewContainer) {
            previewContainer.innerHTML = ''; // Clear previous content

            if (data.media_type === 'video') {
                const videoUrl = data.links[0]?.url || data.thumbnail;
                const video = document.createElement('video');
                video.src = videoUrl;
                video.poster = data.thumbnail;
                video.controls = true;
                video.autoplay = true;
                video.loop = true;
                video.muted = true;
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'contain';
                previewContainer.appendChild(video);
            } else {
                const img = document.createElement('img');
                img.src = data.thumbnail;
                img.alt = data.title;
                previewContainer.appendChild(img);
            }
        }

        // Setup Info
        const titleEl = document.getElementById('result-title');
        if (titleEl) titleEl.textContent = data.title || 'Pinterest Pin';
        
        // Setup Download Links
        const linksContainer = document.getElementById('links-container');
        if (linksContainer) {
            linksContainer.innerHTML = '';

            data.links.forEach(link => {
                const a = document.createElement('a');
                a.href = `${API_BASE}/download?url=${encodeURIComponent(link.url)}&filename=${encodeURIComponent(data.title || 'pin')}.${link.ext}`;
                a.className = 'quality-btn';
                a.target = '_blank';
                a.download = '';
                
                a.innerHTML = `
                    <span class="ext-badge">${link.ext.toUpperCase()}</span>
                    <span class="quality-label">${link.quality || 'Standart'}</span>
                    <span class="download-icon">⬇️ İndir</span>
                `;
                
                linksContainer.appendChild(a);
            });
        }

        // Scroll to result
        if (resultContainer) {
            resultContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function addToHistory(data) {
        const historyItem = {
            id: Date.now(),
            title: data.title || 'Pinterest Pin',
            thumbnail: data.thumbnail,
            date: new Date().toLocaleDateString('tr-TR'),
            url: urlInput.value
        };

        let history = JSON.parse(localStorage.getItem('downloadHistory') || '[]');
        history.unshift(historyItem); // Add to beginning
        
        // Keep only last 20 items
        if (history.length > 20) history = history.slice(0, 20);
        
        localStorage.setItem('downloadHistory', JSON.stringify(history));
    }

    function renderHistory() {
        if (!historyList) return;
        
        const history = JSON.parse(localStorage.getItem('downloadHistory') || '[]');
        historyList.innerHTML = '';

        if (history.length === 0) {
            historyList.innerHTML = '<p class="empty-history">Henüz indirme geçmişi yok.</p>';
            return;
        }

        history.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <img src="${item.thumbnail}" class="history-thumb" alt="${item.title}">
                <div class="history-info">
                    <div class="history-title">${item.title}</div>
                    <div class="history-date">${item.date}</div>
                </div>
                <button class="nav-btn" onclick="loadHistoryItem('${item.url}')" title="Tekrar İndir">
                    🔄
                </button>
            `;
            historyList.appendChild(div);
        });
    }

    // Helper function to be called from HTML onclick
    window.loadHistoryItem = (url) => {
        if (urlInput) {
            urlInput.value = url;
            if (historyModal) historyModal.classList.add('hidden');
            handleDownload();
        }
    };

    function showError(message) {
        if (loading) loading.classList.add('hidden');
        if (errorSection) {
            errorSection.classList.remove('hidden');
            const errorText = document.getElementById('error-text');
            if (errorText) errorText.textContent = message;
        } else {
            alert(message);
        }
    }

    function resetUI() {
        if (resultContainer) resultContainer.classList.add('hidden');
        if (errorSection) errorSection.classList.add('hidden');
        if (loading) loading.classList.add('hidden');
    }
});