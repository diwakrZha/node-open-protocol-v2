//@ts-check
/*
  Enhanced logging added to capture all responses, acknowledgments, and errors from the simulator.
*/

const op = require("node-open-protocol-v2");
const chalk = require("chalk"); // Import chalk using CommonJS

// Define color schemes for different log types
const colors = {
  info: chalk.cyan,
  request: chalk.blue,
  response: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
};

// Mapping of commands to their respective MID numbers
const commandMIDMap = {
  communicationStop: "MID0003",
  selectParameterSet: "MID0018",
  disableTool: "MID0042",
  enableTool: "MID0043",
  vehicleIdNumberDownload: "MID0050",
  abortJob: "MID0127",
};

// Configuration
const ipControlador = "192.168.178.71"; //"172.26.138.52"
const portControlador = 4545;

const optsSessionControl = {
  // Configuration for Session Control
  defaultRevisions: undefined, // {"mid": rev, "mid": rev}
  linkLayerActivate: undefined, // true activate / false not activate / undefined autoNegotiation
  genericMode: false, // true activate / false or undefined not activate
  keepAlive: undefined, // Number, default 10000

  // LinkLayer Configurations
  rawData: undefined, // true activate / false or undefined not activate
  disableMidParsing: undefined, // true activate / false or undefined not activate
  timeOut: undefined, // Number, default 3000
  retryTimes: undefined, // Number, default 3
};

// Initiate connection with detailed logging
const sc = connect();

function connect() {
  logInfo("Initiating connection to server...");
  return op.createClient(
    portControlador,
    ipControlador,
    optsSessionControl,
    (data) => {
      logInfo("Connection established.");
      logResponse(
        `MID0002 - Connection Acknowledgment Data:`,
        JSON.stringify(data)
      );

      // Emit a custom event indicating the connection is established
      sc.emit("connected");
    }
  );
}

// Event logging for errors
sc.on("error", (err) => {
  logError("[Event][SessionControl][onError]", err);
});

// Event logging for data received
sc.on("data", (data) => {
  logInfo("[Event][SessionControl][onData]", JSON.stringify(data));
});

// Capture and log when connection closes
sc.on("close", (err) => {
  logInfo("[Event][SessionControl][onClose]", err);
});

// Event for raw data sent and received for debugging response content
sc.on("rawDataSent", (data) => {
  logInfo("Raw data sent (Hex):", Buffer.from(data).toString("hex"));
});

sc.on("rawDataReceived", (data) => {
  logInfo("Raw data received (ASCII):", data.toString());
  logInfo("Raw data received (Hex):", Buffer.from(data).toString("hex"));
});

// Detailed logging of all responses and errors for commands
function onCallback(type, param, midNumber, err, data) {
  if (err) {
    logError(`[${type}][${param}][MID: ${midNumber}][Error]`, err.message, {
      stack: err.stack,
      ...err.additionalInfo, // If available
    });
  } else {
    logResponse(
      `[${type}][${param}][MID: ${midNumber}][Reply]`,
      JSON.stringify(data)
    );
  }
}

// Commands and Subscriptions with Enhanced Logging
//--> COMMANDS
//MID 0003
function commandCommunicationStop() {
  const midNumber = commandMIDMap.communicationStop;
  logRequest(`[${midNumber}] Sending Command: communicationStop`);
  sc.command("communicationStop", (err, data) => {
    onCallback("Command", "communicationStop", midNumber, err, data);
  });
}

//MID 0018
function commandSelectParameterSet(pset) {
  const midNumber = commandMIDMap.selectParameterSet;
  let opts = {
    payload: {
      parameterSetID: pset,
    },
  };
  logRequest(
    `[${midNumber}] Sending Command: selectParameterSet with pset=${pset}`
  );
  sc.command("selectParameterSet", opts, (err, data) => {
    onCallback("Command", "selectParameterSet", midNumber, err, data);
  });
}

