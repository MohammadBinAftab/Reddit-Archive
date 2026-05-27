/**
 * RepoMod — GitHub Contents API Client
 *
 * Handles all interactions with GitHub's REST API for reading/writing
 * JSON archive files to the connected repository.
 *
 * Uses the Contents API (PUT /repos/{owner}/{repo}/contents/{path})
 * to create and update files with base64-encoded content.
 */

import type { GitHubFileResponse, GitHubPutFileRequest } from './types.js';

const GITHUB_API_BASE = 'https://api.github.com';

/** Headers required for all GitHub API requests */
function getHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'RepoMod-Devvit/0.1.0',
  };
}

/**
 * Encode a string to base64.
 * Uses btoa which is available in the Devvit runtime.
 */
function toBase64(str: string): string {
  // Handle Unicode by encoding to UTF-8 first
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decode a base64 string back to UTF-8 text.
 */
function fromBase64(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Fetch an existing file from the GitHub repository.
 * Returns the file metadata including content and SHA, or null if the file doesn't exist.
 */
export async function getFile(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<GitHubFileResponse | null> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(token),
    });

    if (response.status === 404) {
      return null; // File doesn't exist yet
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub GET failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as GitHubFileResponse;
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

/**
 * Create or update a file in the GitHub repository.
 *
 * @param token   - GitHub Personal Access Token
 * @param owner   - Repository owner (user or org)
 * @param repo    - Repository name
 * @param path    - File path within the repo
 * @param content - Raw string content (will be base64-encoded)
 * @param message - Commit message
 * @param sha     - SHA of existing file (required for updates, omit for creation)
 */
export async function putFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<void> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`;

  const body: GitHubPutFileRequest = {
    message,
    content: toBase64(content),
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: getHeaders(token),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub PUT failed (${response.status}): ${errorText}`);
  }
}

/**
 * Append an entry to a JSON array file in the repository.
 *
 * This is the core operation for archiving: it fetches the existing file,
 * parses the JSON array, appends the new entry, and pushes the updated file.
 * If the file doesn't exist yet, it creates a new one with a single-element array.
 *
 * @param token   - GitHub PAT
 * @param owner   - Repo owner
 * @param repo    - Repo name
 * @param path    - File path (e.g., "subreddit-archive/2026-05/deleted-posts.json")
 * @param entry   - The object to append to the JSON array
 * @param message - Commit message
 */
export async function appendToJsonFile<T>(
  token: string,
  owner: string,
  repo: string,
  path: string,
  entry: T,
  message: string
): Promise<void> {
  // Step 1: Try to get the existing file
  const existingFile = await getFile(token, owner, repo, path);

  let entries: T[] = [];
  let sha: string | undefined;

  if (existingFile) {
    // File exists — parse existing content
    sha = existingFile.sha;
    try {
      // GitHub returns content with newlines for line wrapping, strip them
      const cleanContent = existingFile.content.replace(/\n/g, '');
      const decoded = fromBase64(cleanContent);
      entries = JSON.parse(decoded) as T[];

      if (!Array.isArray(entries)) {
        // If somehow the file isn't an array, wrap it
        entries = [];
      }
    } catch {
      // If parsing fails, start fresh but preserve the SHA for update
      console.error(`Failed to parse existing file at ${path}, starting fresh`);
      entries = [];
    }
  }

  // Step 2: Append the new entry
  entries.push(entry);

  // Step 3: Push the updated file
  const updatedContent = JSON.stringify(entries, null, 2);
  await putFile(token, owner, repo, path, updatedContent, message, sha);
}

/**
 * Validate that the GitHub credentials work by attempting to access the repo.
 * Returns true if the token has access, false otherwise.
 */
export async function validateCredentials(
  token: string,
  owner: string,
  repo: string
): Promise<{ valid: boolean; error?: string }> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(token),
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 404) {
      return { valid: false, error: 'Repository not found. Check owner/repo name and token permissions.' };
    }

    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: 'Authentication failed. Check your GitHub token.' };
    }

    return { valid: false, error: `Unexpected status: ${response.status}` };
  } catch (error) {
    return {
      valid: false,
      error: `Connection error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
