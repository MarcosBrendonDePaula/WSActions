const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Detecta o executável do Chrome por SO (Win/Mac/Linux)
 * @returns {string|null} Caminho do executável do Chrome
 */
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
    } else if (platform === 'darwin') {
        const paths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
    } else {
        // Linux
        const paths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
    }

    return null;
}

/**
 * Retorna o diretório User Data do Chrome por SO
 * @returns {string|null} Caminho do User Data
 */
function getChromeUserDataDir() {
    const platform = os.platform();
    const home = os.homedir();

    if (platform === 'win32') {
        return path.join(process.env['LOCALAPPDATA'] || '', 'Google', 'Chrome', 'User Data');
    } else if (platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
    } else {
        // Linux
        return path.join(home, '.config', 'google-chrome');
    }
}

/**
 * Escaneia o User Data, lê Preferences de cada perfil para pegar o nome
 * @returns {Array<{dirName: string, profileName: string, profilePath: string}>}
 */
function detectProfiles() {
    const userDataDir = getChromeUserDataDir();
    if (!userDataDir || !fs.existsSync(userDataDir)) {
        console.error('Chrome User Data directory not found:', userDataDir);
        return [];
    }

    const profiles = [];
    const entries = fs.readdirSync(userDataDir);

    for (const entry of entries) {
        const profilePath = path.join(userDataDir, entry);
        const prefsPath = path.join(profilePath, 'Preferences');

        // Profile directories: "Default", "Profile 1", "Profile 2", etc.
        if (!fs.statSync(profilePath).isDirectory()) continue;
        if (!fs.existsSync(prefsPath)) continue;

        try {
            const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
            const profileName = prefs?.profile?.name || entry;
            profiles.push({
                dirName: entry,
                profileName: profileName,
                profilePath: profilePath,
            });
        } catch (e) {
            // Skip profiles with invalid Preferences
        }
    }

    return profiles;
}

/**
 * Retorna array com flags stealth para lançamento do Chrome
 * @returns {string[]}
 */
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

/**
 * Gera scripts .bat (Windows) ou .sh (Linux/Mac) para cada perfil + um "launch all"
 * @param {string} outputDir - Diretório de saída para os scripts
 * @param {string} [url] - URL opcional para abrir
 */
function generateLaunchers(outputDir, url) {
    const chromePath = getChromePath();
    if (!chromePath) {
        console.error('Chrome executable not found.');
        return;
    }

    const profiles = detectProfiles();
    if (profiles.length === 0) {
        console.error('No Chrome profiles detected.');
        return;
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const platform = os.platform();
    const isWindows = platform === 'win32';
    const ext = isWindows ? '.bat' : '.sh';
    const flags = getStealthFlags().join(' ');
    const urlArg = url ? ` "${url}"` : '';

    const launchAllLines = [];

    for (const profile of profiles) {
        const safeName = profile.profileName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `launch_${safeName}${ext}`;
        const filePath = path.join(outputDir, fileName);

        let content;
        if (isWindows) {
            content = `@echo off\r\nstart "" "${chromePath}" --profile-directory="${profile.dirName}" ${flags}${urlArg}\r\n`;
            launchAllLines.push(`start "" "${chromePath}" --profile-directory="${profile.dirName}" ${flags}${urlArg}`);
        } else {
            content = `#!/bin/bash\n"${chromePath}" --profile-directory="${profile.dirName}" ${flags}${urlArg} &\n`;
            launchAllLines.push(`"${chromePath}" --profile-directory="${profile.dirName}" ${flags}${urlArg} &`);
        }

        fs.writeFileSync(filePath, content);
        if (!isWindows) {
            fs.chmodSync(filePath, '755');
        }
        console.log(`Created: ${filePath}`);
    }

    // Launch all script
    const launchAllPath = path.join(outputDir, `launch_all${ext}`);
    let launchAllContent;

    if (isWindows) {
        launchAllContent = '@echo off\r\n';
        for (let i = 0; i < launchAllLines.length; i++) {
            launchAllContent += launchAllLines[i] + '\r\n';
            if (i < launchAllLines.length - 1) {
                launchAllContent += 'timeout /t 2 /nobreak >nul\r\n';
            }
        }
    } else {
        launchAllContent = '#!/bin/bash\n';
        for (let i = 0; i < launchAllLines.length; i++) {
            launchAllContent += launchAllLines[i] + '\n';
            if (i < launchAllLines.length - 1) {
                launchAllContent += 'sleep 2\n';
            }
        }
    }

    fs.writeFileSync(launchAllPath, launchAllContent);
    if (!isWindows) {
        fs.chmodSync(launchAllPath, '755');
    }
    console.log(`Created: ${launchAllPath}`);
    console.log(`\nGenerated ${profiles.length} launcher(s) + launch_all in ${outputDir}`);
}

module.exports = {
    getChromePath,
    getChromeUserDataDir,
    detectProfiles,
    getStealthFlags,
    generateLaunchers,
};
