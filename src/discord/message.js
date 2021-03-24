const Discord = require("discord.js");

/**
 * Parses a message and returns the result as an object
 *
 * @param {Discord.Message} message - The message to parse
 * @param {string} prefix - The prefix to all commands
 * @returns {object} The parsed message details
 */
function parseMessage(message, prefix) {
    const content = message.content;
    const parsed = {
        "iscommand": true,
        "command": "",
        "args": []
    };

    if (content[0] != prefix[0]) {
        parsed.iscommand = false;
        return parsed;
    }

    const spaceIndex = content.indexOf(" ");
    if (spaceIndex !== -1) {
        parsed.command = content.slice(1, spaceIndex);
        const args = content.slice(spaceIndex + 1);
        parsed.args = args.split(";");
    } else {
        parsed.command = content.slice(1);
    }

    return parsed;
}

module.exports = { parseMessage };
