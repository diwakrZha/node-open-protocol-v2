//@ts-check
/*
  Copyright:
  - (c) 2024, Diwaker Jha
  - (c) 2023, Alejandro de la Mata Chico
  - (c) 2018-2020, Smart-Tech Controle e Automação
  License: GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

/*
    MID 0901
    Payload Structure:
    - Result Data Identifier (10 bytes)
    - Time Stamp (19 bytes) [YYYY-MM-DD:HH:MM:SS]
    - Number of PIDs (3 digits)
    - Data Fields (variable, based on Number of PIDs)
    - Number of Resolution Fields (3 digits)
    - Resolution Fields (variable, based on Number of Resolution Fields)
    - Number of Trace Types (2 digits)
    - Trace Sample (variable)
*/

const helpers = require("../helpers.js");
const testNul = helpers.testNul;
const processParser = helpers.processParser;
const serializerField = helpers.serializerField;
const processDataFields = helpers.processDataFields;
const processResolutionFields = helpers.processResolutionFields;
const processTraceSamples = helpers.processTraceSamples;

/**
 * @class
 * @name MID0901
 * @description Handles MID 0901: Traces Plot Parameters Message
 */
class MID0901 {
  /**
   * Parses incoming MID 0901 messages
   * @param {object} msg - The message object
   * @param {object} opts - Additional options
   * @param {function} cb - Callback function
   */
  static parser(msg, opts, cb) {
    let buffer = msg.payload;
    msg.payload = {};

    let traceLength = buffer.length;
    let position = { value: 0 };

    try {
      // Result Data Identifier (10 bytes)
      msg.payload.resultID = parseInt(
        helpers.readBuffer(buffer, position, 10),
        10
      );
      position.value += 10;

      // Time Stamp (19 bytes)
      msg.payload.timeStamp = helpers.readBuffer(buffer, position, 19).trim();
      position.value += 19;

      // Number of PIDs (3 digits)
      msg.payload.numberPID = parseInt(
        helpers.readBuffer(buffer, position, 3),
        10
      );
      position.value += 3;

      // Data Fields
      msg.payload.dataFields = helpers.processDataFields(
        buffer,
        position,
        msg.payload.numberPID
      );

      // Number of Resolution Fields (3 digits)
      msg.payload.numberResolution = parseInt(
        helpers.readBuffer(buffer, position, 3),
        10
      );
      position.value += 3;

      // Resolution Fields
      msg.payload.resolutionFields = helpers.processResolutionFields(
        buffer,
        position,
        msg.payload.numberResolution
      );

      // Number of Trace Types (2 digits)
      msg.payload.numberTrace = parseInt(
        helpers.readBuffer(buffer, position, 2),
        10
      );
      position.value += 2;

      // Trace Sample (variable)
      msg.payload.traceSample = helpers
        .readBuffer(buffer, position, traceLength - position.value)
        .trim();
      position.value += traceLength - position.value;

      // Check for null terminator
      helpers.testNul(msg, buffer, "char nul", position, cb);

      cb(null, msg);
    } catch (error) {
      logger.error(`Error parsing MID 0901: ${error}`);
      cb(error, null);
    }
  }

