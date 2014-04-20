var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	http = require('http');;

const isProduction = (process.env.NODE_ENV === 'production'),
	  port = (isProduction ? 80 : 5000),
	  cards = require("./cards.json");

const HAND_SIZE = 10;

var func = {
	key: function(k) {
		return function(o) { return o[k]; };
	}
};

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
		delete player.disconnectTimeout;
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
				this.sendPlayers();
				if (this.players.length && this.cardCzar == player) {
					this.setCardCzar(this.players[index % this.players.length]);
				}
			}.bind(this), 1000);
		}.bind(this))
		.on('draw_black', function() {
			if (this.cardCzar !== player) {
				console.log('a non-czar tried to draw_black', player);
				return;
			}
			if (this.current_card) {
				console.log('tried to draw a black card but one is already in play');
				return;
			}
			this.current_card = this.black_deck.draw();

			this.broadcast('black_card', this.current_card);
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
				//this.setState("reveal");
				this.state = 'reveal'
				this.broadcast("revealed_cards", this.played_cards);
			} else {
				this.broadcast("played_cards", this.played_cards.length);
			}
		}.bind(this))
		.on("submit_winner", function(card) {
			if (this.cardCzar !== player) {
				console.log("non-czar tried to submit_winner:", player);
				return;
			}
			console.log("Winning Card: ", card);
			this.setState("intermission");
			this.broadcast("winning_card", card);
			// TODO: Broadcast the winning card
			// TODO: Scoring
		}.bind(this))
	;

	var want = HAND_SIZE;
	while (want--) { player.hand.push(this.white_deck.draw()); }

	cb && cb({
		hand: player.hand,
		id: player.id,
		players: this.players.map(function(p){ return p.info; }),
		card: this.current_card,
		state: this.state,
		czar: this.cardCzar == player,
		blackCard: this.current_card,
		playedCards: this.state == 'reveal' ? this.played_cards : null
	});

	if (this.players.length === 1) {
		this.setCardCzar(player);
	}
};

Game.prototype.setCardCzar = function(cardCzar) {
	this.cardCzar = cardCzar;
	cardCzar.socket.emit('czar', true);
};

Game.prototype.setState = function(state) {
	this.state = state;
	this.broadcast('state', state);
};

Game.prototype.broadcast = function(name, data) {
	io.sockets.in(this.id).emit(name, data);
};

Game.prototype.sendPlayers = function() {
	this.broadcast('players', this.players.map(func.key('info')));
};


app.use(express.static(__dirname + '/public'));

// intermission
// play
// reveal

io.sockets.on("connection", function(socket) {

	socket.on("create_game", function(_, cb) {
		var game = new Game;
		cb && cb(game.id);
	}).on("join_game", function(info, cb) {
		console.log(games);
		var game = games[info.game]
		if (game) { game.join(socket, info, cb); }
		else { cb && cb(null); }
	}).on("gamestate", function(game_id) {
		var game = games[game_id];
		if (game) { console.log(game); }

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
