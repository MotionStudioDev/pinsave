import yt_dlp
import requests
from bs4 import BeautifulSoup
import json
import re
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
import os
from urllib.parse import quote

app = FastAPI(title="Pinterest Downloader API")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PinterestRequest(BaseModel):
    url: str

class MediaLink(BaseModel):
    label: str  # e.g., '1080p', 'Original', '720p', etc.
    url: str
    ext: str  # 'mp4', 'jpg', etc.

class PinterestResponse(BaseModel):
    title: str
    thumbnail: str
    media_type: str  # 'video' or 'image'
    links: List[MediaLink]

def get_image_qualities(img_url: str) -> List[Dict]:
    """Helper to generate image quality links with correct extensions."""
    # Detect original extension (png, jpg, webp)
    ext = img_url.split('.')[-1].split('?')[0]
    if len(ext) > 4: ext = "jpg"
    
    # Standard Pinterest resolution paths
    base_url = img_url.replace("/236x/", "/originals/").replace("/474x/", "/originals/").replace("/564x/", "/originals/").replace("/736x/", "/originals/")
    
    return [
        {"label": "Original Quality", "url": base_url, "ext": ext},
        {"label": "HD (736x)", "url": base_url.replace("/originals/", "/736x/"), "ext": ext},
        {"label": "Standard (474x)", "url": base_url.replace("/originals/", "/474x/"), "ext": ext}
    ]

@app.get("/api/download")
async def download_proxy(
    url: str = Query(...), 
    filename: str = Query("download"),
    referer: Optional[str] = Query(None)
):
    """Proxy endpoint to allow direct downloading with advanced 403 bypass."""
    try:
        # Robust headers mimicking a real browser session
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
            "Referer": referer or "https://www.pinterest.com/",
            "Sec-Fetch-Dest": "image",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "cross-site",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        }
        
        # If it's a video, update headers
        if ".mp4" in url.lower():
            headers["Accept"] = "*/*"
            headers["Sec-Fetch-Dest"] = "video"
            
        with requests.Session() as session:
            # First, try to "visit" the referer to get some cookies if any (optional but helpful)
            if referer:
                try: session.get(referer, headers={"User-Agent": headers["User-Agent"]}, timeout=5)
                except: pass
            
            response = session.get(url, headers=headers, stream=True, timeout=20)
            
            # If 403, try without Referer or with a generic one
            if response.status_code == 403:
                headers["Referer"] = "https://www.pinterest.com/"
                response = session.get(url, headers=headers, stream=True, timeout=20)
            
            response.raise_for_status()
            
            # Extension detection
            url_clean = url.split('?')[0]
            ext = url_clean.split('.')[-1]
            if len(ext) > 4 or "/" in ext: ext = "mp4" if "video" in url.lower() else "jpg"
            
            # Safe Filename
            safe_filename = filename.replace(" ", "_").replace("\"", "").replace("'", "")
            if not safe_filename.endswith(f".{ext}"):
                safe_filename = f"{safe_filename}.{ext}"
                
            encoded_filename = quote(safe_filename)

            return StreamingResponse(
                response.iter_content(chunk_size=1024*1024),
                media_type=response.headers.get("content-type", f"image/{ext}"),
                headers={
                    "Content-Disposition": f"attachment; filename=\"{encoded_filename}\"; filename*=UTF-8''{encoded_filename}",
                    "Access-Control-Expose-Headers": "Content-Disposition"
                }
            )
    except Exception as e:
        print(f"Download Proxy Error for URL {url}: {e}")
        # Last resort: If proxy fails, we can't do much but we'll try to return a 400 with the direct link
        # so the frontend could potentially show it.
        raise HTTPException(status_code=400, detail=f"Download failed: {str(e)}")

