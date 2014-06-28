/* global Elasticity          : true */
/* global ElasticityTemplates : true */

'use strict';

var ElasticSearch = Npm.require('elasticsearch').Client;
var Promise       = Npm.require('promise');
var Future        = Npm.require('fibers/future');
var Flat          = Npm.require('flat');
var flatten       = Flat.flatten;
var unflatten     = Flat.unflatten;
var indices       = {};

Elasticity = function(config) {
	var self      = this;
	var config    = _.extend(self.default_config, config);
	var client    = new ElasticSearch(_.clone(config));
	var callbacks = {};
	var pending   = {};

	function search(index_name, query, offset, limit, type, force) {
		var index = indices[index_name];

		if(!index) {
			throw new Error('"' + index_name + '" is not a defined index.');
		}

		if(!_.isEmpty(pending[index_name]) && !force) {
			if(self.debug) {
				console.log('Elasticity: Postponing search because index ' + index_name + ' is not ready');
			}

			var called = false;

			var ready = new Promise(function(resolve, reject) {
				var callback = function() {
					search(index_name, query, offset, limit, type, true).then(resolve, reject);
					called = true;
				};

				addCallback(index_name, callback);
			});

			if(self.flush) {
				setTimeout(function() {
					if(!called) {
						if(self.debug) {
							console.log('Elasticity: Flushing callbacks for index ' + index_name);
						}

						doCallbacks(index_name);
					}
				}, self.flush_timeout);
			}

			return ready;
		}

		type = type || index.type;

		if(self.debug) {
			console.log('Elasticity: Performing search: ', query);
		}

		var request = {
			index : index_name,
			type  : type,
			from  : offset || 0,
			size  : limit || 10,
			body  : {
				query : query
			}
		};

		var promise = client.search(request);

		if(self.debug) {
			promise.then(function(data) {
				console.log('Elasticity: Got search results. Data length: ', JSON.stringify(data).length);
			});
		}

		return promise;
	}

	function addIndex(collection, index_name, options, filter, type) {
		options = options || {};
		type    = type || 'default_type';
		filter  = filter || {};

		if(typeof collection === 'string' && Meteor[collection]) {
			collection = Meteor[collection];
		}

		indices[index_name] = {
			type       : type,
			options    : options,
			collection : collection._name
		};

		var promise = new Promise(function(resolve, reject) {
			try {
				collection.find(filter).observeChanges({
					added : function(id, doc) {
						addToIndex(index_name, doc, id);
					},

					changed : function(id, doc) {
						addToIndex(index_name, doc, id, true);
					},

					removed : function(id) {
						removeFromIndex(index_name, id);
					}
				});

				if(self.debug) {
					console.log('Elasticity: Added index: ', indices[index_name]);
				}

				var callback = function() {
					resolve.call(self, indices[index_name]);
				};

				addCallback(index_name, callback);
			}
			catch(e) {
				reject.call(self, e);
			}
		});

		return promise;
	}

	function removeIndex(index_name) {
		var promise = client.indices.delete(index_name);

		promise.then(function() {
			delete indices[index_name];

			if(self.debug) {
				console.log('Elasticity: Removed index: ', indices[index_name]);
			}
		});

		return promise;
	}

	function addToIndex(index_name, doc, id, update, callback) {
		var index = indices[index_name];

		if(!pending[index_name]) {
			pending[index_name] = {};
		}

		pending[index_name][id] = true;

		if(index.options.fields.indexOf('_all') === -1) {
			var tmp_doc = flatten(doc);

			tmp_doc = _.pick(tmp_doc, index.options.fields);
			doc     = unflatten(tmp_doc);
		}

		if(_.isEmpty(doc)) {
			return false;
		}

		var request = {
			index : index_name,
			type  : index.type,
			id    : id
		};

		if(update) {
			request.body = {
				doc : doc
			};
		}
		else {
			request.body = doc;
		}

		var promise = client.index(request);

		promise.then(function(data) {
			if(self.debug) {
				console.log('Elasticity: Updated index for document ' + id, data);
			}

			if(pending[index_name][id]) {
				delete pending[index_name][id];
			}

			if(_.isEmpty(pending[index_name])) {
				doCallbacks(index_name);
			}

			if(typeof callback === 'function') {
				callback.call(self, null, data);
			}
		}, function(error) {
			if(typeof callback === 'function') {
				callback.call(self, error, null);
			}
		});

		return promise;
	}

	function removeFromIndex(index_name, id, callback) {
		var index = indices[index_name];

		if(!pending[index_name]) {
			pending[index_name] = {};
		}

		pending[index_name][id] = true;

		var request = {
			index : index_name,
			type  : index.type,
			id    : id
		};

		var promise = client.delete(request);

		promise.then(function(data) {
			if(self.debug) {
				console.log('Elasticity: Removed document ' + id + ' from index', data);
			}

			if(pending[index_name][id]) {
				delete pending[index_name][id];
			}

			if(_.isEmpty(pending[index_name])) {
				doCallbacks(index_name);
			}

			if(typeof callback === 'function') {
				callback.call(self, null, data);
			}
		}, function(error) {
			if(typeof callback === 'function') {
				callback.call(self, error, null);
			}
		});

		return promise;
	}

	function addCallback(index_name, callback) {
		if(!callbacks[index_name]) {
			callbacks[index_name] = [];
		}

		callbacks[index_name].push(callback);
	}

	function doCallbacks(index_name) {
		if(self.debug) {
			console.log('Elasticity: The ' + index_name + ' index is ready.');
		}

		if(callbacks[index_name] && callbacks[index_name].length) {
			if(self.debug) {
				console.log('Elasticity: Executing stored callbacks for ' + index_name + ' index.');
			}

			while(callbacks[index_name].length) {
				var callback = callbacks[index_name].shift();

				if(typeof callback === 'function') {
					callback.call(self, indices[index_name]);
				}
			}
		}
	}

	this.search          = search;
	this.addIndex        = addIndex;
	this.removeIndex     = removeIndex;
	this.addToIndex      = addToIndex;
	this.removeFromIndex = removeFromIndex;
};

