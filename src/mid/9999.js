//@ts-check
/*
  Copyright: (c) 2018-2020, Smart-Tech Controle e Automação
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

function parser(msg, opts, cb) {
    let buffer = msg.payload;

    // Convert buffer to ASCII and normalize fields if missing
    let payload = buffer.toString("ascii").trim();

    // Ensure Station_id and Spindle_id default to "00" if missing
    msg.stationId = msg.stationId || "00";
    msg.spindleId = msg.spindleId || "00";

    // Attach normalized payload to message
    msg.payload = payload;

    cb(null, msg);
}

function serializer(msg, opts, cb) {
    // Normalize Station_id and Spindle_id before serialization
    let stationId = msg.stationId || "00";
    let spindleId = msg.spindleId || "00";

    // Construct the serialized payload
    let serializedPayload = `${stationId}${spindleId}${msg.payload || ""}`;

    // Convert to Buffer for serialization
    let buf = Buffer.from(serializedPayload, "ascii");

    msg.payload = buf;
    cb(null, msg);
}

function revision() {
    return [1];
}

module.exports = {
    parser,
    serializer,
    revision
};
