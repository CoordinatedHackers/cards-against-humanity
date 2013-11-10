// https://github.com/nko4/website/blob/master/module/README.md#nodejs-knockout-deploy-check-ins
require('nko')('--91jAYB4WnLzw4a');
var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	http = require('http');;

const isProduction = (process.env.NODE_ENV === 'production'),
	  port = (isProduction ? 80 : 5000),
	  cards = require("./cards.json");

var games = {};

app.use(express.static(__dirname + '/public'));

//Intermission
//Play
//Reveal
io.sockets.on("connection", function(socket) {
	try {
	socket.emit("rooms", Object.keys(io.sockets.manager.rooms))
	socket.on("create_game", function() {
		var game_id = Math.floor(Math.random() * 100000);
		games[game_id] = {
			players: [],
			white_deck: new Deck(cards.white),
			black_deck: new Deck(cards.black),
			state: "intermission"
		};
		socket.emit("created_game", game_id);
	}).on("join", function(game_id) {
		socket.join(game_id);
		socket.set("game_id", game_id);
		socket.broadcast.to(game_id).emit("joined", {id: socket.id, room: game_id});

		//For Testing
		io.sockets.emit("rooms", Object.keys(io.sockets.manager.rooms));

		var player = {player_id: socket.id, score: 0};
		var game = games[game_id];
		if (game) {
			if (game.players.length === 0) {
				game.card_czar = player;
				socket.emit("card_czar");
			}
			games[game_id].players.push(player);
			console.log(games);
		}
	}).on("disconnect", function() {
		socket.get("game_id", function(err, game_id) {
			if (err) throw new Error(err);
			var game = games[game_id];
			if (game) {
				game.players.some(function(player, index){
					if (player.player_id === socket.id) {
						if (game.card_czar === player) {
							//FIXME
							game.card_czar = game.players[index + 1];
						}
						game.players.splice(index, 1);
						return true;
					}
				});
				console.log("Gamestate fired");
				socket.broadcast.emit("gamestate", game);
				console.log(game);
			}
		});
	}).on("draw_black", function() {
		socket.get("game_id", function(err, game_id) {
			if (err) throw new Error(err);

			var game = games[game_id],
				current_card;

			if (game) {
				current_card = game.black_deck.draw();
				if (game.current_card !== null) {
					game.black_deck.discard(game.current_card);
				}
				socket.emit("draw_black", current_card);
				game.current_card = current_card;
				game.state = "play";
			} else {
				socket.emit("error", "No Game");
			}
		});
	}).on("draw_white", function(how_many, cb) {
		socket.get("game_id", function(err, game_id) {
			if (err) throw new Error(err);

			var game = games[game_id],
				cards = [];

			if (game) {
				while (how_many--) {
					cards.push(game.white_deck.draw());
				}
				cb(cards);
			} else {
				socket.emit("error", "No Game");
			}
		});
	}).on("submit_cards", function(cards) {
		socket.get("game_id", function(err, game_id) {
			if (err) throw new Error(err);

			var game = games[game_id];

			if (game) {
				game.played_cards.push(cards);
				if (game.played_cards.length === game.players.length) {
					game.state = "reveal";
					socket.broadcast.to(game_id).emit("submitted_cards", game.played_cards);
				} else {
					socket.broadcast.to(game_id).emit("played_cards", game.played_cards.length);
				}
			} else {
				socket.emit("error", "No Game");
			}
		});
	}).on("pick_winner", function(card) {
		socket.get("game_id", function(err, game_id) {
			if (err) throw new Error(err);

			var game = games[game_id];

			if (game) {
				if (game.card_czar.player_id === socket.id) {
					game.state = "intermission";
					//Need the winning card's player
					socket.broadcast.to(game_id).emit("submitted_cards", game.played_cards);
				} else {
					socket.broadcast.to(game_id).emit("played_cards", game.played_cards.length);
				}
			} else {
				socket.emit("error", "No Game");
			}
		});
	}).on("gamestate", function(game_id) {
		if (game_id === undefined || game_id === "") {
			socket.get("game_id", function(err, game_id) {
				if (err) throw new Error(err);
				var game = games[game_id];
				if (game) {
					socket.emit("gamestate", game);
				} else {
					socket.emit("error", "No game");
				}
			});
		} else {
			if (games[game_id]) {
				socket.emit("gamestate", games[game_id]);
			} else {
				socket.emit("error", "no such game");
			}
		}
	});
	} catch (e) {
		socket.emit("error", e);
		throw e;
	}
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

// Credit: http://stackoverflow.com/a/6274398/84745
function shuffle(array) {
	var counter = array.length, temp, index;
	while (counter--) {
		index = (Math.random() * counter) | 0;
		temp = array[counter];
		array[counter] = array[index];
		array[index] = temp;
	}
	return array;
}

function Deck(cards) {
	this.discards = cards;
	this.shuffle();
}

Deck.prototype.shuffle = function() {
	shuffle((this.deck = this.discards));
	this.discards = [];
};

Deck.prototype.draw = function(how_many) {
	if (!this.deck.length) { this.shuffle(); }
	return this.deck.pop();
}

Deck.prototype.discard = function(card) { this.discards.push(card); }
