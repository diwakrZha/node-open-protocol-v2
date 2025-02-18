//@ts-check
/*
  Copyright: (c) 2018-2020, Smart-Tech Controle e Automação
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const { expect } = require("chai");

const LinkLayer = require("../src/linkLayer.js");
const Duplex = require("stream").Duplex;

function createStreamHelper(cbWrite) {
  let stream = new Duplex({
    read(size) {},
    write(chunk, encoding, cb) {
      cbWrite(chunk);
      cb();
    },
  });
  return stream;
}

function destroyStream(stream) {
  // handles Node versions older than 8.x
  if (typeof stream.destroy === "function") {
    stream.destroy();
  } else {
    stream._destroy();
  }
}

describe("LINK LAYER", () => {
  beforeEach(function () {
    this.timeout(5000); // Set a default timeout for all tests
  });

  // Helper to determine `disableMidParsing` behavior
  const shouldDisableMidParsing = (mid) => {
    return mid === 2; // Example logic for specific MID
  };

  it("Should do Basic communication with Link Layer active", (done) => {
    let step = 0;

    let stream = createStreamHelper((data) => {
      switch (step) {
        case 0:
          //send 9997
          stream.push(Buffer.from("00249997001     02  0001\u0000"));
          stream.push(
            Buffer.from(
              "00570002001     01  010001020103Teste Airbag             \u0000"
            )
          );
          step += 1;
          break;

        case 1:
          stream.push(Buffer.from("00240038002     02  8787\u0000"));
          step += 1;
          break;
      }
    });

    // Preprocess `disableMidParsing` based on a specific condition
    const disableMidParsing = shouldDisableMidParsing(2); // Pass MID 2 condition

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3, // Add required properties
      disableMidParsing: false, // Ensure boolean compatibility
      rawData: false,
    });

    linkLayer.on("data", (data) => {
      if (data.mid === 38) {
        destroyStream(linkLayer);
        done();
      }
    });

    linkLayer.on("error", (err) => {});

    let mid = {
      mid: 1,
    };

    linkLayer.activateLinkLayer();
    linkLayer.write(mid);
  });
  it("Should test resend message for timeout", (done) => {
    let receiver = [];

    let stream = createStreamHelper((data) => {
      receiver.push(data);
    });

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3,
      disableMidParsing: false,
      rawData: false,
    });

    linkLayer.on("data", (data) => {});

    linkLayer.activateLinkLayer();

    linkLayer.write(
      {
        mid: 5,
        payload: {
          midNumber: 8787,
        },
      },
      (err) => {
        expect(receiver).to.have.lengthOf(4); // initial write + 3 retries
        expect(err).to.be.an("error");
        destroyStream(linkLayer);
        done();
      }
    );
  });

  it("Should throw an error when Link Layer is instantiated without valid options", (done) => {
    expect(() => new LinkLayer({})).to.throw("[LinkLayer] Socket is undefined");
    done();
  });

  it("Should receiver message with multi parts", (done) => {
    let receiver = [];

    let obj = {
      mid: 2,
      revision: 1,
      noAck: false,
      stationID: 1,
      spindleID: 1,
      sequenceNumber: 0,
      messageParts: 3,
      messageNumber: 3,
      payload: {
        cellID: 5656,
        channelID: 98,
        controllerName: "Teste Diego - Airbag",
      },
    };

    let stream = createStreamHelper((data) => {});

    // Preprocess `disableMidParsing` based on a specific condition
    const disableMidParsing = shouldDisableMidParsing(2); // Pass MID 2 condition

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3, // Add required properties
      disableMidParsing: false, // Ensure boolean compatibility
      rawData: false,
    });

    linkLayer.on("data", (data) => {
      expect(obj).to.be.deep.equal(data);
      destroyStream(linkLayer);
      done();
    });

    linkLayer.on("error", (err) => {});

    stream.push(Buffer.from("00260002001       31015656\u0000"));
    stream.push(Buffer.from("00240002001       320298\u0000"));
    stream.push(
      Buffer.from("00470002001       3303Teste Diego - Airbag     \u0000")
    );
  });

  it("Should return error message multi parts with error in message number", (done) => {
    let stream = createStreamHelper((data) => {});

    // Preprocess `disableMidParsing` based on a specific condition
    const disableMidParsing = shouldDisableMidParsing(2); // Pass MID 2 condition

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3, // Add required properties
      disableMidParsing: false, // Ensure boolean compatibility
      rawData: false,
    });

    linkLayer.on("data", (data) => {});

    linkLayer.on("error", (err) => {
      expect(err).to.be.an("error");
      destroyStream(linkLayer);
      done();
    });

    stream.push(Buffer.from("00300002001       310156560298\u0000"));
    stream.push(
      Buffer.from("00470002001       3303Teste Diego - Airbag     \u0000")
    );
  });
  it("Should return error on check of link layer", (done) => {
    let step = 0;

    let stream = createStreamHelper((data) => {
      if (step === 0) {
        stream.push(Buffer.from("00289998001     02  00010001\u0000"));
        step += 1;
      }
    });

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3,
      disableMidParsing: false,
      rawData: false,
    });

    linkLayer.on("data", (data) => {});

    linkLayer.activateLinkLayer();

    linkLayer.write(
      {
        mid: 1,
      },
      (err) => {
        expect(err).to.be.an("error");
        destroyStream(linkLayer);
        done();
      }
    );
  });
  it("Should return 5 messages with a big message parsed", (done) => {
    let receiver = [];
    let totalPayloadLength = 45000;
    let expectedMessageParts = Math.ceil(totalPayloadLength / 9979);

    let stream = createStreamHelper((data) => {
      receiver.push(data);

      if (receiver.length === expectedMessageParts) {
        stream.push(Buffer.from("002499970010000002002525\u0000"));

        // Reconstruct the payload from received messages
        let receivedPayload = Buffer.concat(
          receiver.map((msgBuffer) => {
            // Assuming the header is 20 bytes and there's a NULL terminator
            return msgBuffer.slice(20, msgBuffer.length - 1);
          })
        );

        // Original payload is 45000 bytes of zeros
        let originalPayload = Buffer.alloc(totalPayloadLength);

        expect(receivedPayload).to.deep.equal(originalPayload);

        destroyStream(linkLayer);
        done();
      }
    });

    const disableMidParsing = shouldDisableMidParsing(2);

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3,
      disableMidParsing: false,
      rawData: false,
    });

    linkLayer.on("data", (data) => {});

    linkLayer.on("error", (err) => {});

    linkLayer.activateLinkLayer();

    // Prepare a large message to trigger splitting
    let obj = {
      mid: 2525,
      payload: Buffer.alloc(totalPayloadLength),
    };

    linkLayer.write(obj);
  });

  it("Should return error message.payload greater than 89811 bits", (done) => {
    let stream = createStreamHelper((data) => {});

    const disableMidParsing = shouldDisableMidParsing(2);

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3,
      disableMidParsing: false,
      rawData: false,
    });

    linkLayer.on("data", (data) => {});

    linkLayer.on("error", (err) => {
      expect(err).to.be.an("error");
      destroyStream(linkLayer);
      done();
    });

    linkLayer.activateLinkLayer();

    let largePayload = Buffer.alloc(112264, "A"); // Payload exceeding 89811 bits

    linkLayer.write({
      mid: 2525,
      payload: largePayload,
    });
  });
  it("Should return error on serializer MID with information wrong", (done) => {
    let stream = createStreamHelper((data) => {});

    const disableMidParsing = shouldDisableMidParsing(2);

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3,
      disableMidParsing: disableMidParsing,
      rawData: true,
    });

    linkLayer.on("data", (data) => {});

    // Listen to 'errorSerializer' event
    linkLayer.on("errorSerializer", (err) => {
      expect(err).to.be.an("error");
      destroyStream(linkLayer);
      done();
    });

    linkLayer.deactivateLinkLayer();

    linkLayer.write({
      mid: 2,
      revision: 1,
      payload: {
        cellID: "AAAA", // Invalid numeric field
        channelID: "01",
        controllerName: "Testes",
      },
    });
  });
  it("Should return error on serializer Header with wrong information", (done) => {
    let stream = createStreamHelper((data) => {});

    const disableMidParsing = shouldDisableMidParsing(2);

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3,
      disableMidParsing: disableMidParsing,
      rawData: true,
    });

    linkLayer.on("data", (data) => {});

    // Listen to 'errorSerializer' event
    linkLayer.on("errorSerializer", (err) => {
      expect(err).to.be.an("error");
      destroyStream(linkLayer);
      done();
    });

    linkLayer.deactivateLinkLayer();

    linkLayer.write({
      mid: 2,
      revision: 1,
      stationID: "A", // Invalid numeric field
      payload: {
        cellID: 15,
        channelID: 2,
        controllerName: "Testes",
      },
    });
  });
  it("Should return error on parser MID with wrong information", (done) => {
    let stream = createStreamHelper((data) => {});

    const disableMidParsing = shouldDisableMidParsing(2);

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3,
      disableMidParsing: false,
      rawData: true,
    });

    linkLayer.on("data", (data) => {});

    linkLayer.on("error", (err) => {
      expect(err).to.be.an("error");
      destroyStream(linkLayer);
      done();
    });

    linkLayer.deactivateLinkLayer();

    // Send a buffer with invalid MID format to trigger parser error
    stream.push(Buffer.from("0020ABC001        \u0000")); // 'ABC' is invalid MID
  });

  it("Should return error on parser Header with wrong information", (done) => {
    let stream = createStreamHelper((data) => {});

    const disableMidParsing = shouldDisableMidParsing(2);

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3,
      disableMidParsing: false,
      rawData: true,
    });

    linkLayer.on("data", (data) => {});

    linkLayer.on("error", (err) => {
      expect(err).to.be.an("error");
      destroyStream(linkLayer);
      done();
    });

    linkLayer.deactivateLinkLayer();

    // Send a buffer with invalid header data
    stream.push(
      Buffer.from(
        "0057AA02001     01  010001020103Teste Airbag             \u0000"
      )
    );
    // 'AA' in the length field should trigger a parsing error
  });

  it("Should return error on receiver sequence number wrong", (done) => {
    let stream = createStreamHelper((data) => {});

    // Preprocess `disableMidParsing` based on a specific condition
    const disableMidParsing = shouldDisableMidParsing(2); // Pass MID 2 condition

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3, // Add required properties
      disableMidParsing: disableMidParsing, // Ensure boolean compatibility
      rawData: true,
    });

    linkLayer.on("data", (data) => {});

    linkLayer.on("error", (err) => {
      destroyStream(linkLayer);
      expect(err).to.be.an("error");
      done();
    });

    linkLayer.activateLinkLayer();

    stream.push(
      Buffer.from(
        "00570002001000000100018787020203Teste - Airbag           \u0000"
      )
    );
    stream.push(
      Buffer.from(
        "00570002001000000200018787020203Teste - Airbag           \u0000"
      )
    );
    stream.push(
      Buffer.from(
        "00570002001000000500018787020203Teste - Airbag           \u0000"
      )
    );
  });

  it("Should receiver multiple resend menssage", (done) => {
    let step = 0;
    let receiverACK = [];

    let stream = createStreamHelper((data) => {
      //console.log("Receiver: ", data.toString("ascii"), cont);

      receiverACK.push(data);

      switch (step) {
        case 0:
          stream.push(Buffer.from("00249997001     02  0001\u0000"));
          stream.push(
            Buffer.from(
              "00570002001     01  010001020103Teste Airbag             \u0000"
            )
          );
          step += 1;
          break;

        case 1:
          stream.push(Buffer.from("00240038002     02  8787\u0000"));
          step += 1;
          break;

        case 2:
          stream.push(Buffer.from("00240038002     02  8787\u0000"));
          step += 1;
          break;

        case 3:
          stream.push(Buffer.from("00240038002     02  8787\u0000"));
          step += 1;
          break;

        case 4:
          stream.push(Buffer.from("00240038002     02  8787\u0000"));
          step += 1;
          break;

        case 5:
          stream.push(Buffer.from("00220039001     03  55\u0000"));
          step += 1;
          break;
      }
    });

    // Preprocess `disableMidParsing` based on a specific condition
    const disableMidParsing = shouldDisableMidParsing(2); // Pass MID 2 condition

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3, // Add required properties
      disableMidParsing: false, // Ensure boolean compatibility
      rawData: false,
    });

    linkLayer.on("data", (data) => {
      //console.log("DATA: ", JSON.stringify(data));
      if (data.mid === 39) {
        expect(receiverACK).to.be.length(7);
        destroyStream(linkLayer);
        done();
      }
    });

    linkLayer.on("error", (err) => {});

    linkLayer.activateLinkLayer();
    linkLayer.write({
      mid: 1,
    });
  });

  it("Should receiver raw data", (done) => {
    let stream = createStreamHelper((data) => {
      //console.log("Receiver: ", data.toString("ascii"));
    });

    // Preprocess `disableMidParsing` based on a specific condition
    const disableMidParsing = shouldDisableMidParsing(2); // Pass MID 2 condition

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3, // Add required properties
      disableMidParsing: disableMidParsing, // Ensure boolean compatibility
      rawData: true,
    });

    linkLayer.on("data", (data) => {
      //console.log("DATA: ", data);

      let mid = {
        mid: 2,
        revision: 1,
        noAck: false,
        stationID: 1,
        spindleID: 1,
        sequenceNumber: 1,
        messageParts: 0,
        messageNumber: 0,
        payload: {
          cellID: 1,
          channelID: 1,
          controllerName: "Teste Airbag",
        },
        _raw: Buffer.from(
          "00570002001     01  010001020103Teste Airbag             \u0000"
        ),
      };

      expect(data).to.be.deep.equal(mid);
      destroyStream(linkLayer);
      done();
    });

    linkLayer.on("error", (err) => {
      //console.log("Error: ", err);
    });

    stream.push(
      Buffer.from(
        "00570002001     01  010001020103Teste Airbag             \u0000"
      )
    );
  });
  it("Should receive mid not parsing", (done) => {
    let stream = createStreamHelper((data) => {});

    const disableMidParsing = { 2: true };

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3,
      disableMidParsing: disableMidParsing,
      rawData: false, // rawData is false to not include _raw
    });

    linkLayer.on("data", (data) => {
      let expectedData = {
        mid: 2,
        revision: 1,
        noAck: false,
        stationID: 1,
        spindleID: 1,
        sequenceNumber: 1,
        messageParts: 0,
        messageNumber: 0,
        payload: Buffer.from("010001020103Teste Airbag             "),
      };

      expect(data).to.deep.equal(expectedData);
      destroyStream(linkLayer);
      done();
    });

    linkLayer.on("error", (err) => {
      // Handle error if necessary
    });

    stream.push(
      Buffer.from(
        "00570002001     01  010001020103Teste Airbag             \u0000"
      )
    );
  });
  it("Should receive mid not parsing and raw data", (done) => {
    let stream = createStreamHelper((data) => {});

    const disableMidParsing = { 2: true };

    let linkLayer = new LinkLayer({
      stream: stream,
      timeOut: 200,
      retryTimes: 3,
      disableMidParsing: disableMidParsing,
      rawData: true, // Include _raw in the output
    });

    linkLayer.on("data", (data) => {
      let expectedData = {
        mid: 2,
        revision: 1,
        noAck: false,
        stationID: 1,
        spindleID: 1,
        sequenceNumber: 1,
        messageParts: 0,
        messageNumber: 0,
        payload: Buffer.from("010001020103Teste Airbag             "),
        _raw: Buffer.from(
          "00570002001     01  010001020103Teste Airbag             \u0000"
        ),
      };

      expect(data).to.deep.equal(expectedData);
      destroyStream(linkLayer);
      done();
    });

    linkLayer.on("error", (err) => {
      // Handle error if necessary
    });

    stream.push(
      Buffer.from(
        "00570002001     01  010001020103Teste Airbag             \u0000"
      )
    );
  });
});
