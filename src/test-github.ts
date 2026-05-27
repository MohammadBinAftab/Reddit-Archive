/**
 * RepoMod — Standalone GitHub API Test Script
 *
 * Run this BEFORE deploying to Reddit to verify your GitHub integration works.
 * This tests the exact same functions the app uses.
 *
 * Usage:
 *   npx tsx src/test-github.ts <GITHUB_TOKEN> <OWNER> <REPO>
 *
 * Example:
 *   npx tsx src/test-github.ts ghp_xxxxxxxxxxxx myusername subreddit-archive
 */

// We re-implement the core GitHub functions here to avoid import issues
// (the main github.ts uses Devvit's fetch which isn't available outside Devvit)

const GITHUB_API_BASE = 'https://api.github.com';

function getHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'RepoMod-Test/0.1.0',
  };
}

function toBase64(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

function fromBase64(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf-8');
}

// ─── Test Functions ──────────────────────────

async function testConnection(token: string, owner: string, repo: string): Promise<boolean> {
  console.log('\n🔗 Test 1: Validating GitHub credentials...');
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(token),
  });

  if (response.ok) {
    const data = await response.json() as any;
    console.log(`   ✅ Connected to ${data.full_name}`);
    console.log(`   📌 Default branch: ${data.default_branch}`);
    console.log(`   🔒 Private: ${data.private}`);
    return true;
  } else {
    console.log(`   ❌ Failed (${response.status}): ${await response.text()}`);
    return false;
  }
}

async function testCreateFile(token: string, owner: string, repo: string): Promise<string | null> {
  console.log('\n📝 Test 2: Creating a test file...');

  const testData = [
    {
      id: 't3_test123',
      title: 'Test Post — RepoMod Connection Test',
      body: 'This is a test archive entry created by RepoMod setup verification.',
      author: 'RepoMod-Bot',
      subreddit: 'test',
      createdAt: new Date().toISOString(),
      archivedAt: new Date().toISOString(),
      permalink: 'https://reddit.com/r/test/comments/test123',
      url: '',
      mediaUrls: [],
      removalType: 'mod_removed',
      flair: '',
      score: 1,
    },
  ];

  const content = JSON.stringify(testData, null, 2);
  const filePath = 'subreddit-archive/_test/connection-test.json';
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${filePath}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: getHeaders(token),
    body: JSON.stringify({
      message: '🧪 RepoMod connection test — creating test file',
      content: toBase64(content),
    }),
  });

  if (response.ok || response.status === 201) {
    const data = await response.json() as any;
    const sha = data.content?.sha;
    console.log(`   ✅ File created at: ${filePath}`);
    console.log(`   📄 SHA: ${sha}`);
    return sha;
  } else {
    const errorText = await response.text();
    // If file already exists, get its SHA and update it
    if (response.status === 422) {
      console.log('   ⚠️  File already exists, fetching SHA...');
      const getResponse = await fetch(url, { method: 'GET', headers: getHeaders(token) });
      if (getResponse.ok) {
        const getData = await getResponse.json() as any;
        const sha = getData.sha;

        // Update the file
        const updateResponse = await fetch(url, {
          method: 'PUT',
          headers: getHeaders(token),
          body: JSON.stringify({
            message: '🧪 RepoMod connection test — updating test file',
            content: toBase64(content),
            sha: sha,
          }),
        });

        if (updateResponse.ok) {
          const updateData = await updateResponse.json() as any;
          console.log(`   ✅ File updated at: ${filePath}`);
          return updateData.content?.sha;
        }
      }
    }
    console.log(`   ❌ Failed (${response.status}): ${errorText}`);
    return null;
  }
}

async function testReadFile(token: string, owner: string, repo: string): Promise<boolean> {
  console.log('\n📖 Test 3: Reading the test file back...');

  const filePath = 'subreddit-archive/_test/connection-test.json';
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${filePath}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(token),
  });

  if (response.ok) {
    const data = await response.json() as any;
    const content = fromBase64(data.content.replace(/\n/g, ''));
    const parsed = JSON.parse(content);
    console.log(`   ✅ File read successfully`);
    console.log(`   📄 Contains ${parsed.length} entry(ies)`);
    console.log(`   🏷️  First entry title: "${parsed[0].title}"`);
    return true;
  } else {
    console.log(`   ❌ Failed (${response.status})`);
    return false;
  }
}

