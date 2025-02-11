//@ts-check
/*
  MID 0900 (Revision 1)
  
  Format reminder:
  10 chars -> resultID (number)
  19 chars -> timeStamp (string)
  3 chars  -> numberPID (number)
    -> Then parse 'numberPID' data fields
  2 chars  -> traceType (number)
  2 chars  -> transducerType (number)
  3 chars  -> unit (string or number, check your device specs)
  3 chars  -> numberData
    -> Then parse 'numberData' data fields
  3 chars  -> numberResolution
    -> Then parse resolutionFields
  5 chars  -> numberTrace
  1 char   -> NUL
    -> Then parse traceSample (length = numberTrace)
*/

const helpers = require("../helpers.js");
const testNul = helpers.testNul;
const processParser = helpers.processParser;         // already in your code
const serializerField = helpers.serializerField;     // already in your code
const processDataFields = helpers.processDataFields; // already in your code
const processResolutionFields = helpers.processResolutionFields; 
const processTraceSamples = helpers.processTraceSamples; // make sure it's exported in helpers.js

/**
 * @function parser
 * @description Parse the payload of MID 0900 revision 1 (trace data).
 * @param {object} msg - The “message” object as provided by the node-open-protocol parser pipeline.
 * @param {object|null} opts - Not used here, can remain null.
 * @param {function} cb - The callback to signal error or success.
 */
function parser(msg, opts, cb) {
  // The raw payload is a Buffer. We'll parse and place results in msg.payload.
  const buffer = msg.payload;
  if (!Buffer.isBuffer(buffer)) {
    return cb(new Error("MID0900 parser error: payload is not a Buffer"));
  }

  // We’ll rewrite msg.payload as an object:
  msg.payload = {};
  const position = { value: 0 };

  // We only have case 1 implemented:
  switch (msg.revision) {
    case 1: {
      // Optionally, do a quick “minimum length” check before parse:
      // The absolute minimum size for all the fixed fields of Rev.1 might be:
      // 10 + 19 + 3 + 2 + 2 + 3 + 3 + 3 + 5 + 1 = 48 (plus however many chars for dataFields, resolutionFields, etc.)
      // If you want a quick check:
      if (buffer.length < 48) {
        return cb(
          new Error(
            `MID0900 parser error: buffer too short (${buffer.length} bytes).`
          )
        );
      }

      // Start parsing each field:
      // 1) resultID (10, number)
      if (!processParser(msg, buffer, "resultID", "number", 10, position, cb)) {
        return; // error thrown inside processParser
      }

      // 2) timeStamp (19, string)
      if (!processParser(msg, buffer, "timeStamp", "string", 19, position, cb)) {
        return;
      }

      // 3) numberPID (3, number)
      if (!processParser(msg, buffer, "numberPID", "number", 3, position, cb)) {
        return;
      }

      // 4) parse dataFields (we have 'numberPID' data fields)
      if (
        !processDataFields(
          msg,
          buffer,
          "fieldPID",
          msg.payload.numberPID, // how many fields
          position,
          cb
        )
      ) {
        return;
      }

      // 5) traceType (2, number)
      if (!processParser(msg, buffer, "traceType", "number", 2, position, cb)) {
        return;
      }

      // 6) transducerType (2, number)
      if (!processParser(msg, buffer, "transducerType", "number", 2, position, cb)) {
        return;
      }

      // 7) unit (3, string or number—depends on official docs)
      if (!processParser(msg, buffer, "unit", "string", 3, position, cb)) {
        return;
      }

      // 8) numberData (3, number)
      if (!processParser(msg, buffer, "numberData", "number", 3, position, cb)) {
        return;
      }

      // 9) parse dataFields again (we have 'numberData' data fields)
      if (
        !processDataFields(
          msg,
          buffer,
          "fieldData",
          msg.payload.numberData,
          position,
          cb
        )
      ) {
        return;
      }

      // 10) numberResolution (3, number)
      if (
        !processParser(msg, buffer, "numberResolution", "number", 3, position, cb)
      ) {
        return;
      }

      // 11) parse resolutionFields
      if (
        !processResolutionFields(
          msg,
          buffer,
          "resolutionFields",
          msg.payload.numberResolution,
          position,
          cb
        )
      ) {
        return;
      }

      // 12) numberTrace (5, number)
      if (!processParser(msg, buffer, "numberTrace", "number", 5, position, cb)) {
        return;
      }

      // 13) testNul (1, NUL)
      if (!testNul(msg, buffer, "char nul", position, cb)) {
        return;
      }

      // 14) traceSample
      //    pass arguments as your function signature demands
      if (
        !processTraceSamples(
          msg,
          buffer,
          "sampleTrace",                     // store output in msg.payload.sampleTrace
          msg.payload.numberTrace,           // length or count
          position,
          msg.payload.timeStamp,
          msg.payload.resolutionFields?.[0]?.timeValue,
          msg.payload.resolutionFields?.[0]?.unit,
          cb
        )
      ) {
        return; // error thrown in processTraceSamples
      }

      // If we reached here, all fields were parsed successfully.
      return cb(null, msg);
    }
    default:
      return cb(
        new Error(`[MID0900] Parser not implemented for revision [${msg.revision}]`)
      );
  }
}

/**
 * @function serializer
 * @description Example serializer that can generate a subscription request for MID 900, rev.1
 * @param {object} msg
 * @param {object|null} opts
 * @param {function} cb
 */
function serializer(msg, opts, cb) {
  let buf;
  let statusprocess = false;

  const position = { value: 0 };

  // If acknowledging a 0900 subscription, we send MID 0005 with "0900" in the payload
  if (msg.isAck) {
    msg.mid = 5;
    const ackBuf = Buffer.from("0900"); // "Acknowledging MID 0900"
    msg.payload = ackBuf;
    return cb(null, msg);
  }

  // default to rev.1 for 0900
  msg.revision = msg.revision || 1;

  switch (msg.revision) {
    case 1:
      // Typically 0008 is used for subscription requests
      msg.mid = 8;

      // Example subscription request:
      msg.payload.midNumber = 900;
      msg.payload.dataLength = 41; // 38 bytes for extraData (41 if all are subscribed, reduce by 3 when one is dropped off
      msg.payload.extraData = "0000000000000000000000000000000"
      + "3" // Number of trace types, options 1, 2, 3
      + "001"; // Trace type 1 - Angle
      + "002"; // Trace type 2 - Torque
      + "003"; // Trace type 3 - Current



      // If the user did not provide subscription details, we can build a default subscription:
      if (
        msg.payload.midNumber === undefined ||
        msg.payload.dataLength === undefined ||
        msg.payload.extraData === undefined ||
        msg.payload.revision === undefined
      ) {
        // Hard-coded for Angle Torque Current
        buf = Buffer.from("09000014100000000000000000000000000000003001002003");
      } else {
        // If the user has provided these fields, build the buffer dynamically:
        buf = Buffer.alloc(9 + msg.payload.dataLength); // for example
        position.value = 9 + msg.payload.dataLength;

        // “serializerField” is a helper that inserts data in the correct order
        // in reality you might need to reverse these calls so that "extraData"
        // is last, etc. This depends on your actual subscription format.
        statusprocess =
          serializerField(
            msg,
            buf,
            "extraData",
            "string",
            msg.payload.dataLength,
            position,
            cb
          ) &&
          serializerField(msg, buf, "dataLength", "number", 2, position, cb) &&
          serializerField(msg, buf, "revision", "number", 3, position, cb) &&
          serializerField(msg, buf, "midNumber", "number", 4, position, cb);

        if (!statusprocess) {
          // If something failed or cb() was called with an error, stop here
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
