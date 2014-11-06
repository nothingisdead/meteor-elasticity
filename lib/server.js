// Globals
var Future       = Npm.require('fibers/future');
var ES           = Npm.require('elasticsearch').Client;
var indexes      = {};
var watchers     = {};
var options      = getOptions();
var client       = new ES(options.config || {});
var log          = options.log || false;

function index(name, options, publish, callback) {
	var self = this;

	// Prepend the collection name
	name = self._name + '::' + name;

	var bound_callback = _.isFunction(callback) ? Meteor.bindEnvironment(callback) : null;

	indexes[name] = {
		name       : name,
		collection : self,
		options    : options,
		publish    : publish,
		ids        : {}
	};

	// For efficiency, don't fetch the previous
	// document when executing the update hook
	var update_options = {
		fetchPrevious : false
	};

	var update_index = function(error, result) {
		if(error) {
			throw new Error(error);
		}

		updateIndex(name);
	};

	update_index = Meteor.bindEnvironment(update_index);

	// Ensure that the index has been created
	createIndex(name, function(error, result) {
		if(error) {
			throw new Error(error);
		}

		// Attach the insert/update/remove hooks
		self.after.insert(function(user_id, doc) {
			doc._id = this._id;

			addToIndex(name, doc, false, update_index);
		});

		self.after.update(function(user_id, doc) {
			addToIndex(name, doc, true, update_index);
		}, update_options);

		self.after.remove(function(user_id, doc) {
			removeFromIndex(name, doc._id, true, update_index);
		});

		if(_.isFunction(bound_callback)) {
			bound_callback.call(self, null, true);
		}
	});

	return self;
}

function rebuild(name, callback) {
	/*jshint -W083 */
	var self = this;

	// Prepend the collection name
	name = self._name + '::' + name;

	var batch_size = 1000;
	var index      = indexes[name];

	var exists_request = {
		index : name
	};

	var delete_request = exists_request;

	var create_request = {
		index : name,
		body  : index.options || {}
	};

	// Function to index all the documents
	var insert = function() {
		var num_docs     = self.find().count();
		var num_batches  = Math.ceil(num_docs / batch_size);
		var indexed      = 0;
		var percent      = 0;
		var last_percent = 0;
		var stop         = false;

		for(var i = 0; i < num_batches; i++) {
			var options = {
				skip  : i * batch_size,
				limit : batch_size
			};

			var docs = self.find({}, options).fetch();

			if(docs.length === 0) {
				continue;
			}

			addToIndex(name, docs, false, function(error, result) {
				if(error) {
					stop = true;

					if(_.isFunction(callback)) {
						callback.call(error, indexed);
					}
				}
				else if(!stop) {
					indexed += result.index.items.length;

					if(log) {
						console.log("Indexed " + result.index.items.length + " documents for '" + name + "'.");
					}

					if(indexed === num_docs) {
						if(_.isFunction(callback)) {
							callback.call(error, indexed);
						}
					}
				}
			});

			if(stop) {
				break;
			}

			percent = Math.floor((i + 1) / num_batches * 100);

			if(log && percent !== last_percent) {
				console.log("Indexing '" + name + "': " + percent + "%");

				last_percent = percent;
			}
		}
	};

	insert = Meteor.bindEnvironment(insert);

	// Recreate the index
	client.indices.exists(exists_request, function(error, result) {
		if(error) {
			throw new Error(error);
		}

		if(result) {
			client.indices.delete(delete_request, function(error, result) {
				if(error) {
					throw new Error(error);
				}

				client.indices.create(create_request, insert);
			});
		}
		else {
			client.indices.create(create_request, insert);
		}
	});
}

function createIndex(name, callback) {
	var index = indexes[name];

	var request = {
		index : name,
		body  : index.options || {}
	};

	client.indices.exists(request, function(error, result) {
		if(error) {
			throw new Error(error);
		}

		if(result) {
			if(_.isFunction(callback)) {
				callback.call(this, null, true);
			}
		}
		else {
			client.indices.create(request, callback);
		}
	});
}

function updateIndex(name) {
	if(!watchers[name]) {
		return;
	}

	for(var key in watchers[name]) {
		var watcher = watchers[name][key];

		updateWatcher(watcher);
	}
}

function updateWatcher(watcher) {
	var index      = watcher.index;
	var new_scores = {};
	var context    = watcher.context;
	var collection = index.collection;
	var field      = '_elasticity_score_' + watcher.key;

	var callback = function(error, results) {
		if(error) {
			throw new Error(error);
		}

		var hits   = results.hits.hits;
		var doc    = null;
		var id     = null;
		var action = null;
		var score  = null;
		var args   = null;
		var add    = {};
		var change = {};
		var remove = {};

		for(var i in hits) {
			id    = hits[i]._id;
			score = hits[i]._score;

			new_scores[id] = score;

			if(watcher.results[id]) {
				change[id] = score;
			}
			else {
				add[id] = score;
			}
		}

		for(id in watcher.results) {
			if(!change[id] && !add[id]) {
				remove[id] = score;
			}
		}

		// Get the actual documents for the results
		var docs = matchCursors(watcher, Object.keys(add));

		for(id in add) {
			if(!docs[id]) {
				continue;
			}

			doc = docs[id];

			doc[field] = add[id];

			watcher.context.added(collection._name, id, doc);
		}

		for(id in change) {
			doc = {};

			doc[field] = change[id];

			watcher.context.changed(collection._name, id, doc);
		}

		for(id in remove) {
			watcher.context.removed(collection._name, id);
		}

		watcher.results = new_scores;
	};

	var args = [index.name, watcher.body, null, null, callback];

	collection.search.apply(this, args);
}

