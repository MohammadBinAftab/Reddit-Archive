# 📦 RepoMod — Reddit Archive to GitHub

**Auto-archive deleted posts and removed media from your subreddit into a connected GitHub repository.**

RepoMod is a [Devvit](https://developers.reddit.com/) app that runs entirely in the background. When a post or comment gets removed by a moderator — or deleted by a user — it automatically captures the content and pushes it as structured JSON to a GitHub repository you control.

## ✨ Features

- **Automatic Archiving** — Mod-removed posts and comments are archived with full content (title, body, author, media URLs, score, flair)
- **GitHub Integration** — Pushes directly to your repo via the GitHub Contents API
- **Date-Organized** — Archives are stored in monthly folders (`subreddit-archive/2026-05/`)
- **Privacy-Aware** — User self-deletions only log metadata (no content preserved), per Reddit's developer rules
- **Toggle On/Off** — Mods can enable/disable archiving from app settings
- **Archive Log** — View the last 10 archived items from the subreddit menu
- **Connection Test** — Validate your GitHub setup with one click

## 📁 GitHub Repository Structure

When RepoMod pushes archives, your repository will look like this:

```
subreddit-archive/
├── 2026-04/
│   ├── deleted-posts.json
│   └── removed-comments.json
├── 2026-05/
│   ├── deleted-posts.json
│   └── removed-comments.json
└── ...
```

Each JSON file contains an array of archived entries:

```json
[
  {
    "id": "t3_abc123",
    "title": "Example removed post",
    "body": "This was the post content...",
    "author": "someuser",
    "subreddit": "YourSubreddit",
    "createdAt": "2026-05-07T10:00:00.000Z",
    "archivedAt": "2026-05-07T10:05:30.000Z",
    "permalink": "https://reddit.com/r/YourSubreddit/comments/abc123/...",
    "url": "",
    "mediaUrls": ["https://i.redd.it/example.jpg"],
    "removalType": "mod_removed",
    "flair": "Discussion",
    "score": 42
  }
]
```

## 🚀 Setup

### Prerequisites

1. **Node.js 18+** installed
2. **Devvit CLI** — Install via `npm install -g devvit`
3. A **GitHub account** with a repository to archive into
4. A **GitHub Personal Access Token** with `repo` scope

### Creating a GitHub Token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Give it a descriptive name (e.g., "RepoMod Archive")
4. Select the **`repo`** scope (full control of private repositories)
5. Click **Generate token** and copy it

### Installation

```bash
# Clone or download this project
cd RepoMod

# Install dependencies
npm install

# Login to Devvit
devvit login

# Upload the app
devvit upload

# Install on your subreddit
devvit install <your-subreddit>
```

### Configuration

After installing the app on your subreddit:

1. Go to your subreddit's **Mod Tools** → **Installed Apps** → **RepoMod**
2. Configure the following settings:
   - **GitHub Personal Access Token** — Your PAT (stored securely)
   - **GitHub Username or Organization** — e.g., `myusername`
   - **GitHub Repository Name** — e.g., `subreddit-archive`
   - **Enable Archiving** — Toggle on/off

3. Test the connection:
   - Open the three-dot menu on your subreddit
   - Click **"🔗 RepoMod: Test GitHub Connection"**
   - You should see a success message

## 🔧 How It Works

### Trigger Flow

```
Mod removes a post/comment
  └─→ ModAction trigger fires (type: "removepost" / "removecomment")
      └─→ Fetch full content via Reddit API
          └─→ Build archive JSON entry
              └─→ Push to GitHub via Contents API
                  └─→ Log result to Redis

User deletes their own post/comment
  └─→ PostDelete / CommentDelete trigger fires
      └─→ Archive metadata only (no content)
          └─→ Push to GitHub
              └─→ Log result to Redis
```

### Menu Actions

| Action | Location | Who Can Use |
|--------|----------|-------------|
| 📦 View Archive Log | Subreddit menu | Moderators |
| 🔗 Test GitHub Connection | Subreddit menu | Moderators |

## 📂 Project Structure

```
RepoMod/
├── devvit.yaml          # Devvit app metadata
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
├── README.md            # This file
└── src/
    ├── main.ts          # Entry point — triggers, settings, menu items
    ├── github.ts        # GitHub Contents API client
    ├── archiver.ts      # Core archiving logic
    └── types.ts         # TypeScript interfaces
```

## ⚖️ Compliance

RepoMod is designed to comply with Reddit's Developer Platform rules:

- **Mod-removed content**: Fully archived (title, body, media, author) — this content was removed for rule violations and mods have legitimate need to review it
- **User-deleted content**: Only metadata is archived (IDs, timestamps) — users' right to delete their content is respected
- **No custom posts**: Runs entirely in the background, no user-facing UI beyond mod tools

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Settings incomplete" toast | Configure all 3 GitHub settings in app settings |
| "Repository not found" | Check owner/repo name, ensure token has `repo` scope |
| "Authentication failed" | Regenerate your GitHub token |
| Archives not appearing | Check that archiving is enabled; view the archive log for errors |
| File conflicts | GitHub Contents API is serial — rapid removals may occasionally conflict. The next removal will succeed |

## 📝 License

MIT — Use freely for your subreddit moderation needs.