Elasticity.prototype.flush_timeout = 200;
Elasticity.prototype.flush         = false;
Elasticity.prototype.debug         = false;

Elasticity.prototype.default_config = {
	host : 'localhost:9200'
};

var getIds = function(result) {
	var hits = [];

	if(result.hits && result.hits.hits) {
		for(var i in result.hits.hits) {
			var id = result.hits.hits[i]._id;
			hits.push(id);
		}
	}

	return hits;
};

var futures = {};

var publish = function(template) {
	return function(key) {
		var self = this;
		var args = JSON.parse(key);

		var index_name   = args[0];
		var query_string = args[1];
		var offset       = args[2];
		var limit        = args[3];
		var type         = args[4];

		var tmp_future = new Future();
		var client = new Elasticity();
		var index  = indices[index_name];

		if(!index || !query_string) {
			self.stop();
		}

		var promise = client.search.call(self, index_name, template.query(query_string), offset, limit, type);

		futures[key] = new Future();

		promise.then(function(data) {
			var ids = getIds(data);
			var cursor;

			if(typeof index.options.publish === 'function') {
				cursor = index.options.publish.call(self, ids);
			}
			else {
				var query = {
					_id : {
						$in : ids
					}
				};

				cursor = Meteor[index.collection].find(query, index.options.cursor_options || {});
			}

			var response = {
				ids   : ids,
				index : index
			};

			futures[key].return(response);
			tmp_future.return(cursor);
		});

		return tmp_future.wait();
	};
};

for(var t in ElasticityTemplates) {
	Meteor.publish('Elasticity:' + t, publish(ElasticityTemplates[t]));
}

Meteor.methods({
	'Elasticity::search' : function(key) {
		return futures[key].wait();
	}
});
