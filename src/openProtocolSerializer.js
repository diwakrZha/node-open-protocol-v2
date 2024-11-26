//@ts-check
/*
  Copyright...
*/

const util = require("util");
const { Transform } = require("stream");

const constants = require("./constants.json");
const encodingOP = constants.defaultEncoder;

const helpers = require("./helpers.js");
const pad = helpers.padLeft;

var debug = util.debuglog("open-protocol");

class OpenProtocolSerializer extends Transform {
  constructor(opts) {
    opts = opts || {};
    opts.writableObjectMode = true;
    super(opts);
    debug("new openProtocolSerializer");
  }

  _transform(chunk, encoding, cb) {
    debug("openProtocolSerializer _transform", chunk);

    chunk.mid = Number(chunk.mid);

    if (isNaN(chunk.mid) || chunk.mid < 1 || chunk.mid > 9999) {
      cb(new Error(`Invalid MID [${chunk.mid}]`));
      debug("openProtocolSerializer _transform err-mid:", chunk);
      return;
    }

    if (
      chunk.revision === "   " ||
      chunk.revision === 0 ||
      chunk.revision === undefined
    ) {
      chunk.revision = 1;
    }

    chunk.revision = Number(chunk.revision);

    if (isNaN(chunk.revision) || chunk.revision < 0 || chunk.revision > 999) {
      cb(new Error(`Invalid revision [${chunk.revision}]`));
      debug("openProtocolSerializer _transform err-revision:", chunk);
      return;
    }

    // Ensure Station ID is a 2-digit ASCII number, default "00"
    if (chunk.stationID === undefined || chunk.stationID === "  ") {
      chunk.stationID = "00";
    } else {
      chunk.stationID = pad(chunk.stationID, 2, 10);
    }

    // Ensure Spindle ID is a 2-digit ASCII number, default "00"
    if (chunk.spindleID === undefined || chunk.spindleID === "  ") {
      chunk.spindleID = "00";
    } else {
      chunk.spindleID = pad(chunk.spindleID, 2, 10);
    }

    if (
      isNaN(Number(chunk.stationID)) ||
      Number(chunk.stationID) < 0 ||
      Number(chunk.stationID) > 99
    ) {
      cb(new Error(`Invalid stationID [${chunk.stationID}]`));
      debug("openProtocolSerializer _transform err-stationID:", chunk);
      return;
    }

    if (
      isNaN(Number(chunk.spindleID)) ||
      Number(chunk.spindleID) < 0 ||
      Number(chunk.spindleID) > 99
    ) {
      cb(new Error(`Invalid spindleID [${chunk.spindleID}]`));
      debug("openProtocolSerializer _transform err-spindleID:", chunk);
      return;
    }

    if (chunk.sequenceNumber === "  " || chunk.sequenceNumber === undefined) {
      chunk.sequenceNumber = 0;
    }

    chunk.sequenceNumber = Number(chunk.sequenceNumber);

    if (
      isNaN(chunk.sequenceNumber) ||
      chunk.sequenceNumber < 0 ||
      chunk.sequenceNumber > 99
    ) {
      cb(new Error(`Invalid sequenceNumber [${chunk.sequenceNumber}]`));
      debug("openProtocolSerializer _transform err-sequenceNumber:", chunk);
      return;
    }

    // Similarly handle messageParts and messageNumber with correct padding

    // Ensure payload is a Buffer
    if (chunk.payload === undefined) {
      chunk.payload = "";
    }
    let payloadBuffer = Buffer.from(chunk.payload.toString(), encodingOP);

    // Calculate message length (excluding null terminator)
    let messageLength = 20 + payloadBuffer.length;

    // Allocate buffer (include space for null terminator)
    let buf = Buffer.alloc(messageLength + 1); // +1 for null terminator

    // Write message length (4 characters)
    buf.write(pad(messageLength, 4, 10), 0, 4, encodingOP);

    // Write MID (4 characters)
    buf.write(pad(chunk.mid, 4, 10), 4, 4, encodingOP);

    // Write Revision (3 characters)
    buf.write(pad(chunk.revision, 3, 10), 8, 3, encodingOP);

    // Write No Ack Flag (1 character)
    buf.write(chunk.noAck ? "1" : "0", 11, 1, encodingOP);

    // Write Station ID (2 characters)
    buf.write(pad(chunk.stationID, 2, 10), 12, 2, encodingOP);

    // Write Spindle ID (2 characters)
    buf.write(pad(chunk.spindleID, 2, 10), 14, 2, encodingOP);

    // Write Sequence Number (2 characters)
    buf.write(pad(chunk.sequenceNumber, 2, 10), 16, 2, encodingOP);

    // Write Message Parts (1 character)
    buf.write(pad(chunk.messageParts, 1, 10), 18, 1, encodingOP);

    // Write Message Number (1 character)
    buf.write(pad(chunk.messageNumber, 1, 10), 19, 1, encodingOP);

    // Write Payload
    payloadBuffer.copy(buf, 20);

    // Write Null Terminator at the correct position
    buf.write("\u0000", messageLength, 1, encodingOP);

    debug("openProtocolSerializer _transform publish", buf);
    this.push(buf);

    cb();
  }

  _destroy() {
    // No-op, needed to handle older node versions
  }
}

module.exports = OpenProtocolSerializer;
