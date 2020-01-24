const express = require('express');
const bodyParser = require("body-parser");
const lib = require('./lib');


// Express App starts from here.
let app = express();
const maxRequestSize = 100; // 100KB of publish is allowed at max.
app.use(bodyParser.json({ limit: maxRequestSize * 1024 }));

app.get('/', function (req, res) {
	res.status(200).end("ROOT");
});

// AutoIncrement clientId.
let clientId = 0;

// Called once for each new client. Note, this response is left open!
app.get('/subscribe', function (req, res) {
    if(!req.query.channels) {
        res.status(400).end("Bad Request");
        return;
    }

    // Get channelNames from the query params
    // get auto incremented clientId.
    const channelNames = req.query.channels.split(',');
    const newClientId = req.query.clientId ? req.query.clientId : ++clientId;

    // Initial setup for SSE.
	req.socket.setTimeout(Number.MAX_SAFE_INTEGER);
	res.writeHead(200, {
        'Access-Control-Allow-Origin': "*",
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive'
	});
    res.write('\n');

    // Reister client.
    lib.registerClient(channelNames, newClientId, req, res);
});

app.post('/publish/', function(req, res) {
    let { events } = req.body;
    if(!events) {
        events = [];
    }

    // Validation for any reserved events.
    for(const event of events) {
        const { type } = event;
        if(lib.reservedEvents.includes(type)) {
            res.status(400).end(`Event type "${type}" is reserved, can't fire!`);
            return;
        }
    }

    // Now fire all events.
    for(const event of events) {
        const {channelName, type, payload} = event;
        if(!channelName || !type || !payload) {
            res.status(400).end("Bad Request: 'channelName', 'eventType', and 'payload' are three required json fields in body.");
        }
        try {
            lib.publishDataToChannel(channelName, type, payload);
        } catch(err) {
            console.log(err);
            errors.push(err.message);
        }
    }

    res.status(200).end();
});

app.listen(process.env.PORT || 9090, () => {
    console.log(`Server listening on port: ${process.env.PORT || 9090}`);
});