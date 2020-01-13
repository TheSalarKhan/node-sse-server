This is a microservice meant for streaming data via SSE HTTP channels.

For an explanation of SSE watch this video: https://www.youtube.com/watch?v=71hId_-Iwqc


## Example

npm install
```
$ npm i
```

Start the dev server
```
$ npm run dev
```

### Subscribe
To subscribe use EventSource object.
```
<!DOCTYPE html> <html> <body>
	<script type="text/javascript">
		const channelsToSubscribe = ["channel1", "channel2"];
		const source = new EventSource(`http://localhost:9090/subscribe/?channels=${encodeURIComponent(channelsToSubscribe.join(","))}`);

		function _getEventData(event) {
			const data = JSON.parse(event.data);
			const { channelName, type, payload } = data;
			return channelName ? {
				channelName,
				type,
				payload
			} : {
				type,
				payload
			};
		}
		// Fires once on a successful subscription.
		source.addEventListener("registered", (event) => {
			console.log(_getEventData(event));
		});
		// Fires once for every subscribed channel, giving the last
		// published value on that channel or "{}"
		source.addEventListener("lastEvent", (event) => {
			console.log(_getEventData(event));
		});
		// Fires on receiving an event of eventType "message"
		// for a channel.
		source.addEventListener("message", (event) => {
			document.body.innerHTML += event.data + "<br>";
		});
		// Fires on receiving an event of eventType "foo"
		source.addEventListener("foo", (event) => {
			document.body.innerHTML += event.data + "<br>";
		});
		// Fires on receiving an event of eventType "bar"
		source.addEventListener("bar", (event) => {
			document.body.innerHTML += event.data + "<br>";
		});
	</script>
</body> </html>
```

### Publish
To publish do the following post call. We can post to multiple channels with multiple events
in a single request. The event listener corresponding to 'eventType' will be fired on all clients connected to the respective channels.

For example this request will fire the following events on channel "channel1": "message", "foo".
And it will fire the following events on channel "channel2": "message", "bar".
```

method:
	POST
url:
	http://localhost:3000/publish
headers:
	'Content-Type': 'application/json'
body:
	{
		"events": [
			{
				"channelName": "channel1",
				"type": "message",
				"payload": "{ \"location\": \"123.44,34.234234\"}"
			},
			{
				"channelName": "channel1",
				"type": "foo",
				"payload": "{ \"message\": \"Hi fooo\"}"
			},
			{
				"channelName": "channel2",
				"type": "message",
				"payload": "{ \"location\": \"123.44,872938.99\"}"
			},
			{
				"channelName": "channel2",
				"type": "bar",
				"payload": "{ \"location\": \"123.44\"}"
			}
		]
	}
```

## TODOS
```
* Security: Token or Secret based.
```
