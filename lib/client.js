/* global Elasticity          : true */
/* global ElasticityTemplates : true */
/* global Promise             : true */

'use strict';

Elasticity = {};

var search = function(name) {
	return function() {
		var key     = JSON.stringify(arguments);
		var promise = new Promise(function(resolve, reject) {
			Meteor.subscribe('Elasticity:' + name, key, function() {
				var self = this;

				Meteor.call('Elasticity::search', key, function(error, result) {
					if(error) {
						reject(error);
					}
					else {
						var response = {
							ids : result.ids,

							getCursor : function(collection) {
								var query = {
									_id : {
										$in : result.ids
									}
								};

								var options = result.index.options.cursor_options || {};

								return collection.find(query, options);
							},

							getDocs : function(collection, sorted, reverse) {
								var cursor = response.getCursor(collection);
								var docs   = cursor.fetch();

								console.log(result.ids);

								if(sorted) {
									var pos = {};

									for(var i in result.ids) {
										pos[result.ids[i]] = i;
									}

									docs.sort(function(a, b) {
										var pos_a = pos[a._id];
										var pos_b = pos[b._id];

										return reverse ? pos_b - pos_a : pos_a - pos_b;
									});
								}

								return docs;
							}
						};

						resolve(response);
					}

					self.stop();
				});
			});
		});

		return promise;
	};
};

for(var i in ElasticityTemplates) {
	var template = ElasticityTemplates[i];

	Elasticity[i] = search(i, template);
}
