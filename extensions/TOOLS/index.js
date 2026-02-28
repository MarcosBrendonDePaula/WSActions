const fs = require('fs');
const path = require('path');
const profileLauncher = require('./profileLauncher');

/**
 * TOOLS Extension - Stealth automation, CDP controls, profile launcher
 * Uses new extension format (config object)
 */
module.exports = ({
    WSIO,
    APP,
    RL,
    STORAGE,
    EXPRESS,
    WEB_SCRIPTS = ['client.js'],
    GLOBAL_SCRIPTS = ['stealth.js'],
    EXTENSION_PATH = '',
    ID = ''
}) => {
    const ENABLED = true;
    const NAME = "TOOLS";
    const CLIENT_LINK = `${NAME}/client`;
    const ROUTER = EXPRESS.Router();

    const IOEVENTS = {
        "master:command": {
            description: "Relay commands from master to all connected clients",
            _function: (data) => {
                WSIO.to(ID).emit(`${NAME}:command`, data);
            }
        }
    };

    const COMMANDS = {
        "openPage": {
            description: "Open a URL on all connected browsers",
            _function: () => {
                RL.question('URL: ', (url) => {
                    WSIO.emit(`${NAME}:command`, { command: 'browser:openPage', payload: url });
                });
            }
        },
        "reloadPage": {
            description: "Reload all connected browser pages",
            _function: () => {
                WSIO.emit(`${NAME}:command`, { command: 'browser:reloadPage' });
            }
        },
        "evaluate": {
            description: "Execute JavaScript code on all connected browsers",
            _function: () => {
                RL.question('JS code: ', (code) => {
                    WSIO.emit(`${NAME}:command`, { command: 'page:evaluate', payload: code });
                });
            }
        },
        "clickElement": {
            description: "Click an element by CSS selector on all browsers",
            _function: () => {
                RL.question('CSS selector: ', (selector) => {
                    WSIO.emit(`${NAME}:command`, { command: 'button:click', data: selector });
                });
            }
        },
        "listProfiles": {
            description: "List all detected Chrome profiles",
            _function: () => {
                const profiles = profileLauncher.detectProfiles();
                const chromePath = profileLauncher.getChromePath();
                console.log(`\n[TOOLS] Chrome: ${chromePath}`);
                console.log(`[TOOLS] User Data: ${profileLauncher.getChromeUserDataDir()}`);
                console.log(`[TOOLS] Found ${profiles.length} profiles:\n`);
                profiles.forEach((p, i) => {
                    console.log(`  ${i + 1}. ${p.name} (${p.dir})`);
                });
                console.log('');
            }
        },
        "generateLaunchers": {
            description: "Generate launch scripts for all Chrome profiles (with stealth flags)",
            _function: () => {
                const defaultDir = path.resolve(process.cwd(), 'launchers');
                RL.question(`Output directory [${defaultDir}]: `, (dir) => {
                    const outputDir = dir.trim() || defaultDir;
                    RL.question('URL to open (empty for none): ', (url) => {
                        const result = profileLauncher.generateLaunchers(outputDir, url.trim() || null);
                        console.log(`\n[TOOLS] Chrome: ${result.chromePath}`);
                        console.log(`[TOOLS] Profiles found: ${result.profiles}`);
                        console.log(`[TOOLS] Scripts generated in: ${result.outputDir}\n`);
                        result.generated.forEach(g => {
                            console.log(`  ${g.file} -> ${g.profile} (${g.dir})`);
                        });
                        console.log(`\nFlags included:`);
                        profileLauncher.getStealthFlags().forEach(f => console.log(`  ${f}`));
                        console.log('');
                    });
                });
            }
        },
        "launchProfile": {
            description: "Launch a specific Chrome profile with stealth flags",
            _function: () => {
                const profiles = profileLauncher.detectProfiles();
                if (profiles.length === 0) {
                    console.log('[TOOLS] No Chrome profiles found');
                    return;
                }
                console.log('\nAvailable profiles:');
                profiles.forEach((p, i) => {
                    console.log(`  ${i + 1}. ${p.name} (${p.dir})`);
                });
                console.log(`  ${profiles.length + 1}. Launch ALL profiles`);

                RL.question('\nProfile number: ', (num) => {
                    const idx = parseInt(num) - 1;
                    RL.question('URL to open (empty for none): ', (url) => {
                        const chromePath = profileLauncher.getChromePath();
                        const flags = profileLauncher.getStealthFlags();
                        const urlPart = url.trim() || '';

                        const { exec } = require('child_process');

                        if (idx === profiles.length) {
                            profiles.forEach((profile, i) => {
                                setTimeout(() => {
                                    const cmd = `"${chromePath}" --profile-directory="${profile.dir}" ${flags.join(' ')} ${urlPart}`;
                                    exec(cmd, (err) => {
                                        if (err) console.error(`[TOOLS] Error launching ${profile.name}:`, err.message);
                                    });
                                    console.log(`[TOOLS] Launched: ${profile.name}`);
                                }, i * 2000);
                            });
                        } else if (idx >= 0 && idx < profiles.length) {
                            const profile = profiles[idx];
                            const cmd = `"${chromePath}" --profile-directory="${profile.dir}" ${flags.join(' ')} ${urlPart}`;
                            exec(cmd, (err) => {
                                if (err) console.error(`[TOOLS] Error:`, err.message);
                            });
                            console.log(`[TOOLS] Launched: ${profile.name}`);
                        } else {
                            console.log('[TOOLS] Invalid selection');
                        }
                    });
                });
            }
        }
    };

    const onInitialize = () => {
        console.log(`[${NAME}] initialized (stealth + CDP + profile launcher)`);
    };

    const onError = (error) => {
        console.error(`[${NAME}] error: ${error.message}`);
    };

    return {
        NAME,
        ROUTER,
        ENABLED,
        IOEVENTS,
        COMMANDS,
        CLIENT_LINK,
        EXTENSION_PATH,
        WEB_SCRIPTS,
        GLOBAL_SCRIPTS,
        ID,
        onInitialize,
        onError
    };
};
