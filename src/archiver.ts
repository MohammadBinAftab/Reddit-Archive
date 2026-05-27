/**
 * RepoMod — Core Archiver Module
 *
 * Contains the business logic for:
 * 1. Capturing post/comment data from the Reddit API
 * 2. Building archive entries
 * 3. Pushing to GitHub
 * 4. Logging results to Redis
 *
 * Uses a minimal context interface that works with both Context and TriggerContext,
 * since TriggerContext omits 'ui', 'modLog', etc.
 */

import { appendToJsonFile } from './github.js';
import type { ArchivedPost, ArchivedComment, ArchiveLogEntry } from './types.js';

/**
 * Minimal context interface that works with both Devvit.Context and TriggerContext.
 * TriggerContext = Omit<Devvit.Context, 'ui' | 'dimensions' | 'modLog' | 'uiEnvironment'>
 * We only need reddit, redis, and settings — all of which exist in TriggerContext.
 */
interface ArchiverContext {
  reddit: {
    getPostById(id: string): Promise<any>;
    getCommentById(id: string): Promise<any>;
  };
  redis: {
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string): Promise<string>;
  };
  settings: {
    get<T>(key: string): Promise<T | undefined>;
  };
}

/** Redis key for the archive log (stores last N entries) */
const LOG_KEY = 'repomod:archive_log';
/** Maximum number of log entries to keep */
const MAX_LOG_ENTRIES = 10;
/** Base folder name in the GitHub repo */
const ARCHIVE_FOLDER = 'subreddit-archive';

/**
 * Get the current month folder name (e.g., "2026-05")
 */
function getMonthFolder(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Extract media URLs from post body markdown and URL.
 * Looks for common image/media patterns in Reddit content.
 */
function extractMediaUrls(body: string, url: string): string[] {
  const mediaUrls: string[] = [];
  const mediaExtensions = /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)(\?.*)?$/i;
  const mediaHosts = /i\.redd\.it|i\.imgur\.com|preview\.redd\.it|v\.redd\.it|imgur\.com/i;

  // Check the post URL itself
  if (url && (mediaExtensions.test(url) || mediaHosts.test(url))) {
    mediaUrls.push(url);
  }

  // Extract image URLs from markdown: ![alt](url) and bare URLs
  if (body) {
    // Markdown image syntax
    const markdownImages = body.matchAll(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g);
    for (const match of markdownImages) {
      if (match[1]) mediaUrls.push(match[1]);
    }

    // Bare URLs that look like media
    const bareUrls = body.matchAll(/(https?:\/\/[^\s)]+)/g);
    for (const match of bareUrls) {
      if (match[1] && (mediaExtensions.test(match[1]) || mediaHosts.test(match[1]))) {
        // Avoid duplicates from markdown images
        if (!mediaUrls.includes(match[1])) {
          mediaUrls.push(match[1]);
        }
      }
    }
  }

  return mediaUrls;
}

/**
 * Read app settings and validate they're configured.
 * Returns null if settings are incomplete or archiving is disabled.
 */
async function getSettings(context: ArchiverContext): Promise<{
  token: string;
  owner: string;
  repo: string;
  enabled: boolean;
} | null> {
  try {
    const token = await context.settings.get<string>('github-token');
    const owner = await context.settings.get<string>('github-owner');
    const repo = await context.settings.get<string>('github-repo');
    const enabled = await context.settings.get<boolean>('archiving-enabled');

    if (!token || !owner || !repo) {
      console.log('RepoMod: Settings not fully configured, skipping archive');
      return null;
    }

    // If explicitly set to false, archiving is disabled
    if (enabled === false) {
      console.log('RepoMod: Archiving is disabled');
      return null;
    }

    return {
      token: token.trim(),
      owner: owner.trim(),
      repo: repo.trim(),
      enabled: true,
    };
  } catch (error) {
    console.error('RepoMod: Failed to read settings:', error);
    return null;
  }
}

/**
 * Add a log entry to Redis (capped at MAX_LOG_ENTRIES).
 */