function matchCursors(watcher, ids) {
	var docs       = {};
	var cursors    = watcher.cursors;
	var collection = watcher.index.collection;

	for(var i in cursors) {
		var desc = cursors[i]._cursorDescription;

		if(!desc) {
			continue;
		}

		// Modify the cursor to limit results to the ID
		// we're looking for, and to only select the ID
		var selector = {
			$and : [
				{
					_id : {
						$in : ids
					}
				},
				_.clone(desc.selector)
			]
		};

		var cursor  = collection.find(selector, desc.options);
		var results = cursor.fetch();

		for(var z in results) {
			var id = results[z]._id;

			if(!docs[id]) {
				docs[id] = {};
			}

			_.defaults(docs[id], results[z]);
		}
	}

	return docs;
}

function search(name, body, limit, skip, callback) {
	var self = this;

	// Prepend the collection name
	if(!indexes[name]) {
		name = self._name + '::' + name;
	}

	if(!indexes[name]) {
		throw new Error("Index " + name + " does not exist.");
	}

	var request = {
		index   : name,
		from    : skip || 0,
		size    : limit || 20,
		timeout : 500,
		body    : body
	};

	client.search(request, Meteor.bindEnvironment(callback));
}

Mongo.Collection.prototype.index   = index;
Mongo.Collection.prototype.rebuild = rebuild;
Mongo.Collection.prototype.search  = search;

function addToIndex(name, docs, update, callback) {
	var body = [];
	var self = this;

	if(!_.isArray(docs)) {
		docs = [docs];
	}

	for(var i in docs) {
		if(update) {
			body.push({
				update : {
					_id : docs[i]._id
				}
			}, {
				doc : docs[i]
			});
		}
		else {
			body.push({
				index : {
					_id : docs[i]._id
				}
			}, docs[i]);
		}
	}

	var request = {
		index : name,
		type  : 'elasticity',
		body  : body
	};

	client.bulk(request, function(error, index_result) {
		if(error) {
			callback.call(self, error, null);
		}
		else {
			var refresh_request = {
				index : name
			};

			client.indices.refresh(refresh_request, function(error, refresh_result) {
				if(error) {
					callback.call(self, error, null);
				}
				else {
					var result = {
						index   : index_result,
						refresh : refresh_result
					};

					callback.call(self, null, result);
				}
			});
		}
	});
}

function removeFromIndex(name, ids, callback) {
	var body = [];

	if(!_.isArray(ids)) {
		ids = [ids];
	}

	for(var i in ids) {
		body.push({
			delete : {
				_id : ids[i]
			}
		});
	}

	var request = {
		index : name,
		type  : 'elasticity',
		body  : body
	};

	client.bulk(request, callback);
}

function getOptions() {
	var path = process.env.PWD + '/elasticity.json';
	var fs   = Npm.require('fs');

	if(fs.existsSync(path)) {
		var json = fs.readFileSync(process.env.PWD + '/elasticity.json', {
			encoding : 'utf8'
		});

		var result = JSON.parse(json);

		return result;
	}

	return null;
}

/**
 * Publish the search results
 * @param  {String} key  A unique key for this search
 * @param  {String} name The name of the index to search on
 * @param  {Object} body The body of the search request
 */
Meteor.publish("Elasticity::search", function(key, name, body, limit, skip) {
	body = body || {};

	var index      = indexes[name];
	var collection = index.collection;
	var self       = this;

	if(!watchers[name]) {
		watchers[name] = {};
	}

	if(!watchers[name][key]) {
		var cursors = [];

		if(_.isFunction(index.publish)) {
			var result      = index.publish.call(self, index);
			var tmp_cursors = _.isArray(result) ? result : [result];

			for(var i in tmp_cursors) {
				var cursor = tmp_cursors[i];
				var desc   = cursor._cursorDescription;

				if(desc && desc.collectionName === collection._name) {
					cursors.push(cursor);
				}
			}
		}
		else {
			cursors.push(collection.find());
		}

		watchers[name][key] = {
			key     : key,
			index   : index,
			cursors : cursors,
			results : {}
		};
	}
	else {
		watchers[name][key].context.stop();
	}

	var watcher = watchers[name][key];

	watcher.body    = body;
	watcher.limit   = limit;
	watcher.skip    = skip;
	watcher.context = self;

	updateWatcher(watcher);

	self.onStop(function() {
		watcher.results = {};
	});

	self.ready();
});
