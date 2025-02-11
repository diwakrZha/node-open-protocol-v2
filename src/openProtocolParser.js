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
  
    // If we had leftover data from a previous chunk, prepend it.
    if (this._nBuffer !== null) {
      chunk = Buffer.concat([this._nBuffer, chunk]);
      this._nBuffer = null;
    }
  
    // Parse as many complete messages as we can.
    while (true) {
      // 1) We need at least 4 bytes to read the length field.
      if (chunk.length - ptr < 4) {
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
  
      // 2) Read the 4-byte length field.
      let lengthStr = chunk.toString(encodingOP, ptr, ptr + 4);
      // Extra guard: make sure the 4 bytes are all digits.
      if (!/^\d{4}$/.test(lengthStr)) {
        // Incomplete or invalid length field => buffer and wait.
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      let lengthVal = Number(lengthStr);
      if (isNaN(lengthVal) || lengthVal < 1 || lengthVal > 9999) {
        let e = new Error(`Invalid length [${lengthStr}]`);
        e.errno = constants.ERROR_LINKLAYER.INVALID_LENGTH;
        debug("OpenProtocolParser _transform err-length:", ptr, chunk);
        cb(e);
        return;
      }
  
      // We now have a complete 4-byte length.
      // Advance the pointer.
      ptr += 4;
  
      // 3) Check if we have at least 4 more bytes for the MID.
      if (chunk.length - ptr < 4) {
        this._nBuffer = chunk.slice(ptr - 4); // include length field
        cb();
        return;
      }
  
      let midStr = chunk.toString(encodingOP, ptr, ptr + 4);
      let midVal = Number(midStr);
      if (isNaN(midVal) || midVal < 1 || midVal > 9999) {
        debug("OpenProtocolParser _transform err-mid:", ptr, chunk);
        cb(new Error(`Invalid MID [${midStr}]`));
        return;
      }
      ptr += 4;
  
      // Decide if we skip the trailing zero (for MID 900 or 901).
      const skipTrailingZero = (midVal === 900 || midVal === 901);
      // The total message length is lengthVal (header + payload).
      // For non‑900/901 MIDs we expect an extra trailing 0x00 byte.
      const totalNeeded = skipTrailingZero ? lengthVal : (lengthVal + 1);
  
      // We already consumed 8 bytes (length + MID).
      if (chunk.length - ptr < (totalNeeded - 8)) {
        // Not enough data; rewind pointer so we can re-read the whole message later.
        ptr -= 8;
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
  
      // 4) Parse the rest of the 12-byte header:
      // revision (3), noAck (1), stationID (2), spindleID (2), sequenceNumber (2),
      // messageParts (1), messageNumber (1)
      let obj = {};
      obj.mid = midVal;
  
      // (a) Revision (3)
      if (chunk.length - ptr < 3) {
        ptr -= 8;
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
      // Accept "00" as a valid stationID.
      if (stationID === "  ") stationID = "0";
      let stationIDVal = Number(stationID);
      if (isNaN(stationIDVal) || stationIDVal < 0 || stationIDVal > 99) {
        debug("OpenProtocolParser _transform err-stationID:", ptr, chunk);
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
      if (spindleID === "  ") spindleID = "0";
      let spindleVal = Number(spindleID);
      if (isNaN(spindleVal) || spindleVal < 0 || spindleVal > 99) {
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
  
      // 5) Parse the payload, which is (lengthVal - 20) bytes.
      if (chunk.length - ptr < (lengthVal - 20)) {
        // Not enough data for payload => buffer partial message.
        ptr -= 20; // roll back the header bytes
        this._nBuffer = chunk.slice(ptr);
        cb();
        return;
      }
      obj.payload = chunk.slice(ptr, ptr + (lengthVal - 20));
      ptr += (lengthVal - 20);
  
      // 6) Handle trailing zero if needed (for non-900/901 messages).
      if (!skipTrailingZero) {
        if (ptr >= chunk.length) {
          // Partial: not enough data for trailing 0
          ptr -= (20 + (lengthVal - 20));
          this._nBuffer = chunk.slice(ptr);
          cb();
          return;
        }
        if (chunk[ptr] !== 0) {
          let e = new Error(`Invalid message (expected trailing 0) [${chunk.toString()}]`);
          e.errno = constants.ERROR_LINKLAYER.INVALID_LENGTH;
          debug("OpenProtocolParser _transform err-trailing zero:", ptr, chunk);
          cb(e);
          return;
        }
        ptr += 1; // consume trailing zero
      }
    
      // If rawData is enabled, store the entire raw chunk from startPtr to ptr.
      if (this.rawData) {
        obj._raw = chunk.slice(startPtr, ptr);
      }
    
      // We have a complete MID object; push it.
      this.push(obj);
    
      // If there is no more data, break out of the loop.
      if (ptr >= chunk.length) {
        break;
      }
    }
    
    cb();
  }  
  
  
}

module.exports = OpenProtocolParser;
