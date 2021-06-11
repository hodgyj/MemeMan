const Discord = require("discord.js");
const { exit } = require("process");

const Manager = require("./Manager.js");

const config = require("../config.json");

if (!Object.prototype.hasOwnProperty.call(config, "token")) {
    console.error("Config does not contain a 'token' key");
    exit(1);
}

if (!Object.prototype.hasOwnProperty.call(config, "prefix")) {
    console.log("Config does not contain a 'prefix' key, defaulting to $");
    config.prefix = "$";
}

// Discord client object
const manager = new Manager(new Discord.Client(), config);

if (!Object.prototype.hasOwnProperty.call(config, "ops")) {
    console.log("Config does not contain a 'ops' key, some commands will be unavailable");
    manager.opsEnabled = false;
}

/**
 * Cleans up the Discord client
 */
function cleanup() {
    console.debug("Cleaning up client");
    // close voice connections here
    manager.client.destroy();
}

// Event handlers for client
manager.client.on("ready", () => {
    console.debug("Received ready event");
    console.log("Logged in");
});

manager.client.on("message", async (message) => {
    console.debug("Received message event");
    await manager.parseMessage(message);
});

manager.client.on("voiceStateUpdate", (oldState, newState) => {
    console.debug("Received voiceStateUpdate event");
});

manager.client.on("error", (err) => {
    console.error("An error occurred with the bot:");
    console.error(err);
    console.error("Recreating client");

    cleanup();

    manager.client = new Discord.Client();
    manager.client.login(config.token);
});

console.log("Logging in to Discord");
manager.client.login(config.token);

process.on("SIGINT", () => {
    console.debug("Received SIGINT");
    console.log("Closing...");
    cleanup();
});
