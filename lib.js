function debugLog(objToLog) {
    if(process.env.DEBUG_LOGS === "true") {
        console.log((new Date().getTime() | 0));
	console.log(objToLog);
    }
}

/**
 * channels: {
 *  'channel1': {
 *      lastValue: "last_published_value_here",
 *      clients: {
 *          / *  Against each client we are saving a list of sockets, because the client maybe connected from multiple browser-tabs/devices  * /
 *          "client1": [ client1ResObject, client1ResObject2 ],
 *          "client2": [ client2ResObject, client2ResObject2 ],
 *          "client3": [ client3ResObject ]
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
function publishDataToSingleSocket(channelName, res, eventType, payload) {
    const dataToWrite = JSON.stringify({ channelName, type: eventType, payload: payload+"" });
    res.write(`event: ${eventType}\n`)
    res.write(`data: ${dataToWrite}\n\n`);
}

// This object manages online presence.
let connectedClients = {
    _clients: {},
    _broadcastChange: function() {
        for(const [clientId, sockets] of Object.entries(this._clients)) {
            for(res of sockets) {
                publishDataToSingleSocket(undefined, res, "online-presence", JSON.stringify(Object.keys(this._clients)));
            }
        }
    },
    addClientAndNotifyOthers: function(clientId, res) {
        if(!this._clients[clientId]) {
            this._clients[clientId] = [res];
        } else {
            this._clients[clientId].push(res);
        }
        this._broadcastChange();
    },
    removeClientAndNotifyOthers: function(clientId, res) {
        // If there's no such clientId, or if there are no sockets against
        // the id simply return.
        if(!this._clients[clientId] || !this._clients[clientId].length) return;
        // Remove the res object from the clients list.
        this._clients[clientId] = this._clients[clientId].filter(v => v !== res);
        // Check now if the list is of 0 length, then delete the whole
        // clientId and broadcast the change.
        if(!this._clients[clientId].length) {
            delete this._clients[clientId];
            this._broadcastChange();
        }
    }
};

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
    if(channels[channelName]) {
        // 1a.1) If the client list is already created, add this client
        // to the client list. Else, create the
        // client list add, this client as the first client.
        const clientsForThisChannel = channels[channelName].clients;
        if(clientsForThisChannel) {
            // save the res socket for the clientId to the
            // client list.
            if(clientsForThisChannel[clientId]){
                clientsForThisChannel[clientId].push(res);
            } else {
                clientsForThisChannel[clientId] = [res];
            }
        } else {
            // No clients. Add this client as the
            // first client.
            channels[channelName].clients = {
                [clientId]: [res]
            };
        }
    } else {
        // 1b) If the channel does not exist, creat the channel, set "{}" as the lastValue,
        // add the client in the client list.
        createChannel(channelName, "{}", {
            [clientId]: [res]
        });
    }

    // 2) Remove the client from the clients list if
    // the client disconnects.
    req.on("close", function () {
        const clients = channels[channelName].clients;
        // remove the associated 'res' from the clients list against the clientId.
        clients[clientId] = clients[clientId].filter(v => v !== res);
        // check if there are no more sockets left for this clientId then delete it
        // from the channel.
        if(!clients[clientId].length) {
            delete clients[clientId];
            debugLog(`Client ${clientId} removed `);
            debugLog(channels);
        }
        // Also remove the client from the connectedClients singleton.
        connectedClients.removeClientAndNotifyOthers(clientId, res);
    });

    debugLog(`Client ${clientId} added `);
    debugLog(channels);
}

function doInitialSSESetup(req, res) {
    // Initial setup for SSE.
    // Setting timeout to 0 disables idle timeout,
    // so the socket will never close because of inactivity.
    req.socket.setTimeout(0);
	// Disables the Nagle algorithm, data will not be buffered
	// and will be sent each time socket.write() is called.
    req.socket.setNoDelay(true);
    // Enable TCP keep-alive probes.
    req.socket.setKeepAlive(true);
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
    publishDataToSingleSocket(undefined, res, "registered", JSON.stringify({ clientId }));
    // Add the client to all the requested channels
    for(const channelName of channelNames) {
        saveClientToChannel(channelName, clientId, req, res);
        const lastChannelEvent = channels[channelName].lastEvent;
        publishDataToSingleSocket(channelName, res, "lastEvent", lastChannelEvent);
    }
    // Finally, add the client to the connectedClients singleton and notify all
    // connected users.
    connectedClients.addClientAndNotifyOthers(clientId, res);
}

module.exports.reservedEvents = ["registered", "lastEvent", "online-presence"];


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
            for(res of clients[clientId]) {
                publishDataToSingleSocket(channelName, res, eventType, payload);
            }
        };
    }
}
