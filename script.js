document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('url-input');
    const downloadBtn = document.getElementById('download-btn');
    const pasteBtn = document.getElementById('paste-btn');
    const loading = document.getElementById('loading');
    const resultContainer = document.getElementById('result-container');
    const errorMessage = document.getElementById('error-message');
    const thumbnail = document.getElementById('thumbnail');
    const resultTitle = document.getElementById('result-title');
    const playIcon = document.getElementById('play-icon');
    const linksContainer = document.getElementById('links-container');

    // Dynamic API URL for Vercel/Production compatibility
    const isLocal = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '';

    // In local dev, we use the full URL. In production/Vercel, we use relative paths.
    const API_BASE = isLocal ? 'http://localhost:8000/api' : '/api';

    // Paste Handle
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            urlInput.value = text;
            urlInput.focus();

            // Add a subtle flash effect to feedback
            urlInput.style.borderColor = 'var(--primary-color)';
            setTimeout(() => {
                urlInput.style.borderColor = 'var(--glass-border)';
            }, 500);
        } catch (err) {
            console.error('Clipboard error:', err);
            // If API fails, UI is unaffected, user pastes manually
        }
    });

    // Error helper
    const showError = (msg) => {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
        setTimeout(() => {
            errorMessage.classList.add('hidden');
        }, 5000);
    };

    downloadBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();

        if (!url) {
            showError('Lütfen geçerli bir Pinterest linki girin!');
            return;
        }

        // Reset UI
        resultContainer.classList.add('hidden');
        errorMessage.classList.add('hidden');
        loading.classList.remove('hidden');
        downloadBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE}/extract`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: url }),
            });

            const text = await response.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error('Failed to parse JSON. Response text:', text);
                throw new Error('Sunucudan geçersiz bir cevap geldi.');
            }

            if (!response.ok) {
                throw new Error(data.detail || 'Extraction failed');
            }

            // Update UI with result
            resultTitle.textContent = data.title;

            // Set thumbnail with fallback
            if (data.thumbnail) {
                thumbnail.src = data.thumbnail;
            } else {
                thumbnail.src = 'https://i.pinimg.com/originals/ce/dd/a8/cedda8f0e08b539c4d169c9b68e0e7a2.jpg'; // Pinterest Placeholder
            }

            // Clear and populate links
            linksContainer.innerHTML = '';

            data.links.forEach(link => {
                const btn = document.createElement('a');
                // Use our proxy endpoint with the original URL as referer to bypass 403
                // Use our proxy endpoint with the original URL as referer to bypass 403
                const downloadUrl = `${API_BASE}/download?url=${encodeURIComponent(link.url)}&filename=${encodeURIComponent(data.title.substring(0, 50))}&referer=${encodeURIComponent(url)}`;

                btn.href = downloadUrl;
                btn.className = 'quality-btn';
                btn.innerHTML = `
                    <span>Download</span>
                    <span class="size-label">${link.label}</span>
                    <span class="ext-badge">${link.ext.toUpperCase()}</span>
                `;
                linksContainer.appendChild(btn);
            });

            if (data.media_type === 'video') {
                playIcon.classList.remove('hidden');
            } else {
                playIcon.classList.add('hidden');
            }

            loading.classList.add('hidden');
            resultContainer.classList.remove('hidden');
        } catch (error) {
            console.error('Error:', error);
            loading.classList.add('hidden');
            showError(error.message || 'Bir hata oluştu. Lütfen linki kontrol edin.');
        } finally {
            downloadBtn.disabled = false;
        }
    });

    // Handle Enter key
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            downloadBtn.click();
        }
    });

    // Hide Preloader on Load
    window.addEventListener('load', () => {
        const preloader = document.getElementById('preloader');
        setTimeout(() => {
            preloader.classList.add('fade-out');
        }, 500); // Small delay for premium feel
    });
});