async function addLogEntry(context: ArchiverContext, entry: ArchiveLogEntry): Promise<void> {
  try {
    // Get existing log
    const existingLog = await context.redis.get(LOG_KEY);
    let entries: ArchiveLogEntry[] = [];

    if (existingLog) {
      try {
        entries = JSON.parse(existingLog);
      } catch {
        entries = [];
      }
    }

    // Prepend new entry (most recent first)
    entries.unshift(entry);

    // Trim to max
    if (entries.length > MAX_LOG_ENTRIES) {
      entries = entries.slice(0, MAX_LOG_ENTRIES);
    }

    // Save back
    await context.redis.set(LOG_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error('RepoMod: Failed to write log entry:', error);
  }
}

/**
 * Get the archive log from Redis.
 * Accepts the broader ArchiverContext so it can also be called from menu actions.
 */
export async function getArchiveLog(context: ArchiverContext): Promise<ArchiveLogEntry[]> {
  try {
    const log = await context.redis.get(LOG_KEY);
    if (!log) return [];
    return JSON.parse(log) as ArchiveLogEntry[];
  } catch {
    return [];
  }
}

/**
 * Archive a mod-removed post.
 *
 * Called when a ModAction trigger fires with action "removelink" or similar.
 * At this point, the post content is still accessible via the Reddit API.
 */
export async function archiveRemovedPost(
  context: ArchiverContext,
  postId: string
): Promise<void> {
  const settings = await getSettings(context);
  if (!settings) return;

  const now = new Date().toISOString();
  let logEntry: ArchiveLogEntry;

  try {
    // Fetch the post content before it becomes inaccessible
    const post = await context.reddit.getPostById(postId);

    const archived: ArchivedPost = {
      id: postId,
      title: post.title || '[No Title]',
      body: post.body || '',
      author: post.authorName || '[deleted]',
      subreddit: post.subredditName || '[unknown]',
      createdAt: post.createdAt instanceof Date
        ? post.createdAt.toISOString()
        : now,
      archivedAt: now,
      permalink: post.permalink || `https://reddit.com/comments/${postId.replace('t3_', '')}`,
      url: post.url || '',
      mediaUrls: extractMediaUrls(post.body || '', post.url || ''),
      removalType: 'mod_removed',
      flair: post.flair?.text || '',
      score: post.score ?? 0,
    };

    // Build the file path
    const monthFolder = getMonthFolder();
    const filePath = `${ARCHIVE_FOLDER}/${monthFolder}/deleted-posts.json`;
    const commitMessage = `📦 Archive removed post: ${archived.title.substring(0, 50)}`;

    // Push to GitHub
    await appendToJsonFile(
      settings.token,
      settings.owner,
      settings.repo,
      filePath,
      archived,
      commitMessage
    );

    logEntry = {
      type: 'post',
      id: postId,
      summary: archived.title.substring(0, 80),
      removalType: 'mod_removed',
      archivedAt: now,
      success: true,
    };

    console.log(`RepoMod: Successfully archived post ${postId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`RepoMod: Failed to archive post ${postId}:`, errorMsg);

    logEntry = {
      type: 'post',
      id: postId,
      summary: `[Failed to fetch] ${postId}`,
      removalType: 'mod_removed',
      archivedAt: now,
      success: false,
      error: errorMsg,
    };
  }

  await addLogEntry(context, logEntry);
}

/**
 * Archive a mod-removed comment.
 *
 * Called when a ModAction trigger fires with action "removecomment".
 */
export async function archiveRemovedComment(
  context: ArchiverContext,
  commentId: string
): Promise<void> {
  const settings = await getSettings(context);
  if (!settings) return;

  const now = new Date().toISOString();
  let logEntry: ArchiveLogEntry;

  try {
    // Fetch the comment content
    const comment = await context.reddit.getCommentById(commentId);

    const archived: ArchivedComment = {
      id: commentId,
      postId: comment.postId || '',
      body: comment.body || '[No Body]',
      author: comment.authorName || '[deleted]',
      subreddit: comment.subredditName || '[unknown]',
      createdAt: comment.createdAt instanceof Date
        ? comment.createdAt.toISOString()
        : now,
      archivedAt: now,
      permalink: comment.permalink || '',
      removalType: 'mod_removed',
      score: comment.score ?? 0,
    };

    // Build the file path
    const monthFolder = getMonthFolder();
    const filePath = `${ARCHIVE_FOLDER}/${monthFolder}/removed-comments.json`;
    const commitMessage = `💬 Archive removed comment by u/${archived.author}`;

    // Push to GitHub
    await appendToJsonFile(
      settings.token,
      settings.owner,
      settings.repo,
      filePath,
      archived,
      commitMessage
    );

    logEntry = {
      type: 'comment',
      id: commentId,
      summary: archived.body.substring(0, 80),
      removalType: 'mod_removed',
      archivedAt: now,
      success: true,
    };

    console.log(`RepoMod: Successfully archived comment ${commentId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`RepoMod: Failed to archive comment ${commentId}:`, errorMsg);

    logEntry = {
      type: 'comment',
      id: commentId,
      summary: `[Failed to fetch] ${commentId}`,
      removalType: 'mod_removed',
      archivedAt: now,
      success: false,
      error: errorMsg,
    };
  }

  await addLogEntry(context, logEntry);
}

/**
 * Handle a user-deleted post event.
 *
 * Per Devvit rules, we respect user deletion and only archive minimal metadata.
 * We do NOT preserve the content of user-deleted posts.
 */
export async function handleUserDeletedPost(
  context: ArchiverContext,
  postId: string
): Promise<void> {
  const settings = await getSettings(context);
  if (!settings) return;

  const now = new Date().toISOString();

  // Only log metadata — respect user's right to delete
  const archived: ArchivedPost = {
    id: postId,
    title: '[User Deleted — Content Redacted]',
    body: '',
    author: '[deleted]',
    subreddit: '[redacted]',
    createdAt: '',
    archivedAt: now,
    permalink: '',
    url: '',
    mediaUrls: [],
    removalType: 'user_deleted',
    flair: '',
    score: 0,
  };

  try {
    const monthFolder = getMonthFolder();
    const filePath = `${ARCHIVE_FOLDER}/${monthFolder}/deleted-posts.json`;
    const commitMessage = `🗑️ Log user-deleted post ${postId}`;

    await appendToJsonFile(
      settings.token,
      settings.owner,
      settings.repo,
      filePath,
      archived,
      commitMessage
    );

    await addLogEntry(context, {
      type: 'post',
      id: postId,
      summary: '[User deleted — metadata only]',
      removalType: 'user_deleted',
      archivedAt: now,
      success: true,
    });
  } catch (error) {
    console.error(`RepoMod: Failed to log user-deleted post ${postId}:`, error);
    await addLogEntry(context, {
      type: 'post',
      id: postId,
      summary: '[User deleted — log failed]',
      removalType: 'user_deleted',
      archivedAt: now,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle a user-deleted comment event.
 * Same as posts — only archive metadata for user deletions.
 */
export async function handleUserDeletedComment(
  context: ArchiverContext,
  commentId: string,
  postId: string
): Promise<void> {
  const settings = await getSettings(context);
  if (!settings) return;

  const now = new Date().toISOString();

  const archived: ArchivedComment = {
    id: commentId,
    postId: postId,
    body: '[User Deleted — Content Redacted]',
    author: '[deleted]',
    subreddit: '[redacted]',
    createdAt: '',
    archivedAt: now,
    permalink: '',
    removalType: 'user_deleted',
    score: 0,
  };

  try {
    const monthFolder = getMonthFolder();
    const filePath = `${ARCHIVE_FOLDER}/${monthFolder}/removed-comments.json`;
    const commitMessage = `🗑️ Log user-deleted comment ${commentId}`;

    await appendToJsonFile(
      settings.token,
      settings.owner,
      settings.repo,
      filePath,
      archived,
      commitMessage
    );

    await addLogEntry(context, {
      type: 'comment',
      id: commentId,
      summary: '[User deleted — metadata only]',
      removalType: 'user_deleted',
      archivedAt: now,
      success: true,
    });
  } catch (error) {
    console.error(`RepoMod: Failed to log user-deleted comment ${commentId}:`, error);
    await addLogEntry(context, {
      type: 'comment',
      id: commentId,
      summary: '[User deleted — log failed]',
      removalType: 'user_deleted',
      archivedAt: now,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
