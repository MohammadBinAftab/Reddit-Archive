# RepoMod - Subreddit Archive to GitHub

Automatically archive removed posts and comments from your subreddit into a connected GitHub repository.

RepoMod runs in the background. When a moderator removes a post or comment, it fetches the content and pushes it as structured JSON to your repository. It also handles user-deleted posts by logging only timestamps and IDs to protect user privacy.

## Features

* Automatic Archiving: Stores full post and comment metadata (title, body text, author, tags, score).
* Media Extraction: Automatically parses URLs to extract direct image or video links.
* Monthly Partitioning: Saves files in chronological monthly folders for scaling.
* Privacy Compliance: Redacts body text and author names for user-deleted content.
* Moderator Console: Includes connection validation and a rolling diagnostic log inside Reddit.

## GitHub Directory Structure

Your repository will follow this structure:

```
subreddit-archive/
├── YYYY-MM/
│   ├── deleted-posts.json
│   └── removed-comments.json
```

Each JSON file stores an array of archived records:

```json
[
  {
    "id": "t3_abc123",
    "title": "Post Title",
    "body": "Post Body Content",
    "author": "username",
    "subreddit": "SubredditName",
    "createdAt": "2026-05-07T10:00:00.000Z",
    "archivedAt": "2026-05-07T10:05:30.000Z",
    "permalink": "https://reddit.com/r/SubredditName/comments/abc123/...",
    "url": "",
    "mediaUrls": ["https://i.redd.it/example.jpg"],
    "removalType": "mod_removed",
    "flair": "Discussion",
    "score": 42
  }
]
```

## Setup

### Prerequisites

1. Node.js 18 or higher.
2. Devvit CLI installed globally.
3. A GitHub repository and a Personal Access Token with repo scope.

### Installation

1. Clone this repository.
2. Run npm install.
3. Log in to Devvit: devvit login
4. Start the playtest server: npm run dev

### Configuration

1. In your subreddit's Mod Tools, go to Installed Apps -> RepoMod.
2. Fill in your GitHub token, repository owner, and repository name.
3. Click Save Settings.
4. Test the connection from your subreddit's three-dot menu using the "Test GitHub Connection" button.

## How it Works

* Moderator Action: Trigger fires -> Fetches content from Reddit API -> Formats JSON -> Commits to GitHub -> Updates local Redis diagnostic log.
* User Deletion: Trigger fires -> Redacts title and body text -> Commits metadata to GitHub -> Updates local Redis diagnostic log.

## Troubleshooting

* Connection Failure: Verify your GitHub token, repository name, and repository owner. Ensure the token has the correct repo scope.
* Missing Files: Ensure archiving is toggled on in the app settings. Check the in-app diagnostic log for error messages.
