// @ts-check
/*
  This parser is based on the official open-protocol approach,
  but includes a special exception for MID 900 (trace data), which
  often does NOT have a trailing 0x00 terminator.
*/

const util = require("util");
const { Transform } = require("stream");

const constants = require("./constants");
const encodingOP = constants.defaultEncoder;

var debug = util.debuglog("open-protocol");

class OpenProtocolParser extends Transform {
  /**
   * @class OpenProtocolParser
   * @description This class performs the parsing of the MID header (first 20 bytes)
   * and extracts the payload for each message.
   * @param {Partial<Omit<import("stream").TransformOptions, "readableObjectMode" | "decodeStrings"> & {
   *  rawData?: boolean
   * }>} opts an object with the option passed to the constructor
   */
  constructor(opts = {}) {
    super({
      ...opts,
      decodeStrings: true,
      readableObjectMode: true,
    });

    this.rawData = opts.rawData || false;
    this._nBuffer = null;
    debug("new OpenProtocolParser");
  }

  _transform(chunk, encoding, cb) {
    debug("OpenProtocolParser _transform", chunk);

    let ptr = 0;

    // If we had leftover data from a previous chunk, prepend it
    if (this._nBuffer !== null) {
      chunk = Buffer.concat([this._nBuffer, chunk]);
      this._nBuffer = null;
    }

    // We need at least 20 bytes for a valid open-protocol header
    if (chunk.length < 20) {
      this._nBuffer = chunk;
      cb();
      return;
    }

    // We'll parse as many messages as fit in this chunk
    while (ptr < chunk.length) {
      let obj = {};
      let startPtr = ptr;

      // 1) Read 4-byte length field
      let lengthStr = chunk.toString(encodingOP, ptr, ptr + 4);
      let lengthVal = Number(lengthStr);

      if (isNaN(lengthVal) || lengthVal < 1 || lengthVal > 9999) {
        let e = new Error(`Invalid length [${lengthStr}]`);
        e.errno = constants.ERROR_LINKLAYER.INVALID_LENGTH;
        debug("OpenProtocolParser _transform err-length:", ptr, chunk);
        cb(e);
        return;
      }

      // Check if we have enough bytes for the entire message
      // Normally we also expect a trailing 0x00 => so lengthVal + 1
      // BUT for MID=900 we skip trailing zero. We'll handle that logic after reading MID.
      // For now, we do the old approach:
      if (chunk.length < ptr + lengthVal + 1) {
        // Not enough data to parse the full message (and trailing 0x00).
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }

      // Advance past the length field
      ptr += 4;

      // 2) Read 4-byte MID
      let midStr = chunk.toString(encodingOP, ptr, ptr + 4);
      let midVal = Number(midStr);
      obj.mid = midVal;

      if (isNaN(obj.mid) || obj.mid < 1 || obj.mid > 9999) {
        debug("OpenProtocolParser _transform err-mid:", ptr, chunk);
        cb(new Error(`Invalid MID [${midStr}]`));
        return;
      }
      ptr += 4;

      // 3) Read 3-byte revision
      let revision = chunk.toString(encodingOP, ptr, ptr + 3);
      if (revision === "   ") {
        revision = "1"; // default to 1
      }
      obj.revision = Number(revision);

      if (isNaN(obj.revision) || obj.revision < 0 || obj.revision > 999) {
        let e = new Error(`Invalid revision [${revision}]`);
        e.errno = constants.ERROR_LINKLAYER.INVALID_REVISION;
        e.obj = obj;
        debug("OpenProtocolParser _transform err-revision:", ptr, chunk);
        cb(e);
        return;
      }

      // If revision is zero, default to 1
      if (obj.revision === 0) {
        obj.revision = 1;
      }

      ptr += 3;

      // 4) Read 1-byte noAck
      let noAck = chunk.toString(encodingOP, ptr, ptr + 1);
      if (noAck === " ") {
        noAck = "0";
      }
      obj.noAck = Number(noAck);

      if (isNaN(obj.noAck) || obj.noAck < 0 || obj.noAck > 1) {
        debug("OpenProtocolParser _transform err-no-ack:", ptr, chunk);
        cb(new Error(`Invalid no ack [${obj.noAck}]`));
        return;
      }
      // Convert 0/1 => boolean
      obj.noAck = Boolean(obj.noAck);

      ptr += 1;

      // 5) Read stationID (2 bytes)
      let stationID = chunk.toString(encodingOP, ptr, ptr + 2);
      if (stationID === "  ") {
        stationID = "1"; // default to 1
      }
      obj.stationID = Number(stationID);

      if (isNaN(obj.stationID) || obj.stationID < 0 || obj.stationID > 99) {
        debug("OpenProtocolParser _transform err-station-id:", ptr, chunk);
        cb(new Error(`Invalid station id [${obj.stationID}]`));
        return;
      }

      if (obj.stationID === 0) {
        obj.stationID = 1;
      }

      ptr += 2;

      // 6) Read spindleID (2 bytes)
      let spindleID = chunk.toString(encodingOP, ptr, ptr + 2);
      if (spindleID === "  ") {
        spindleID = "1";
      }
      obj.spindleID = Number(spindleID);

      if (isNaN(obj.spindleID) || obj.spindleID < 0 || obj.spindleID > 99) {
        debug("OpenProtocolParser _transform err-spindle-id:", ptr, chunk);
        cb(new Error(`Invalid spindle id [${obj.spindleID}]`));
        return;
      }

      if (obj.spindleID === 0) {
        obj.spindleID = 1;
      }

      ptr += 2;

      // 7) Read sequenceNumber (2 bytes)
      let sequenceNumber = chunk.toString(encodingOP, ptr, ptr + 2);
      if (sequenceNumber === "  ") {
        sequenceNumber = "0";
      }
      obj.sequenceNumber = Number(sequenceNumber);

      if (isNaN(obj.sequenceNumber) || obj.sequenceNumber < 0 || obj.sequenceNumber > 99) {
        debug("OpenProtocolParser _transform err-sequence-number:", ptr, chunk);
        cb(new Error(`Invalid sequence number [${obj.sequenceNumber}]`));
        return;
      }

      ptr += 2;

      // 8) Read messageParts (1 byte)
      let messageParts = chunk.toString(encodingOP, ptr, ptr + 1);
      if (messageParts === " ") {
        messageParts = "0";
      }
      obj.messageParts = Number(messageParts);

      if (isNaN(obj.messageParts) || obj.messageParts < 0 || obj.messageParts > 9) {
        debug("OpenProtocolParser _transform err-message-parts:", ptr, chunk);
        cb(new Error(`Invalid message parts [${obj.messageParts}]`));
        return;
      }

      ptr += 1;

      // 9) Read messageNumber (1 byte)
      let messageNumber = chunk.toString(encodingOP, ptr, ptr + 1);
      if (messageNumber === " ") {
        messageNumber = "0";
      }
      obj.messageNumber = Number(messageNumber);

      if (isNaN(obj.messageNumber) || obj.messageNumber < 0 || obj.messageNumber > 9) {
        debug("OpenProtocolParser _transform err-message-number:", ptr, chunk);
        cb(new Error(`Invalid message number [${obj.messageNumber}]`));
        return;
      }

      ptr += 1;

      // 10) The remaining portion is the payload => lengthVal - 20 bytes
      obj.payload = chunk.slice(ptr, ptr + (lengthVal - 20));

      ptr += (lengthVal - 20);

      // === SPECIAL LOGIC FOR MID 900 (trace data) ===
      // Typically the spec says chunk[ptr] == 0. But some devices skip the trailing 0 for MID 900.
      // So let's do a conditional check:
      if (obj.mid !== 900) {
        // For standard MIDs, enforce trailing 0
        if (chunk[ptr] !== 0) {
          let e = new Error(`Invalid message (expected trailing 0) [${chunk.toString()}]`);
          e.errno = constants.ERROR_LINKLAYER.INVALID_LENGTH;
          debug("OpenProtocolParser _transform err-message:", ptr, chunk);
          cb(e);
          return;
        }
        // If everything is good, move ptr forward by 1 for that trailing 0
        ptr += 1;
      } else {
        // If it is MID 900, do NOT require a trailing 0
        // We'll just keep ptr as is. (No increment)
      }

      // If rawData is enabled, store the entire raw chunk from startPtr
      if (this.rawData) {
        // If we didn't consume an extra byte for MID=900,
        // the actual raw data ends at ptr. For other MIDs, it's at ptr.
        obj._raw = chunk.slice(startPtr, ptr);
      }

      this.push(obj);

      // Loop back to parse next message if there's more data in chunk
    }

    cb();
  }
}

module.exports = OpenProtocolParser;
