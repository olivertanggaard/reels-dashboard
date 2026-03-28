export function extractInstagramShortcode(url) {
    try {
      const parsed = new URL(url.trim());
  
      if (!["www.instagram.com", "instagram.com"].includes(parsed.hostname)) {
        return null;
      }
  
      // Matches /reel/CODE or /reels/CODE
      const match = parsed.pathname.match(/^\/reels?\/([A-Za-z0-9_-]+)/);
  
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }