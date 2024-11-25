//@ts-check
/*
  MID 0901 Traces Plot Parameters Message
*/

const helpers = require("../helpers.js");
const { processParser, processDataFields } = helpers;

function parser(msg, opts, cb) {
  let buffer = msg.payload;
  msg.payload = {};

  let position = { value: 0 };

  switch (msg.revision) {
    case 1:
      // Parse Result Data Identifier (10 bytes)
      if (!processParser(msg, buffer, "resultID", "number", 10, position, cb))
        return;

      // Parse Time Stamp (19 bytes)
      if (!processParser(msg, buffer, "timeStamp", "string", 19, position, cb))
        return;

      // Parse Number of PID's (3 bytes)
      if (
        !processParser(msg, buffer, "numberOfPIDs", "number", 3, position, cb)
      )
        return;

      // Parse Data Fields (variable size)
      if (
        !processDataFields(
          msg,
          buffer,
          "dataFields",
          msg.payload.numberOfPIDs,
          position,
          cb
        )
      )
        return;

      cb(null, msg);
      break;

    default:
      cb(
        new Error(
          `[Parser MID${msg.mid}] Revision ${msg.revision} not supported`
        )
      );
      break;
  }
}

function serializer(msg, opts, cb) {
  if (msg.isAck) {
    // For acknowledgments, respond with MID0005 with MID0901 in the data field
    msg.mid = 5;
    msg.payload = Buffer.from("0901");
    cb(null, msg);
    return;
  }

  switch (msg.revision) {
    case 1:
      // For subscription and unsubscription, include MID0901 in the payload when used with MID0008 or MID0009
      if (msg.mid === 8 || msg.mid === 9) {
        msg.payload = Buffer.from("0901");
      } else {
        msg.payload = Buffer.alloc(0);
      }
      cb(null, msg);
      break;

    default:
      cb(
        new Error(
          `[Serializer MID${msg.mid}] invalid revision [${msg.revision}]`
        )
      );
      break;
  }
}

function revision() {
  return [1];
}

module.exports = {
  parser,
  serializer,
  revision,
};
