# PinSave - Pinterest Video & Resim İndirici

Premium Pinterest downloader with multi-quality support and direct download functionality.

## 🚀 Deployment

### Render.com (Backend)
1. Push this repo to GitHub
2. Create a new Web Service on Render.com
3. Connect your GitHub repo
4. Render will automatically detect `render.yaml`
5. Deploy!

### Vercel (Frontend - Optional)
1. Deploy only `index.html`, `style.css`, `script.js` to Vercel
2. Update `API_BASE` in `script.js` with your Render backend URL

## 🛠️ Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run server
python main.py

# Open http://localhost:8000 in browser
```

## ✨ Features
- Multi-quality downloads (Original, HD, Standard)
- Direct download with Unicode support
- Custom PS branding
- Premium glassmorphism UI
- Mobile responsive
