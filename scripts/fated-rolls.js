/*
Fated Rolls Module
Allows the GM to force player roll results in FoundryVTT
*/

// Main class for handling forced player rolls set by the GM
class FatedRolls {
    static forcedRolls = {};

    // Initialize settings, menus, and hooks
    static init() {
        // Register GM menu to configure forced rolls
        game.settings.registerMenu('fated-rolls', 'forcedRollsMenu', {
            name: "Forced Rolls Control",
            label: "Configure Forced Rolls",
            type: ForcedRollsConfigApp,
            restricted: true
        });

        // Store forced roll data in world settings
        game.settings.register('fated-rolls', 'forcedRollData', {
            scope: 'world',
            config: false,
            default: {},
            type: Object
        });

        // Hook into roll creation to intercept and modify rolls
        Hooks.on('preCreateChatMessage', FatedRolls.onPreCreateChatMessage);
    }

    // Retrieves the next forced roll result for a specific player (userId)
    static getForcedRollForUser(userId) {
        const data = game.settings.get('fated-rolls', 'forcedRollData') || {};
        if (!data[userId] || !data[userId].length) return undefined;
        return data[userId][0]; // Return the first forced result in the queue
    }

    // Removes the used forced roll result from the player's queue
    static consumeForcedRoll(userId) {
        const data = game.settings.get('fated-rolls', 'forcedRollData') || {};
        if (!data[userId]) return;
        data[userId].shift(); // Remove the used forced result
        game.settings.set('fated-rolls', 'forcedRollData', data);
    }

    // Hook that intercepts player roll messages and overrides the result if a forced roll is set
    static async onPreCreateChatMessage(message, options, userId) {
        if (!game.user.isGM) return; // Only allow GM to control rolls

        const roll = message.rolls?.[0];
        if (!roll) return; // Exit if no roll is present

        const forcedResult = FatedRolls.getForcedRollForUser(message.user.id);
        if (forcedResult === undefined) return; // Exit if no forced roll is queued

        const newRoll = Roll.fromData(roll.toJSON());
        newRoll.terms.forEach(term => {
            if (term instanceof Die) {
                term.results.forEach(r => r.result = forcedResult); // Override each die result
            }
        });

        await newRoll.evaluate({ async: true }); // Re-evaluate the modified roll

        await message.update({ content: await newRoll.render(), roll: newRoll.toJSON() });

        ui.notifications.info(`Forced roll applied: ${forcedResult}`); // Notify GM
        FatedRolls.consumeForcedRoll(message.user.id); // Consume forced result
    }
}

// Register initialization hook
Hooks.once('init', () => {
    FatedRolls.init();
});

// GM Configuration Form for managing forced rolls per player
class ForcedRollsConfigApp extends FormApplication {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'forced-rolls-config',
            title: 'Forced Rolls Configuration',
            template: 'modules/fated-rolls/templates/config.html',
            width: 400
        });
    }

    // Load current data for the configuration form
    async getData() {
        const data = game.settings.get('fated-rolls', 'forcedRollData') || {};
        return { users: game.users.contents, forcedRolls: data };
    }

    // Handle form submission and save updated forced roll data
    async _updateObject(event, formData) {
        const newData = expandObject(formData);
        await game.settings.set('fated-rolls', 'forcedRollData', newData.forcedRolls);
        ui.notifications.info("Forced rolls updated.");
    }
}
