//@ts-check
/*
  MID 0901 (Revision 1)

  Format:
  After the standard header (20 bytes):
  - 10 chars -> resultID (number)
  - 19 chars -> timeStamp (string)
  -  3 chars -> numberPID (number)
  - Data fields repeated "numberPID" times

  For subscription:
  - We send MID=0008 referencing “901” in the “midNumber” field, but with no extra data.
*/

const helpers = require("../helpers.js");
const processParser = helpers.processParser;
const processDataFields = helpers.processDataFields;
const serializerField = helpers.serializerField;

/**
 * @function parser
 * @description Parse the payload of MID 0901 revision 1 (trace plotting parameters).
 * @param {object} msg - The “message” object from node-open-protocol.
 * @param {object|null} opts - Not used here, can remain null.
 * @param {function} cb - Callback for error or success.
 */
function parser(msg, opts, cb) {
  const buffer = msg.payload;
  if (!Buffer.isBuffer(buffer)) {
    return cb(new Error("MID0901 parser error: payload is not a Buffer"));
  }

  // Convert the payload to an object:
  msg.payload = {};
  const position = { value: 0 };

  switch (msg.revision) {
    case 1: {
      // Minimal length check: 10 + 19 + 3 = 32
      if (buffer.length < 32) {
        return cb(
          new Error(
            `MID0901 parser error: buffer too short (${buffer.length} bytes).`
          )
        );
      }

      // 1) resultID (10, number)
      if (!processParser(msg, buffer, "resultID", "number", 10, position, cb)) {
        return; // error thrown
      }

      // 2) timeStamp (19, string)
      if (!processParser(msg, buffer, "timeStamp", "string", 19, position, cb)) {
        return;
      }

      // 3) numberPID (3, number)
      if (!processParser(msg, buffer, "numberPID", "number", 3, position, cb)) {
        return;
      }

      // 4) parse dataFields (repeated numberPID times)
      if (
        !processDataFields(
          msg,
          buffer,
          "fieldPID",
          msg.payload.numberPID,
          position,
          cb
        )
      ) {
        return;
      }

      // Done parsing
      return cb(null, msg);
    }

    default:
      return cb(
        new Error(`[MID0901] Parser not implemented for revision [${msg.revision}]`)
      );
  }
}

/**
 * @function serializer
 * @description 
 * - If `msg.isAck`, sets mid=5 and payload="0901" (command accepted referencing 0901).
 * - Otherwise, we do a subscription with MID=8, referencing midNumber=901—but with no extra data beyond the header.
 * 
 * @param {object} msg
 * @param {object|null} opts
 * @param {function} cb
 */
function serializer(msg, opts, cb) {
  // If acknowledging a 0901 subscription
  if (msg.isAck) {
    msg.mid = 5;
    msg.payload = Buffer.from("0901"); // "Command accepted" referencing 0901
    return cb(null, msg);
  }

  // By default, we handle revision=1 only
  msg.revision = msg.revision || 1;

  switch (msg.revision) {
    case 1:
      // The doc says “Use MID=0008 … no extra data needed after the header.”
      msg.mid = 8;

      // We'll store "901" in the same style as your 900 code, but dataLength=0
      // so we don't actually send any extra payload bytes beyond the 20-byte header.

      //901 plotParameters subscription request:
      //msg.payload.midNumber = 901;


      
      // If the user did not provide subscription details, we can build a default subscription:
      if (
        msg.payload.midNumber === undefined ||
        msg.payload.revision === undefined
      ) {
        // Hard-coded for Angle Torque Current
        consol.log("Using hardcoded 0901 subscription");
        buf = Buffer.from("0901001");
      }
      else {  
        consol.log("Constructing 0901 subscription");

       // Build the final buffer:
      // It's 9 bytes = (2 for dataLength, 3 for revision, 4 for midNumber)
      // but dataLength=0 means "extraData" is length 0
      let buf = Buffer.alloc(9); 
      let position = { value: 9 };

      // serializerField: 
      //  1) "extraData" (length=0) => no actual data
      //  2) "dataLength" => 2 numeric chars
      //  3) "revision" => 3 numeric chars
      //  4) "midNumber" => 4 numeric chars
      let ok = 
        serializerField(msg, buf, "revision", "number", 3, position, cb) &&
        serializerField(msg, buf, "midNumber", "number", 4, position, cb);

      if (!ok) {
        // If something failed and cb(...) was already called with an error
        return;
      }
    }
      msg.payload = buf;
      return cb(null, msg);

    default:
      return cb(
        new Error(
          `[Serializer MID${msg.mid}] invalid revision [${msg.revision}]`
        )
      );
  }
}

/**
 * Let the parser/serializer system know which revisions you handle.
 */
function revision() {
  return [1];
}

module.exports = {
  parser,
  serializer,
  revision,
};
