const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const fs = require("fs");
const { exit } = require("process");
const randomWords = require("random-words");
const { google } = require("googleapis");
const sox = require("sox-stream");
const stream = require("stream");
const prism = require("prism-media");

const client = new Discord.Client();

// From http://urlregex.com/
const urlRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/;

const taggedUserIdRegex = /[<][@][!](\d+)[>]\s*([^\n\r]+)$/;
const connections = {};

let opId = "";
let ytApiKey = "";

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
    exit(1);
}

const youtube = google.youtube({
    version: "v3",
    auth: ytApiKey
});

async function getPlaylistItems(playlistId) {
    let items = [];
    try {
        let playlistResult = await youtube.playlistItems.list({
            part: "contentDetails",
            playlistId: playlistId,
            maxResults: 50
        });
        if (Object.prototype.hasOwnProperty.call(playlistResult, "data")
            && Object.prototype.hasOwnProperty.call(playlistResult.data, "items")) {
            items = items.concat(playlistResult.data.items);

            while (Object.prototype.hasOwnProperty.call(playlistResult.data, "nextPageToken")) {
                playlistResult = await youtube.playlistItems.list({
                    part: "contentDetails",
                    playlistId: playlistId,
                    maxResults: 50,
                    pageToken: playlistResult.data.nextPageToken
                });
                if (Object.prototype.hasOwnProperty.call(playlistResult, "data")
                    && Object.prototype.hasOwnProperty.call(playlistResult.data, "items")) {
                    items = items.concat(playlistResult.data.items);
                }
            }
        }
    } catch (error) {
        console.error(error);
    }
    return items;
}

function createPlayer(connection, readStream, soxArgs) {
    console.log("Creating player");
    const transcoder = new prism.FFmpeg({
        args: [
            '-f', 'flac',
            '-acodec', 'flac'
        ]
    });

    transcoder.on('error', function(err) {
        console.log("transcoder: " + err);
    })

    const soxStream = sox({
        global: {
            "-V1": false
        },
        input: {
            type: 'flac',
        },
        output: {
            type: 'flac',
            rate: '48000'
        },
        effects: soxArgs
    });

    soxStream.on('error', function(err) {
        console.log("soxstream: " + err);
    })

    const passStream = stream.PassThrough();

    passStream.on('error', function(err) {
        console.log("passthrough: " + err);
    })

    readStream.pipe(transcoder).pipe(soxStream).pipe(passStream);

    return {
        // player: connection.play(tempFile.path),
        player: connection.play(passStream),
        transcoder: transcoder,
        soxStream: soxStream,
        passStream: passStream
    };
}

