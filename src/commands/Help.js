const discord = require("discord.js");

class Help {
    /**
     *
     * @param {Manager} Manager
     */
    constructor(Manager) {
        this.manager = Manager;
        this.name = "Help";
        this.commandNames = ["help", "h"];
        this.description = "Show a summary of the available bot commands";
        this.usage = ["help"];
        this.opsRequired = false;
        this.hidden = false;

        this.args = [];
    }

    /**
     * Help command. Replies with a list of the available commands.
     *
     * @param {object} args - The command arguments
     * @param {discord.Message} args.message - The command message
     * @param {string[]} args.commandArgs - The command arguments
     */
    async run(args) {
        const commands = this.manager.commandManager.listCommands(this.manager.opsEnabled);

        let outMessage = "```Meme Man : The undisputed best Discord bot ever made™\n\n";
        outMessage += "Available commands:\n";

        for (let i in commands) {
            const command = commands[i];
            if (command.hidden) {
                continue;
            }
            outMessage += `${command.name} | `;
            for (let j in command.commandNames) {
                outMessage += `${this.manager.config.prefix}${command.commandNames[j]} `;
            }
            outMessage += "\n\tUsage:";
            for (let j in command.usage) {
                outMessage += `\n\t\t${this.manager.config.prefix}${command.usage[j]}`;
            }
            outMessage += "\n";
        }

        outMessage += "\nBot Nudes @ https://github.com/hodgyj/MemeMan```";

        await args.message.reply(outMessage);
    }
}

module.exports = Help;
