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
