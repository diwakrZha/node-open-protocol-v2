//@ts-check
/*
  Copyright: (c) 2018-2020, Smart-Tech Controle e Automação
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const util = require('util');
const { Transform } = require('stream');

const constants = require("./constants");
const encodingOP = constants.defaultEncoder;

const helpers = require("./helpers.js");
const pad = helpers.padLeft;

var debug = util.debuglog('open-protocol');

/**
 * @typedef {import('stream').TransformOptions & { vendor?: string }} OpenProtocolSerializerOptions
 */

/**
 * @class
 * @name Header
 * @param {object} Header
 * @param {number} Header.mid The MID describes how to interpret the message.
 * @param {number} Header.revision The MID Revision is unique per MID and is used in case different versions are available for the same MID.
 * @param {boolean} Header.noAck The No Ack Flag is used when setting a subscription.
 * @param {number} Header.stationID The station the message is addressed to in the case of controller with multi-station configuration.
 * @param {number} Header.spindleID The spindle the message is addressed to in the case several spindles are connected to the same controller.
 * @param {number} Header.sequenceNumber For acknowledging on “Link Level” with MIDs 0997 and 0998.
 * @param {number} Header.messageParts Linking function can be up to 9 = possible to send 9*9999 bytes messages (~90kB).
 * @param {number} Header.messageNumber Linking function, can be 1-9 at message length > 9999.
 * @param {Buffer | string} Header.payload The user's data to be serialized.
 */

class OpenProtocolSerializer extends Transform {

    /**
     * @class OpenProtocolSerializer
     * @description This class performs the serialization of the MID header
     *   (i.e. transforms an object into a Buffer).
     * @param {Omit<import('stream').TransformOptions, 'writableObjectMode'> & { vendor?: string }} opts
     */
    constructor(opts = {}) {
        super({
            ...opts,
            writableObjectMode: true,
        });

        // Store the vendor property for later use
        this.vendor = opts.vendor// || "AtlasCopco";
        debug("IN USE openProtocolSerializer for vendor:", this.vendor);
    }

    _transform(chunk, encoding, cb) {
        debug("openProtocolSerializer _transform", chunk);

        // 1) Basic checks + defaulting (unchanged from your original code)
        chunk.mid = Number(chunk.mid);
        if (isNaN(chunk.mid) || chunk.mid < 1 || chunk.mid > 9999) {
            cb(new Error(`Invalid MID [${chunk.mid}]`));
            debug("openProtocolSerializer _transform err-mid:", chunk);
            return;
        }

        if (chunk.revision === "   " || chunk.revision === 0 || chunk.revision === undefined) {
            chunk.revision = 1;
        }
        chunk.revision = Number(chunk.revision);
        if (isNaN(chunk.revision) || chunk.revision < 0 || chunk.revision > 999) {
            cb(new Error(`Invalid revision [${chunk.revision}]`));
            debug("openProtocolSerializer _transform err-revision:", chunk);
            return;
        }

        if (chunk.stationID === "  " || chunk.stationID === undefined) {
            chunk.stationID = 1;
        }
        chunk.stationID = Number(chunk.stationID);
        if (isNaN(chunk.stationID) || chunk.stationID < 0 || chunk.stationID > 99) {
            cb(new Error(`Invalid stationID [${chunk.stationID}]`));
            debug("openProtocolSerializer _transform err-stationID:", chunk);
            return;
        }

        if (chunk.spindleID === "  " || chunk.spindleID === undefined) {
            chunk.spindleID = 1;
        }
        chunk.spindleID = Number(chunk.spindleID);
        if (isNaN(chunk.spindleID) || chunk.spindleID < 0 || chunk.spindleID > 99) {
            cb(new Error(`Invalid spindleID [${chunk.spindleID}]`));
            debug("openProtocolSerializer _transform err-spindleID:", chunk);
            return;
        }

        if (chunk.sequenceNumber === "  " || chunk.sequenceNumber === undefined) {
            chunk.sequenceNumber = 0;
        }
        chunk.sequenceNumber = Number(chunk.sequenceNumber);
        if (isNaN(chunk.sequenceNumber) || chunk.sequenceNumber < 0 || chunk.sequenceNumber > 99) {
            cb(new Error(`Invalid sequenceNumber [${chunk.sequenceNumber}]`));
            debug("openProtocolSerializer _transform err-sequenceNumber:", chunk);
            return;
        }

        if (chunk.messageParts === " " || chunk.messageParts === undefined) {
            chunk.messageParts = 0;
        }
        chunk.messageParts = Number(chunk.messageParts);
        if (isNaN(chunk.messageParts) || chunk.messageParts < 0 || chunk.messageParts > 9) {
            cb(new Error(`Invalid messageParts [${chunk.messageParts}]`));
            debug("openProtocolSerializer _transform err-messageParts:", chunk);
            return;
        }

        if (chunk.messageNumber === " " || chunk.messageNumber === undefined) {
            chunk.messageNumber = 0;
        }
        chunk.messageNumber = Number(chunk.messageNumber);
        if (isNaN(chunk.messageNumber) || chunk.messageNumber < 0 || chunk.messageNumber > 9) {
            cb(new Error(`Invalid messageNumber [${chunk.messageNumber}]`));
            debug("openProtocolSerializer _transform err-messageNumber:", chunk);
            return;
        }

        if (chunk.payload === undefined) {
            chunk.payload = "";
        }
        if (!Buffer.isBuffer(chunk.payload) && typeof chunk.payload !== "string") {
            cb(new Error(`Invalid payload [${chunk.payload}]`));
            debug("openProtocolSerializer _transform err-payload:", chunk);
            return;
        }

        // 2) Dispatch to vendor-specific logic
        const normalizedVendor = this.vendor.trim().toLowerCase();

        debug("Choosing openProtocolSerializer for vendor:", this.vendor);

        if (normalizedVendor === "bosch") {
            this._serializeForBosch(chunk, cb);
            return; // Don't call cb() again
        } else if (normalizedVendor === "atlascopco") {
            this._serializeForAtlasCopco(chunk, cb);
            return;
        } else if (normalizedVendor === "desoutter") {
            this._serializeForDesoutter(chunk, cb);
            return;
        } else {
            // Fallback if an unknown vendor
            return cb(new Error(`Unsupported vendor: ${this.vendor}`));
        }
    }

