//@ts-check
/*
  Tests for MID0901 Trace Plot Parameters Message
*/

const { expect } = require("chai");
const MID = require("../src/mid/0901.js");
const codes = require("../src/constants.json");

describe("MID 0901", () => {
  it("Parser rev 1 with data fields", (done) => {
    let msg = {
      mid: 901,
      revision: 1,
      payload: Buffer.from(
        "00000012342023-11-25:12:34:56002" +
          "00001" + // Parameter ID (5 bytes)
          "005" + // Length (3 bytes)
          "01" + // Data Type (2 bytes)
          "001" + // Unit (3 bytes)
          "0001" + // Step Number (4 bytes)
          "ABCDE" + // Data Value (length 5)
          "00002" + // Parameter ID
          "003" + // Length
          "02" + // Data Type (2 bytes)
          "001" + // Unit (3 bytes)
          "0002" + // Step Number (4 bytes)
          "123" // Data Value
      ),
    };

    MID.parser(msg, {}, (err, data) => {
      if (err) return done(err);

      expect(data.payload).to.have.property("resultID", 1234);
      expect(data.payload).to.have.property("timeStamp", "2023-11-25:12:34:56");
      expect(data.payload).to.have.property("numberOfPIDs", 2);
      expect(data.payload)
        .to.have.property("dataFields")
        .that.is.an("array")
        .with.length(2);

      expect(data.payload.dataFields[0]).to.deep.equal({
        parameterID: "00001",
        parameterName: codes.PID["00001"] || "",
        length: 5,
        dataType: 1,
        unit: "001",
        unitName: codes.UNIT["001"] || "",
        stepNumber: 1,
        dataValue: "ABCDE",
      });

      expect(data.payload.dataFields[1]).to.deep.equal({
        parameterID: "00002",
        parameterName: codes.PID["00002"] || "",
        length: 3,
        dataType: 2,
        unit: "001",
        unitName: codes.UNIT["001"] || "",
        stepNumber: 2,
        dataValue: "123",
      });

      done();
    });
  });

  it("Serializer rev 1 for subscription", (done) => {
    let msg = {
      mid: 901,
      revision: 1,
    };

    MID.serializer(msg, {}, (err, data) => {
      if (err) return done(err);

      expect(data.payload).to.be.instanceof(Buffer);
      expect(data.payload.length).to.equal(0); // No payload for subscription

      done();
    });
  });

  it("Serializer rev 1 for MID0008 subscription", (done) => {
    let msg = {
      mid: 8,
      revision: 1,
    };

    MID.serializer(msg, {}, (err, data) => {
      if (err) return done(err);

      expect(data.mid).to.equal(8);
      expect(data.payload.toString()).to.equal("0901");

      done();
    });
  });

  it("Serializer rev 1 for MID0009 unsubscription", (done) => {
    let msg = {
      mid: 9,
      revision: 1,
    };

    MID.serializer(msg, {}, (err, data) => {
      if (err) return done(err);

      expect(data.mid).to.equal(9);
      expect(data.payload.toString()).to.equal("0901");

      done();
    });
  });

  it("Parser should return error for unsupported revision", (done) => {
    let msg = {
      mid: 901,
      revision: 2,
      payload: Buffer.alloc(0),
    };

    MID.parser(msg, {}, (err, data) => {
      expect(err).to.be.an("error");
      expect(err.message).to.include("Revision 2 not supported");
      done();
    });
  });

  it("Serializer acknowledgment", (done) => {
    let msg = {
      mid: 901,
      revision: 1,
      isAck: true,
    };

    MID.serializer(msg, {}, (err, data) => {
      if (err) return done(err);

      expect(data.mid).to.equal(5); // MID0005 Command accepted
      expect(data.payload.toString()).to.equal("0901");

      done();
    });
  });

  it("Parser handles partial data fields gracefully", (done) => {
    let msg = {
      mid: 901,
      revision: 1,
      payload: Buffer.from(
        "00000012342023-11-25:12:34:56001" + // One PID but incomplete data
          "00001" + // Parameter ID
          "005" // Length but missing rest of the field
      ),
    };

    MID.parser(msg, {}, (err, data) => {
      expect(err).to.be.an("error");
      expect(err.message).to.include("Incomplete data field");
      done();
    });
  });
});
