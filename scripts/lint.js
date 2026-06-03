'use strict';

/**
 * Dependency-free lint pass for this project. It keeps the zero-dependency
 * philosophy while still catching the classes of mistakes worth gating on:
 *   - syntax errors (via `node --check`, which handles both CJS and ESM)
 *   - leftover `debugger` statements
 *   - leftover `console.log` debugging in src/ (the server startup banner in
 *     the entry point is allowed)
 *
 * Exit code is non-zero when any problem is found so it can gate CI later.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['src', 'public/js', 'scripts', 'test'];

const problems = [];

function listJsFiles(dir) {
  const absolute = path.join(ROOT, dir);
  if (!fs.existsSync(absolute)) {
    return [];
  }

  const results = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listJsFiles(relative));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(relative);
    }
  }
  return results;
}

function checkSyntax(relativePath) {
  // `node --check` parses both CommonJS and ES modules without executing them.
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, relativePath)], { stdio: 'pipe' });
  } catch (error) {
    const detail = String(error.stderr || error.message).split('\n').find(Boolean) || 'syntax error';
    problems.push(`${relativePath}: ${detail.trim()}`);
  }
}

// The server entry point legitimately prints a startup banner.
const CONSOLE_LOG_ALLOWLIST = new Set([path.join('src', 'server.js')]);

function checkConsoleLog(relativePath, source) {
  if (!relativePath.startsWith('src') || CONSOLE_LOG_ALLOWLIST.has(relativePath)) {
    return;
  }
  source.split('\n').forEach((line, index) => {
    if (/\bconsole\.log\(/.test(line)) {
      problems.push(`${relativePath}:${index + 1}: console.log in production source`);
    }
  });
}

function checkDebugger(relativePath, source) {
  source.split('\n').forEach((line, index) => {
    if (/(^|[^.\w])debugger\s*;?\s*$/.test(line)) {
      problems.push(`${relativePath}:${index + 1}: leftover debugger statement`);
    }
  });
}

const files = SCAN_DIRS.flatMap(listJsFiles);
for (const relativePath of files) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
  checkSyntax(relativePath);
  checkConsoleLog(relativePath, source);
  checkDebugger(relativePath, source);
}

if (problems.length > 0) {
  console.error(`Lint found ${problems.length} problem(s):`);
  for (const problem of problems) {
    console.error('  ' + problem);
  }
  process.exit(1);
}

console.log(`Lint passed: ${files.length} files checked, no problems found.`);
