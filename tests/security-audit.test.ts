/**
 * Security Audit Tests for Subtitles Generator (Electron App)
 *
 * These tests verify security properties of the Electron main process,
 * IPC handlers, and renderer-exposed APIs. They run against the source
 * code and compiled output to catch misconfigurations before release.
 *
 * Run:  npx vitest run tests/security-audit.test.ts
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// ─── Helpers ────────────────────────────────────────────────────────

const mainSource = read('electron/main.ts');
const preloadSource = read('electron/preload.ts');
const indexHtml = read('index.html');
const packageJson = JSON.parse(read('package.json'));

// ─── 1. Electron BrowserWindow Configuration ───────────────────────

describe('Electron BrowserWindow security', () => {
  it('should enable contextIsolation', () => {
    expect(mainSource).toMatch(/contextIsolation\s*:\s*true/);
  });

  it('should disable nodeIntegration', () => {
    expect(mainSource).toMatch(/nodeIntegration\s*:\s*false/);
  });

  it('should not enable webSecurity: false', () => {
    // webSecurity defaults to true — explicitly setting it to false is dangerous
    expect(mainSource).not.toMatch(/webSecurity\s*:\s*false/);
  });

  it('should not enable allowRunningInsecureContent', () => {
    expect(mainSource).not.toMatch(/allowRunningInsecureContent\s*:\s*true/);
  });

  it('should not enable experimentalFeatures', () => {
    expect(mainSource).not.toMatch(/experimentalFeatures\s*:\s*true/);
  });

  it('should explicitly enable sandbox', () => {
    // sandbox defaults to true in recent Electron, but should be explicit
    // This test currently FAILS — see SECURITY_PLAN.md for fix
    expect(mainSource).toMatch(/sandbox\s*:\s*true/);
  });

  it('should only open DevTools in development', () => {
    // DevTools should be gated behind VITE_DEV_SERVER_URL or equivalent
    const devToolsLines = mainSource
      .split('\n')
      .filter(line => line.includes('openDevTools'));

    for (const line of devToolsLines) {
      // Must be inside a dev-only branch — check surrounding context
      const idx = mainSource.indexOf(line);
      const preceding = mainSource.slice(Math.max(0, idx - 200), idx);
      expect(preceding).toMatch(/VITE_DEV_SERVER_URL|isDev|process\.env\.NODE_ENV/);
    }
  });
});

// ─── 2. IPC Handler Input Validation ────────────────────────────────

describe('IPC handler path validation', () => {
  const fileHandlers = [
    'file:read',
    'file:readAsDataUrl',
    'file:write',
    'file:getInfo',
  ];

  const ffmpegHandlers = [
    'ffmpeg:extractAudio',
    'ffmpeg:getDuration',
    'ffmpeg:detectSilences',
    'ffmpeg:splitAudio',
  ];

  // Extract the handler body for a given channel name
  function getHandlerBody(channel: string): string {
    const escapedChannel = channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `ipcMain\\.handle\\(['"]${escapedChannel}['"]\\s*,\\s*(?:async\\s+)?\\([^)]*\\)\\s*=>\\s*\\{`,
      's'
    );
    const match = mainSource.match(regex);
    if (!match) return '';

    // Find the matching closing brace
    const startIdx = mainSource.indexOf(match[0]) + match[0].length;
    let depth = 1;
    let i = startIdx;
    while (i < mainSource.length && depth > 0) {
      if (mainSource[i] === '{') depth++;
      if (mainSource[i] === '}') depth--;
      i++;
    }
    return mainSource.slice(startIdx, i);
  }

  for (const channel of [...fileHandlers, ...ffmpegHandlers]) {
    it(`handler "${channel}" should validate file paths`, () => {
      const body = getHandlerBody(channel);

      // The handler should contain path validation logic:
      //   - Inline: path.resolve / path.normalize + .startsWith()
      //   - Or: a call to a dedicated validatePath / sanitizePath helper
      const hasPathValidation =
        /path\.(resolve|normalize)/.test(body) ||
        /startsWith/.test(body) ||
        /validatePath|isPathAllowed|sanitizePath|allowedPath/.test(body);

      expect(hasPathValidation).toBe(true);
    });
  }

  it('should define a validatePath function with path.resolve and startsWith', () => {
    // The validatePath helper itself must use proper path normalization
    expect(mainSource).toMatch(/function\s+validatePath/);
    expect(mainSource).toMatch(/path\.resolve/);
    expect(mainSource).toMatch(/startsWith/);
  });

  it('ffmpeg:detectSilences should validate threshold bounds', () => {
    // Look in the region between the handler registration and the ffmpeg call
    const handlerRegion = mainSource.match(
      /handle\(['"]ffmpeg:detectSilences['"][\s\S]*?ffmpeg\(safePath\)/
    )?.[0] || '';

    const hasValidation =
      /Number\.isFinite\(threshold\)/.test(handlerRegion) ||
      /isNaN\(threshold\)/.test(handlerRegion) ||
      /typeof\s+threshold/.test(handlerRegion);

    expect(hasValidation).toBe(true);
  });

  it('ffmpeg:detectSilences should validate minDuration bounds', () => {
    const handlerRegion = mainSource.match(
      /handle\(['"]ffmpeg:detectSilences['"][\s\S]*?ffmpeg\(safePath\)/
    )?.[0] || '';

    const hasValidation =
      /Number\.isFinite\(minDuration\)/.test(handlerRegion) ||
      /isNaN\(minDuration\)/.test(handlerRegion) ||
      /typeof\s+minDuration/.test(handlerRegion);

    expect(hasValidation).toBe(true);
  });
});

// ─── 3. Store/Settings Safety ───────────────────────────────────────

describe('Store handler safety', () => {
  it('store:set should validate key names to prevent prototype pollution', () => {
    // The store handler must restrict which keys can be written
    // Look for an allowlist pattern or key type-checking in the full source
    const hasKeyAllowlist =
      /ALLOWED_STORE_KEYS/.test(mainSource) ||
      /allowedKeys|validKeys|whitelist/.test(mainSource);

    const hasKeyTypeCheck =
      /typeof\s+key\s*[!=]==?\s*['"]string['"]/.test(mainSource);

    expect(hasKeyAllowlist).toBe(true);
    expect(hasKeyTypeCheck).toBe(true);
  });
});

// ─── 4. Content Security Policy ─────────────────────────────────────

describe('Content Security Policy', () => {
  it('should have a CSP meta tag', () => {
    expect(indexHtml).toContain('Content-Security-Policy');
  });

  it('should set default-src to self', () => {
    expect(indexHtml).toMatch(/default-src\s+'self'/);
  });

  it('should not allow unsafe-eval in script-src', () => {
    const cspMatch = indexHtml.match(/content="([^"]*Content-Security-Policy[^"]*?)"/i)
      || indexHtml.match(/Content-Security-Policy[^"]*content="([^"]*)"/i);

    // Extract just the CSP value
    const csp = cspMatch ? cspMatch[1] : indexHtml;
    const scriptSrc = csp.match(/script-src\s+([^;]+)/)?.[1] || '';

    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('should not allow unsafe-eval in default-src', () => {
    const csp = indexHtml;
    const defaultSrc = csp.match(/default-src\s+([^;]+)/)?.[1] || '';
    expect(defaultSrc).not.toContain("'unsafe-eval'");
  });

  it('should not use wildcard (*) in connect-src', () => {
    const connectSrc = indexHtml.match(/connect-src\s+([^;]+)/)?.[1] || '';
    expect(connectSrc).not.toContain('*');
  });

  it('should restrict connect-src to known APIs only', () => {
    const connectSrc = indexHtml.match(/connect-src\s+([^;]+)/)?.[1] || '';
    const allowedDomains = [
      "'self'",
      'https://generativelanguage.googleapis.com',
    ];

    const parts = connectSrc.trim().split(/\s+/);
    for (const part of parts) {
      expect(allowedDomains).toContain(part);
    }
  });

  it('should not use unsafe-inline in script-src', () => {
    const scriptSrc = indexHtml.match(/script-src\s+([^;]+)/)?.[1] || '';
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});

// ─── 5. Preload Script Surface Area ─────────────────────────────────

describe('Preload script surface area', () => {
  it('should use contextBridge.exposeInMainWorld', () => {
    expect(preloadSource).toContain('contextBridge.exposeInMainWorld');
  });

  it('should not expose require or process', () => {
    // The preload must not leak Node.js primitives
    expect(preloadSource).not.toMatch(/exposeInMainWorld\s*\(\s*['"]require['"]/);
    expect(preloadSource).not.toMatch(/exposeInMainWorld\s*\(\s*['"]process['"]/);
    expect(preloadSource).not.toMatch(/exposeInMainWorld\s*\(\s*['"]__dirname['"]/);
  });

  it('should not expose shell or child_process APIs', () => {
    expect(preloadSource).not.toContain('child_process');
    expect(preloadSource).not.toContain('execSync');
    expect(preloadSource).not.toContain('spawnSync');
    expect(preloadSource).not.toContain('shell.openExternal');
  });

  it('should not expose fs module directly', () => {
    // fs ops should go through IPC, not be exposed raw
    expect(preloadSource).not.toMatch(/require\(['"]fs['"]\)/);
    expect(preloadSource).not.toMatch(/import\s+.*\s+from\s+['"]fs['"]/);
  });

  it('should only expose a single namespace', () => {
    const exposeCount = (preloadSource.match(/exposeInMainWorld/g) || []).length;
    expect(exposeCount).toBe(1);
  });

  it('should not expose ipcRenderer.send or ipcRenderer.on directly', () => {
    // Only ipcRenderer.invoke (request/response) and wrapped .on are safe
    expect(preloadSource).not.toMatch(/ipcRenderer\.send(?!er)/);
    // Check that .on is only used inside a wrapper function, not exposed raw
    const rawOnExposed = preloadSource.match(
      /['"]?\w+['"]?\s*:\s*ipcRenderer\.on/
    );
    expect(rawOnExposed).toBeNull();
  });
});

// ─── 6. API Key Handling ────────────────────────────────────────────

describe('API key security', () => {
  it('should not pass API key as URL query parameter', () => {
    // API keys in URLs get logged in browser history, server logs, etc.
    const settingsSource = read('src/components/Settings.tsx');
    expect(settingsSource).not.toMatch(/\?key=\$\{apiKey\}/);
    expect(settingsSource).not.toMatch(/[?&]key=/);
  });

  it('should use password type for API key input', () => {
    const settingsSource = read('src/components/Settings.tsx');
    expect(settingsSource).toMatch(/type=["']password["']/);
  });
});

// ─── 7. No Dangerous Patterns ───────────────────────────────────────

describe('Dangerous code patterns', () => {
  const allSourceFiles = [
    'electron/main.ts',
    'electron/preload.ts',
    'src/App.tsx',
    'src/services/transcriber.ts',
    'src/services/audioProcessor.ts',
    'src/services/healer.ts',
    'src/components/Settings.tsx',
    'src/components/FileUpload.tsx',
    'src/components/SubtitleEditor.tsx',
    'src/utils.ts',
  ];

  const readIfExists = (rel: string) => {
    try {
      return read(rel);
    } catch {
      return '';
    }
  };

  const allSource = allSourceFiles.map(readIfExists).join('\n');

  it('should not use eval()', () => {
    // Match eval( but not .evaluate or other methods containing "eval"
    const evalUsage = allSource.match(/(?<!\w)eval\s*\(/g);
    expect(evalUsage).toBeNull();
  });

  it('should not use new Function() for dynamic code', () => {
    expect(allSource).not.toMatch(/new\s+Function\s*\(/);
  });

  it('should not use dangerouslySetInnerHTML', () => {
    expect(allSource).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it('should not use document.write', () => {
    expect(allSource).not.toMatch(/document\.write\s*\(/);
  });

  it('should not use innerHTML assignments', () => {
    // .innerHTML = ... is a common XSS vector
    expect(allSource).not.toMatch(/\.innerHTML\s*=/);
  });

  it('should not execute shell commands with string interpolation', () => {
    // exec(`command ${userInput}`) is command injection
    expect(allSource).not.toMatch(/exec\s*\(\s*`/);
    expect(allSource).not.toMatch(/execSync\s*\(\s*`/);
  });
});

// ─── 8. Dependencies ────────────────────────────────────────────────

describe('Dependency security', () => {
  it('should not include known dangerous packages', () => {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const dangerousPackages = [
      'electron-remote',    // Bypasses context isolation
      'remote',             // Deprecated, security risk
      'node-cmd',           // Shell execution
      'shelljs',            // Shell execution
    ];

    for (const pkg of dangerousPackages) {
      expect(allDeps).not.toHaveProperty(pkg);
    }
  });

  it('should use electron-store for settings (not plain JSON files)', () => {
    expect(packageJson.dependencies).toHaveProperty('electron-store');
  });

  it('should have electron as devDependency not dependency', () => {
    // Electron should be dev-only — it's the runtime, not bundled
    expect(packageJson.devDependencies).toHaveProperty('electron');
    expect(packageJson.dependencies).not.toHaveProperty('electron');
  });
});

// ─── 9. Build Configuration ────────────────────────────────────────

describe('Build security', () => {
  it('should not ship sourcemaps in preload for production', () => {
    // Inline sourcemaps expose full source to anyone inspecting the app
    const viteConfig = read('vite.config.ts');

    // This test currently FAILS — see SECURITY_PLAN.md for fix
    // Preload build should not have sourcemap: 'inline' in production
    const preloadSection = viteConfig.match(
      /entry:\s*['"]electron\/preload\.ts['"][\s\S]*?(?=\{[\s\S]*?entry:|$)/
    )?.[0] || '';

    expect(preloadSection).not.toMatch(/sourcemap\s*:\s*['"]inline['"]/);
  });

  it('should have an appId configured for electron-builder', () => {
    expect(packageJson.build?.appId).toBeTruthy();
  });
});

// ─── 10. Navigation & URL Loading ───────────────────────────────────

describe('Navigation security', () => {
  it('should not load arbitrary URLs', () => {
    // Main process should only load local files or the dev server
    const loadURLCalls = mainSource.match(/loadURL\s*\(([^)]+)\)/g) || [];
    for (const call of loadURLCalls) {
      // Should only reference VITE_DEV_SERVER_URL (dev) or file:// protocol
      expect(call).toMatch(/VITE_DEV_SERVER_URL|file:/);
    }
  });

  it('should not have shell.openExternal with unsanitized URLs', () => {
    // shell.openExternal can be used to launch arbitrary executables
    expect(mainSource).not.toContain('shell.openExternal');
  });

  it('should use loadFile for production', () => {
    expect(mainSource).toContain('loadFile');
  });
});
