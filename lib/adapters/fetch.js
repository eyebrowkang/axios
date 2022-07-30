'use strict';

var utils = require('./../utils');
var settle = require('./../core/settle');
var cookies = require('./../helpers/cookies');
var buildURL = require('./../helpers/buildURL');
var isAxiosError = require('./../helpers/isAxiosError');
var buildFullPath = require('../core/buildFullPath');
var isURLSameOrigin = require('./../helpers/isURLSameOrigin');
var AxiosError = require('../core/AxiosError');
var parseProtocol = require('../helpers/parseProtocol');

module.exports = function fetchAdapter(config) {
  return new Promise(function dispatchFetchRequest(resolve, reject) {
    var requestData = config.data;
    var requestHeaders = config.headers;
    // for Response Object
    var responseType = config.responseType;

    if (utils.isFormData(requestData) && utils.isStandardBrowserEnv()) {
      delete requestHeaders['Content-Type']; // Let the browser set it
    }

    // HTTP basic authentication
    if (config.auth) {
      var username = config.auth.username || '';
      var password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';
      requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
    }

    var fullPath = buildFullPath(config.baseURL, config.url);

    var options = {
      method: config.method.toUpperCase(),
    };

    // Add xsrf header
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.
    if (utils.isStandardBrowserEnv()) {
      // Add xsrf header
      var xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath)) && config.xsrfCookieName ?
        cookies.read(config.xsrfCookieName) :
        undefined;

      if (xsrfValue) {
        requestHeaders[config.xsrfHeaderName] = xsrfValue;
      }
    }

    // Add headers to the request
    utils.forEach(requestHeaders, function setRequestHeader(val, key) {
      if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
        // Remove Content-Type if data is undefined
        delete requestHeaders[key];
      } else {
        // Otherwise add header to the request
        requestHeaders[key] = val;
      }
    });

    // Add credentials to options if needed
    if (!utils.isUndefined(config.credentials)) {
      options.credentials = !!config.credentials;
    }

    if (!requestData) {
      requestData = null;
    }

    if (config.mode) {
      options.mode = config.mode;
    }
    if (config.cache) {
      options.cache = config.cache;
    }
    if (config.redirect) {
      options.redirect = config.redirect;
    }
    if (config.referrer) {
      options.referrer = config.referrer;
    }
    if (config.referrerPolicy) {
      options.referrerPolicy = config.referrerPolicy;
    }
    if (config.integrity) {
      options.integrity = config.integrity;
    }
    if (config.keepalive) {
      options.keepalive = config.keepalive;
    }
    if (config.signal) {
      options.signal = config.signal;
    }

    var protocol = parseProtocol(fullPath);

    if (protocol && [ 'http', 'https', 'file' ].indexOf(protocol) === -1) {
      reject(new AxiosError('Unsupported protocol ' + protocol + ':', AxiosError.ERR_BAD_REQUEST, config));
      return;
    }

    var resource = buildURL(fullPath, config.params, config.paramsSerializer);
    options.headers = requestHeaders;
    options.body = requestData;

    var res = {
      data: '',
      status: '',
      statusText: '',
      headers: '',
      config: config,
    }
    console.log('resource', resource);
    console.log('options', options);
    var requestPromise = [fetch(resource, options)];
    if (config.timeout) {
      requestPromise.push(new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new AxiosError('Timeout of ' + config.timeout + 'ms exceeded', AxiosError.ERR_TIMEOUT, config));
        }, config.timeout);
      }));
    }
    Promise.race(requestPromise).then(function (response) {
      console.log('response object: ', response);
      res.status = response.status;
      res.statusText = response.statusText;
      res.headers = response.headers;
      if (!responseType || responseType === 'json') {
        return response.json();
      } else if (responseType === 'text') {
        return response.text();
      } else if (responseType === 'arraybuffer') {
        return response.arrayBuffer();
      } else if (responseType === 'blob') {
        return response.blob();
      } else if (responseType === 'formdata') {
        return response.formData();
      } else {
        return response;
      }
    }).then((data) => {
      res.data = data;
      console.log('data: ', data);
      console.log('res: ', res);
      settle(function _resolve(value) {
        resolve(value);
      }, function _reject(err) {
        reject(err);
      }, res);
    }).catch(function (error) {
      console.log('error: ', error);
      if (error.name === 'AbortError') {
        reject(new AxiosError('Request aborted', AxiosError.ECONNABORTED, config, requestPromise));
      } else if (isAxiosError(error)) {
        reject(error);
      } else {
        reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, requestPromise));
      }
    });
  });
};
