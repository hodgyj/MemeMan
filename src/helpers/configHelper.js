const fs = require("fs");

/**
 * Loads JSON config file from disk
 *
 * @param {string} path - The path to the config file to load
 * @returns {object} The parsed config as an Object
 */
function loadConfig(path) {
    return JSON.parse(fs.readFileSync(path));
}

module.exports = { loadConfig };
