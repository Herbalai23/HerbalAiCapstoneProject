import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('../', import.meta.url));

export const privateRepositoryPath = path => {
  const name = basename(path.replaceAll('\\', '/'));
  return /^\.env/i.test(name)
    || /\.(?:pem|key)$/i.test(name)
    || /\.private\.json$/i.test(name)
    || /^(?:credentials|service-account[^/]*)\.json$/i.test(name);
};

const credentialPatterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['github-token', /\b(?:gh[pousr]_[0-9A-Za-z]{36,255}|github_pat_[0-9A-Za-z_]{60,255})\b/],
  ['google-oauth-secret', /\bGOCSPX-[0-9A-Za-z_-]{20,}\b/],
  ['google-refresh-token', /\b1\/\/[0-9A-Za-z_-]{40,}\b/],
  ['stripe-secret', /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{24,}\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['slack-token', /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/],
];

export const inspectCredentialContent = (path, content) => {
  const findings = [];
  for (const [rule, pattern] of credentialPatterns) {
    const match = content.match(pattern);
    if (match) findings.push({ path, rule, line: content.slice(0, match.index).split('\n').length });
  }
  return findings;
};

export const inspectRepository = (root = workspace) => {
  const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root })
    .toString().split('\0').filter(Boolean);
  const findings = [];
  let filesChecked = 0;
  for (const path of paths) {
    const fullPath = resolve(root, path);
    if (!existsSync(fullPath)) continue;
    filesChecked += 1;
    if (privateRepositoryPath(path)) {
      findings.push({ path, rule: 'private-file' });
      continue;
    }
    const content = readFileSync(fullPath);
    if (!content.includes(0)) findings.push(...inspectCredentialContent(path, content.toString('utf8')));
  }
  return { filesChecked, findings };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectRepository();
  if (result.findings.length > 0) {
    for (const finding of result.findings) {
      console.error(`${finding.path}${finding.line ? `:${finding.line}` : ''}: ${finding.rule}; value withheld`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Repository credential guard passed (${result.filesChecked} files; ignored local credentials not read).`);
  }
}
