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
  
    // We'll parse as many messages as fit in this chunk
    while (true) {
      // 1) We need at least 4 bytes to read the length field
      if (chunk.length - ptr < 4) {
        // Not enough data for length => buffer partial
        if (ptr < chunk.length) {
          this._nBuffer = chunk.slice(ptr);
        }
        cb();
        return;
      }
  
      // 2) Parse length (4 ASCII digits)
      let lengthStr = chunk.toString(encodingOP, ptr, ptr + 4);
      let lengthVal = Number(lengthStr);
  
      if (isNaN(lengthVal) || lengthVal < 1 || lengthVal > 9999) {
        let e = new Error(`Invalid length [${lengthStr}]`);
        e.errno = constants.ERROR_LINKLAYER.INVALID_LENGTH;
        debug("OpenProtocolParser _transform err-length:", ptr, chunk);
        cb(e);
        return;
      }
  
      // If we have fewer than lengthVal + 1 (normally) bytes left, we can't parse the full message yet
      // But we must read the MID to see if it's 900 or 901 (which won't require trailing zero).
      // So let's see if we have at least 8 bytes (4 length + 4 MID).
      if (chunk.length - ptr < 8) {
        // Not enough to even read the MID
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
  
      // Move ptr past the length field for now
      ptr += 4;
  
      // 3) Read 4-byte MID
      let midStr = chunk.toString(encodingOP, ptr, ptr + 4);
      let midVal = Number(midStr);
  
      if (isNaN(midVal) || midVal < 1 || midVal > 9999) {
        debug("OpenProtocolParser _transform err-mid:", ptr, chunk);
        cb(new Error(`Invalid MID [${midStr}]`));
        return;
      }
      ptr += 4;
  
      // Decide if we require a trailing zero:
      const skipTrailingZero = (midVal === 900 || midVal === 901);
  
      // The total message length is lengthVal (header+payload). 
      // For most MIDs, we also expect +1 for trailing zero => (lengthVal + 1).
      // But for 900/901, we only expect lengthVal.
      const totalNeeded = skipTrailingZero ? lengthVal : (lengthVal + 1);
  
      // Check if we have enough bytes left for the entire message
      if (chunk.length - ptr < (totalNeeded - 8)) {
        // Not enough data to parse the rest of the message
        // We already consumed 8 bytes (length+mid).
        ptr -= 8; // Rewind pointer so we can re-read length+mid next time
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
  
      // 4) Now parse the rest of the header (12 bytes: revision(3), noAck(1), station(2), spindle(2), seq(2), msgParts(1), msgNumber(1))
      let obj = {};
      obj.mid = midVal;
  
      // revision (3)
      if (chunk.length - ptr < 3) {
        // partial
        ptr -= 8;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let revision = chunk.toString(encodingOP, ptr, ptr + 3);
      if (revision === "   ") revision = "1";
      obj.revision = Number(revision);
      if (isNaN(obj.revision) || obj.revision < 0 || obj.revision > 999) {
        let e = new Error(`Invalid revision [${revision}]`);
        e.errno = constants.ERROR_LINKLAYER.INVALID_REVISION;
        e.obj = obj;
        debug("OpenProtocolParser _transform err-revision:", ptr, chunk);
        cb(e);
        return;
      }
      if (obj.revision === 0) obj.revision = 1;
      ptr += 3;
  
      // noAck (1)
      if (chunk.length - ptr < 1) {
        ptr -= 11;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let noAck = chunk.toString(encodingOP, ptr, ptr + 1);
      if (noAck === " ") noAck = "0";
      obj.noAck = Number(noAck);
      if (isNaN(obj.noAck) || obj.noAck < 0 || obj.noAck > 1) {
        debug("OpenProtocolParser _transform err-no-ack:", ptr, chunk);
        cb(new Error(`Invalid no ack [${obj.noAck}]`));
        return;
      }
      obj.noAck = Boolean(obj.noAck);
      ptr += 1;
  
      // stationID (2)
      if (chunk.length - ptr < 2) {
        ptr -= 12;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let stationID = chunk.toString(encodingOP, ptr, ptr + 2);
      if (stationID === "  ") stationID = "1";
      obj.stationID = Number(stationID);
      if (isNaN(obj.stationID) || obj.stationID < 0 || obj.stationID > 99) {
        debug("OpenProtocolParser _transform err-station-id:", ptr, chunk);
        cb(new Error(`Invalid station id [${obj.stationID}]`));
        return;
      }
      if (obj.stationID === 0) obj.stationID = 1;
      ptr += 2;
  
      // spindleID (2)
      if (chunk.length - ptr < 2) {
        ptr -= 14;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let spindleID = chunk.toString(encodingOP, ptr, ptr + 2);
      if (spindleID === "  ") spindleID = "1";
      obj.spindleID = Number(spindleID);
      if (isNaN(obj.spindleID) || obj.spindleID < 0 || obj.spindleID > 99) {
        debug("OpenProtocolParser _transform err-spindle-id:", ptr, chunk);
        cb(new Error(`Invalid spindle id [${obj.spindleID}]`));
        return;
      }
      if (obj.spindleID === 0) obj.spindleID = 1;
      ptr += 2;
  
      // sequenceNumber (2)
      if (chunk.length - ptr < 2) {
        ptr -= 16;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let sequenceNumber = chunk.toString(encodingOP, ptr, ptr + 2);
      if (sequenceNumber === "  ") sequenceNumber = "0";
      obj.sequenceNumber = Number(sequenceNumber);
      if (isNaN(obj.sequenceNumber) || obj.sequenceNumber < 0 || obj.sequenceNumber > 99) {
        debug("OpenProtocolParser _transform err-sequence-number:", ptr, chunk);
        cb(new Error(`Invalid sequence number [${obj.sequenceNumber}]`));
        return;
      }
      ptr += 2;
  
      // messageParts (1)
      if (chunk.length - ptr < 1) {
        ptr -= 18;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let messageParts = chunk.toString(encodingOP, ptr, ptr + 1);
      if (messageParts === " ") messageParts = "0";
      obj.messageParts = Number(messageParts);
      if (isNaN(obj.messageParts) || obj.messageParts < 0 || obj.messageParts > 9) {
        debug("OpenProtocolParser _transform err-message-parts:", ptr, chunk);
        cb(new Error(`Invalid message parts [${obj.messageParts}]`));
        return;
      }
      ptr += 1;
  
      // messageNumber (1)
      if (chunk.length - ptr < 1) {
        ptr -= 19;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let messageNumber = chunk.toString(encodingOP, ptr, ptr + 1);
      if (messageNumber === " ") messageNumber = "0";
      obj.messageNumber = Number(messageNumber);
      if (isNaN(obj.messageNumber) || obj.messageNumber < 0 || obj.messageNumber > 9) {
        debug("OpenProtocolParser _transform err-message-number:", ptr, chunk);
        cb(new Error(`Invalid message number [${obj.messageNumber}]`));
        return;
      }
      ptr += 1;
  
      // Now parse the payload => lengthVal - 20
      if (chunk.length - ptr < (lengthVal - 20)) {
        // partial
        ptr -= 20; // roll back
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      obj.payload = chunk.slice(ptr, ptr + (lengthVal - 20));
      ptr += (lengthVal - 20);
  
      // Finally, handle trailing zero if needed
      if (!skipTrailingZero) {
        // We expect 1 trailing byte=0
        if (ptr >= chunk.length) {
          // partial again
          ptr -= (20 + (lengthVal - 20)); // i.e. roll back the entire message
          this._nBuffer = chunk.slice(ptr);
          cb();
          return;
        }
        if (chunk[ptr] !== 0) {
          let e = new Error(`Invalid message (expected trailing 0) [${chunk.toString()}]`);
          e.errno = constants.ERROR_LINKLAYER.INVALID_LENGTH;
          debug("OpenProtocolParser _transform err-message:", ptr, chunk);
          cb(e);
          return;
        }
        ptr += 1;
      }
  
      // If rawData is enabled, store the entire raw chunk from startPtr
      if (this.rawData) {
        obj._raw = chunk.slice(startPtr, ptr);
      }
  
      // we have a complete MID object
      this.push(obj);
  
      // If we've reached or passed the end, break
      if (ptr >= chunk.length) {
        break;
      }
    } // end while
  
    cb();
  }
  
}

module.exports = OpenProtocolParser;
