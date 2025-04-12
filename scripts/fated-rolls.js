/*
Fated Rolls Module
Allows the GM to force player roll results in FoundryVTT
*/

class FatedRolls {

    static init() {
        // Register GM menu
        game.settings.registerMenu('fated-rolls', 'forcedRollsMenu', {
            name: "Forced Rolls Control",
            label: "Configure Forced Rolls",
            type: ForcedRollsConfigApp,
            restricted: true
        });

        // Register forced roll data storage
        game.settings.register('fated-rolls', 'forcedRollData', {
            scope: 'world',
            config: false,
            default: {},
            type: Object
        });

        // Hook into roll creation
        Hooks.on('preCreateChatMessage', FatedRolls.onPreCreateChatMessage);
    }

    // Get next forced roll value for a user
    static getForcedRollForUser(userId) {
        const data = game.settings.get('fated-rolls', 'forcedRollData') || {};
        if (!data[userId] || !data[userId].length) return undefined;
        return data[userId][0];
    }

    // Remove used forced result
    static consumeForcedRoll(userId) {
        const data = game.settings.get('fated-rolls', 'forcedRollData') || {};
        if (!data[userId]) return;
        data[userId].shift();
        game.settings.set('fated-rolls', 'forcedRollData', data);
    }

    // Hook: Intercept and enforce forced rolls
    static async onPreCreateChatMessage(message, options, userId) {
        const roll = message.rolls?.[0];
        if (!roll) return;

        const targetUserId = message.userId;
        const forcedResult = FatedRolls.getForcedRollForUser(targetUserId);
        if (forcedResult === undefined) return;

        // Case 1: Roll not yet evaluated (e.g., system roll, sheet roll)
        if (!roll._evaluated) {
            roll.terms.forEach(term => {
                if (term instanceof Die) {
                    term.results = [];
                    for (let i = 0; i < term.number; i++) {
                        term.results.push({ result: forcedResult, active: true });
                    }
                }
            });

            await roll.evaluate({ async: true });

            await message.update({
                content: await roll.render(),
                roll: roll.toJSON()
            });

        } else {
            // Case 2: Already evaluated roll (e.g., /r 1d20 in chat)
            const newRoll = Roll.fromData(roll.toJSON());
            newRoll.terms.forEach(term => {
                if (term instanceof Die) {
                    term.results = [];
                    for (let i = 0; i < term.number; i++) {
                        term.results.push({ result: forcedResult, active: true });
                    }
                }
            });

            await newRoll.evaluate({ async: true });

            await message.update({
                content: await newRoll.render(),
                roll: newRoll.toJSON()
            });
        }

        // Notify GM
        ui.notifications.info(`Forced roll applied: ${forcedResult}`);

        // Consume forced roll
        FatedRolls.consumeForcedRoll(targetUserId);
    }
}

Hooks.once('init', () => {
    FatedRolls.init();
});

class ForcedRollsConfigApp extends FormApplication {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'forced-rolls-config',
            title: 'Forced Rolls Configuration',
            template: 'modules/fated-rolls/templates/config.html',
            width: 400
        });
    }

    async getData() {
        const data = game.settings.get('fated-rolls', 'forcedRollData') || {};
        return {
            users: game.users.contents,
            forcedRolls: data
        };
    }

    async _updateObject(event, formData) {
        const newData = expandObject(formData);
        await game.settings.set('fated-rolls', 'forcedRollData', newData.forcedRolls);
        ui.notifications.info("Forced rolls updated.");
    }
}
