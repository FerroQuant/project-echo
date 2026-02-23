#!/usr/bin/env python3
"""Build a Lunr.js-compatible search index from transcripts and Facebook posts."""

import json
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRANSCRIPTS_DIR = os.path.join(REPO_ROOT, "_data", "transcripts")
POSTS_FILE      = os.path.join(REPO_ROOT, "_data", "facebook_posts.json")
OUTPUT_FILE     = os.path.join(REPO_ROOT, "assets", "search-index.json")


def truncate(text, max_words=50):
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]) + "..."


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def main():
    documents = []

    # --- Transcripts ---
    if os.path.isdir(TRANSCRIPTS_DIR):
        for fname in sorted(os.listdir(TRANSCRIPTS_DIR)):
            if fname == "index.json" or not fname.endswith(".json"):
                continue
            path = os.path.join(TRANSCRIPTS_DIR, fname)
            try:
                with open(path) as f:
                    data = json.load(f)
            except (json.JSONDecodeError, OSError) as e:
                print(f"Warning: skipping {fname}: {e}", file=sys.stderr)
                continue

            video_id = data.get("video_id", fname[:-5])
            title    = data.get("title", "Sermon")
            body     = data.get("full_text", "")

            documents.append({
                "id":    f"sermon-{video_id}",
                "title": title,
                "body":  truncate(body),
                "type":  "sermon",
                "url":   f"/sermons/{slug(video_id)}/"
            })

    # --- Facebook posts ---
    if os.path.isfile(POSTS_FILE):
        try:
            with open(POSTS_FILE) as f:
                posts = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"Warning: could not read facebook_posts.json: {e}", file=sys.stderr)
            posts = []

        for post in posts:
            post_id = post.get("id", "")
            message = post.get("message", "").strip()
            if not message:
                continue

            first_line = message.splitlines()[0][:80]

            documents.append({
                "id":    f"post-{post_id}",
                "title": first_line,
                "body":  truncate(message),
                "type":  "post",
                "url":   post.get("permalink_url", "https://www.facebook.com/thewellreading")
            })

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(documents, f, indent=2)

    print(f"Built search index: {len(documents)} documents → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
