//@ts-check
/*
  Tests for MID0900 Trace Curve Data Message
*/

const { expect } = require("chai");
const MID0900 = require("../src/mid/0900.js");

describe("MID 0900", () => {
  // Test the parser for a valid payload with all fields
  it("Parser rev 1 with values", (done) => {
    let msg = {
      mid: 900,
      revision: 1,
      payload: Buffer.from(
        "12345678902018-06-04:15:00:0000100002003010228888ABC090800500198765003010226666DFE001543219876500505353QWERT65432\u000011"
      ),
    };

    MID0900.parser(msg, {}, (err, data) => {
      if (err) return done(err);

      expect(data.payload)
        .to.have.property("resolutionFields")
        .that.is.an("array")
        .with.length(1);
      expect(data.payload.resolutionFields[0]).to.deep.include({
        firstIndex: 54321,
        lastIndex: 98765,
        length: 5,
        dataType: 5,
        unit: "353",
        timeValue: "QWERT", // Ensure raw string is preserved
      });

      done();
    });
  });

  // Test the serializer for a valid subscription message
  it("Serializer rev 1 for subscription", (done) => {
    let msg = {
      mid: 900,
      revision: 1,
    };

    MID0900.serializer(msg, {}, (err, data) => {
      if (err) return done(err);

      expect(data.mid).to.equal(8); // Subscription uses MID0008
      expect(data.payload.toString()).to.include("0900"); // Check payload for MID0900

      done();
    });
  });

  // Test the serializer for a valid unsubscription message
  it("Serializer rev 1 for unsubscription", (done) => {
    let msg = {
      mid: 900,
      revision: 1,
      unsubscribe: true,
    };

    MID0900.serializer(msg, {}, (err, data) => {
      if (err) return done(err);

      expect(data.mid).to.equal(9); // Unsubscription uses MID0009
      expect(data.payload.toString()).to.equal("0900");

      done();
    });
  });

  // Test the parser for unsupported revision
  it("Parser should return error for unsupported revision", (done) => {
    let msg = {
      mid: 900,
      revision: 2, // Unsupported revision
      payload: Buffer.alloc(0),
    };

    MID0900.parser(msg, {}, (err, data) => {
      expect(err).to.be.an("error");
      expect(err.message).to.include("Revision 2 not supported");
      done();
    });
  });

  // Test the parser for missing resolution fields
  it("Parser handles large resolution fields", (done) => {
    let msg = {
      mid: 900,
      revision: 1,
      payload: Buffer.from(
        "12345678902018-06-04:15:00:0000100002003010228888ABC090800800543219876500805353QWERX54321065432\u000011"
      ),
    };

    MID0900.parser(msg, {}, (err, data) => {
      if (err) return done(err);

      expect(data.payload)
        .to.have.property("resolutionFields")
        .that.is.an("array")
        .with.length(2); // Ensure both resolution fields are parsed
      done();
    });
  });

  // Test the serializer acknowledgment message
  it("Serializer acknowledgment", (done) => {
    let msg = {
      mid: 900,
      revision: 1,
      isAck: true,
    };

    MID0900.serializer(msg, {}, (err, data) => {
      if (err) return done(err);

      expect(data.mid).to.equal(5); // MID0005 Command accepted
      expect(data.payload.toString()).to.equal("0900");

      done();
    });
  });

  // Test the parser for invalid data
  it("Parser should return error for invalid data", (done) => {
    let msg = {
      mid: 900,
      revision: 1,
      payload: Buffer.from("INVALID DATA"),
    };

    MID0900.parser(msg, {}, (err, data) => {
      expect(err).to.be.an("error");
      done();
    });
  });
});