//MID 0042
function commandDisableTool() {
  const midNumber = commandMIDMap.disableTool;
  logRequest(`[${midNumber}] Sending Command: disableTool`);
  sc.command("disableTool", (err, data) => {
    onCallback("Command", "disableTool", midNumber, err, data);
  });
}

//MID 0043
function commandEnableTool() {
  const midNumber = commandMIDMap.enableTool;
  logRequest(`[${midNumber}] Sending Command: enableTool`);
  sc.command("enableTool", (err, data) => {
    onCallback("Command", "enableTool", midNumber, err, data);
  });
}

//MID 0050 - Vehicle ID
function commandVehicleIdNumberDownload(numberVIN) {
  const midNumber = commandMIDMap.vehicleIdNumberDownload;
  let opts = {
    payload: {
      numberVIN,
    },
  };
  logRequest(
    `[${midNumber}] Sending Command: vehicleIdNumberDownload with VIN=${numberVIN}`
  );
  sc.command("vehicleIdNumberDownload", opts, (err, data) => {
    onCallback("Command", "vehicleIdNumberDownload", midNumber, err, data);
  });
}

//MID 0127 - Abort Job
function commandAbortJob() {
  const midNumber = commandMIDMap.abortJob;
  logRequest(`[${midNumber}] Sending Command: abortJob`);
  sc.command("abortJob", (err, data) => {
    onCallback("Command", "abortJob", midNumber, err, data);
  });
}
//--> END COMMANDS

//--> SUBSCRIPTIONS with detailed logging
//MID 0014 - Pset Selected
function subscribePsetSelected() {
  logRequest("Subscribing to psetSelected");
  sc.subscribe("psetSelected", (err, data) => {
    const midNumber = "MID0014";
    onCallback("Subscribe", "psetSelected", midNumber, err, data);
  });

  setListener("psetSelected");
}

//MID 0070 - Alarm
function subscribeAlarm() {
  logRequest("Subscribing to alarm, alarmAcknowledged, and alarmStatus");
  sc.subscribe("alarm", (err, data) => {
    const midNumber = "MID0070";
    onCallback("Subscribe", "alarm", midNumber, err, data);
  });

  setListener("alarm");
  setListener("alarmAcknowledged");
  setListener("alarmStatus");
}

//MID 0051 - VIN
function subscribeVin() {
  logRequest("Subscribing to vin");
  sc.subscribe("vin", (err, data) => {
    const midNumber = "MID0051";
    onCallback("Subscribe", "vin", midNumber, err, data);
  });

  setListener("vin");
}

//MID 0061 - Last Tightening
function subscribeLastTightening() {
  logRequest("Subscribing to lastTightening");
  sc.subscribe("lastTightening", (err, data) => {
    const midNumber = "MID0061";
    onCallback("Subscribe", "lastTightening", midNumber, err, data);
  });

  setListener("lastTightening");
}
//--> END SUBSCRIPTIONS

// Helper function to log listener events for all message types
function setListener(type) {
  sc.on(type, (data) => {
    logInfo(`[Event][onData][${type}]`, JSON.stringify(data));
  });
}

// Logging Helper Functions
function logInfo(message, ...optionalParams) {
  console.log(colors.info(message), ...optionalParams);
}

function logRequest(message, ...optionalParams) {
  console.log(colors.request(message), ...optionalParams);
}

function logResponse(message, ...optionalParams) {
  console.log(colors.response(message), ...optionalParams);
}

function logError(message, ...optionalParams) {
  console.error(colors.error(message), ...optionalParams);
}

function logWarning(message, ...optionalParams) {
  console.warn(colors.warning(message), ...optionalParams);
}

//--> Testing Sequence
function startTestSequence() {
  logInfo("Starting test sequence...");

  // Example call sequence to initiate tool commands
  commandAbortJob();
  commandSelectParameterSet(1);
  commandVehicleIdNumberDownload("ASDEDCUHBG34563EDFRCVGFR6");
  commandDisableTool();
  commandEnableTool();
}

// Start the test sequence after connection is established
sc.on("connected", () => {
  startTestSequence();
});