  /**
   * Serializes MID 0901 messages to send to the client
   * @param {object} msg - The message object
   * @param {object} opts - Additional options
   * @param {function} cb - Callback function
   */
  static serializer(msg, opts, cb) {
    let buf;
    let position = { value: 0 };

    try {
      // Define and populate fields based on the spec
      const resultID = msg.payload.resultID.toString().padStart(10, "0"); // 10 bytes
      const timeStamp = msg.payload.timeStamp.padEnd(19, " "); // 19 bytes
      const numberPID = msg.payload.numberPID.toString().padStart(3, "0"); // 3 digits

      // Serialize Data Fields
      let dataFieldsSerialized = "";
      msg.payload.dataFields.forEach((field) => {
        const parameterID = field.parameterID.toString().padStart(3, "0"); // 3 digits
        const length = field.length.toString().padStart(3, "0"); // 3 digits
        const dataType = field.dataType.toString().padStart(2, "0"); // 2 digits
        const unit = field.unit.toString().padStart(3, "0"); // 3 digits
        const stepNumber = field.stepNumber.toString(); // variable
        const dataValue = field.dataValue; // variable
        dataFieldsSerialized += `${parameterID}${length}${dataType}${unit}${stepNumber}${dataValue}`;
      });

      // Number of Resolution Fields (3 digits)
      const numberResolution = msg.payload.numberResolution
        .toString()
        .padStart(3, "0"); // 3 digits

      // Serialize Resolution Fields
      let resolutionFieldsSerialized = "";
      msg.payload.resolutionFields.forEach((resField) => {
        const firstIndex = resField.firstIndex.toString().padStart(5, "0"); // 5 digits
        const lastIndex = resField.lastIndex.toString().padStart(5, "0"); // 5 digits
        const length = resField.length.toString().padStart(3, "0"); // 3 digits
        const dataType = resField.dataType.toString().padStart(2, "0"); // 2 digits
        const unit = resField.unit.toString().padStart(3, "0"); // 3 digits
        const timeValue = resField.timeValue; // variable
        resolutionFieldsSerialized += `${firstIndex}${lastIndex}${length}${dataType}${unit}${timeValue}`;
      });

      // Number of Trace Types (2 digits)
      const numberTrace = msg.payload.numberTrace.toString().padStart(2, "0"); // 2 digits

      // Trace Sample (variable)
      const traceSample = msg.payload.traceSample; // variable

      // Calculate total length: header + payload
      const headerLength = 4 + 4 + 1 + 2 + 2 + 2 + 1 + 1; // Length + MID + No_ack + Station_id + Spindle_id + Sequence_number + Message_parts + Message_number
      const payloadLength =
        resultID.length +
        timeStamp.length +
        numberPID.length +
        dataFieldsSerialized.length +
        numberResolution.length +
        resolutionFieldsSerialized.length +
        numberTrace.length +
        traceSample.length;
      const totalLength = (headerLength + payloadLength)
        .toString()
        .padStart(4, "0"); // 4 digits

      // Initialize buffer with total length
      buf = Buffer.alloc(parseInt(totalLength, 10));
      position.value = 0;

      // Length
      buf.write(totalLength, position.value, 4, "ascii");
      position.value += 4;

      // MID
      buf.write("0901", position.value, 4, "ascii");
      position.value += 4;

      // No_ack
      buf.write("0", position.value, 1, "ascii");
      position.value += 1;

      // Station_id
      buf.write("00", position.value, 2, "ascii");
      position.value += 2;

      // Spindle_id
      buf.write("00", position.value, 2, "ascii");
      position.value += 2;

      // Sequence_number
      buf.write("00", position.value, 2, "ascii");
      position.value += 2;

      // Message_parts
      buf.write("0", position.value, 1, "ascii");
      position.value += 1;

      // Message_number
      buf.write("0", position.value, 1, "ascii");
      position.value += 1;

      // Payload Fields
      buf.write(resultID, position.value, 10, "ascii");
      position.value += 10;

      buf.write(timeStamp, position.value, 19, "ascii");
      position.value += 19;

      buf.write(numberPID, position.value, 3, "ascii");
      position.value += 3;

      buf.write(
        dataFieldsSerialized,
        position.value,
        dataFieldsSerialized.length,
        "ascii"
      );
      position.value += dataFieldsSerialized.length;

      buf.write(numberResolution, position.value, 3, "ascii");
      position.value += 3;

      buf.write(
        resolutionFieldsSerialized,
        position.value,
        resolutionFieldsSerialized.length,
        "ascii"
      );
      position.value += resolutionFieldsSerialized.length;

      buf.write(numberTrace, position.value, 2, "ascii");
      position.value += 2;

      buf.write(traceSample, position.value, traceSample.length, "ascii");
      position.value += traceSample.length;

      // Assign the constructed buffer to msg.payload
      msg.payload = buf;

      cb(null, msg);
    } catch (error) {
      logger.error(`Error serializing MID 0901: ${error}`);
      cb(error, null);
    }
  }

  /**
   * Revision function for MID 0901
   * Since MID 0901 does not have revisions, this function can return an empty array or be omitted.
   * Here, we return an empty array to indicate no revisions are supported.
   * @returns {number[]} - Array of supported revision numbers (empty in this case)
   */
  static revision() {
    return []; // No revisions for MID 0901
  }
}

module.exports = {
  parser: MID0901.parser,
  serializer: MID0901.serializer,
  revision: MID0901.revision,
};
