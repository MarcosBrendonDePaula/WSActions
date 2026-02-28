/**
 * Chrome Profile Launcher Generator
 * Generates scripts/shortcuts to launch Chrome profiles with stealth flags
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

function getChromePath() {
    const platform = os.platform();

    if (platform === 'win32') {
        const paths = [
            path.join(process.env['PROGRAMFILES'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(process.env['LOCALAPPDATA'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
        return 'chrome.exe';
    }

    if (platform === 'darwin') {
        const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        return fs.existsSync(macPath) ? macPath : 'google-chrome';
    }

    const linuxPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
    ];
    for (const p of linuxPaths) {
        if (fs.existsSync(p)) return p;
    }
    return 'google-chrome';
}

function getChromeUserDataDir() {
    const platform = os.platform();
    const home = os.homedir();

    if (platform === 'win32') {
        return path.join(process.env['LOCALAPPDATA'] || '', 'Google', 'Chrome', 'User Data');
    }
    if (platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
    }
    return path.join(home, '.config', 'google-chrome');
}

function detectProfiles() {
    const userDataDir = getChromeUserDataDir();
    const profiles = [];

    if (!fs.existsSync(userDataDir)) return profiles;

    const defaultPath = path.join(userDataDir, 'Default');
    if (fs.existsSync(defaultPath)) {
        profiles.push({ dir: 'Default', name: 'Default' });
    }

    const entries = fs.readdirSync(userDataDir);
    for (const entry of entries) {
        if (entry.startsWith('Profile ')) {
            const profilePath = path.join(userDataDir, entry);
            if (fs.statSync(profilePath).isDirectory()) {
                let name = entry;
                const prefsPath = path.join(profilePath, 'Preferences');
                if (fs.existsSync(prefsPath)) {
                    try {
                        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
                        if (prefs.profile && prefs.profile.name) {
                            name = prefs.profile.name;
                        }
                    } catch (e) {}
                }
                profiles.push({ dir: entry, name: name });
            }
        }
    }
    return profiles;
}

function getStealthFlags() {
    return [
        '--silent-debugger-extension-api',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
    ];
}

function generateLaunchers(outputDir, url) {
    const chromePath = getChromePath();
    const profiles = detectProfiles();
    const flags = getStealthFlags();
    const platform = os.platform();
    const ext = platform === 'win32' ? '.bat' : '.sh';

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const generated = [];

    for (const profile of profiles) {
        const safeName = profile.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `launch_${safeName}${ext}`;
        const filePath = path.join(outputDir, filename);
        const flagsStr = flags.join(' ');
        const urlPart = url ? ` "${url}"` : '';

        let script;
        if (platform === 'win32') {
            script = `@echo off\r\nREM WSActions: ${profile.name} (${profile.dir})\r\nstart "" "${chromePath}" --profile-directory="${profile.dir}" ${flagsStr}${urlPart}\r\n`;
        } else {
            script = `#!/bin/bash\n# WSActions: ${profile.name} (${profile.dir})\n"${chromePath}" --profile-directory="${profile.dir}" ${flagsStr}${urlPart} &\n`;
        }
        fs.writeFileSync(filePath, script, { mode: 0o755 });
        generated.push({ file: filename, profile: profile.name, dir: profile.dir });
    }

    if (profiles.length > 0) {
        const allFilename = `launch_ALL_PROFILES${ext}`;
        const allPath = path.join(outputDir, allFilename);
        const flagsStr = flags.join(' ');
        const urlPart = url ? ` "${url}"` : '';
        let allScript;
        if (platform === 'win32') {
            allScript = `@echo off\r\nREM WSActions - Launch ALL profiles\r\n\r\n`;
            for (const p of profiles) {
                allScript += `echo Starting: ${p.name}\r\nstart "" "${chromePath}" --profile-directory="${p.dir}" ${flagsStr}${urlPart}\r\ntimeout /t 2 /nobreak >nul\r\n\r\n`;
            }
            allScript += `echo All ${profiles.length} profiles launched.\r\npause\r\n`;
        } else {
            allScript = `#!/bin/bash\n# WSActions - Launch ALL profiles\n\n`;
            for (const p of profiles) {
                allScript += `echo "Starting: ${p.name}"\n"${chromePath}" --profile-directory="${p.dir}" ${flagsStr}${urlPart} &\nsleep 2\n\n`;
            }
            allScript += `echo "All ${profiles.length} profiles launched."\n`;
        }
        fs.writeFileSync(allPath, allScript, { mode: 0o755 });
        generated.push({ file: allFilename, profile: 'ALL', dir: 'all' });
    }

    return { chromePath, outputDir, profiles: profiles.length, generated };
}

module.exports = {
    getChromePath,
    getChromeUserDataDir,
    detectProfiles,
    getStealthFlags,
    generateLaunchers
};
