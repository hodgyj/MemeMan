const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const fs = require("fs");
const { exit } = require("process");
const search = require("youtube-search");

const client = new Discord.Client();

// From http://urlregex.com/
const urlRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/

const connections = {};

let opId = "";
let ytApiKey = "";

async function play(connection, data) {
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
    } else if (urlRegex.test(data)) {
        player = connection.play(ytdl(data, {filter: "audioonly"}));
    } else {
        // Search YouTube
        const result = await new Promise((resolve, reject) => {
            search(data, {
                maxResults: 1,
                key: ytApiKey
            }, function(err, results) {
                if(err) return console.log(err);

                resolve(results[0]);
              });
        });
        player = connection.play(ytdl(result.link, {filter: "audioonly"}));
    }
    player.on("finish", () => {
        player.destroy();
        connections[player.player.voiceConnection.channel.id].player = null;
        playNext(player.player.voiceConnection.channel.id);
    });
    return player;
}

async function skip(connection) {
    connection.player.destroy();
    connections[connection.channel.id].player = null;
    await playNext(connection.channel.id);
}

function volume(connection, volume) {
    const dispatcher = connection.dispatcher;
    dispatcher.setVolume(volume);
}

function addToQueue(channelId, data) {
    if (!connections[channelId]) return;
    connections[channelId].queue.push(data);
}

/**
 * Plays the next song in the queue (if one exists)
 */
async function playNext(channelId) {
    if (connections[channelId] === undefined) return;
    if (connections[channelId].queue.length === 0) {
        if (connections[channelId].player !== null) return;
        connections[channelId].connection.disconnect();
        delete connections[channelId];
        return
    }
    if (connections[channelId].player !== null) return;

    const conn = connections[channelId].connection;
    connections[channelId].player = await play(conn, connections[channelId].queue.shift());
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
            message.reply("```$play <sound name or YouTube URL or YouTube search term>\n$stop - Close immediately\n$finish - Stop after current sound\n$add <sound name> <YouTube URL or search term>\n$list - List downloaded sounds\n$skip - Skips currently playing sound```");
            break;
        }
        case "add": {
            if (data.indexOf(" ") === -1) {
                message.react("😠");
                return;
            }
            const split = data.split(" ");
            const commandName = split[0];
            let url = split[1];
            if (!urlRegex.test(url)) {
                // Search YouTube
                const result = await new Promise((resolve, reject) => {
                    search(url, {
                        maxResults: 1,
                        key: ytApiKey
                    }, function(err, results) {
                        if(err) return console.log(err);

                        resolve(results[0]);
                    });
                });
                url = result.link
            }
            const id = ytdl.getURLVideoID(url);
            if (!fs.existsSync(`./sounds/${commandName}`)) {
                fs.mkdirSync(`./sounds/${commandName}`);
            }
            if (fs.existsSync(`./sounds/${commandName}/${id}`)) {
                message.react("😠");
                message.reply("That link has already been downloaded!");
                return;
            }
            ytdl(url, {filter: "audioonly"}).pipe(fs.createWriteStream(`./sounds/${commandName}/${id}`));
            message.react("✅")
            break;
        }
        case "play": {
            if (!message.guild) return;
            if (!message.member.voice.channel) {
                message.reply("You aren't in a voice channel!");
                await message.react("😠");
                return;
            }

            if (data.replace(" ", "") === "") return;

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
            await playNext(connection.channel.id);
            await message.react("✅");
            break;
        }
        case "skip": {
            if (!message.guild) return;
            if (!message.member.voice.channel) {
                message.reply("You aren't in a voice channel!");
                await message.react("😠");
                return;
            }
            if (!connections[message.member.voice.channel.id]) return;

            const connection = connections[message.member.voice.channel.id].connection;

            await skip(connection);
            await message.react("✅");

            break;
        }
        case "volume": {
            if (!message.guild) return;
            if (message.member.id !== opId) {
                await message.react("😠");
                return;
            }
            if (!message.member.voice.channel) {
                message.reply("You aren't in a voice channel!");
                await message.react("😠");
                return;
            }
            if (!connections[message.member.voice.channel.id]) return;

            const connection = connections[message.member.voice.channel.id].connection;

            volume(connection, Number(data));
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

            const connection = connections[message.member.voice.channel.id].connection;
            connection.player.destroy();
            connection.disconnect();
            delete connections[message.member.voice.channel.id];
            break;
        }
        case "finish": {
            if (!message.guild) return;
            if (!message.member.voice.channel) {
                message.reply("You aren't in a voice channel!");
                await message.react("😠");
                return;
            }
            if (!connections[message.member.voice.channel.id]) return;

            connections[message.member.voice.channel.id].queue = [];
            await message.react("✅");
            break;
        }
        case "list": {
            const dirs = fs.readdirSync("./sounds/", {withFileTypes: true})
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            let reply = "```";
            for (let i = 0; i < dirs.length; i++) {
                reply += `\n${dirs[i]}`
            }
            reply += "\n```"
            message.reply(reply);
            break;
        }
        case "lonely": {
            if (!message.guild) return;
            if (!message.member.voice.channel) {
                await message.react("😠");
                return;
            }

            message.member.voice.setChannel(message.guild.channels.resolveID("443513051870920705"));

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
    exit(1)
}

if (fs.existsSync("./op.txt")) {
    opId = fs.readFileSync("./op.txt", {encoding : "utf8"}).replace("\n", "");
} else {
    console.error("op.txt doesn't exist!");
}

if (fs.existsSync("./yt_api_key.txt")) {
    ytApiKey = fs.readFileSync("./yt_api_key.txt", {encoding : "utf8"}).replace("\n", "");
} else {
    console.error("yt_api_key.txt doesn't exist!");
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