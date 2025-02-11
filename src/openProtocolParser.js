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
  
    // We'll parse as many complete messages as fit in this chunk
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
  
      // 2) Parse the 4 ASCII bytes for length
      let lengthStr = chunk.toString(encodingOP, ptr, ptr + 4);
      let lengthVal = Number(lengthStr);
      if (isNaN(lengthVal) || lengthVal < 1 || lengthVal > 9999) {
        let e = new Error(`Invalid length [${lengthStr}]`);
        e.errno = constants.ERROR_LINKLAYER.INVALID_LENGTH;
        debug("OpenProtocolParser _transform err-length:", ptr, chunk);
        cb(e);
        return;
      }
  
      // We haven't yet read MID, so let's see if we have enough bytes for "length + 1" or "length"
      // But we first need to read the 4-byte MID. So let's see if we have at least 8 bytes total.
      if (chunk.length - ptr < 8) {
        // Not enough data to even read the MID
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
  
      // Advance past the 4 bytes of length
      ptr += 4;
  
      // 3) Read the 4-byte MID
      let midStr = chunk.toString(encodingOP, ptr, ptr + 4);
      let midVal = Number(midStr);
      if (isNaN(midVal) || midVal < 1 || midVal > 9999) {
        debug("OpenProtocolParser _transform err-mid:", ptr, chunk);
        cb(new Error(`Invalid MID [${midStr}]`));
        return;
      }
      ptr += 4;
  
      // Decide if we skip the trailing zero for this MID
      const skipTrailingZero = (midVal === 900 || midVal === 901);
  
      // The total length is lengthVal. Normally we also add +1 for trailing zero.
      // But for MID 900 / 901, we do NOT add +1.
      const totalNeeded = skipTrailingZero ? lengthVal : (lengthVal + 1);
  
      // Now check if we have enough bytes for the entire message
      // We already consumed 8 bytes (length + mid).
      // So the remaining needed is (totalNeeded - 8).
      if (chunk.length - ptr < (totalNeeded - 8)) {
        // Not enough data to parse the rest
        // Rewind the pointer so we can re-parse length+mid next time
        ptr -= 8;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
  
      // 4) Now parse the next 12 bytes of the header:
      //    revision(3), noAck(1), stationID(2), spindleID(2), sequenceNumber(2), messageParts(1), messageNumber(1)
      let obj = {};
      obj.mid = midVal;
  
      // (a) revision (3)
      if (chunk.length - ptr < 3) {
        ptr -= 8; // roll back
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let revision = chunk.toString(encodingOP, ptr, ptr + 3);
      if (revision === "   ") revision = "1";
      obj.revision = Number(revision);
      if (isNaN(obj.revision) || obj.revision < 1 || obj.revision > 999) {
        let e = new Error(`Invalid revision [${revision}]`);
        e.errno = constants.ERROR_LINKLAYER.INVALID_REVISION;
        e.obj = obj;
        debug("OpenProtocolParser _transform err-revision:", ptr, chunk);
        cb(e);
        return;
      }
      ptr += 3;
  
      // (b) noAck (1)
      if (chunk.length - ptr < 1) {
        ptr -= 11;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let noAck = chunk.toString(encodingOP, ptr, ptr + 1);
      if (noAck === " ") noAck = "0";
      let noAckVal = Number(noAck);
      if (isNaN(noAckVal) || noAckVal < 0 || noAckVal > 1) {
        debug("OpenProtocolParser _transform err-noAck:", ptr, chunk);
        cb(new Error(`Invalid noAck [${noAck}]`));
        return;
      }
      obj.noAck = Boolean(noAckVal);
      ptr += 1;
  
      // (c) stationID (2)
      if (chunk.length - ptr < 2) {
        ptr -= 12;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let stationID = chunk.toString(encodingOP, ptr, ptr + 2);
      if (stationID === "  ") stationID = "1";
      let stationIDVal = Number(stationID);
  
      if (isNaN(stationIDVal) || stationIDVal < 0 || stationIDVal > 99) {
        debug("... err-stationID ...");
        cb(new Error(`Invalid stationID [${stationIDVal}]`));
        return;
      }
      obj.stationID = stationIDVal;
      ptr += 2;
  
      // (d) spindleID (2)
      if (chunk.length - ptr < 2) {
        ptr -= 14;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let spindleID = chunk.toString(encodingOP, ptr, ptr + 2);
      if (spindleID === "  ") spindleID = "1";
      let spindleVal = Number(spindleID);
      if (isNaN(spindleVal) || spindleVal < 1 || spindleVal > 99) {
        debug("OpenProtocolParser _transform err-spindleID:", ptr, chunk);
        cb(new Error(`Invalid spindleID [${spindleID}]`));
        return;
      }
      obj.spindleID = spindleVal;
      ptr += 2;
  
      // (e) sequenceNumber (2)
      if (chunk.length - ptr < 2) {
        ptr -= 16;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let seqStr = chunk.toString(encodingOP, ptr, ptr + 2);
      if (seqStr === "  ") seqStr = "0";
      let seqVal = Number(seqStr);
      if (isNaN(seqVal) || seqVal < 0 || seqVal > 99) {
        debug("OpenProtocolParser _transform err-sequenceNumber:", ptr, chunk);
        cb(new Error(`Invalid sequenceNumber [${seqStr}]`));
        return;
      }
      obj.sequenceNumber = seqVal;
      ptr += 2;
  
      // (f) messageParts (1)
      if (chunk.length - ptr < 1) {
        ptr -= 18;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let msgPartsStr = chunk.toString(encodingOP, ptr, ptr + 1);
      if (msgPartsStr === " ") msgPartsStr = "0";
      let msgPartsVal = Number(msgPartsStr);
      if (isNaN(msgPartsVal) || msgPartsVal < 0 || msgPartsVal > 9) {
        debug("OpenProtocolParser _transform err-messageParts:", ptr, chunk);
        cb(new Error(`Invalid message parts [${msgPartsStr}]`));
        return;
      }
      obj.messageParts = msgPartsVal;
      ptr += 1;
  
      // (g) messageNumber (1)
      if (chunk.length - ptr < 1) {
        ptr -= 19;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let msgNumStr = chunk.toString(encodingOP, ptr, ptr + 1);
      if (msgNumStr === " ") msgNumStr = "0";
      let msgNumVal = Number(msgNumStr);
      if (isNaN(msgNumVal) || msgNumVal < 0 || msgNumVal > 9) {
        debug("OpenProtocolParser _transform err-messageNumber:", ptr, chunk);
        cb(new Error(`Invalid message number [${msgNumStr}]`));
        return;
      }
      obj.messageNumber = msgNumVal;
      ptr += 1;
  
      // 5) Now parse the payload => lengthVal - 20
      // Check partial
      if (chunk.length - ptr < (lengthVal - 20)) {
        // partial
        ptr -= 20;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
  
      obj.payload = chunk.slice(ptr, ptr + (lengthVal - 20));
      ptr += (lengthVal - 20);
  
      // 6) If we do require a trailing zero, parse it
      if (!skipTrailingZero) {
        // We expect 1 trailing byte = 0x00
        if (ptr >= chunk.length) {
          // partial again
          ptr -= (20 + (lengthVal - 20));
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
  
      // If rawData is enabled, store the entire raw chunk from startPtr to the final ptr
      if (this.rawData) {
        obj._raw = chunk.slice(startPtr, ptr);
      }
  
      // We have a complete MID object
      this.push(obj);
  
      // If we've reached or passed the end, break from the while loop
      if (ptr >= chunk.length) {
        break;
      }
    }
  
    cb();
  }
  
  
  
}

module.exports = OpenProtocolParser;
