/**
 * RepoMod — Type Definitions
 *
 * Shared interfaces for archived content and GitHub API interactions.
 */

/** Represents an archived Reddit post */
export interface ArchivedPost {
  /** Reddit post ID (e.g., "t3_abc123") */
  id: string;
  /** Post title */
  title: string;
  /** Post body text (selftext), empty string for link posts */
  body: string;
  /** Author username (may be "[deleted]" if account is gone) */
  author: string;
  /** Subreddit name without "r/" prefix */
  subreddit: string;
  /** ISO 8601 timestamp when the post was originally created */
  createdAt: string;
  /** ISO 8601 timestamp when the post was deleted/removed */
  archivedAt: string;
  /** Full permalink URL to the post */
  permalink: string;
  /** Direct URL (for link posts) or empty string */
  url: string;
  /** Array of image/media URLs found in the post */
  mediaUrls: string[];
  /** How the content was removed */
  removalType: 'mod_removed' | 'user_deleted' | 'unknown';
  /** Flair text if present */
  flair: string;
  /** Post score at time of archival */
  score: number;
}

/** Represents an archived Reddit comment */
export interface ArchivedComment {
  /** Reddit comment ID (e.g., "t1_xyz789") */
  id: string;
  /** Parent post ID */
  postId: string;
  /** Comment body text */
  body: string;
  /** Author username */
  author: string;
  /** Subreddit name */
  subreddit: string;
  /** ISO 8601 timestamp when the comment was created */
  createdAt: string;
  /** ISO 8601 timestamp when the comment was archived */
  archivedAt: string;
  /** Full permalink URL */
  permalink: string;
  /** How the content was removed */
  removalType: 'mod_removed' | 'user_deleted' | 'unknown';
  /** Comment score at time of archival */
  score: number;
}

/** A log entry displayed to mods */
export interface ArchiveLogEntry {
  /** Type of content archived */
  type: 'post' | 'comment';
  /** Content ID */
  id: string;
  /** Brief description (title or truncated body) */
  summary: string;
  /** How it was removed */
  removalType: string;
  /** When it was archived */
  archivedAt: string;
  /** Whether the GitHub push succeeded */
  success: boolean;
  /** Error message if push failed */
  error?: string;
}

/** GitHub Contents API response when getting a file */
export interface GitHubFileResponse {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: string;
}

/** GitHub Contents API request body for creating/updating a file */
export interface GitHubPutFileRequest {
  message: string;
  content: string;
  sha?: string;
  branch?: string;
}

/** App settings stored via Devvit.addSettings */
export interface RepoModSettings {
  'github-token': string;
  'github-owner': string;
  'github-repo': string;
  'archiving-enabled': boolean;
}
