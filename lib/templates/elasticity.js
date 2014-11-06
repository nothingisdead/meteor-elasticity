var results = {};
var terms   = {};
var handles = {};

Template.SearchInput.rendered = function() {
	var data  = this.data;
	var limit = data.limit || 100;
	var skip  = data.skip || 0;
	var key   = 'es::' + data.id;

	if(_.isString(data.collection)) {
		data.collection = window[data.collection];
	}

	if(!results[data.id]) {
		results[data.id] = new ReactiveVar([]);
	}

	if(!terms[data.id]) {
		terms[data.id] = new ReactiveVar('');
	}

	if(!data.request) {
		data.request = {
			query : {
				bool : {
					should : [
						{
							multi_match : {
								query  : "{{term}}",
								fields : "name.*",
								boost  : 2.0,
								type   : 'cross_fields'
							}
						},
						{
							query_string : {
								query : "{{term}}~2",
							}
						}
					]
				}
			}
		};
	}

	Tracker.autorun(function() {
		var term = terms[data.id].get();

		if(handles[data.id]) {
			handles[data.id].stop();
		}

		if(!term.length) {
			results[data.id].set([]);
			return;
		}

		var request = {
			query : {
				template : JSON.parse(JSON.stringify(data.request))
			}
		};

		request.query.template.params = {
			term : term
		};

		handles[data.id] = data.collection.search(data.index, request, limit, skip, key);

		var update = _.debounce(function() {
			var tmp_results = handles[data.id].cursor.fetch();

			results[data.id].set(tmp_results);
		}, 100);

		handles[data.id].cursor.observeChanges({
			addedBefore : update,
			movedBefore : update,
			removed     : update
		});
	});
};

Template.SearchInput.events({
	'keyup .elasticity-input' : function(e) {
		terms[this.id].set(e.target.value);
	}
});

Template.registerHelper('SearchResult', function(id) {
	if(!results[id]) {
		results[id] = new ReactiveVar([]);
	}

	return results[id].get();
});
