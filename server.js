var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	http = require('http');;

const isProduction = (process.env.NODE_ENV === 'production'),
	  port = (isProduction ? 80 : 5000),
	  cards = require("./cards.json");

var games = {};

function Game() {

	this.id = Math.floor(Math.random() * 100000);
	this.players = [];
	this.playersById = {};
	this.white_deck = new Deck(cards.white);
	this.black_deck = new Deck(cards.black);
	this.played_cards = [];
	this.state = "intermission";

	games[this.id] = this;
}

Game.prototype.join = function(socket, playerInfo, cb) {

	var player;
	if ((player = this.playersById[playerInfo.id])) {
		clearTimeout(player.disconnectTimeout);
		delete player[disconnectTimeout];
	} else {
		player = {
			socket: socket,
			info: { // Public
				id: Math.random().toString(36).substring(2),
				name: playerInfo.name,
				score: 0
			},
			hand: []
		};
		this.players.push(player);
		this.playersById[player.info.id] = player;
		socket.broadcast.to(this.id).emit("joined", {id: socket.id});
	}

	socket
		.join(this.id)
		.on('disconnect', function() {
			setTimeout(function(){
				var index = this.players.indexOf(player);
				this.players.splice(index, 1);
				delete this.playersById[player.id];
				if (this.players.length) {
					this.setCardCzar(this.players[index % this.players.length]);
				}
			}.bind(this), 5000);
		}.bind(this))
		.on('draw_black', function() {
			var new_card = this.black_deck.draw();
			if (this.current_card) {
				this.black_deck.discard(this.current_card);
			}
			this.broadcast("draw_black", new_card);
			this.current_card = new_card;
			this.state = "play";
			this.setState('play');
		}.bind(this))
		.on('draw_white', function(how_many, cb) {
			var cards = [];

			while (how_many--) {
				cards.push(this.white_deck.draw());
			}
			cb && cb(cards);
		}.bind(this))
		.on('submit_cards', function(cards) {
			this.played_cards.push(cards);
			if (this.played_cards.length === (this.players.length - 1)) {
				this.setState("reveal");
				socket.broadcast.to(this.id).emit("submitted_cards", this.played_cards);
			} else {
				socket.broadcast.to(this.id).emit("played_cards", this.played_cards.length);
			}
		}.bind(this))
		.on("pick_winner", function(card) {
			if (this.cardCzar === player) {
				this.setState("intermission");
				//Need the winning card's player
				socket.broadcast.to(this.id).emit("submitted_cards", this.played_cards);
			} else {
				socket.broadcast.to(this.id).emit("played_cards", this.played_cards.length);
			}
		}.bind(this))
	;

	if (this.players.length === 1) {
		this.setCardCzar(player);
	}
	if (this.current_card) {
		socket.emit('draw_black', this.current_card);
	}
	console.log('New client', player, '. State is', this.state);
	socket.emit('game_state', this.state);
	cb && cb({
		hand: player.hand,
		id: player.id,
		players: this.players.map(function(p){ return p.info; })
	});
};

Game.prototype.setCardCzar = function(cardCzar) {
	this.cardCzar = cardCzar;
	cardCzar.socket.emit('card_czar');
};

Game.prototype.setState = function(state) {
	this.state = state;
	this.broadcast('game_state', state);
};

Game.prototype.broadcast = function(name, data) {
	io.sockets.in(this.id).emit(name, data);
}


app.use(express.static(__dirname + '/public'));

//Intermission
//Play
//Reveal
io.sockets.on("connection", function(socket) {

	socket.on("create_game", function(_, cb) {
		var game = new Game;
		cb && cb(game.id);
	}).on("join_game", function(info, cb) {
		var game = games[info.game]
		if (game) {
			game.join(socket, info, cb);
		} else {
			cb && cb(null);
		}
	}).on("gamestate", function(game_id) {
		var game = games[game_id];
		if (game) {
			console.log(game);
		}

	// Debuggin’
	}).on("dbg_rooms", function(_, cb){
		cb && cb(Object.keys(games));
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
