const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const fs = require("fs");

const client = new Discord.Client();

const connections = {};

function play(connection, data) {
    let player;
    if (fs.existsSync(`./sounds/${data}`)) {
        const files = [];
        fs.readdirSync(`./sounds/${data}`).forEach(file => {
            files.push(file);
        });
        if (files.length === 0) {
            player = connection.play(ytdl(data, {filter: "audioonly"}));
        } else {
            const file = files[Math.floor(Math.random() * files.length)];
            player = connection.play(`./sounds/${data}/${file}`);
        }
    } else {
        player = connection.play(ytdl(data, {filter: "audioonly"}));
    }
    player.on("finish", () => {
        player.destroy();
        connections[player.player.voiceConnection.channel.id].player = null;
        playNext(player.player.voiceConnection.channel.id);
    });
    return player;
}

function addToQueue(channelId, data) {
    if (!connections[channelId]) return;
    connections[channelId].queue.push(data);
}

/**
 * Plays the next song in the queue (if one exists)
 */
function playNext(channelId) {
    if (connections[channelId] === undefined) return;
    if (connections[channelId].queue.length === 0) {
        if (connections[channelId].player !== null) return;
        connections[channelId].connection.disconnect();
        delete connections[channelId];
        return
    }
    if (connections[channelId].player !== null) return;

    const conn = connections[channelId].connection;
    connections[channelId].player = play(conn, connections[channelId].queue.shift());
}

/**
 * Handles a command sent from discord
 * 
 * @param {Discord.Message} message - The discord message object
 * @param {string} command - The command text
 * @param {string} data - The rest of the string
 */
async function handleMessage(message, command, data) {
    switch (command) {
        case "help": {
            message.reply("```$play <sound name or YouTube URL>\n$stop - Close immediately\n$finish - Stop after current sound\n$add <sound name> <YouTube URL>```");
            break;
        }
        case "add": {
            if (data.indexOf(" ") === -1) {
                message.react("😠");
                return;
            }
            const split = data.split(" ");
            const commandName = split[0];
            const url = split[1];
            const id = ytdl.getURLVideoID(url);
            if (!fs.existsSync(`./sounds/${commandName}`)) {
                fs.mkdirSync(`./sounds/${commandName}`);
            }
            if (fs.existsSync(`./sounds/${commandName}/${id}`)) {
                message.react("😠");
                message.reply("That link has already been downloaded!");
                return;
            }
            ytdl(data, {filter: "audioonly"}).pipe(fs.createWriteStream(`./sounds/${commandName}/${id}`));
            message.react("✅")
            break;
        }
        case "play": {
            if (!message.guild) return;
            if (!message.member.voice.channel) {
                message.reply("You aren't in a voice channel!");
                return;
            }

            let connection = null;
            if (!connections[message.member.voice.channel.id]) {
                connection = await message.member.voice.channel.join();
                connections[connection.channel.id] = {
                    connection: connection,
                    queue: [],
                    player: null
                };
            } else {
                connection = connections[message.member.voice.channel.id].connection;
            }

            addToQueue(connection.channel.id, data);
            playNext(connection.channel.id);
            await message.react("✅");
            break;
        }
        case "stop": {
            if (!message.guild) return;
            if (!message.member.voice.channel) {
                message.reply("You aren't in a voice channel!");
                return;
            }
            if (!connections[message.member.voice.channel.id]) return;

            connections[message.member.voice.channel.id].queue = [];

            // Hopefully this stops?
            connections[message.member.voice.channel.id].connection.disconnect();
            delete connections[message.member.voice.channel.id];
            break;
        }
        case "finish": {
            if (!message.guild) return;
            if (!message.member.voice.channel) {
                message.reply("You aren't in a voice channel!");
                return;
            }
            if (!connections[message.member.voice.channel.id]) return;

            connections[message.member.voice.channel.id].queue = [];
            break;
        }
        default: {
            message.reply(`Unknown command ${command}`);
            message.react("😠");
        }
    }
}

client.on('ready', () => {
    console.log('Bot is a go!');
});

client.on('message', async message => {
    if (!message.guild) return;

    if (message.content[0] === "$") {
        // Bot command
        const space = message.content.indexOf(" ");
        let command;
        if (space !== -1) {
            command = message.content.slice(1, space);
        } else {
            command = message.content.slice(1);
        }
        const data = message.content.slice(space + 1);

        await handleMessage(message, command, data);

    }
});

if (!fs.existsSync("./token.txt")) {
    console.error("Token file (token.txt) doesn't exist!");
}

client.login(fs.readFileSync("./token.txt", {encoding: "utf8"}).replace("\n", ""));

process.on("SIGINT", function() {
    console.log("\nClosing..");
    const connectionIds = Object.keys(connections);
    for (let i = 0; i < connectionIds.length; i++) {
        connections[connectionIds[i]].connection.disconnect();
    }
    client.destroy();
});