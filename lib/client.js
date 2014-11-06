var handles = {};

// Extend the client-side Mongo.Collection object
function search(index, body, limit, skip, key) {
	key = key || Random.id();

	var collection  = this;
	var stack       = [];
	var score_field = '_elasticity_score_' + key;
	var score_query  = {};

	var score_options = {
		sort : {}
	};

	if(limit) {
		score_options.limit = limit;
	}

	if(skip) {
		score_options.skip = skip;
	}

	score_query[score_field] = {
		$exists : true
	};

	score_options.sort[score_field] = -1;

	score_options.transform = function(doc) {
		var score = doc[score_field];

		doc._score = score;

		delete doc[score_field];

		return doc;
	};

	var cursor    = collection.find(score_query, score_options);
	var full_name = collection._name + '::' + index;

	if(!handles[key]) {
		var subscription = Meteor.subscribe('Elasticity::search', key, full_name, body);

		handles[key] = {
			score_field : score_field,
			cursor      : cursor,
			ready       : subscription.ready,

			stop : function() {
				subscription.stop();

				delete handles[key];
			}
		};
	}

	return handles[key];
}

Mongo.Collection.prototype.search = search;
