const Discord = require("discord.js");
const CommandManager = require("./CommandManager.js");

class Manager {
    /**
     *
     * @param {Discord.Client} client
     * @param {object} config
     */
    constructor(client, config) {
        this.client = client;
        this.config = config;
        this.commandManager = new CommandManager(this);
        this.opsEnabled = true;
    }

    /**
     *
     * @param {Discord.Message} message
     */
    async parseMessage(message) {
        if (message.content[0] === this.config.prefix) {
            await this.commandManager.runCommand(message);
        }
    }
}

module.exports = Manager;
