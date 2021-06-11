const Discord = require("discord.js");
const Help = require("./commands/Help.js");
const BadBot = require("./commands/BadBot.js");

class CommandManager {
    constructor(Manager) {
        this.manager = Manager;
        this.commands = {
            badbot: BadBot,
            help: Help
        };
    }

    /**
     *
     * @param {string} name - The name of the command to load
     */
    getCommand(name) {
        if (this.commands[name.toLowerCase()] !== undefined) {
            return new this.commands[name.toLowerCase()](this.manager);
        }
        return null;
    }

    listCommands(opsEnabled) {
        const commandNames = Object.keys(this.commands);

        const commandList = [];
        for (let i in commandNames) {
            const name = commandNames[i];
            const command = this.getCommand(name);
            if (command === null) {
                continue;
            }
            if (command.opsRequired && !opsEnabled) {
                continue;
            }
            commandList.push(command);
        }
        return commandList;
    }

    /**
     *
     * @param {string} content -
     * @returns {string[]}
     */
    parseMessage(content) {
        const retVal = [];
        const trimmed = content.trim();
        if (content[0] !== this.manager.config.prefix) {
            return retVal;
        }

        const spaceIdx = trimmed.indexOf(" ");
        if (spaceIdx !== -1) {
            retVal.push(trimmed.slice(1, spaceIdx));
        }
        else {
            retVal.push(trimmed.slice(1));
        }

        retVal.concat(trimmed.slice(spaceIdx + 1).split(";"));

        return retVal;
    }

    /**
     *
     * @param {Discord.Message} message
     */
    async runCommand(message) {
        // parse message
        const parsed = this.parseMessage(message.content);
        const commands = this.listCommands(this.manager.opsEnabled);

        for (let i in commands) {
            const command = commands[i];
            for (let j in command.commandNames) {
                const name = command.commandNames[j];
                if (name.toLowerCase() === parsed[0].toLowerCase()) {
                    await command.run({
                        message,
                        parsed
                    });
                }
            }
        }

    }
}

module.exports = CommandManager;
