/**
 * RepoMod — Main Entry Point
 *
 * Devvit app that auto-archives deleted posts and removed media
 * from a subreddit into a connected GitHub repository.
 *
 * This file configures:
 * - App permissions and capabilities
 * - Mod-configurable settings (GitHub credentials, toggle)
 * - Event triggers (ModAction for removals, PostDelete/CommentDelete for user deletions)
 * - Menu actions (View Archive Log, Test Connection)
 */

import { Devvit, SettingScope } from '@devvit/public-api';
import {
  archiveRemovedPost,
  archiveRemovedComment,
  handleUserDeletedPost,
  handleUserDeletedComment,
  getArchiveLog,
} from './archiver.js';
import { validateCredentials } from './github.js';

// ─────────────────────────────────────────────
// 1. Configure App Capabilities
// ─────────────────────────────────────────────

Devvit.configure({
  redditAPI: true,  // Access Reddit API to fetch post/comment data
  redis: true,      // Persistent storage for archive log
  http: true,       // External HTTP for GitHub API calls
});

// ─────────────────────────────────────────────
// 2. App Settings (Mod-Configurable)
// ─────────────────────────────────────────────

Devvit.addSettings([
  {
    type: 'string',
    name: 'github-token',
    label: 'GitHub Personal Access Token',
    helpText: 'Create a token at github.com/settings/tokens with "repo" scope. This is stored securely.',
    scope: SettingScope.Installation,
  },
  {
    type: 'string',
    name: 'github-owner',
    label: 'GitHub Username or Organization',
    helpText: 'The owner of the repository (e.g., "myusername" or "my-org")',
    scope: SettingScope.Installation,
  },
  {
    type: 'string',
    name: 'github-repo',
    label: 'GitHub Repository Name',
    helpText: 'The name of the repository to archive into (e.g., "subreddit-archive")',
    scope: SettingScope.Installation,
  },
  {
    type: 'boolean',
    name: 'archiving-enabled',
    label: 'Enable Archiving',
    helpText: 'Toggle archiving on or off. When disabled, no content will be pushed to GitHub.',
    defaultValue: true,
    scope: SettingScope.Installation,
  },
]);

// ─────────────────────────────────────────────
// 3. Event Triggers
// ─────────────────────────────────────────────

/**
 * ModAction Trigger — Fires when a moderator performs an action.
 *
 * We listen for "removelink" (post removal) and "removecomment" (comment removal).
 * These are the internal Reddit action strings for mod removal actions.
 * At this point, the content is still available via the Reddit API,
 * so we can capture the full post/comment data before it vanishes.
 */
Devvit.addTrigger({
  event: 'ModAction',
  onEvent: async (event, context) => {
    const action = event.action;

    if (!action) return;

    console.log(`RepoMod: ModAction detected — ${action}`);

    // "removelink" = mod removed a post, "removecomment" = mod removed a comment
    // The targetPost/targetComment fields contain the PostV2/CommentV2 proto
    if (action === 'removelink' && event.targetPost?.id) {
      const postId = event.targetPost.id;
      await archiveRemovedPost(context, postId);
    } else if (action === 'removecomment' && event.targetComment?.id) {
      const commentId = event.targetComment.id;
      await archiveRemovedComment(context, commentId);
    }
  },
});

/**
 * PostDelete Trigger — Fires when a post is deleted (usually by the author).
 *
 * Per Devvit compliance rules, we only archive metadata for user deletions.
 * We do NOT attempt to preserve user-deleted content.
 */
Devvit.addTrigger({
  event: 'PostDelete',
  onEvent: async (event, context) => {
    const postId = event.postId;
    if (!postId) return;

    console.log(`RepoMod: PostDelete detected — ${postId}`);
    await handleUserDeletedPost(context, postId);
  },
});

/**
 * CommentDelete Trigger — Fires when a comment is deleted by its author.
 * Same metadata-only handling as PostDelete.
 */
Devvit.addTrigger({
  event: 'CommentDelete',
  onEvent: async (event, context) => {
    const commentId = event.commentId;
    const postId = event.postId || '';
    if (!commentId) return;

    console.log(`RepoMod: CommentDelete detected — ${commentId}`);
    await handleUserDeletedComment(context, commentId, postId);
  },
});

// ─────────────────────────────────────────────
// 4. Menu Actions (Mod-Only)
// ─────────────────────────────────────────────

/**
 * Form to display the full archive log (used when log has many entries)
 */
const archiveLogForm = Devvit.createForm(
  (data) => ({
    title: '📦 RepoMod — Archive Log',
    description: (data?.logContent as string) || 'No log data available',
    fields: [],
    acceptLabel: 'Close',
    cancelLabel: '',
  }),
  async () => {
    // No action needed on close
  }
);

/**
 * "View Archive Log" — Shows the last 10 archived items
 * Accessible from the subreddit menu (three-dot menu on subreddit page)
 */
Devvit.addMenuItem({
  label: '📦 RepoMod: View Archive Log',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const log = await getArchiveLog(context);

    if (log.length === 0) {
      context.ui.showToast('No archived items yet. Archive log is empty.');
      return;
    }

    // Build a readable summary
    const lines = log.map((entry, i) => {
      const status = entry.success ? '✅' : '❌';
      const time = new Date(entry.archivedAt).toLocaleString();
      const type = entry.type === 'post' ? '📄' : '💬';
      const errorNote = entry.error ? ` (Error: ${entry.error.substring(0, 40)})` : '';
      return `${i + 1}. ${status} ${type} [${entry.removalType}] ${entry.summary.substring(0, 50)}${errorNote}\n   archived: ${time}`;
    });

    const message = `Last ${log.length} archived items:\n\n${lines.join('\n\n')}`;

    // Show as a toast for short logs, or use a form for longer ones
    if (log.length <= 3) {
      context.ui.showToast({
        text: `Last ${log.length} archives: ${log.map(e => `${e.success ? '✅' : '❌'} ${e.type}: ${e.summary.substring(0, 30)}`).join(' | ')}`,
        appearance: 'success',
      });
    } else {
      // For longer logs, show via form since toasts are limited
      context.ui.showForm(archiveLogForm, { logContent: message });
    }
  },
});

/**
 * "Test GitHub Connection" — Validates the configured credentials
 */
Devvit.addMenuItem({
  label: '🔗 RepoMod: Test GitHub Connection',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const token = await context.settings.get<string>('github-token');
    const owner = await context.settings.get<string>('github-owner');
    const repo = await context.settings.get<string>('github-repo');
    const enabled = await context.settings.get<boolean>('archiving-enabled');

    if (!token || !owner || !repo) {
      context.ui.showToast({
        text: '⚠️ Settings incomplete! Configure GitHub token, owner, and repo in app settings.',
        appearance: 'neutral',
      });
      return;
    }

    context.ui.showToast({
      text: '🔄 Testing connection to GitHub...',
      appearance: 'neutral',
    });

    const result = await validateCredentials(token.trim(), owner.trim(), repo.trim());

    if (result.valid) {
      context.ui.showToast({
        text: `✅ Connected to ${owner}/${repo}! Archiving is ${enabled !== false ? 'ENABLED' : 'DISABLED'}.`,
        appearance: 'success',
      });
    } else {
      context.ui.showToast({
        text: `❌ Connection failed: ${result.error}`,
        appearance: 'neutral',
      });
    }
  },
});

// ─────────────────────────────────────────────
// 5. Export
// ─────────────────────────────────────────────

export default Devvit;