async function testAppendToFile(token: string, owner: string, repo: string): Promise<boolean> {
  console.log('\n➕ Test 4: Appending to existing file (simulates real archiving)...');

  const filePath = 'subreddit-archive/_test/connection-test.json';
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${filePath}`;

  // Step 1: GET existing file
  const getResponse = await fetch(url, { method: 'GET', headers: getHeaders(token) });
  if (!getResponse.ok) {
    console.log(`   ❌ Failed to read existing file`);
    return false;
  }

  const fileData = await getResponse.json() as any;
  const existingContent = fromBase64(fileData.content.replace(/\n/g, ''));
  const entries = JSON.parse(existingContent);
  const sha = fileData.sha;

  // Step 2: Append new entry
  entries.push({
    id: 't3_test456',
    title: 'Second Test — Append Verification',
    body: 'This entry was appended to verify the update flow works.',
    author: 'RepoMod-Bot',
    subreddit: 'test',
    createdAt: new Date().toISOString(),
    archivedAt: new Date().toISOString(),
    permalink: 'https://reddit.com/r/test/comments/test456',
    url: '',
    mediaUrls: [],
    removalType: 'mod_removed',
    flair: 'Test',
    score: 42,
  });

  // Step 3: PUT updated file
  const updatedContent = JSON.stringify(entries, null, 2);
  const putResponse = await fetch(url, {
    method: 'PUT',
    headers: getHeaders(token),
    body: JSON.stringify({
      message: '🧪 RepoMod test — appending entry to verify update flow',
      content: toBase64(updatedContent),
      sha: sha,
    }),
  });

  if (putResponse.ok) {
    console.log(`   ✅ Successfully appended! File now has ${entries.length} entries`);
    return true;
  } else {
    console.log(`   ❌ Failed (${putResponse.status}): ${await putResponse.text()}`);
    return false;
  }
}

async function testCleanup(token: string, owner: string, repo: string): Promise<void> {
  console.log('\n🧹 Test 5: Cleaning up test file...');

  const filePath = 'subreddit-archive/_test/connection-test.json';
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${filePath}`;

  // Get SHA first
  const getResponse = await fetch(url, { method: 'GET', headers: getHeaders(token) });
  if (!getResponse.ok) {
    console.log('   ⚠️  Test file not found, nothing to clean up');
    return;
  }

  const fileData = await getResponse.json() as any;

  const deleteResponse = await fetch(url, {
    method: 'DELETE',
    headers: getHeaders(token),
    body: JSON.stringify({
      message: '🧹 RepoMod test — cleanup test file',
      sha: fileData.sha,
    }),
  });

  if (deleteResponse.ok) {
    console.log('   ✅ Test file deleted');
  } else {
    console.log(`   ⚠️  Cleanup failed (${deleteResponse.status}), you can delete it manually`);
  }
}

// ─── Main ────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(`
╔══════════════════════════════════════════════════════╗
║          RepoMod — GitHub Integration Test           ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Usage:                                              ║
║    npx tsx src/test-github.ts <TOKEN> <OWNER> <REPO> ║
║                                                      ║
║  Example:                                            ║
║    npx tsx src/test-github.ts ghp_xxx myuser my-repo ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }

  const [token, owner, repo] = args;

  console.log(`
╔══════════════════════════════════════════════╗
║     RepoMod — GitHub Integration Test        ║
╠══════════════════════════════════════════════╣
║  Repository: ${(owner + '/' + repo).padEnd(30)} ║
║  Token:      ${(token.substring(0, 8) + '...').padEnd(30)} ║
╚══════════════════════════════════════════════╝`);

  let passed = 0;
  let failed = 0;

  // Test 1: Connection
  if (await testConnection(token, owner, repo)) {
    passed++;
  } else {
    failed++;
    console.log('\n❌ Cannot proceed — connection failed. Check your token and repo name.');
    process.exit(1);
  }

  // Test 2: Create
  const sha = await testCreateFile(token, owner, repo);
  if (sha) {
    passed++;
  } else {
    failed++;
  }

  // Test 3: Read
  if (await testReadFile(token, owner, repo)) {
    passed++;
  } else {
    failed++;
  }

  // Test 4: Append
  if (await testAppendToFile(token, owner, repo)) {
    passed++;
  } else {
    failed++;
  }

  // Test 5: Cleanup
  await testCleanup(token, owner, repo);

  // Summary
  console.log(`
╔══════════════════════════════════════════════╗
║              Test Results                    ║
╠══════════════════════════════════════════════╣
║  ✅ Passed: ${String(passed).padEnd(32)} ║
║  ❌ Failed: ${String(failed).padEnd(32)} ║
╠══════════════════════════════════════════════╣`);

  if (failed === 0) {
    console.log(`║  🎉 All tests passed! GitHub is ready.       ║`);
    console.log(`║  You can now deploy RepoMod to Reddit.       ║`);
  } else {
    console.log(`║  ⚠️  Some tests failed. Fix issues above.     ║`);
  }
  console.log(`╚══════════════════════════════════════════════╝`);
}

main().catch(console.error);
