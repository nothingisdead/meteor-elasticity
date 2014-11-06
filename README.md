#Elasticity
A customizable Elasticsearch client with Blaze templates

##Updates

###1.0.0
Complete rewrite. Adds reactive searches, removes lots of cruft. Until I rewrite the readme, here's some very basic usage:

```javascript
// This should be on both client and server
var foo = new Mongo.Collection('foo');

// Set up an index on the server
foo.index('test_index');
```

```html
<!-- Use Blaze Templates -->
{{> SearchInput placeholder="Search Term" collection="foo" index="test_index" id="search1"}}

{{#if SearchResult "search1"}}
  {{#each SearchResult "search1"}}
    Name: {{name}}
  {{/each}}
{{else}}
  No Results.
{{/if}}
```

Notes: "foo" is a global variable that references the "foo" collection. "search1" links the input to the results. To write your own queries, define a template helper that returns an object in the elasticsearch query DSL. Then, pass "request=yourHelperFunction" to the SearchInput helper. The string "{{term}}" in your request will be replaced by the search term.

###0.1.0
The package has undergone some major internal changes, and the syntax for calling most of the functions has changed. This file has been updated to reflect those changes.

###0.0.5
Switched underlying client to the official elasticsearch.js client

Elasticity is a smart package for [meteor](https://www.meteor.com/) and [meteorite](https://github.com/oortcloud/meteorite/) that wraps around the [elasticsearch](https://github.com/elasticsearch/elasticsearch-js) package for node.js.

This package draws inspiration from the [easy-search](http://atmospherejs.com/package/easy-search) package. My goals were to expose some additional functionality of Elasticsearch and provide some more features while keeping it relatively simple to use.

##Todo

+ Finish documentation
+ Write tests
+ Publish test app