    /**
     * For Bosch: standard Open Protocol format with revision, station, spindle in the 20 char header
     */
    _serializeForBosch(chunk, cb) {
        let sizePayload = chunk.payload.length;
        let sizeMessage = 21 + sizePayload;

        let buf = Buffer.alloc(sizeMessage);
        buf.write(pad(sizeMessage - 1, 4), 0, 4, encodingOP);
        buf.write(pad(chunk.mid, 4), 4, 4, encodingOP);
        buf.write(pad(chunk.revision, 3), 8, encodingOP);
        buf.write(chunk.noAck ? '1' : '0', 11, encodingOP);
        buf.write(pad(chunk.stationID, 2), 12, encodingOP);
        buf.write(pad(chunk.spindleID, 2), 14, encodingOP);
        buf.write(pad(chunk.sequenceNumber, 2), 16, encodingOP);
        buf.write(pad(chunk.messageParts, 1), 18, encodingOP);
        buf.write(pad(chunk.messageNumber, 1), 19, encodingOP);

        buf.write(chunk.payload.toString(encodingOP), 20, encodingOP);
        buf.write("\u0000", sizeMessage, encodingOP);

        debug("Bosch openProtocolSerializer _transform publish", buf);
        this.push(buf);

        cb(); // Important: done with callback
    }

    /**
     * For AtlasCopco: standard approach (similar to Bosch) but possibly different future expansions
     */
    _serializeForAtlasCopco(chunk, cb) {
        let sizePayload = chunk.payload.length;
        let sizeMessage = 21 + sizePayload;

        let buf = Buffer.alloc(sizeMessage);
        buf.write(pad(sizeMessage - 1, 4), 0, 4, encodingOP);
        buf.write(pad(chunk.mid, 4), 4, 4, encodingOP);
        buf.write(pad(chunk.revision, 3), 8, encodingOP);
        buf.write(chunk.noAck ? '1' : '0', 11, encodingOP);
        buf.write(pad(chunk.stationID, 2), 12, encodingOP);
        buf.write(pad(chunk.spindleID, 2), 14, encodingOP);
        buf.write(pad(chunk.sequenceNumber, 2), 16, encodingOP);
        buf.write(pad(chunk.messageParts, 1), 18, encodingOP);
        buf.write(pad(chunk.messageNumber, 1), 19, encodingOP);

        buf.write(chunk.payload.toString(encodingOP), 20, encodingOP);
        buf.write("\u0000", sizeMessage, encodingOP);

        debug("AtlasCopco openProtocolSerializer _transform publish", buf);
        this.push(buf);

        cb(); // Important: done with callback
    }

    /**
     * For Desoutter: skip certain header fields, etc. 
     * 
     * Note: This snippet includes your license block as requested.
     */
    _serializeForDesoutter(chunk, cb) {
        /*
            Copyright 2021 Jeremy London
    
            Licensed under the Apache License, Version 2.0 (the "License");
            you may not use this file except in compliance with the License.
            You may obtain a copy of the License at
    
                http://www.apache.org/licenses/LICENSE-2.0
    
            Unless required by applicable law or agreed to in writing, software
            distributed under the License is distributed on an "AS IS" BASIS,
            WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
            See the License for the specific language governing permissions and
            limitations under the License.
        */

        // "Desoutter controllers did not like the version number. 
        //  Sending blank characters for this header option got it to work"

        let sizePayload = chunk.payload.length;
        let sizeMessage = 21 + sizePayload;

        let buf = Buffer.alloc(sizeMessage);
        buf.write(pad(sizeMessage - 1, 4), 0, 4, encodingOP);
        buf.write(pad(chunk.mid, 4), 4, 4, encodingOP);

        // For Desoutter, we skip or ignore chunk.revision in the header 
        // and write blank spaces from 8..19, or as you did:
        buf.write("            ", 8, encodingOP);

        // Put the payload starting at position 20
        buf.write(chunk.payload.toString(encodingOP), 20, encodingOP);
        buf.write("\u0000", sizeMessage, encodingOP);

        debug("Desoutter openProtocolSerializer _transform publish", buf);
        this.push(buf);

        cb();
    }

}

module.exports = OpenProtocolSerializer;
