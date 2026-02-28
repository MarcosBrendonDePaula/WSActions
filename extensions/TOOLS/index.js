const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const profileLauncher = require(path.join(__dirname, 'profileLauncher.js'));

module.exports = function(config) {
    const { RL, EXTENSION_PATH, ID } = config;

    const EXT = {
        NAME: 'TOOLS',
        ENABLED: true,
        IOEVENTS: {},
        COMMANDS: {},
        ROUTER: require('express').Router(),
        onInitialize: () => {
            console.log('[TOOLS] Extension initialized');
        },
        WEB_SCRIPTS: config.WEB_SCRIPTS || [],
        GLOBAL_SCRIPTS: config.GLOBAL_SCRIPTS || [],
        EXTENSION_PATH: EXTENSION_PATH,
        ID: ID || 'tools',
    };

    // =======================
    // Comando: listProfiles
    // =======================
    EXT.COMMANDS['listProfiles'] = {
        description: 'Lista perfis do Chrome detectados no sistema',
        _function: () => {
            const chromePath = profileLauncher.getChromePath();
            const userDataDir = profileLauncher.getChromeUserDataDir();
            const profiles = profileLauncher.detectProfiles();

            console.log('\n=== Chrome Profile Detector ===');
            console.log(`Chrome: ${chromePath || 'NOT FOUND'}`);
            console.log(`User Data: ${userDataDir || 'NOT FOUND'}`);
            console.log(`\nProfiles found: ${profiles.length}`);
            console.log('─'.repeat(50));

            profiles.forEach((p, i) => {
                console.log(`  [${i}] ${p.profileName} (${p.dirName})`);
            });

            console.log('─'.repeat(50));
        },
    };

    // =======================
    // Comando: generateLaunchers
    // =======================
    EXT.COMMANDS['generateLaunchers'] = {
        description: 'Gera scripts de lançamento para cada perfil Chrome',
        _function: () => {
            if (!RL) {
                console.error('[TOOLS] Readline interface not available');
                return;
            }

            const defaultDir = path.join(process.cwd(), 'chrome-launchers');

            RL.question(`Output directory [${defaultDir}]: `, (outputDir) => {
                outputDir = outputDir.trim() || defaultDir;

                RL.question('URL to open (leave empty for none): ', (url) => {
                    url = url.trim() || undefined;

                    console.log(`\nGenerating launchers in: ${outputDir}`);
                    if (url) console.log(`Opening URL: ${url}`);

                    profileLauncher.generateLaunchers(outputDir, url);
                });
            });
        },
    };

    // =======================
    // Comando: launchProfile
    // =======================
    EXT.COMMANDS['launchProfile'] = {
        description: 'Lança Chrome com um perfil específico ou todos',
        _function: () => {
            const chromePath = profileLauncher.getChromePath();
            if (!chromePath) {
                console.error('[TOOLS] Chrome executable not found');
                return;
            }

            const profiles = profileLauncher.detectProfiles();
            if (profiles.length === 0) {
                console.error('[TOOLS] No Chrome profiles detected');
                return;
            }

            console.log('\n=== Launch Chrome Profile ===');
            profiles.forEach((p, i) => {
                console.log(`  [${i}] ${p.profileName} (${p.dirName})`);
            });
            console.log(`  [a] Launch ALL profiles`);
            console.log('─'.repeat(40));

            if (!RL) {
                console.error('[TOOLS] Readline interface not available');
                return;
            }

            RL.question('Choose profile (number or "a" for all): ', (answer) => {
                answer = answer.trim().toLowerCase();
                const flags = profileLauncher.getStealthFlags().join(' ');

                if (answer === 'a') {
                    // Launch all with 2s interval
                    console.log('\nLaunching all profiles...');
                    profiles.forEach((p, i) => {
                        setTimeout(() => {
                            const cmd = `"${chromePath}" --profile-directory="${p.dirName}" ${flags}`;
                            console.log(`  Launching: ${p.profileName}`);
                            exec(cmd, (error) => {
                                if (error) console.error(`  Error launching ${p.profileName}:`, error.message);
                            });
                        }, i * 2000);
                    });
                } else {
                    const idx = parseInt(answer, 10);
                    if (isNaN(idx) || idx < 0 || idx >= profiles.length) {
                        console.error('Invalid selection');
                        return;
                    }

                    const profile = profiles[idx];
                    const cmd = `"${chromePath}" --profile-directory="${profile.dirName}" ${flags}`;
                    console.log(`\nLaunching: ${profile.profileName}`);
                    exec(cmd, (error) => {
                        if (error) console.error(`Error launching ${profile.profileName}:`, error.message);
                    });
                }
            });
        },
    };

    return EXT;
};
