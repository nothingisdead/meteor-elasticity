/* global Package: true */

'use strict';

Package.describe({
	summary : 'A customizable Elastic Search client with Blaze templates'
});

Npm.depends({
	elasticsearch : '2.2.0',
	promise       : '5.0.0',
	flat          : '1.2.1'
});

Package.on_use(function (api) {
	api.use(['underscore'], ['client', 'server']);
	api.use(['templating', 'ui', 'jquery', 'standard-app-packages'], 'client');

	// Add search templates to both client and server
	api.add_files([
		'lib/search-templates.js'
	], ['client', 'server']);

	api.add_files([
		'lib/client.js',
		'lib/templates/elasticity.html',
		'lib/templates/elasticity.js',
	], 'client');

	api.add_files([
		'lib/server.js'
	], 'server');

	api.export(['Elasticity', 'ElasticityTemplates']);
});
