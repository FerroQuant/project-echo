#!/usr/bin/env python3
"""Fetch posts, videos, and events from The Well Church Facebook page."""

import json
import os
import sys
from urllib.request import urlopen, Request
from urllib.error import HTTPError

PAGE_ID = os.environ.get("FB_PAGE_ID", "thewellreading")
ACCESS_TOKEN = os.environ.get("FB_ACCESS_TOKEN", "")
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_data")
GRAPH_URL = "https://graph.facebook.com/v19.0"

def fetch(endpoint, fields):
    url = f"{GRAPH_URL}/{PAGE_ID}/{endpoint}?fields={fields}&limit=50&access_token={ACCESS_TOKEN}"
    req = Request(url, headers={"User-Agent": "TheWellChurch/1.0"})
    try:
        with urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        print(f"Error fetching {endpoint}: {e.code} {e.reason}", file=sys.stderr)
        return {"data": []}

def save(filename, data):
    path = os.path.join(DATA_DIR, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Saved {len(data)} items to {path}")

def main():
    if not ACCESS_TOKEN:
        print("FB_ACCESS_TOKEN not set", file=sys.stderr)
        sys.exit(1)

    posts_resp = fetch("posts", "id,message,full_picture,created_time,type,permalink_url")
    save("facebook_posts.json", posts_resp.get("data", []))

    videos_resp = fetch("videos", "id,title,description,source,picture,created_time,length")
    save("facebook_videos.json", videos_resp.get("data", []))

    events_resp = fetch("events", "id,name,description,start_time,end_time,place,cover")
    save("facebook_events.json", events_resp.get("data", []))

if __name__ == "__main__":
    main()
