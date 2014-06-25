'use strict';

var hits  = {};
var dep   = new Deps.Dependency();
var timer = null;

UI.registerHelper('es_result', function(id) {
	dep.depend();

	id = id || $('.elasticity-input').first().data('id');

	return hits[id];
});

Template.es_input.helpers({
	id : function() {
		return (this && this.id) || Random.id();
	}
});

Template.es_input.events({
	'submit .elasticity-form' : function(e, instance) {
		var $input = $(e.target).find('.elasticity-input');
		var key    = 'Elasticity::' + instance.data.id + '::query';

		Session.set(key, $input.val());

		return false;
	},

	'keyup, change .elasticity-input' : function(e) {
		if(timer) {
			Meteor.clearTimeout(timer);
		}

		timer = Meteor.setTimeout(function() {
			var $form = $(e.target).closest('.elasticity-form');

			$form.trigger('submit');
		}, 10);
	}
});

Template.es_input.created = function() {
	var self = this;

	if(!self.data) {
		self.data = {};
	}

	if(!self.data.id) {
		self.data.id = Random.id();
	}

	var watchQuery = function() {
		var query  = Session.get('Elasticity::' + self.data.id + '::query');
		var search = self.data.search || 'fuzzy';
		var index  = self.data.index;

		if(query) {
			Elasticity[search](search, index, query)
				.then(function(data) {
					hits[self.data.id] = data;
					dep.changed();
				}, function(error) {
					console.log(error);
				});
		}
		else {
			hits = [];
			dep.changed();
		}
	};

	Deps.autorun(watchQuery);
};
