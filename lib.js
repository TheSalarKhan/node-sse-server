function debugLog(objToLog) {
    if(process.env.DEBUG_LOGS === "true") {
        console.log(objToLog);
    }
}

/**
 * channels: {
 *  'channel1': {
 *      lastValue: "last_published_value_here",
 *      clients: {
 *          "client1": client1ResObject,
 *          "client2": client2ResObject,
 *          "client3": client3ResObject
 *      }
 *   },
 *  'channel2': {
 *  ...
 *  }
 *
 * }
 */
let channels = {};

/**
 * Publishes the data to a single client.
 * @param {string} channelName name of the channel
 * @param {object} res express res object for the client
 * @param {string} eventType name of the event
 * @param {string} payload string to publish to the client.
 */
function publishDataToSingleClient(channelName, res, eventType, payload) {
    const dataToWrite = JSON.stringify({ channelName, type: eventType, payload: payload+"" });
    res.write(`event: ${eventType}\n`)
    res.write(`data: ${dataToWrite}\n\n`);
}

/**
 * Initializes a channel in the 'channels' object.
 * @param {*} channelName
 * @param {*} initialValue
 * @param {*} clients
 */
function createChannel(channelName, initialValue, clients={}) {
    channels[channelName] = {
        lastEvent: initialValue,
        clients
    }
}

/**
 * Saves and Subscribes client to a channel, also adding an on disconnect hook
 * that removes the client from the channel.
 * @param {*} channelName Channel identifier
 * @param {*} clientId Client identifier
 * @param {*} res Client's express res object.
 */
function saveClientToChannel(channelName, clientId, req, res) {
    // 1) if the channel already exists.
    if(channels[channelName]) {
        // 1.1) If the client list is already created, add this client
        // to the client list. Else, create the
        // client list add, this client as the first client.
        const clientsForThisChannel = channels[channelName].clients;
        if(clientsForThisChannel) {
            // save the res socket for the client to the
            // client list.
            clientsForThisChannel[clientId] = res;
        } else {
            // No clients. Add this client as the
            // first client.
            channels[channelName].clients = {
                [clientId]: res
            };
        }
    } else {
        // 2) If the channel does not exist, creat the channel, set "{}" as the lastValue,
        // add the client in the client list.
        createChannel(channelName, "{}", {
            [clientId]: res
        });
    }

    // 2) Remove the client from the clients list if
    // the client disconnects.
    req.on("close", function () {
        const clients = channels[channelName].clients;
        delete clients[clientId];

        debugLog(`Client ${clientId} removed `);
        debugLog(channels);
    });

    debugLog(`Client ${clientId} added `);
    debugLog(channels);
}

function doInitialSSESetup(req, res) {
    // Previously the timeout was set to Number.MAX_SAFE_INTEGER
    // but on everyconnection the server would throw a
    // "TimeoutOverflowWarning" saying that:
    // "Timer duration was truncated to 2147483647."
    // So, that's why this number.
    const MAX_SOCKET_TIMEOUT = 2147483647;
    // Initial setup for SSE.
	req.socket.setTimeout(MAX_SOCKET_TIMEOUT);
	res.writeHead(200, {
        'Access-Control-Allow-Origin': "*",
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive'
	});
    res.write('\n');
}

/**
 * Registers a client for the first time:
 *  i) Saves it to the channel
 *  ii) send initial messages.
 * @param {[string]} channelNames
 * @param {*} clientId
 * @param {*} res
 */
module.exports.registerClient = function (channelNames, clientId, req, res) {
    // Set timeout and headers.
    doInitialSSESetup(req, res);
    // Send the client id to the client for debugging purposes.
    // TODO: Need to add logging for client trace.
    publishDataToSingleClient(undefined, res, "registered", JSON.stringify({ clientId }));
    for(const channelName of channelNames) {
        saveClientToChannel(channelName, clientId, req, res);
        const lastChannelEvent = channels[channelName].lastEvent;
        publishDataToSingleClient(channelName, res, "lastEvent", lastChannelEvent);
    }
}

module.exports.reservedEvents = ["registered", "lastEvent"];


module.exports.publishDataToChannel = function (channelName, eventType, payload) {
    if(module.exports.reservedEvents.includes(eventType)) {
        throw Error(`Can't fire event "${eventType}", it's reserved.`);
    }
    const channel = channels[channelName];
    if(!channel) {
        createChannel(channelName, payload);
        return;
    } else {
        channel.lastEvent = JSON.stringify({ type: eventType, payload });
        const clients = channel.clients;
        for (clientId in clients) {
            publishDataToSingleClient(channelName, clients[clientId], eventType, payload);
        };
    }
}