async function play(connection, data) {
    let player;
    let soxArgs = [];
    let soundName = data;
    if (data.includes(";")) {
        const split = data.split(";");
        soundName = split[0].trim();
        soxArgs = split[1].trim().split(" ");
    }
    console.log(`Playing "${soundName}"`);
    if (fs.existsSync(`./sounds/${soundName}`)) {
        console.log(`  - "${soundName}" directory exists`);
        const files = [];
        fs.readdirSync(`./sounds/${soundName}`).forEach(file => {
            files.push(file);
        });
        if (files.length === 0) {
            // Remove empty directory
            console.log(`  - "${soundName}" directory is empty, removing directory`);
            fs.rmdirSync(`./sounds/${soundName}`);
            playNext(connection.channel.id);
            return;
        } else {
            console.log(`  - Playing from ${soundName}`);
            const file = fs.createReadStream(`./sounds/${soundName}/${files[Math.floor(Math.random() * files.length)]}`);
            player = createPlayer(connection, file, soxArgs);
        }
    } else if (urlRegex.test(soundName)) {
        console.log("  - Is a URL");
        const playlistRegex = /^http(s)?:\/\/(www.)?youtube.com\/playlist\?/i;
        if (playlistRegex.test(soundName)) {
            console.log("  - Is a playlist URL");
            const playlistIdRegex = /list=([^&]+)/i;
            const result = playlistIdRegex.exec(soundName);
            if (result !== null) {
                const items = await getPlaylistItems(result[1]);

                for (let i = 0; i < items.length; i++) {
                    addToQueue(connection.channel.id, `https://www.youtube.com/watch?v=${items[i].contentDetails.videoId}`);
                }
                console.log(`    - Added ${items.length} items to queue.`);
                playNext(connection.channel.id);
                return;

            }
        } else {
            console.log("  - Playing with YTDL");
            // player = connection.play(ytdl(soundName, {filter: "audioonly"}));
            player = createPlayer(connection, ytdl(soundName, {filter: "audioonly"}), soxArgs);
        }
    } else {
        console.log(`  - Searching YouTube for "${soundName}"`);
        // Search YouTube
        const result = await youtube.search.list({
            part: "snippet",
            maxResults: 1,
            q: soundName
        });
        console.log(`    - Playing "${result.data.items[0].snippet.title}"`);
        player = createPlayer(connection, ytdl(result.data.items[0].id.videoId, {filter: "audioonly"}), soxArgs);
    }

    player.player.on("finish", () => {
        console.log("finish");
        connections[player.player.player.voiceConnection.channel.id].player = null;
        playNext(player.player.player.voiceConnection.channel.id);
    });
    player.player.on("error", (e) => {
        console.error(e);
        connections[player.player.player.voiceConnection.channel.id].player = null;
        playNext(player.player.player.voiceConnection.channel.id);
    })
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
    console.log(`Queueing "${data}"`);
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
 *
 */
async function changeNickname(user, nick) {
    try {
        await user.setNickname(nick);
    } catch {
        return false;
    }
    return true;
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
            message.reply("```$play <sound name or YouTube URL or YouTube search term or YouTube playlist URL (up to 50 items)> ; sox arguments\n\tExample: $play bustin ; speed 2\n$shuffle <optional n> - Play n random sounds\n$stop - Close immediately\n$finish - Stop after current sound\n$add <sound name> <YouTube URL or search term>\n$list - List downloaded sounds\n$skip - Skips currently playing sound\n$nick / $nickname - Change a users nickname\n\te.g. $nick Shania\n\tor   $nick @hodgyj Shania Twain```");
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
            let search = false;
            if (!urlRegex.test(url)) {
                // Search YouTube
                const result = await youtube.search.list({
                    part: "snippet",
                    maxResults: 1,
                    q: data
                });
                url = result.data.items[0].id.videoId
                search = true;
            }
            const id = (search) ? url : ytdl.getURLVideoID(url);
            if (!fs.existsSync(`./sounds/${commandName}`)) {
                fs.mkdirSync(`./sounds/${commandName}`);
            }
            if (fs.existsSync(`./sounds/${commandName}/${id}`)) {
                message.react("😠");
                message.reply("That link has already been downloaded!");
                return;
            }
            ytdl(id, {filter: "audioonly"}).pipe(fs.createWriteStream(`./sounds/${commandName}/${id}`));
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
        case "shuffle": {
            if (!message.guild) return;
            if (!message.member.voice.channel) {
                message.reply("You aren't in a voice channel!");
                await message.react("😠");
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

            // Find random here
            const dirList = fs.readdirSync("./sounds", {withFileTypes: true});
            const dirs = [];
            for (let i = 0; i < dirList.length; i++) {
                if (dirList[i].isDirectory()) {
                    dirs.push(dirList[i].name);
                }
            }

            let numFiles = parseInt(data);
            if (numFiles === NaN) {
                numFiles = 1;
            } else if (numFiles <= 0) {
                numFiles = 1;
            }

            for (let i = 0; i < numFiles; i++)
            {
                const rand = Math.floor((Math.random() * dirs.length));
                addToQueue(connection.channel.id, dirs[rand]);
            }

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
            const channel = await message.guild.channels.create(`${message.member.displayName} is lonely`, {type: "voice", userLimit: 1});
            message.member.voice.setChannel(channel);

            break;
        }
        case "nick":
        case "nickname": {
            if (!message.guild) return;
            if (!message.member) return;
            if (!message.member.guild) return;

            let member = message.member;
            let nick = data;

            const result = taggedUserIdRegex.exec(data);
            if (result !== null) {
                if (result.length < 3) {
                    await message.react("😠");
                    break;
                }
                let memberId = result[1];
                nick = result[2];

                try {
                    member = await message.guild.members.fetch(memberId);
                } catch (e) {
                    console.error(e);
                    await message.react("😠");
                    break;
                }
            }

            if (await changeNickname(member, nick)) {
                await message.react("✅");
            } else {
                await message.react("😠");
            }

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

client.on('voiceStateUpdate', async (oldState, newState) => {
    if (!oldState.guild || !newState.guild) return;
    if (oldState.guild !== newState.guild) return;

    // Limit servers in case its still in servers I forgot
    if(newState.guild.id !== "696354397340565504" &&
        newState.guild.id !== "252509975841079296") return;

    if (oldState.channelID !== undefined &&
        oldState.channelID !== null &&
        oldState.channel.userLimit === 1 &&
        oldState.channel.name.slice(-6) === "lonely" &&
        oldState.channelID !== newState.channelID &&
        oldState.channel.editable) {
        await oldState.channel.delete();
    }

    const guild = await newState.guild.fetch()
    const channels = guild.channels.cache.array();
    const emptyChannels = [];
    for (let i = 0; i < channels.length; i++) {
        if (channels[i].type === "voice") {
            if (channels[i].members.array().length === 0) {
                emptyChannels.push(channels[i]);
            }
        }
    }

    if (emptyChannels.length > 1) {
        // Remove channels
        for (let i = emptyChannels.length - 1; i >= 1; i--) {
            if (emptyChannels[i].editable) {
                console.log(`Deleting channel "${emptyChannels[i].name}"`);
                emptyChannels[i].delete();
            }
        }
    } else if (emptyChannels.length === 0) {
        // Create a channel
        const newName = randomWords({exactly: 2, join: '-'});
        console.log(`Creating channel "${newName}"`);
        newState.guild.channels.create(newName, {type: "voice"});
    }

})

client.login(fs.readFileSync("./token.txt", {encoding: "utf8"}).replace("\n", ""));

process.on("SIGINT", function() {
    console.log("\nClosing..");
    const connectionIds = Object.keys(connections);
    for (let i = 0; i < connectionIds.length; i++) {
        connections[connectionIds[i]].connection.disconnect();
    }
    client.destroy();
});
