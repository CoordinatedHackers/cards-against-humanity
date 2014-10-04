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
	this.whiteDeck = new Deck(cards.white);
	this.blackDeck = new Deck(cards.black);

	this.info = {
		playedCards: [],
		state: "intermission",
		czar: null,
		blackCard: null
	}

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
				score: 0,
				hand: [],
				playedCards: []
			},
		};
		this.players.push(player);
		this.playersById[player.info.id] = player;
		this.broadcast("joined", player.info);
	}

	socket
		.join(this.id)
		.on('disconnect', function() {
			setTimeout(function(){
				var index = this.players.indexOf(player);
				this.players.splice(index, 1);
				delete this.playersById[player.info.id];
				this.sendPlayers();
				if (this.players.length && this.info.czar == player.info.id) {
					this.setCardCzar(this.players[index % this.players.length]);
				}
			}.bind(this), 1000);
		}.bind(this))
		.on('draw_black', function() {
			if (this.info.czar !== player.info.id) {
				console.log('a non-czar tried to draw_black', player);
				return;
			}
			if (this.info.blackCard) {
				console.log('tried to draw a black card but one is already in play');
				return;
			}
			this.info.blackCard = this.blackDeck.draw();

			this.broadcast('black_card', this.info.blackCard);
			this.setState('play');
		}.bind(this))
		.on('draw_white', function(howMany, cb) {
			var cards = [];

			while (howMany--) {
				cards.push(this.whiteDeck.draw());
			}
			cb && cb(cards);
		}.bind(this))
		.on('submit_cards', function(cards) {

			this.info.playedCards.push(cards);
			// TODO this state change should probably check that
			// each player has submitted a card rather than the number of cards
			if (this.info.playedCards.length === (this.players.length - 1)) {
				//this.setState("reveal");
				this.info.state = 'reveal'
				this.broadcast("revealed_cards", this.info.playedCards);
			} else {
				this.broadcast("played_cards", this.info.playedCards.length);
			}
		}.bind(this))
		.on("submit_winner", function(card) {
			if (this.info.czar !== player.info.id) {
				console.log("non-czar tried to submit_winner:", player);
				return;
			}
			console.log("Winning Card: ", card);
			this.setState("intermission");
			this.broadcast("winning_card", card);
			// TODO: Broadcast the winning card
			this.info.blackCard = null;
			this.info.playedCards = [];
			this.setCardCzar(this.players[
				(this.players.indexOf(this.playersById[this.info.czar]) + 1) % this.players.length
			]);
		}.bind(this))
	;

	var want = HAND_SIZE;
	while (want--) { player.info.hand.push(this.whiteDeck.draw()); }

	cb && cb({
		game: this.info,
		players: this.players.map(function(p){ return p.info; }),
		you: this.players.indexOf(player),
		playedCards: this.info.state == 'reveal' ? this.playedCards : null
	});

	if (this.players.length === 1) {
		this.setCardCzar(player);
	}
};

Game.prototype.setCardCzar = function(czar) {
	console.log('became the card czar:', czar);
	this.info.czar = czar.info.id;
	console.log('broadcasting card_czar', this.info.czar);
	this.broadcast('card_czar', this.info.czar);
};

Game.prototype.setState = function(state) {
	this.info.state = state;
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
		var game = games[info.game]
		if (game) { game.join(socket, info, cb); }
		else { cb && cb(null); }
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

Deck.prototype.draw = function() {
	if (!this.deck.length) { this.shuffle(); }
	return this.deck.pop();
}

Deck.prototype.discard = function(card) { this.discards.push(card); }
