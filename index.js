var htmlparser = require("htmlparser2"),
  rp = require('request-promise'),
  Promise = require('bluebird'),
  _ = require('lodash'),
  csv = require('fast-csv'),
  fs = Promise.promisifyAll(require('fs')),
  moment = require('moment'),
  DomUtils = require("domutils");

Promise.promisifyAll(htmlparser.DomHandler)

require('dotenv').load();
var oio = require('orchestrate');
var db = oio(process.env.ORCHESTRATE_API_KEY, process.env.ORCHESTRATE_ENDPOINT);

var cookie = process.env.SF_COOKIE;
var options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/43.0.2357.81 Safari/537.36',
    'cookie': cookie,
  }
};

function get(uri) {
  console.log('GET', uri);
  return rp(_.extend({
    uri: uri,
    method: 'GET'
  }, options));
}

function handleDom(rawHtml) {
  return new Promise(function(resolve, reject) {
    var handler = new htmlparser.DomHandler(function(error, dom) {
      if (error) {
        return reject(error);
      }

      resolve(dom);
    });

    var parser = new htmlparser.Parser(handler);
    parser.write(rawHtml);
    parser.done();
  });
}

// Checks cookie by loading homepage and returns username on success
function logIntoSf() {
  return get('https://scriptfodder.com/')
    .then(function(res) {
      return handleDom(res);
    })
    .then(function(dom) {
      var userBtn = DomUtils.getElementById('nav-user-btn', dom, true);
      var usernameElem = DomUtils.getElements({
        class: 'username hidden-sm'
      }, userBtn, true, 5);
      var username = usernameElem[0].children[0].data;
      return username;
    });
}

// Gets all scriptIds from the current API key user
function getScriptIds() {
  return rp({
    uri: 'http://scriptfodder.com/api/scripts/',
    qs: {
      api_key: process.env.SF_APIKEY
    },
    transform: function(body) {
      return JSON.parse(body);
    }
  }).then(function(scripts) {
    return Promise.map(scripts.scripts, function(script) {
      return script.id;
    });
  });
}

function getUserIdFromUrl(url) {
  var re = /\/users\/view\/(\d+)/;
  return re.exec(url)[1];
}

function getReviewsForScript(scriptId) {
  var url = 'https://scriptfodder.com/scripts/view/' + scriptId + '/reviews/';
  return get(url)
    .then(handleDom)
    .then(function(dom) {
      var reviewList = DomUtils.getElements({
        'class': 'list-group'
      }, dom, true, 100)[0];

      var reviews = _.chain(reviewList.children)
        .toArray()
        .filter('type', 'tag')
        .map(function(li) {
          // Catch no reviews elem
          if (DomUtils.getElements({
              'class': 'alert alert-warning'
            }, li, true, 10).length > 0
          ) {
            return;
          }

          // Parse review
          var review = {};
          review.user_id = getUserIdFromUrl(DomUtils.getElements({
            'tag_name': 'a'
          }, li, true, 10)[0].attribs.href);

          var dateAbbr = DomUtils.getElements({
            'class': 'tip'
          }, li, true, 10)[0];
          review.date = dateAbbr.attribs['title'];

          var starsDiv = DomUtils.getElements({
            class: 'review-stars'
          }, li, true, 10)[0];
          review.stars = _(starsDiv.children)
            .filter('type', 'tag')
            .reduce(function(total, i) {
              return (i.attribs['class'] == 'fa fa-star') ? total + 1 : total;
            }, 0);

          var textDiv = DomUtils.getElements({
            'class': 'review-text'
          }, li, true, 10)[0];
          review.text = textDiv.children[0].data;
          review.script_id = scriptId;
          return review;
        }).filter(function(review) {
          return review !== undefined;
        }).value();
      return reviews;
    });
}

function scrapeReviews(scriptId) {
  var url = "/";
}

function scrapeAll() {
  return getScriptIds()
  .then(function(scriptIds) {
    return Promise.map(scriptIds, getReviewsForScript);
  })
  .then(_.flatten);
}

exports.handler = function (event, context) {
  logIntoSf()
    .then(function(name) {
      console.log("Logged in as ", name);
    })
    .then(scrapeAll)
    .then(function(reviews) {
      return _.groupBy(reviews, 'user_id');
    })
    .then(function(userToReviewsMap) {
      return Promise.map(_.pairs(userToReviewsMap), function(pair) {
        var userId = pair[0];
        var reviews = pair[1];
        return db.put('reviews', userId, {reviews: reviews});
      });
    })
    .then(context.succeed, context.fail);
}