def extract_with_bs4(url: str) -> Optional[Dict]:
    """Enhanced fallback scraper with prioritized video detection and better thumbnails."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        html_content = response.text
        
        links = []
        title = soup.title.string if soup.title else "Pinterest Media"
        thumbnail = ""
        media_type = "image"
        
        # Method 0: Check for mp4 URLs
        mp4_match = re.search(r'https://v1\.pinimg\.com/[a-zA-Z0-9/_.-]+\.mp4', html_content)
        if mp4_match:
            video_url = mp4_match.group(0)
            media_type = "video"
            links.append({"label": "Video (MP4)", "url": video_url, "ext": "mp4"})

        # Method 1: application/ld+json
        json_tags = soup.find_all('script', type='application/ld+json')
        for tag in json_tags:
            try:
                data = json.loads(tag.string)
                if isinstance(data, list): data = data[0]
                
                if 'video' in data:
                    v_data = data['video']
                    v_url = v_data.get('contentUrl') or v_data.get('embedUrl')
                    if v_url:
                        media_type = "video"
                        thumbnail = v_data.get('thumbnailUrl', thumbnail)
                        if not any(l['url'] == v_url for l in links):
                            links.append({"label": "Video HD", "url": v_url, "ext": "mp4"})
                
                if 'image' in data:
                    img_data = data['image']
                    t_url = img_data if isinstance(img_data, str) else img_data.get('url')
                    if t_url:
                        thumbnail = t_url # Best guess for thumbnail
                        if media_type != "video":
                            links.extend(get_image_qualities(t_url))
            except:
                continue

        # Try to find a better thumbnail if still empty or small
        image_tags = soup.find_all('img')
        if not thumbnail and image_tags:
            thumbnail = image_tags[0].get('src', '')

        # PWS_DATA often has better thumbnails
        pws_tag = soup.find('script', id='__PWS_DATA__')
        if pws_tag:
            try:
                 pws_data = json.loads(pws_tag.string)
                 # Try to extract the highest quality image as thumbnail
                 # Path: props.initialReduxState.pins[pinId].images.orig.url
                 # This is complex to parse strictly but we can look for large i.pinimg.com links
                 large_imgs = re.findall(r'https://i\.pinimg\.com/[a-zA-Z0-9/_.-]+736x[a-zA-Z0-9/_.-]+\.jpg', pws_tag.string)
                 if large_imgs:
                     thumbnail = large_imgs[0]
            except:
                 pass

        # Method 2: Regex for original image (If no video found)
        if media_type == "image":
            orig_match = re.search(r'https://i\.pinimg\.com/originals/[a-zA-Z0-9/_.-]+', html_content)
            if orig_match and not links:
                img_url = orig_match.group(0)
                thumbnail = img_url
                links.extend(get_image_qualities(img_url))

        if links:
            return {
                "title": title,
                "thumbnail": thumbnail,
                "media_type": media_type,
                "links": links
            }
            
        return None
    except Exception as e:
        print(f"Extraction fallback error: {e}")
        return None

def extract_pinterest_data(url: str) -> Dict:
    # Try yt-dlp first
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'format': 'best',
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            title = info.get('title', 'Pinterest Media')
            thumbnail = info.get('thumbnail', '')
            
            links = []
            formats = info.get('formats', [])
            
            # IMPROVED: Check for video duration or presence of video formats
            is_video = bool(formats) or info.get('duration') is not None
            
            if is_video and formats:
                seen_heights = set()
                for f in reversed(formats):
                    height = f.get('height')
                    if height and height not in seen_heights:
                        label = f"{height}p"
                        links.append({"label": label, "url": f.get('url'), "ext": "mp4"})
                        seen_heights.add(height)
                
                if not links:
                    links.append({"label": "Best Quality", "url": formats[-1].get('url'), "ext": "mp4"})
                
                media_type = 'video'
            else:
                media_url = info.get('url')
                if media_url:
                    links.extend(get_image_qualities(media_url))
                    media_type = 'image'
                else:
                    raise Exception("yt-dlp: No direct URL found")

            # Final check: if yt-dlp returns an image but we suspect it's a video
            if media_type == 'image' and ("video" in title.lower() or "reel" in title.lower()):
                 raise Exception("yt-dlp misidentified as image")

            return {
                "title": title,
                "thumbnail": thumbnail,
                "media_type": media_type,
                "links": links
            }
    except Exception as e:
        print(f"yt-dlp error/skip: {e}. Trying BS4/Regex fallback...")
        fallback_data = extract_with_bs4(url)
        if fallback_data:
            return fallback_data
        raise HTTPException(status_code=400, detail=f"Fail: {str(e)[:50]}")

@app.post("/api/extract", response_model=PinterestResponse)
async def extract(request: PinterestRequest):
    url = request.url.split('?')[0] if '?' in request.url else request.url
    if not url or ("pinterest.com" not in url and "pin.it" not in url):
        raise HTTPException(status_code=400, detail="Invalid Pinterest URL")
    data = extract_pinterest_data(url)
    return data

@app.get("/")
async def root():
    return FileResponse("index.html")

@app.get("/style.css")
async def get_css():
    return FileResponse("style.css", media_type="text/css")

@app.get("/script.js")
async def get_js():
    return FileResponse("script.js", media_type="application/javascript")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
