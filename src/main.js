const Discord = require("discord.js");
const fs = require("fs");
const { exit } = require("process");
const { loadConfig } = require("./helpers/configHelper");
const { parseMessage } = require("./discord/message");

// Discord client object
let client = new Discord.Client();
const configPath = "./config.json";

/**
 * Cleans up the Discord client
 */
function cleanup() {
    console.debug("Cleaning up client");
    // close voice connections here
    client.destroy();
}

if (!fs.existsSync(configPath)) {
    console.error("config.json file does not exist");
    exit(1);
}

const config = loadConfig(configPath);

if (!Object.prototype.hasOwnProperty.call(config, "token")) {
    console.error("Config does not contain a 'token' key");
    exit(1);
}

if (!Object.prototype.hasOwnProperty.call(config, "ops")) {
    console.log("Config does not contain a 'ops' key, the following commands won't work:");
    console.log("volume");
}

if (!Object.prototype.hasOwnProperty.call(config, "prefix")) {
    console.log("Config does not contain a 'prefix' key, defaulting to $");
    config.prefix = "$";
}

// Event handlers for client
client.on("ready", () => {
    console.debug("Received ready event");
    console.log("Logged in");
});

client.on("message", (message) => {
    console.debug("Received message event");
    const parsed = parseMessage(message, config.prefix);
    if (parsed.iscommand) {
        console.debug(`Received command ${parsed.command}`);
    }
});

client.on("voiceStateUpdate", (oldState, newState) => {
    console.debug("Received voiceStateUpdate event");
});

client.on("error", (err) => {
    console.error("An error occurred with the bot:");
    console.error(err);
    console.error("Recreating client");

    cleanup();

    client = new Discord.Client();
    client.login(config.token);
});

console.log("Logging in to Discord");
client.login(config.token);

process.on("SIGINT", () => {
    console.debug("Received SIGINT");
    console.log("Closing...");
    cleanup();
});
