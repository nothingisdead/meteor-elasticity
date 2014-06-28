'use strict';

var results  = {};
var contexts = {};
var dep      = new Deps.Dependency();
var timer    = null;

UI.registerHelper('elasticity_result', function(id) {
	dep.depend();

	id = id || $('.elasticity-input').first().data('id');

	if(contexts[id] && results[id]) {
		return results[id].getDocs(contexts[id].collection, true);
	}

	return null;
});

Template.elasticity_input.helpers({
	id : function() {
		return (this && this.id) || Random.id();
	}
});

Template.elasticity_input.events({
	'keyup .elasticity-input' : function(e, instance) {
		var $input = $(e.target);
		var key    = 'Elasticity::' + instance.data.id + '::query';
		var query  = Session.get(key);

		if(query !== $input.val()) {
			$input.trigger('change');
		}
	},

	'change .elasticity-input' : function(e, instance) {
		if(timer) {
			Meteor.clearTimeout(timer);
		}

		timer = Meteor.setTimeout(function() {
			var $input = $(e.target);
			var key    = 'Elasticity::' + instance.data.id + '::query';

			Session.set(key, $input.val());
		}, 100);
	}
});

Template.elasticity_input.created = function() {
	var self = this;

	if(!self.data) {
		self.data = {};
	}

	if(!self.data.id) {
		self.data.id = Random.id();
	}

	contexts[self.data.id] = self.data;

	var watchQuery = function() {
		var query  = Session.get('Elasticity::' + self.data.id + '::query');
		var search = self.data.search || 'fuzzy';
		var index  = self.data.index;

		if(query) {
			Elasticity[search].call(this, index, query)
				.then(function(result) {
					results[self.data.id] = result;
					dep.changed();
				}, function(error) {
					console.log(error);
				});
		}
		else {
			results = [];
			dep.changed();
		}
	};

	Deps.autorun(watchQuery);
};
