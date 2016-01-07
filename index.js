/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2015 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

var _ = require('lodash');
var path = require('path');
var pathLoader = require('path-loader');
var YAML = require('js-yaml');

// Load promises polyfill if necessary
/* istanbul ignore if */
if (typeof Promise === 'undefined') {
  require('native-promise-only');
}

var supportedVersions = {
  '2.0': require('./lib/versions/2.0/')
};

/**
 * A library for simpler [Swagger](http://swagger.io/) integrations.
 *
 * @module Sway
 */

/**
 * Callback used for validation.
 *
 * @typedef {function} ValidatorCallback
 *
 * @param {SwaggerApi} api - The Swagger API object
 *
 * @returns {ValidationResults} The validation results.
 */

/**
 * Server response wrapper.
 *
 * Since the low level `http.ServerResponse` object is not always guaranteed and even if it is, there is no public way
 * to gather the necessary parts of the response to perform validation, this object encapsulates the required response
 * information to perform response validation.
 *
 * @typedef {object} ServerResponseWrapper
 *
 * @property {*} body - The response body
 * @property {string} [encoding] - The encoding of the body when the body is a `Buffer`
 * @property {object} headers - The response headers
 * @property {number|string} [statusCode=default] - The response status code
 */

/**
 * Validation error/warning object.
 *
 * @typedef {object} ValidationEntry
 *
 * @property {string} code - The code used to identify the error/warning
 * @property {string} [error] - Whenever there is an upstream `Error` encountered, its message is here
 * @property {ValidationEntry[]} [errors] - The nested error(s) encountered during validation
 * @property {string[]} [lineage] - Contains the composition lineage for circular composition errors
 * @property {string} message - The human readable description of the error/warning
 * @property {string} [name] - The header name for header validation errors
 * @property {string[]} path - The path to the location in the document where the error/warning occurred
 */

/**
 * Validation results object.
 *
 * @typedef {object} ValidationResults
 *
 * @property {ValidationEntry[]} errors - The validation errors
 * @property {ValidationEntry[]} warnings - The validation warnings
 */

/**
 * Creates a SwaggerApi object from its Swagger definition(s).
 *
 * @param {object} options - The options for loading the definition(s)
 * @param {object|string} options.definition - The Swagger definition location or structure
 * @param {object} [options.jsonRefs] - *(See [JsonRefs~JsonRefsOptions](https://github.com/whitlockjc/json-refs/blob/master/docs/API.md#module_JsonRefs..JsonRefsOptions))*
 * @param {ValidatorCallback[]} [options.customValidators] - The custom validators
 *
 * @returns {Promise} The promise
 *
 * @example
 * SwaggerApi.create({definition: 'http://petstore.swagger.io/v2/swagger.yaml'})
 *   .then(function (api) {
 *     console.log('Documentation URL: ', api.documentation);
 *   }, function (err) {
 *     console.error(err.stack);
 *   });
 */
module.exports.create = function (options) {
  var allTasks = Promise.resolve();

  // Validate arguments
  allTasks = allTasks.then(function () {
    return new Promise(function (resolve) {
      if (_.isUndefined(options)) {
        throw new TypeError('options is required');
      } else if (!_.isPlainObject(options)) {
        throw new TypeError('options must be an object');
      } else if (_.isUndefined(options.definition)) {
        throw new TypeError('options.definition is required');
      } else if (!_.isPlainObject(options.definition) && !_.isString(options.definition)) {
        throw new TypeError('options.definition must be either an object or a string');
      } else if (!_.isUndefined(options.jsonRefs) && !_.isPlainObject(options.jsonRefs)) {
        throw new TypeError('options.jsonRefs must be an object');
      } else if (!_.isUndefined(options.customValidators) && !_.isArray(options.customValidators)) {
        throw new TypeError('options.customValidators must be an array');
      }

      _.forEach(options.customValidators, function (validator, index) {
        if (!_.isFunction(validator)) {
          throw new TypeError('options.customValidators at index ' + index + ' must be a function');
        }
      });

      resolve();
    });
  });

  // Make a copy of the input options so as not to alter them
  options = _.cloneDeep(options);

  // Retrieve the definition if it is a path/URL (The reason we do this here instead of using JsonRefs#resolveRefsAt is
  // because we use this to identify which plugin we want to use.)
  allTasks = allTasks
    // Load the remote definition or return options.definition
    .then(function () {
      if (_.isString(options.definition)) {
        return pathLoader.load(options.jsonRefs && options.jsonRefs.relativeBase ?
                                 path.join(options.jsonRefs.relativeBase, options.definition) :
                                 options.definition,
                               options.jsonRefs && options.jsonRefs.loaderOptions ?
                                 options.jsonRefs.loaderOptions :
                                 {})
                         .then(YAML.safeLoad);
      } else {
        return options.definition;
      }
    });

  // Process the Swagger definition (if possible)
  allTasks = allTasks
    .then(function (apiDefinition) {
      var definition = _.find(supportedVersions, function (pDefinition) {
        return pDefinition.canProcess(apiDefinition);
      });

      if (_.isUndefined(definition)) {
        throw new TypeError('Unable to identify the Swagger version or the Swagger version is unsupported');
      }

      return definition.createSwaggerApi(apiDefinition, options);
    });

  return allTasks;
};
