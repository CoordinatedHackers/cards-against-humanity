// https://github.com/nko4/website/blob/master/module/README.md#nodejs-knockout-deploy-check-ins
require('nko')('--91jAYB4WnLzw4a');
var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server);

var isProduction = (process.env.NODE_ENV === 'production');
var http = require('http');
var port = (isProduction ? 80 : 5000);

app.use(express.static(__dirname + '/public'));

app.get("/", function(req, res) {
	res.send("Oh Herrow World");
});

io.sockets.on("connection", function(socket) {
	socket.on("yo", function(data) {
		console.log("Yo", data);
		socket.emit("yo", {oh: "herrow"});
	});
});

server.listen(port, function(err) {
  if (err) { console.error(err); process.exit(-1); }

  // if run as root, downgrade to the owner of this file
  if (process.getuid() === 0) {
    require('fs').stat(__filename, function(err, stats) {
      if (err) { return console.error(err); }
      process.setuid(stats.uid);
    });
  }

  console.log('Server running at http://0.0.0.0:' + port + '/');
});

